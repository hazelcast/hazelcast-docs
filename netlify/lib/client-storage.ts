// Shared registered OAuth client storage
// Stores dynamically registered clients per RFC 7591

import { createAuthStorage } from './auth-storage.ts';

export interface RegisteredClient {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  applicationType: string;
  createdAt: number;
}

export const registeredClients = createAuthStorage<RegisteredClient>('oauth-clients');
