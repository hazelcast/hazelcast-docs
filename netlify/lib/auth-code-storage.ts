// Shared authorization code storage
// Must be shared between oauth-callback (creates) and oauth-token (verifies)

import { createAuthStorage } from './auth-storage.ts';

export interface AuthorizationCode {
  code: string;
  user: {
    id: number;
    login: string;
    email: string;
    name: string;
  };
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  scope: string;
  expiresAt: number;
}

export const authCodes = createAuthStorage<AuthorizationCode>('oauth-auth-codes');
