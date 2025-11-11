// Shared pending authorization storage
// Must be shared between oauth-authorize (creates) and oauth-callback (verifies)

import { createBlobStorage } from './blob-storage.ts';

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

// Persistent storage using Netlify Blobs
export const pendingAuths = createBlobStorage<PendingAuth>('oauth-pending-auths');