// RFC 7591 Dynamic Client Registration endpoint
// For MCP clients - auto-registers public clients
//
// DESIGN NOTE: This endpoint generates client IDs but does NOT store or validate them.
// Rate limiting prevents abuse (10 requests/minute per IP/domain).
// Client validation is optional since PKCE provides security without client secrets.

import { generateSecureRandomString } from '../lib/oauth-utils.ts';

function createCORSPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function createInvalidRequestResponse(description: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: 'invalid_request', error_description: description }),
    {
      status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
}

function createMethodNotAllowedResponse(): Response {
  return createInvalidRequestResponse('Method must be POST', 405);
}

function createInvalidRedirectUriResponse(description: string): Response {
  return new Response(
    JSON.stringify({
      error: 'invalid_redirect_uri',
      error_description: description,
    }),
    { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}

export default async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return createCORSPreflightResponse();
  }

  if (request.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return createInvalidRequestResponse('Invalid JSON');
  }

  const { redirect_uris, client_name, grant_types, response_types } = body;

  // Validate redirect URIs (must be localhost or HTTPS)
  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return createInvalidRedirectUriResponse('redirect_uris is required');
  }

  for (const uri of redirect_uris) {
    try {
      const url = new URL(uri);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const isHttps = url.protocol === 'https:';

      if (!isLocalhost && !isHttps) {
        return createInvalidRedirectUriResponse('redirect_uri must be localhost or HTTPS')
      }
    } catch (e) {
      return createInvalidRedirectUriResponse('Invalid redirect_uri format')
    }
  }

  // Generate client ID (for MCP, we accept any public client)
  // Use cryptographically secure random values for security (128 bits of entropy)
  const clientId = generateSecureRandomString(16);

  // Return client registration response
  const response = {
    client_id: clientId,
    client_name: client_name || 'MCP Client',
    redirect_uris: redirect_uris,
    grant_types: grant_types || ['authorization_code', 'refresh_token'],
    response_types: response_types || ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
  };

  return new Response(JSON.stringify(response), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const config = {
  path: '/oauth/register',
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
