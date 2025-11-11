import { jwtVerify, SignJWT } from 'jose';
import { createBlobStorage } from './blob-storage.ts';

export const ACCESS_TOKEN_EXPIRY = 3600; // 1 hour
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 3600; // 7 days
export const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY * 1000; // Convert to milliseconds for TTL

export interface CreateTokenParams {
  userId: string;
  email: string;
  name: string;
  audience: string;
  scope: string;
}

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

// Persistent storage using Netlify Blobs
const refreshTokens = createBlobStorage<TokenPayload>('oauth-refresh-tokens');

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

export async function verifyToken(token: string, expectedAudience: string): Promise<TokenPayload | null> {
  if (!process.env.TOKEN_SECRET) {
    throw new Error("TOKEN_SECRET environment variable must be set");
  }
  try {
    const encoder = new TextEncoder();
    const secret = encoder.encode(process.env.TOKEN_SECRET);

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

export function validateScope(payload: TokenPayload, requiredScope: string): boolean {
  const tokenScopes = payload.scope.split(' ');
  return tokenScopes.includes(requiredScope);
}

async function createToken(payload: TokenPayload): Promise<string> {
  const TOKEN_SECRET = process.env.TOKEN_SECRET;
  if (!TOKEN_SECRET) {
    throw new Error("TOKEN_SECRET environment variable must be set");
  }
  const encoder = new TextEncoder();
  const secret = encoder.encode(TOKEN_SECRET);

  const token = await new SignJWT({
    email: payload.email,
    name: payload.name,
    scope: payload.scope,
    token_type: payload.token_type,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setAudience(payload.aud)
    .setExpirationTime(payload.exp)
    .setIssuedAt(payload.iat)
    .sign(secret);

  return token;
}

export async function createAccessToken({
  userId,
  email,
  name,
  audience,
  scope,
}: CreateTokenParams): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: userId,
    email,
    name,
    aud: audience,
    scope,
    exp: now + ACCESS_TOKEN_EXPIRY,
    iat: now,
    token_type: 'access',
  };

  return await createToken(payload);
}

export async function createRefreshToken({
   userId,
   email,
   name,
   audience,
   scope,
 }: CreateTokenParams): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: userId,
    email,
    name,
    aud: audience,
    scope,
    exp: now + REFRESH_TOKEN_EXPIRY,
    iat: now,
    token_type: 'refresh',
  };

  const token = await createToken(payload);
  // Store with automatic expiration (TTL handled by blob storage)
  await refreshTokens.set(token, payload, REFRESH_TOKEN_EXPIRY_MS);

  return token;
}

export async function getRefreshTokenPayload(refreshToken: string): Promise<TokenPayload | null> {
  return await refreshTokens.get(refreshToken);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await refreshTokens.delete(refreshToken);
}
