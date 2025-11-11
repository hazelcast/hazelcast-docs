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