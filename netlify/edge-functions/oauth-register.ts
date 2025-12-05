// RFC 7591 Dynamic Client Registration endpoint
// For MCP clients - auto-registers public clients
//
// Stores registered clients in blob storage for validation in authorization requests.
// Enforces redirect_uri binding and enables client management per RFC 7591.
// Rate limiting prevents abuse (10 requests/minute per IP/domain).

import { generateSecureRandomString } from '../lib/oauth-utils.ts';
import { registeredClients, type RegisteredClient } from '../lib/client-storage.ts';
import { createOAuthErrorResponse } from '../lib/request-utils.ts';

// Store client with 1-year TTL (effectively permanent for MCP use case)
const CLIENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

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
  return createOAuthErrorResponse('invalid_request', description, status);
}

function createMethodNotAllowedResponse(): Response {
  return createInvalidRequestResponse('Method must be POST', 405);
}

function createInvalidRedirectUriResponse(description: string): Response {
  return createOAuthErrorResponse('invalid_redirect_uri', description);
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
        console.error('Invalid redirect_uri (not localhost/HTTPS):', uri);
        return createInvalidRedirectUriResponse('redirect_uri must be localhost or HTTPS');
      }
    } catch (e) {
      console.error('Invalid redirect_uri format:', uri);
      return createInvalidRedirectUriResponse('Invalid redirect_uri format');
    }
  }

  // Generate client ID (for MCP, we accept any public client)
  // Use cryptographically secure random values for security (128 bits of entropy)
  const clientId = generateSecureRandomString(16);

  // Store the registered client
  const registeredClient: RegisteredClient = {
    clientId,
    clientName: client_name || 'MCP Client',
    redirectUris: redirect_uris,
    grantTypes: grant_types || ['authorization_code', 'refresh_token'],
    responseTypes: response_types || ['code'],
    tokenEndpointAuthMethod: 'none',
    applicationType: 'web',
    createdAt: Date.now(),
  };

  await registeredClients.set(clientId, registeredClient, CLIENT_TTL_MS);

  console.log('Client registered:', { clientId, clientName: registeredClient.clientName, redirectUrisCount: redirect_uris.length });

  // Return client registration response per RFC 7591
  const response = {
    client_id: clientId,
    client_name: registeredClient.clientName,
    redirect_uris: registeredClient.redirectUris,
    grant_types: registeredClient.grantTypes,
    response_types: registeredClient.responseTypes,
    token_endpoint_auth_method: registeredClient.tokenEndpointAuthMethod,
    application_type: registeredClient.applicationType,
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
