// OAuth callback from GitHub
import { authCodes, type AuthorizationCode } from '../lib/auth-code-storage.ts';
import { pendingAuths } from './oauth-authorize.ts';

const AUTH_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

async function createAuthorizationCode(
  user: { id: number; login: string; email: string; name: string },
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

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_API = 'https://api.github.com/user';
const GITHUB_USER_EMAILS_API = 'https://api.github.com/user/emails';

function isAllowedUser(email: string): boolean {
  const allowedEmails = process.env.ALLOWED_EMAILS || '';
  const allowedDomains = process.env.ALLOWED_DOMAINS || '';

  // If no restrictions are set, allow all
  if (!allowedEmails && !allowedDomains) {
    return true;
  }

  // Check email whitelist
  if (allowedEmails) {
    const emails = allowedEmails.split(',').map(e => e.trim().toLowerCase());
    if (emails.includes(email.toLowerCase())) {
      return true;
    }
  }

  // Check domain whitelist
  if (allowedDomains) {
    const domains = allowedDomains.split(',').map(d => d.trim().toLowerCase());
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain && domains.includes(emailDomain)) {
      return true;
    }
  }

  return false;
}

interface GitHubUser {
  login: string;
  id: number;
  email: string | null;
  name: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(`GitHub OAuth error: ${error}`, { status: 400 });
  }

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  // Retrieve pending auth request
  const pendingAuth = pendingAuths.get(state);
  if (!pendingAuth) {
    return new Response('Invalid or expired state', { status: 400 });
  }

  pendingAuths.delete(state);

  if (Date.now() > pendingAuth.expiresAt) {
    return new Response('Authorization request expired', { status: 400 });
  }

  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return new Response('GitHub OAuth not configured', { status: 500 });
  }

  try {
    // Exchange GitHub code for access token
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: `${url.origin}/oauth/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub token error:', tokenData);
      return buildErrorRedirect(
        pendingAuth.redirectUri,
        'server_error',
        'Failed to get GitHub access token',
        pendingAuth.state
      );
    }

    const githubToken = tokenData.access_token;

    // Get user information from GitHub
    const userResponse = await fetch(GITHUB_USER_API, {
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      return buildErrorRedirect(
        pendingAuth.redirectUri,
        'server_error',
        'Failed to fetch user information',
        pendingAuth.state
      );
    }

    const user: GitHubUser = await userResponse.json();

    // Get user email
    let email = user.email;
    if (!email) {
      const emailsResponse = await fetch(GITHUB_USER_EMAILS_API, {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (emailsResponse.ok) {
        const emails: GitHubEmail[] = await emailsResponse.json();
        const primaryEmail = emails.find(e => e.primary && e.verified);
        email = primaryEmail?.email || emails[0]?.email || '';
      }
    }

    if (!email) {
      return buildErrorRedirect(
        pendingAuth.redirectUri,
        'server_error',
        'Could not retrieve user email',
        pendingAuth.state
      );
    }

    // Check if user is allowed
    if (!isAllowedUser(email)) {
      return buildErrorRedirect(
        pendingAuth.redirectUri,
        'access_denied',
        'User not authorized',
        pendingAuth.state
      );
    }

    // Create authorization code with PKCE
    const authCode = await createAuthorizationCode(
      {
        id: user.id,
        login: user.login,
        email: email,
        name: user.name || user.login,
      },
      pendingAuth.codeChallenge,
      pendingAuth.codeChallengeMethod,
      pendingAuth.redirectUri,
      pendingAuth.scope
    );

    // Redirect back to client with authorization code
    const redirectUrl = new URL(pendingAuth.redirectUri);
    redirectUrl.searchParams.set('code', authCode);
    if (pendingAuth.state) {
      redirectUrl.searchParams.set('state', pendingAuth.state);
    }

    return Response.redirect(redirectUrl.toString(), 302);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return buildErrorRedirect(
      pendingAuth.redirectUri,
      'server_error',
      'Authentication failed',
      pendingAuth.state
    );
  }
};

function buildErrorRedirect(redirectUri: string, error: string, description: string, state?: string): Response {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) {
    url.searchParams.set('state', state);
  }
  return Response.redirect(url.toString(), 302);
}

export const config = {
  path: '/oauth/callback',
};
