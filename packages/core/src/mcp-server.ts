// src/mcp-server.ts
//
// Shared MCP server scaffolding. Encodes the family conventions: stdio
// transport only, flat tool array, JSON/text tool responses, errors returned
// as isError content (never thrown to the transport), and a single startup
// line to stderr.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Tool["inputSchema"];
  /** Handles a tool call; the returned string becomes the text response. */
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface McpServerConfig {
  name: string;
  version: string;
  tools: McpToolDef[];
  /** Single line written to stderr once the stdio transport is connected. */
  startupLine: string;
}

export interface McpServerHandle {
  server: Server;
  /** Connect the stdio transport and print the startup line. */
  start: () => Promise<void>;
}

export function createMcpServer(config: McpServerConfig): McpServerHandle {
  const server = new Server(
    { name: config.name, version: config.version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: config.tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const tool = config.tools.find(t => t.name === name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      const text = await tool.handler(args ?? {});
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error: ${(error as Error).message}`,
        }],
        isError: true,
      };
    }
  });

  return {
    server,
    start: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error(config.startupLine);
    },
  };
}
