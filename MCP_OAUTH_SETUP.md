# MCP OAuth 2.1 Setup Guide

This document describes how to set up OAuth 2.1 authentication for the Hazelcast Docs MCP server, compliant with the [MCP Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization).

## Overview

The MCP server implements OAuth 2.1 with the following features:

- **OAuth 2.1 compliant** authorization server
- **RFC 7591** Dynamic Client Registration
- **PKCE (S256)** for secure authorization code exchange
- **GitHub** as identity provider
- **Bearer token** authentication for MCP endpoints
- **RFC 9728** Protected Resource Metadata
- **RFC 8414** Authorization Server Metadata
- **Audience validation** to prevent token misuse
- **Scope-based** access control
- **Client validation** with redirect_uri binding

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│             │         │   Authorization  │         │             │
│ MCP Client  │────────▶│     Server       │────────▶│   GitHub    │
│             │  (1)    │  (OAuth 2.1)     │  (2)    │   OAuth     │
└─────────────┘ Register└──────────────────┘ Verify  └─────────────┘
      │                          │
      │  (3) Authorize            │ (4) Store
      │  with PKCE               │ Client
      ▼                          ▼
┌─────────────────────────────────────────┐
│         MCP Resource Server             │
│          (/mcp endpoint)                │
│   Protected by Bearer Token Auth       │
└─────────────────────────────────────────┘

Flow:
1. Client registers at /oauth/register and receives client_id
2. Client authorization requests are validated against stored registrations
3. Authorization server verifies identity via GitHub OAuth
4. Clients are stored persistently with registered redirect_uris
```

## Environment Variables

Set the following environment variables in Netlify:

### Required Variables

```bash
# GitHub OAuth Application credentials
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret

# Token signing secret (generate a secure random string)
TOKEN_SECRET=your_secure_random_secret_at_least_32_chars

# Existing Kapa.ai credentials
KAPA_API_KEY=your_kapa_api_key
KAPA_PROJECT_ID=your_kapa_project_id
KAPA_INTEGRATION_ID=your_kapa_integration_id
```

Use this command to generate a secure random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Optional Variables (Access Control)

```bash
# Comma-separated list of allowed email addresses
ALLOWED_EMAILS=user1@example.com,user2@example.com

# Comma-separated list of allowed email domains
ALLOWED_DOMAINS=example.com,yourcompany.com
```

If neither `ALLOWED_EMAILS` nor `ALLOWED_DOMAINS` is set, all authenticated GitHub users will be allowed.

## GitHub OAuth App Setup

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Hazelcast Docs MCP
   - **Homepage URL**: `https://your-netlify-domain.netlify.app`
   - **Authorization callback URL**: `https://your-netlify-domain.netlify.app/oauth/callback`
4. Click "Register application"
5. Copy the **Client ID** and generate a **Client Secret**
6. Add these to your Netlify environment variables

## OAuth 2.1 Endpoints

### Discovery Endpoints

- **Protected Resource Metadata**: `/.well-known/oauth-protected-resource`
  - Returns information about the protected MCP resource
  - Specifies authorization server location

- **Authorization Server Metadata**: `/.well-known/oauth-authorization-server/oauth`
  - Returns OAuth server configuration
  - Lists supported grant types, scopes, and PKCE methods

### Dynamic Client Registration (RFC 7591)

- **Registration**: `/oauth/register`
  - Dynamically registers MCP clients per RFC 7591
  - Request body (JSON):
    ```json
    {
      "redirect_uris": ["https://your-app.com/callback"],
      "client_name": "My MCP Client",
      "grant_types": ["authorization_code", "refresh_token"],
      "response_types": ["code"]
    }
    ```
  - Response includes `client_id` to use in authorization requests
  - Clients are stored persistently in blob storage
  - All subsequent authorization requests must use a registered `client_id`
  - The `redirect_uri` in authorization requests must match one of the registered `redirect_uris`
  - Rate limited: 10 requests per minute per IP/domain

  **Security Note**: Client registration is now **required** before authorization. This prevents:
  - Unauthorized clients from using the authorization server
  - Redirect URI hijacking attacks
  - Client impersonation
  - Enables tracking and potential revocation of misbehaving clients

### Authorization Flow Endpoints

- **Authorization**: `/oauth/authorize`
  - Initiates OAuth flow with PKCE
  - Parameters:
    - `response_type=code` (required)
    - `client_id` (required)
    - `redirect_uri` (required, must be localhost or HTTPS)
    - `code_challenge` (required, PKCE challenge)
    - `code_challenge_method=S256` (required)
    - `scope` (optional, default: `mcp:query`)
    - `resource` (optional, specifies target resource)
    - `state` (optional, recommended)

- **Token**: `/oauth/token`
  - Exchanges authorization code for access token
  - Supports grant types:
    - `authorization_code` (with PKCE verification)
    - `refresh_token` (with token rotation)

- **Callback**: `/oauth/callback`
  - Internal endpoint for GitHub OAuth callback
  - Handles GitHub authentication and generates authorization code

### Protected Resource

- **MCP Endpoint**: `/mcp`
  - Requires Bearer token in `Authorization` header
  - Returns `401` with `WWW-Authenticate` header if unauthenticated
  - Returns `403` if insufficient scope

## OAuth Flow

### 1. Protected Resource Discovery

```http
GET /.well-known/oauth-protected-resource
```

Response:
```json
{
  "resource": "https://your-domain.netlify.app/mcp",
  "authorization_servers": ["https://your-domain.netlify.app/oauth"],
  "scopes_supported": ["mcp:query"]
}
```

### 2. Authorization Server Metadata Discovery

```http
GET /.well-known/oauth-authorization-server/oauth
```

Response:
```json
{
  "issuer": "https://your-domain.netlify.app/oauth",
  "authorization_endpoint": "https://your-domain.netlify.app/oauth/authorize",
  "token_endpoint": "https://your-domain.netlify.app/oauth/token",
  "registration_endpoint": "https://your-domain.netlify.app/oauth/register",
  "code_challenge_methods_supported": ["S256"]
}
```

### 3. Dynamic Client Registration

Using the `registration_endpoint` from step 2, register the client:

```http
POST /oauth/register
Content-Type: application/json

{
  "redirect_uris": ["https://your-app.com/callback"],
  "client_name": "My MCP Client"
}
```

Response:
```json
{
  "client_id": "randomly_generated_client_id",
  "client_name": "My MCP Client",
  "redirect_uris": ["https://your-app.com/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "web"
}
```

**Important**: Store the `client_id` securely. You'll need it for all authorization requests.

### 4. Generate PKCE Values

```javascript
// Generate code verifier (random string, 43-128 chars)
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// Generate code challenge (SHA-256 hash of verifier)
const hash = crypto.createHash('sha256').update(codeVerifier).digest();
const codeChallenge = hash.toString('base64url');
```

### 5. Authorization Request

```http
GET /oauth/authorize?response_type=code
  &client_id=your_client_id
  &redirect_uri=https://your-app.com/callback
  &code_challenge=CHALLENGE_HERE
  &code_challenge_method=S256
  &scope=mcp:query
  &resource=https://your-domain.netlify.app/mcp
  &state=random_state
```

User is redirected to GitHub, authenticates, and is redirected back with an authorization code.

### 6. Token Exchange

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=https://your-app.com/callback
&code_verifier=CODE_VERIFIER
&client_id=your_client_id
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "mcp:query"
}
```

### 7. Access Protected Resource

```http
POST /mcp
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { ... }
}
```

### 8. Refresh Token (Optional)

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=REFRESH_TOKEN
```

## Security Features

### PKCE (Proof Key for Code Exchange)

- Required for all authorization code flows
- Only S256 challenge method supported
- Prevents authorization code interception attacks

### Token Security

- Access tokens expire in 1 hour
- Refresh tokens expire in 7 days
- Refresh token rotation on use
- HMAC-SHA256 signature validation
- Audience claim validation prevents token reuse

### Access Control

- GitHub authentication required
- Optional email/domain whitelisting
- Scope-based authorization

### Transport Security

- All endpoints require HTTPS in production
- Redirect URIs must be localhost or HTTPS
- Bearer tokens never sent in query strings

## Testing

### Test Protected Resource Access

```bash
# Without token (should return 401)
curl -X POST https://your-domain.netlify.app/mcp \
  -H "Content-Type: application/json"

# Expected response includes WWW-Authenticate header with resource_metadata URL
```

### Test Discovery Endpoints

```bash
# Protected Resource Metadata
curl https://your-domain.netlify.app/.well-known/oauth-protected-resource

# Authorization Server Metadata
curl https://your-domain.netlify.app/.well-known/oauth-authorization-server/oauth
```

## MCP Client Configuration

Most MCP clients will automatically handle the OAuth flow if they support MCP Auth and RFC 7591 Dynamic Client Registration.

Configure your client with:
- **MCP Server URL**: `https://your-domain.netlify.app/mcp`

The client will automatically:
1. Attempt to access `/mcp`
2. Receive 401 with discovery information
3. Fetch protected resource metadata
4. Fetch authorization server metadata
5. Register dynamically to obtain a `client_id`
6. Initiate OAuth flow with PKCE using the registered `client_id`
7. Store and use access tokens
8. Automatically refresh tokens when needed

## Troubleshooting

### "Invalid or expired access token"

- Check that `TOKEN_SECRET` is consistent across deployments
- Verify token hasn't expired (1 hour lifetime)
- Ensure token audience matches the resource URL

### "User not authorized"

- Check `ALLOWED_EMAILS` and `ALLOWED_DOMAINS` settings
- Verify user's GitHub email is verified
- Check Netlify function logs for details

### "Invalid authorization code or code_verifier"

- Ensure PKCE code_verifier matches the original code_challenge
- Check that authorization code hasn't expired (10 minutes)
- Verify redirect_uri matches exactly

### "Unknown client_id" or "invalid_client"

- The client must register at `/oauth/register` before authorizing
- Check that you're using the `client_id` returned from registration
- Client registrations are stored for 1 year - if expired, re-register
- Verify you're not mixing client_ids from different environments (dev vs prod)

### "redirect_uri does not match"

- The `redirect_uri` in the authorization request must exactly match one of the URIs registered during client registration
- Check for trailing slashes, http vs https, and port numbers
- Re-register the client if you need to add additional redirect URIs


## References

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [RFC 7591: Dynamic Client Registration](https://www.rfc-editor.org/rfc/rfc7591.html)
- [RFC 9728: Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728.html)
- [RFC 8414: Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414.html)
- [RFC 7636: PKCE](https://www.rfc-editor.org/rfc/rfc7636.html)
- [RFC 8707: Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
