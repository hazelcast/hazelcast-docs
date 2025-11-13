import handle from '@modelfetch/netlify'
import { extractBearerToken, validateScope, verifyToken } from '../lib/token-utils.ts';
import {
  createInsufficientScopeResponse,
  createInvalidTokenResponse,
  createMethodNotAllowedResponse,
  createUnauthorizedResponse,
} from '../lib/mcp-response-creators.ts';
import { mcpServer, SERVER_VERSION } from '../lib/mcp-server.ts';

export default async (request: Request, context: any): Promise<Response> => {
  const url = new URL(request.url)
  console.log(request.method, url.pathname);

  if (request.method !== 'POST') {
    return createMethodNotAllowedResponse()
  }

  const resourceUrl = `${url.origin}/mcp`
  const resourceMetadataUrl = `${url.origin}/.well-known/oauth-protected-resource`

  const token = extractBearerToken(request.headers.get('Authorization'))
  if (!token) {
    console.error('MCP request missing authorization token')
    return createUnauthorizedResponse(resourceUrl, resourceMetadataUrl)
  }

  const payload = await verifyToken(token, resourceUrl)
  if (!payload) {
    console.error('MCP request with invalid token')
    return createInvalidTokenResponse(resourceUrl, resourceMetadataUrl)
  }

  const requiredScope = 'mcp:query'
  if (!validateScope(payload, requiredScope)) {
    console.error('MCP request with insufficient scope:', { userEmail: payload.email, scope: payload.scope })
    return createInsufficientScopeResponse(resourceUrl, resourceMetadataUrl, requiredScope)
  }

  console.log('MCP request authenticated:', { userEmail: payload.email })

  return handle(mcpServer)(request, context)
}

export const config = {
  path: '/mcp',
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
}
