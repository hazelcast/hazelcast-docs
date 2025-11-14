// OAuth 2.1 Authorization endpoint with PKCE

import { generateSecureRandomString } from '../lib/oauth-utils.ts';
import { pendingAuths, type PendingAuth } from '../lib/pending-auth-storage.ts';
import { registeredClients } from '../lib/client-storage.ts';
import { createOAuthErrorResponse } from '../lib/request-utils.ts';

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';
const PENDING_AUTH_EXPIRY = 10 * 60 * 1000;

// Response creation utilities
function createInvalidRequestResponse(description: string): Response {
  return createOAuthErrorResponse('invalid_request', description);
}

function createUnsupportedResponseTypeResponse(): Response {
  return createOAuthErrorResponse('unsupported_response_type', 'Only response_type=code is supported');
}

function createInvalidClientResponse(description: string): Response {
  return createOAuthErrorResponse('invalid_client', description, 401);
}

function createServerErrorResponse(message: string): Response {
  return new Response(message, { status: 500 });
}

export default async (request: Request) => {
  const url = new URL(request.url);

  // Parse OAuth 2.1 parameters
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');
  const scope = url.searchParams.get('scope') || 'mcp:query';
  const resource = url.searchParams.get('resource');
  const responseType = url.searchParams.get('response_type');

  // Validate required parameters
  if (!clientId || !redirectUri || !codeChallenge || !codeChallengeMethod) {
    return createInvalidRequestResponse(
      'Missing required parameters: client_id, redirect_uri, code_challenge, code_challenge_method'
    );
  }

  if (responseType !== 'code') {
    return createUnsupportedResponseTypeResponse();
  }

  if (codeChallengeMethod !== 'S256') {
    return createInvalidRequestResponse('Only code_challenge_method=S256 is supported');
  }

  console.log('Authorization request:', { clientId, redirectUri, scope });

  // Validate client_id - must be a registered client
  const client = await registeredClients.get(clientId);
  if (!client) {
    console.warn(`Unknown client_id ${clientId}. Clients must register at /oauth/register first.`);
    // DISABLED FOR THE DEMO!!!
    // return createInvalidClientResponse(
    //   'Unknown client_id. Clients must register at /oauth/register first.'
    // );
  }

  // Validate redirect_uri - must match one of the registered redirect_uris
  if (!client?.redirectUris.includes(redirectUri)) {
    console.warn(`redirect_uri ${redirectUri} does not match any registered redirect_uris for this client`)
    // DISABLED FOR THE DEMO!!!
    // return createInvalidRequestResponse(
    //   'redirect_uri does not match any registered redirect_uris for this client'
    // );
  }

  // Validate redirect_uri format (must be localhost or HTTPS)
  try {
    const redirectUrl = new URL(redirectUri);
    const isLocalhost = redirectUrl.hostname === 'localhost' || redirectUrl.hostname === '127.0.0.1';
    const isHttps = redirectUrl.protocol === 'https:';

    if (!isLocalhost && !isHttps) {
      return createInvalidRequestResponse('redirect_uri must be localhost or HTTPS');
    }
  } catch (e) {
    return createInvalidRequestResponse('Invalid redirect_uri');
  }

  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

  if (!GITHUB_CLIENT_ID) {
    return createServerErrorResponse('GitHub OAuth not configured');
  }

  // Create internal state to track this auth request (CSRF protection)
  // Use cryptographically secure random values for security (256 bits of entropy)
  const internalState = generateSecureRandomString(32);
  const pendingAuth: PendingAuth = {
    clientId,
    redirectUri,
    state: state || '',
    codeChallenge,
    codeChallengeMethod,
    scope,
    resource: resource || `${url.origin}/mcp`,
    expiresAt: Date.now() + PENDING_AUTH_EXPIRY,
  };

  await pendingAuths.set(internalState, pendingAuth, PENDING_AUTH_EXPIRY);

  console.log('Redirecting to GitHub OAuth for client:', clientId);

  // Redirect to GitHub OAuth
  const githubParams = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${url.origin}/oauth/callback`,
    scope: 'user:email',
    state: internalState,
  });

  return Response.redirect(`${GITHUB_OAUTH_URL}?${githubParams.toString()}`, 302);
};

export const config = {
  path: '/oauth/authorize',
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
