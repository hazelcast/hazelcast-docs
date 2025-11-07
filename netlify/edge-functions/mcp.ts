import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import handle from '@modelfetch/netlify'
import { z } from 'zod'
import { jwtVerify } from 'jose'

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  aud: string;
  scope: string;
  exp: number;
  iat: number;
  token_type: 'access' | 'refresh';
}

const API_BASE = 'https://api.kapa.ai'
const SERVER_VERSION = '0.0.1';

async function verifyToken(token: string, expectedAudience?: string): Promise<TokenPayload | null> {
  try {
    const TOKEN_SECRET = process.env.TOKEN_SECRET;
    const encoder = new TextEncoder();
    const secret = encoder.encode(TOKEN_SECRET);

    const { payload } = await jwtVerify<TokenPayload>(token, secret, {
      audience: expectedAudience,
    });

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      aud: payload.aud,
      scope: payload.scope,
      exp: payload.exp,
      iat: payload.iat,
      token_type: payload.token_type,
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

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
        console.error('JSON parse error from upstream response:', error.message, 'Raw response:', raw);
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


const baseHandler = handle({
  server: server,
  pre: (app) => {
    app.use('/mcp', async (c, next) => {
      await next();
      c.res.headers.set('X-MCP-Server', `Hazelcast Docs MCP/${SERVER_VERSION}`);
    });
  },
})

export default async (request, context) => {
  const url = new URL(request.url)

  // Enforce POST for /mcp (some tools accidentally send GET)
  if (url.pathname === '/mcp' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { 'Allow': 'POST' } })
  }

  // Extract Bearer token from Authorization header
  const authHeader = request.headers.get('Authorization')
  const resourceUrl = `${url.origin}/mcp`
  const resourceMetadataUrl = `${url.origin}/.well-known/oauth-protected-resource`

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Return 401 with WWW-Authenticate header as per MCP spec (RFC 9728)
    return new Response(
      JSON.stringify({
        error: 'unauthorized',
        message: 'Bearer token required'
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="${resourceUrl}", resource_metadata="${resourceMetadataUrl}", scope="mcp:query"`
        }
      }
    )
  }

  const token = authHeader.substring(7) // Remove 'Bearer ' prefix

  // Verify token with audience validation
  const payload = await verifyToken(token, resourceUrl)

  if (!payload) {
    return new Response(
      JSON.stringify({
        error: 'invalid_token',
        message: 'Invalid or expired access token'
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="${resourceUrl}", resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="The access token is invalid or expired"`
        }
      }
    )
  }

  // Check scope (MCP spec requires proper scope validation)
  const requiredScope = 'mcp:query'
  const tokenScopes = payload.scope.split(' ')

  if (!tokenScopes.includes(requiredScope)) {
    return new Response(
      JSON.stringify({
        error: 'insufficient_scope',
        message: 'Token does not have required scope'
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="${resourceUrl}", resource_metadata="${resourceMetadataUrl}", error="insufficient_scope", scope="${requiredScope}"`
        }
      }
    )
  }

  const patchedHeaders = new Headers(request.headers)
  patchedHeaders.set('accept', 'application/json, text/event-stream')
  patchedHeaders.set('content-type', 'application/json')

  const patchedRequest = new Request(request, { headers: patchedHeaders })
  return baseHandler(patchedRequest, context)
}

export const config = {
  path: '/mcp',
  rateLimit: {
    windowLimit: 20,
    windowSize: 120,
    aggregateBy: ["ip", "domain"],
  }
}
