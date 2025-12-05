const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_API = 'https://api.github.com/user';
const GITHUB_USER_EMAILS_API = 'https://api.github.com/user/emails';

export interface GitHubUser {
  login: string;
  id: number;
  email: string | null;
  name: string | null;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export interface GitHubUserData {
  id: number;
  login: string;
  email: string;
  name: string;
}

/**
 * Exchanges a GitHub authorization code for an access token.
 */
export async function exchangeGitHubCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GitHubTokenResponse> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  return await response.json();
}

/**
 * Fetches user information from GitHub API.
 */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser | null> {
  const response = await fetch(GITHUB_USER_API, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

/**
 * Fetches user email addresses from GitHub API.
 * Returns the primary verified email, or the first available email.
 */
export async function fetchGitHubUserEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(GITHUB_USER_EMAILS_API, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const emails: GitHubEmail[] = await response.json();
  const primaryEmail = emails.find(e => e.primary && e.verified);

  return primaryEmail?.email || emails[0]?.email || null;
}

/**
 * Retrieves complete user data from GitHub, including email.
 */
export async function getGitHubUserData(accessToken: string): Promise<GitHubUserData | null> {
  const user = await fetchGitHubUser(accessToken);

  if (!user) {
    return null;
  }

  let email = user.email;

  // If email is not public, fetch from emails endpoint
  if (!email) {
    email = await fetchGitHubUserEmail(accessToken);
  }

  if (!email) {
    return null;
  }

  return {
    id: user.id,
    login: user.login,
    email,
    name: user.name || user.login,
  };
}

/**
 * Validates GitHub OAuth environment configuration.
 */
export function validateGitHubConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}