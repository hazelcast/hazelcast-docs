// OAuth 2.1 Authorization endpoint with PKCE

import { generateSecureRandomString } from '../lib/oauth-utils.ts';
import { pendingAuths, type PendingAuth } from '../lib/pending-auth-storage.ts';

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';
const PENDING_AUTH_EXPIRY = 10 * 60 * 1000; // 10 minutes

export default async (request: Request) => {
  const url = new URL(request.url);

  // Parse OAuth 2.1 parameters
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');
  const scope = url.searchParams.get('scope') || 'mcp:query';
  const resource = url.searchParams.get('resource'); // RFC 8707
  const responseType = url.searchParams.get('response_type');

  // Validate required parameters
  if (!clientId || !redirectUri || !codeChallenge || !codeChallengeMethod) {
    return new Response(
      JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id, redirect_uri, code_challenge, code_challenge_method'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (responseType !== 'code') {
    return new Response(
      JSON.stringify({
        error: 'unsupported_response_type',
        error_description: 'Only response_type=code is supported'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (codeChallengeMethod !== 'S256') {
    return new Response(
      JSON.stringify({
        error: 'invalid_request',
        error_description: 'Only code_challenge_method=S256 is supported'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate redirect_uri (must be localhost or HTTPS)
  try {
    const redirectUrl = new URL(redirectUri);
    const isLocalhost = redirectUrl.hostname === 'localhost' || redirectUrl.hostname === '127.0.0.1';
    const isHttps = redirectUrl.protocol === 'https:';

    if (!isLocalhost && !isHttps) {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          error_description: 'redirect_uri must be localhost or HTTPS'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

  if (!GITHUB_CLIENT_ID) {
    return new Response('GitHub OAuth not configured', { status: 500 });
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

  // Store with automatic expiration (TTL handled by blob storage)
  await pendingAuths.set(internalState, pendingAuth, PENDING_AUTH_EXPIRY);

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
};
