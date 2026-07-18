#!/usr/bin/env node
// src/index.ts

import { createMcpServer } from "@miaggy/core";
import { auditMcpConfig } from "./tools/audit-mcp-config.js";
import { generateMcpAuditReport } from "./tools/generate-report.js";
import { runCli } from "./cli.js";

// ── Tool registry (2 of the 3-tool cap; scan-manifests arrives in Wave 2) ──
const mcp = createMcpServer({
  name: "mcp-audit",
  version: "0.1.0",
  startupLine: "[mcp-audit] MCP server running",
  tools: [
    {
      name: "audit_mcp_config",
      description: "Audit the MCP servers configured on this machine (Claude Desktop, Claude Code, Cursor, VS Code) for supply-chain risk: unpinned npm versions, inline credentials in env blocks, missing registry provenance, install scripts, and low maintenance signals. Read-only: config files are parsed, npm registry metadata is fetched, and no discovered server is ever executed. Unreadable configs and failed registry lookups are reported as skip findings, never silently ignored.",
      inputSchema: {
        type: "object" as const,
        properties: {
          projectDir: {
            type: "string",
            description: "Optional: project directory for project-level configs (default: current directory)",
          },
        },
      },
      handler: async (args) => {
        const findings = await auditMcpConfig(args);
        return JSON.stringify(findings, null, 2);
      },
    },
    {
      name: "generate_mcp_audit_report",
      description: "Run the full MCP configuration audit and produce a markdown posture report with a remediation roadmap and compliance mapping.",
      inputSchema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "Optional report title",
          },
        },
      },
      handler: async (args) => {
        const result = await generateMcpAuditReport(args);
        let responseText = result.markdown;
        if (result.htmlPath) {
          responseText += `\n\nHTML report written to \`${result.htmlPath}\`.`;
        }
        return responseText;
      },
    },
  ],
});

// ── Start ─────────────────────────────────────────────────────
// No args → MCP stdio server. `audit` subcommand → LLM-free CLI.
async function main() {
  const sub = process.argv[2];
  if (sub === "audit") {
    const code = await runCli(process.argv.slice(3));
    process.exit(code);
  }
  if (sub !== undefined) {
    console.error(`Unknown subcommand '${sub}'. Use 'audit' or run with no args for the MCP server.`);
    process.exit(2);
  }
  await mcp.start();
}

main().catch((err) => {
  console.error("[mcp-audit] Fatal error:", err);
  process.exit(1);
});
