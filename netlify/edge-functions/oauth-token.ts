import { authCodes, type AuthorizationCode } from '../lib/auth-code-storage.ts';
import {
  ACCESS_TOKEN_EXPIRY,
  createAccessToken,
  createRefreshToken,
  getRefreshTokenPayload, revokeRefreshToken,
} from '../lib/token-utils.ts';

async function verifyAuthorizationCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<AuthorizationCode | null> {
  const authCode = authCodes.get(code);

  if (!authCode) {
    return null;
  }

  if (Date.now() > authCode.expiresAt) {
    authCodes.delete(code);
    return null;
  }

  if (authCode.redirectUri !== redirectUri) {
    return null;
  }

  // Verify PKCE challenge
  if (authCode.codeChallengeMethod === 'S256') {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const base64 = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    if (base64 !== authCode.codeChallenge) {
      return null;
    }
  }

  // Delete code after successful verification (single use)
  authCodes.delete(code);

  return authCode;
}

export default async (request: Request) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
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

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'invalid_request', error_description: 'Method must be POST' }),
      { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const contentType = request.headers.get('content-type');
  let params: URLSearchParams;

  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const body = await request.text();
    params = new URLSearchParams(body);
  } else if (contentType?.includes('application/json')) {
    const json = await request.json();
    params = new URLSearchParams(json);
  } else {
    return new Response(
      JSON.stringify({ error: 'invalid_request', error_description: 'Unsupported content type' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const grantType = params.get('grant_type');

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(params, request);
  } else if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(params, request);
  } else {
    return new Response(
      JSON.stringify({ error: 'unsupported_grant_type', error_description: `Grant type ${grantType} not supported` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

async function handleAuthorizationCodeGrant(params: URLSearchParams, request: Request): Promise<Response> {
  const code = params.get('code');
  const codeVerifier = params.get('code_verifier');
  const redirectUri = params.get('redirect_uri');

  if (!code || !codeVerifier || !redirectUri) {
    return new Response(
      JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing required parameters: code, code_verifier, redirect_uri'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify authorization code and PKCE
  const authCode = await verifyAuthorizationCode(code, codeVerifier, redirectUri);

  if (!authCode) {
    return new Response(
      JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Invalid authorization code or code_verifier'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const audience = `${url.origin}/mcp`;

  // Create access and refresh tokens
  const accessToken = await createAccessToken(
    String(authCode.user.id),
    authCode.user.email,
    authCode.user.name,
    audience,
    authCode.scope
  );

  const refreshToken = await createRefreshToken(
    String(authCode.user.id),
    authCode.user.email,
    authCode.user.name,
    audience,
    authCode.scope
  );

  const response = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: refreshToken,
    scope: authCode.scope,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function handleRefreshTokenGrant(params: URLSearchParams, request: Request): Promise<Response> {
  const refreshToken = params.get('refresh_token');

  if (!refreshToken) {
    return new Response(
      JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing refresh_token'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const payload = getRefreshTokenPayload(refreshToken);

  if (!payload) {
    return new Response(
      JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Invalid refresh token'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if token is expired
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    revokeRefreshToken(refreshToken);
    return new Response(
      JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Refresh token expired'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Revoke old refresh token and create new one (refresh token rotation)
  revokeRefreshToken(refreshToken);

  const url = new URL(request.url);
  const audience = `${url.origin}/mcp`;

  const newAccessToken = await createAccessToken(
    payload.sub,
    payload.email,
    payload.name,
    audience,
    payload.scope
  );

  const newRefreshToken = await createRefreshToken(
    payload.sub,
    payload.email,
    payload.name,
    audience,
    payload.scope
  );

  const response = {
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: newRefreshToken,
    scope: payload.scope,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const config = {
  path: '/oauth/token',
};
