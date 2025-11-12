import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { extractBearerToken, validateScope, verifyToken } from '../lib/token-utils.ts';
import { SimpleTransport } from '../lib/simple-transport.ts';
import {
  createInsufficientScopeResponse,
  createInvalidTokenResponse,
  createJsonRpcParsingErrorResponse,
  createMethodNotAllowedResponse,
  createSuccessResponse,
  createUnauthorizedResponse,
} from '../lib/mcp-response-creators.ts';

const API_BASE = 'https://api.kapa.ai'
const SERVER_VERSION = '0.0.1';

const server = new McpServer({
  name: 'Hazelcast Docs MCP',
  version: SERVER_VERSION,
})


server.registerTool(
  'ask_hazelcast_docs',
  {
    title: 'Search Hazelcast Sources',
    description: 'Search the official Hazelcast documentation and return the most relevant sections from it for a user query. Each returned section includes the url and its actual content in markdown. Use this tool to for all queries that require Hazelcast knowledge.',
    inputSchema: { question: z.string() },
  },
  async (args) => {
    const q = (args?.question ?? '').trim();
    if (!q) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'missing_query', message: 'Provide a non-empty "question".' }) }]
      };
    }

    const KAPA_API_KEY = process.env.KAPA_API_KEY;
    const KAPA_PROJECT_ID = process.env.KAPA_PROJECT_ID;
    const KAPA_INTEGRATION_ID = process.env.KAPA_INTEGRATION_ID;

    if (!KAPA_API_KEY || !KAPA_PROJECT_ID || !KAPA_INTEGRATION_ID) {
      throw new Error('KAPA_API_KEY, KAPA_PROJECT_ID, and KAPA_INTEGRATION_ID environment variables must be set');
    }

    try {
      const response = await fetch(
        `${API_BASE}/query/v1/projects/${KAPA_PROJECT_ID}/retrieval/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': KAPA_API_KEY,
          },
          body: JSON.stringify({
            integration_id: KAPA_INTEGRATION_ID,
            query: q,
          }),
        }
      );

      const raw = await response.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : [];
      } catch (error) {
        console.error('JSON parse error from upstream response:', error?.message, 'Raw response:', raw);
        data = [];
      }

      if (!response.ok) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'upstream_error',
              status: response.status,
              statusText: response.statusText,
              body: raw || null,
            })
          }]
        };
      }

      const arr = Array.isArray(data) ? data : [];
      return { content: [{ type: 'text', text: JSON.stringify(arr) }] };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'exception', message: msg }) }] };
    }
  }
);

async function parseJsonRpcRequest(request: Request): Promise<JSONRPCMessage | null> {
  try {
    return await request.json() as JSONRPCMessage
  } catch (error) {
    return null
  }
}

async function handleMcpRequest(jsonRpcRequest: JSONRPCMessage): Promise<JSONRPCMessage> {
  const transport = new SimpleTransport()

  const responsePromise = new Promise<JSONRPCMessage>((resolve) => {
    transport.setResponseHandler(resolve)
  })

  await server.connect(transport)
  transport.onmessage?.(jsonRpcRequest)

  const jsonRpcResponse = await responsePromise
  await transport.close()

  return jsonRpcResponse
}

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url)

  if (request.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }

  const resourceUrl = `${url.origin}/mcp`
  const resourceMetadataUrl = `${url.origin}/.well-known/oauth-protected-resource`

  const token = extractBearerToken(request.headers.get('Authorization'))
  if (!token) {
    return createUnauthorizedResponse(resourceUrl, resourceMetadataUrl)
  }

  const payload = await verifyToken(token, resourceUrl)
  if (!payload) {
    return createInvalidTokenResponse(resourceUrl, resourceMetadataUrl)
  }

  const requiredScope = 'mcp:query'
  if (!validateScope(payload, requiredScope)) {
    return createInsufficientScopeResponse(resourceUrl, resourceMetadataUrl, requiredScope)
  }

  const jsonRpcRequest = await parseJsonRpcRequest(request)
  if (!jsonRpcRequest) {
    return createJsonRpcParsingErrorResponse()
  }

  const jsonRpcResponse = await handleMcpRequest(jsonRpcRequest)
  return createSuccessResponse(jsonRpcResponse)
}

export const config = {
  path: '/mcp',
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
}
