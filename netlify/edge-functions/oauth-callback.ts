import { pendingAuths } from '../lib/pending-auth-storage.ts';
import { createAuthorizationCode, isUserAuthorized } from '../lib/oauth-utils.ts';
import {
  exchangeGitHubCode,
  getGitHubUserData,
  validateGitHubConfig,
} from '../lib/github-oauth-utils.ts';
import {
  createPlainErrorResponse,
  createOAuthErrorRedirect,
  createOAuthSuccessRedirect,
} from '../lib/oauth-response-creators.ts';

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return createPlainErrorResponse(`GitHub OAuth error: ${error}`, 400);
  }

  if (!code || !state) {
    return createPlainErrorResponse('Missing code or state', 400);
  }

  // Retrieve pending auth request
  const pendingAuth = await pendingAuths.get(state);
  if (!pendingAuth) {
    return createPlainErrorResponse('Invalid or expired state', 400);
  }

  await pendingAuths.delete(state);

  if (Date.now() > pendingAuth.expiresAt) {
    return createPlainErrorResponse('Authorization request expired', 400);
  }

  const githubConfig = validateGitHubConfig();
  if (!githubConfig) {
    return createPlainErrorResponse('GitHub OAuth not configured', 500);
  }

  try {
    // Exchange GitHub code for access token
    const tokenData = await exchangeGitHubCode(
      code,
      githubConfig.clientId,
      githubConfig.clientSecret,
      `${url.origin}/oauth/callback`
    );

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub token error:', tokenData);
      return createOAuthErrorRedirect(
        pendingAuth.redirectUri,
        'server_error',
        'Failed to get GitHub access token',
        pendingAuth.state
      );
    }

    // Get complete user data from GitHub
    const userData = await getGitHubUserData(tokenData.access_token);

    if (!userData) {
      console.error('Failed to retrieve GitHub user data');
      return createOAuthErrorRedirect(
        pendingAuth.redirectUri,
        'server_error',
        'Could not retrieve user information',
        pendingAuth.state
      );
    }

    console.log('GitHub user data retrieved:', {
      id: userData.id,
      login: userData.login,
      email: userData.email,
    });

    // Check if user is authorized
    if (!isUserAuthorized(userData.email)) {
      console.error('User not authorized:', {
        email: userData.email,
        allowedEmails: process.env.ALLOWED_EMAILS || '(not set)',
        allowedDomains: process.env.ALLOWED_DOMAINS || '(not set)',
      });
      return createOAuthErrorRedirect(
        pendingAuth.redirectUri,
        'access_denied',
        'User not authorized',
        pendingAuth.state
      );
    }

    console.log('User authorized successfully:', userData.email);

    // Create authorization code with PKCE
    const authCode = await createAuthorizationCode(
      userData,
      pendingAuth.codeChallenge,
      pendingAuth.codeChallengeMethod,
      pendingAuth.redirectUri,
      pendingAuth.scope
    );

    // Redirect back to client with authorization code
    return createOAuthSuccessRedirect(
      pendingAuth.redirectUri,
      authCode,
      pendingAuth.state
    );

  } catch (error) {
    console.error('OAuth callback error:', error);
    return createOAuthErrorRedirect(
      pendingAuth.redirectUri,
      'server_error',
      'Authentication failed',
      pendingAuth.state
    );
  }
};

export const config = {
  path: '/oauth/callback',
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
