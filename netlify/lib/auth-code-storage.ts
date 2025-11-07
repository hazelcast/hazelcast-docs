// Shared authorization code storage
// Must be shared between oauth-callback (creates) and oauth-token (verifies)

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

// In-memory storage (replace with Redis/KV in production)
export const authCodes = new Map<string, AuthorizationCode>();