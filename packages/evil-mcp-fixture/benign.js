#!/usr/bin/env node
// The benign fixture: a clean stdio MCP server. Its read_file collides with
// the evil server's read_file (tool-shadowing-collision); everything else is
// annotated and quiet.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "benign-mcp-fixture", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: "read_file",
    description: "Reads a project file and returns its contents.",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "delete_note",
    description: "Deletes a note by id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } } },
    annotations: { destructiveHint: true },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async () => {
  throw new Error("fixture tools must never be invoked");
});

const transport = new StdioServerTransport();
await server.connect(transport);
