/**
 * Verifies a PKCE (Proof Key for Code Exchange) code challenge.
 * Implements RFC 7636 - https://tools.ietf.org/html/rfc7636
 */
export async function verifyPkceChallenge(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string
): Promise<boolean> {
  if (codeChallengeMethod === 'S256') {
    const computedChallenge = await generateCodeChallenge(codeVerifier);
    return computedChallenge === codeChallenge;
  }

  // Only S256 method is supported
  return false;
}

/**
 * Generates a code challenge from a code verifier using SHA-256.
 * The result is base64url-encoded as per RFC 7636.
 */
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  return base64UrlEncode(hashArray);
}

/**
 * Encodes a byte array to base64url format (RFC 4648).
 * Converts standard base64 to base64url by replacing + with -, / with _, and removing padding =
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}