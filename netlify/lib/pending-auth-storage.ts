// Shared pending authorization storage
// Must be shared between oauth-authorize (creates) and oauth-callback (verifies)

import { createAuthStorage } from './auth-storage.ts';

export interface PendingAuth {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string;
  expiresAt: number;
}

export const pendingAuths = createAuthStorage<PendingAuth>('oauth-pending-auths');
