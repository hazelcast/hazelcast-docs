import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export function createUnauthorizedResponse(resourceUrl: string, resourceMetadataUrl: string): Response {
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

export function createInvalidTokenResponse(resourceUrl: string, resourceMetadataUrl: string): Response {
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

export function createInsufficientScopeResponse(resourceUrl: string, resourceMetadataUrl: string, requiredScope: string): Response {
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

export function createJsonRpcParsingErrorResponse(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null
    }),
    {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

export function createMethodNotAllowedResponse() {
  return new Response('Method not allowed', { status: 405, headers: { 'Allow': 'POST' } })
}

export function createSuccessResponse(jsonRpcResponse: JSONRPCMessage): Response {
  return new Response(
    JSON.stringify(jsonRpcResponse),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}
