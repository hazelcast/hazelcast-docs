/**
 * Parses request body parameters from either application/x-www-form-urlencoded
 * or application/json content types.
 *
 * @param request - The incoming HTTP request
 * @returns URLSearchParams containing the parsed parameters, or null if content type is unsupported
 */
export async function parseRequestParams(request: Request): Promise<URLSearchParams | null> {
  const contentType = request.headers.get('content-type');

  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const body = await request.text();
    return new URLSearchParams(body);
  }

  if (contentType?.includes('application/json')) {
    const json = await request.json();
    return new URLSearchParams(json);
  }

  return null;
}

/**
 * Extracts the audience (resource URL) from a request.
 * The audience is typically the origin plus the resource path.
 *
 * @param request - The incoming HTTP request
 * @param resourcePath - The path to append to the origin (default: '/mcp')
 * @returns The full audience URL
 */
export function extractAudience(request: Request, resourcePath = '/mcp'): string {
  const url = new URL(request.url);
  return `${url.origin}${resourcePath}`;
}

/**
 * Creates a JSON error response with OAuth error format.
 * General utility for creating OAuth-compliant error responses.
 *
 * @param error - The OAuth error code (e.g., 'invalid_request', 'invalid_client')
 * @param description - Human-readable error description
 * @param status - HTTP status code (default: 400)
 * @returns Response with JSON error payload
 */
export function createOAuthErrorResponse(
  error: string,
  description: string,
  status: number = 400
): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: description,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}