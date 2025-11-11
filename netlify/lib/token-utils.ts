import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_EXPIRY = 3600; // 1 hour
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 3600; // 7 days

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

// In-memory storage (replace with Redis/KV in production)
const refreshTokens = new Map<string, TokenPayload>();

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
  refreshTokens.set(token, payload);

  return token;
}

export function getRefreshTokenPayload(refreshToken: string): TokenPayload | null {
  return refreshTokens.get(refreshToken) || null;
}

export function revokeRefreshToken(refreshToken: string): void {
  refreshTokens.delete(refreshToken);
}
