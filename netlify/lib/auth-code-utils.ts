import { authCodes, type AuthorizationCode } from './auth-code-storage.ts';

const AUTH_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

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