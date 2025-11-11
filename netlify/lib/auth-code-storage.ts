// Shared authorization code storage
// Must be shared between oauth-callback (creates) and oauth-token (verifies)

import { createBlobStorage } from './blob-storage.ts';

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

// Persistent storage using Netlify Blobs
export const authCodes = createBlobStorage<AuthorizationCode>('oauth-auth-codes');