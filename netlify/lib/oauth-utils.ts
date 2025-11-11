import { authCodes, type AuthorizationCode } from './auth-code-storage.ts';

const AUTH_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// Authorization Code Management
// ============================================================================

export interface UserInfo {
  id: number;
  login: string;
  email: string;
  name: string;
}

/**
 * Creates and stores an authorization code with PKCE parameters.
 * The code will automatically expire after AUTH_CODE_EXPIRY.
 *
 * @returns The generated authorization code
 */
export async function createAuthorizationCode(
  user: UserInfo,
  codeChallenge: string,
  codeChallengeMethod: string,
  redirectUri: string,
  scope: string
): Promise<string> {
  const code = crypto.randomUUID();

  const authCode: AuthorizationCode = {
    code,
    user,
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    scope,
    expiresAt: Date.now() + AUTH_CODE_EXPIRY,
  };

  authCodes.set(code, authCode);

  // Clean up after expiry
  setTimeout(() => authCodes.delete(code), AUTH_CODE_EXPIRY);

  return code;
}

// ============================================================================
// PKCE (Proof Key for Code Exchange) - RFC 7636
// ============================================================================

/**
 * Verifies a PKCE (Proof Key for Code Exchange) code challenge.
 * Implements RFC 7636 - https://tools.ietf.org/html/rfc7636
 */
export async function verifyPkceChallenge(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string
): Promise<boolean> {
  if (codeChallengeMethod === 'S256') {
    const computedChallenge = await generateCodeChallenge(codeVerifier);
    return computedChallenge === codeChallenge;
  }

  // Only S256 method is supported
  return false;
}

/**
 * Generates a code challenge from a code verifier using SHA-256.
 * The result is base64url-encoded as per RFC 7636.
 */
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  return base64UrlEncode(hashArray);
}

/**
 * Encodes a byte array to base64url format (RFC 4648).
 * Converts standard base64 to base64url by replacing + with -, / with _, and removing padding =
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ============================================================================
// User Authorization
// ============================================================================

/**
 * Checks if a user is authorized to access the system based on
 * email whitelist and domain whitelist configuration.
 *
 * If no restrictions are configured (both ALLOWED_EMAILS and ALLOWED_DOMAINS are empty),
 * all users are allowed.
 *
 * @param email - The user's email address
 * @returns true if the user is authorized, false otherwise
 */
export function isUserAuthorized(email: string): boolean {
  const allowedEmails = process.env.ALLOWED_EMAILS || '';
  const allowedDomains = process.env.ALLOWED_DOMAINS || '';

  // If no restrictions are set, allow all users
  if (!allowedEmails && !allowedDomains) {
    return true;
  }

  // Check email whitelist
  if (allowedEmails && isEmailInWhitelist(email, allowedEmails)) {
    return true;
  }

  // Check domain whitelist
  if (allowedDomains && isDomainInWhitelist(email, allowedDomains)) {
    return true;
  }

  return false;
}

/**
 * Checks if an email is in the comma-separated whitelist.
 */
function isEmailInWhitelist(email: string, allowedEmails: string): boolean {
  const emails = allowedEmails.split(',').map(e => e.trim().toLowerCase());
  return emails.includes(email.toLowerCase());
}

/**
 * Checks if an email's domain is in the comma-separated domain whitelist.
 */
function isDomainInWhitelist(email: string, allowedDomains: string): boolean {
  const domains = allowedDomains.split(',').map(d => d.trim().toLowerCase());
  const emailDomain = email.split('@')[1]?.toLowerCase();

  return emailDomain ? domains.includes(emailDomain) : false;
}