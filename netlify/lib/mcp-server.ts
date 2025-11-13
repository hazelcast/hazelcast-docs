import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const API_BASE = 'https://api.kapa.ai'
export const SERVER_VERSION = '0.0.1';

export const mcpServer = new McpServer({
  title: 'Hazelcast Docs MCP',
  name: 'hazelcast-docs-mcp',
  description: 'A Model Context Protocol (MCP) server for accessing Hazelcast documentation.',
  version: SERVER_VERSION,
})


mcpServer.registerTool(
  'ask_hazelcast_docs',
  {
    title: 'Search Hazelcast Sources',
    description: 'Search the official Hazelcast documentation and return the most relevant sections from it for a user query. Results are ordered by relevance, with the most relevant result returned first. Each returned section includes the url and its actual content in markdown. Use this tool to for all queries that require Hazelcast knowledge.',
    inputSchema: {
      question: z.string()
        .min(1, 'Question cannot be empty')
        .max(5000, 'Question cannot exceed 5000 characters')
    },
  },
  async ({ question }) => {
    const normalizedQuestion = question.trim();

    const KAPA_API_KEY = process.env.KAPA_API_KEY;
    const KAPA_PROJECT_ID = process.env.KAPA_PROJECT_ID;
    const KAPA_INTEGRATION_ID = process.env.KAPA_INTEGRATION_ID;

    if (!KAPA_API_KEY || !KAPA_PROJECT_ID || !KAPA_INTEGRATION_ID) {
      throw new Error('KAPA_API_KEY, KAPA_PROJECT_ID, and KAPA_INTEGRATION_ID environment variables must be set');
    }

    console.log('Sending query to Kapa:', normalizedQuestion );

    try {
      const response = await fetch(
        `${API_BASE}/query/v1/projects/${KAPA_PROJECT_ID}/retrieval/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': KAPA_API_KEY,
          },
          body: JSON.stringify({
            integration_id: KAPA_INTEGRATION_ID,
            query: normalizedQuestion,
            top_k: 5,
          }),
        }
      );

      const raw = await response.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : [];
      } catch (error) {
        console.error('JSON parse error from upstream response:', error?.message, 'Raw response:', raw);
        data = [];
      }

      if (!response.ok) {
        console.error('Kapa API error:', { status: response.status, statusText: response.statusText });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'upstream_error',
              status: response.status,
              statusText: response.statusText,
              body: raw || null,
            })
          }]
        };
      }

      const arr = Array.isArray(data) ? data : [];
      console.log(`Kapa query successful, returned ${arr.length} results`);
      return { content: [{ type: 'text', text: JSON.stringify(arr) }] };

    } catch (error) {
      console.error('MCP tool handler', error)
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'MCP server error' }) }] };
    }
  }
);
