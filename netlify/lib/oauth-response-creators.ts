export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface ErrorResponse {
  error: string;
  error_description: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
const CACHE_CONTROL_HEADERS = {
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
};

export function createCorsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export function createMethodNotAllowedResponse(): Response {
  return createErrorResponse(
    'invalid_request',
    'Method must be POST',
    405,
    true
  );
}

export function createUnsupportedContentTypeResponse(): Response {
  return createErrorResponse(
    'invalid_request',
    'Unsupported content type',
    400,
    false
  );
}

export function createUnsupportedGrantTypeResponse(grantType: string | null): Response {
  return createErrorResponse(
    'unsupported_grant_type',
    `Grant type ${grantType} not supported`,
    400,
    false
  );
}

export function createMissingParametersResponse(params: string): Response {
  return createErrorResponse(
    'invalid_request',
    `Missing required parameters: ${params}`,
    400,
    false
  );
}

export function createInvalidGrantResponse(description: string): Response {
  return createErrorResponse(
    'invalid_grant',
    description,
    400,
    false
  );
}

export function createTokenSuccessResponse(tokenResponse: TokenResponse): Response {
  return new Response(JSON.stringify(tokenResponse), {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      ...CACHE_CONTROL_HEADERS,
      ...CORS_HEADERS,
    },
  });
}

function createErrorResponse(
  error: string,
  errorDescription: string,
  status: number,
  includeCors: boolean
): Response {
  const errorResponse: ErrorResponse = {
    error,
    error_description: errorDescription,
  };

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...(includeCors ? CORS_HEADERS : {}),
    },
  });
}

/**
 * Creates an OAuth error redirect response.
 * Used to redirect back to the client with an error.
 */
export function createOAuthErrorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state?: string
): Response {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);

  if (state) {
    url.searchParams.set('state', state);
  }

  return Response.redirect(url.toString(), 302);
}

/**
 * Creates an OAuth success redirect response with authorization code.
 */
export function createOAuthSuccessRedirect(
  redirectUri: string,
  code: string,
  state?: string
): Response {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);

  if (state) {
    url.searchParams.set('state', state);
  }

  return Response.redirect(url.toString(), 302);
}

/**
 * Creates a plain error response (non-JSON).
 * Used for simple error messages.
 */
export function createPlainErrorResponse(message: string, status: number): Response {
  return new Response(message, { status });
}