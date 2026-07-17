import { describe, it, expect, vi } from "vitest";
import { createMcpServer } from "../src/mcp-server.js";

describe("createMcpServer", () => {
  it("constructs a server handle without connecting a transport", () => {
    const handle = createMcpServer({
      name: "test-pack",
      version: "0.0.0",
      startupLine: "[test-pack] MCP server running",
      tools: [
        {
          name: "audit",
          description: "Run the audit.",
          inputSchema: { type: "object", properties: {} },
          handler: vi.fn(async () => "ok"),
        },
      ],
    });
    expect(handle.server).toBeDefined();
    expect(typeof handle.start).toBe("function");
  });
});
