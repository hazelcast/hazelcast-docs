// RFC 9728 Protected Resource Metadata endpoint

export default async (request: Request) => {
  const url = new URL(request.url);
  const origin = url.origin;

  const metadata = {
    resource: `${origin}/mcp`,
    authorization_servers: [`${origin}/oauth`],
    bearer_methods_supported: ["header"],
    resource_signing_alg_values_supported: ["RS256"],
    resource_documentation: "https://docs.hazelcast.com",
    scopes_supported: ["mcp:query"],
  };

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const config = {
  path: '/.well-known/oauth-protected-resource',
};
