import { authCodes, type AuthorizationCode } from '../lib/auth-code-storage.ts';
import {
  ACCESS_TOKEN_EXPIRY,
  createAccessToken,
  createRefreshToken,
  getRefreshTokenPayload,
  revokeRefreshToken,
} from '../lib/token-utils.ts';
import { verifyPkceChallenge } from '../lib/oauth-utils.ts';
import { parseRequestParams, extractAudience } from '../lib/request-utils.ts';
import {
  createCorsPreflightResponse,
  createMethodNotAllowedResponse,
  createUnsupportedContentTypeResponse,
  createUnsupportedGrantTypeResponse,
  createMissingParametersResponse,
  createInvalidGrantResponse,
  createTokenSuccessResponse,
  type TokenResponse,
} from '../lib/oauth-response-creators.ts';

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

  const isValidChallenge = await verifyPkceChallenge(
    codeVerifier,
    authCode.codeChallenge,
    authCode.codeChallengeMethod
  );

  if (!isValidChallenge) {
    return null;
  }

  // Delete code after successful verification (single use)
  authCodes.delete(code);

  return authCode;
}

export default async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return createCorsPreflightResponse();
  }

  if (request.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }

  const params = await parseRequestParams(request);
  if (!params) {
    return createUnsupportedContentTypeResponse();
  }

  const grantType = params.get('grant_type');

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(params, request);
  }

  if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(params, request);
  }

  return createUnsupportedGrantTypeResponse(grantType);
};

async function handleAuthorizationCodeGrant(params: URLSearchParams, request: Request): Promise<Response> {
  const code = params.get('code');
  const codeVerifier = params.get('code_verifier');
  const redirectUri = params.get('redirect_uri');

  if (!code || !codeVerifier || !redirectUri) {
    return createMissingParametersResponse('code, code_verifier, redirect_uri');
  }

  const authCode = await verifyAuthorizationCode(code, codeVerifier, redirectUri);
  if (!authCode) {
    return createInvalidGrantResponse('Invalid authorization code or code_verifier');
  }

  const tokenParams = {
    userId: String(authCode.user.id),
    email: authCode.user.email,
    name: authCode.user.name,
    audience: extractAudience(request),
    scope: authCode.scope,
  };

  const accessToken = await createAccessToken({ ...tokenParams });
  const refreshToken = await createRefreshToken({ ...tokenParams });

  return createTokenSuccessResponse({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: refreshToken,
    scope: authCode.scope,
  });
}

function isTokenExpired(expiry: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return expiry < now;
}

async function handleRefreshTokenGrant(params: URLSearchParams, request: Request): Promise<Response> {
  const refreshToken = params.get('refresh_token');

  if (!refreshToken) {
    return createMissingParametersResponse('refresh_token');
  }

  const payload = getRefreshTokenPayload(refreshToken);

  if (!payload) {
    return createInvalidGrantResponse('Invalid refresh token');
  }

  if (isTokenExpired(payload.exp)) {
    revokeRefreshToken(refreshToken);
    return createInvalidGrantResponse('Refresh token expired');
  }

  // Revoke old refresh token and create new one (refresh token rotation)
  revokeRefreshToken(refreshToken);

  const tokenParams = {
    userId: payload.sub,
    email: payload.email,
    name: payload.name,
    audience: extractAudience(request),
    scope: payload.scope,
  };

  const newAccessToken = await createAccessToken({ ...tokenParams });
  const newRefreshToken = await createRefreshToken({ ...tokenParams });

  const tokenResponse: TokenResponse = {
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: newRefreshToken,
    scope: payload.scope,
  };

  return createTokenSuccessResponse(tokenResponse);
}

export const config = {
  path: '/oauth/token',
};
