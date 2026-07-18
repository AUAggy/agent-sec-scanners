#!/usr/bin/env node
// src/index.ts

import { createMcpServer } from "@miaggy/core";
import { auditMcpConfig } from "./tools/audit-mcp-config.js";
import { scanMcpManifests } from "./tools/scan-manifests.js";
import { generateMcpAuditReport } from "./tools/generate-report.js";
import { runSnapshotCli } from "./tools/snapshot.js";
import { runCli } from "./cli.js";

// ── Tool registry (3 tools; the cap) ──────────────────────────
const mcp = createMcpServer({
  name: "mcp-audit",
  version: "0.2.0",
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
      name: "scan_mcp_manifests",
      description: "Live-scan the tool manifests of the MCP servers configured on this machine. Starts each configured stdio server with a handshake-only MCP client (initialize + tools/list; no tool is ever called, and each server is shut down after the handshake; servers receive their configured env, which they need to start). Rules: prompt-injection signatures in tool descriptions, tool-name collisions across servers, destructive-sounding tools without safety annotations, and anomalously long descriptions. Servers that cannot be scanned are reported as skip findings.",
      inputSchema: {
        type: "object" as const,
        properties: {
          projectDir: {
            type: "string",
            description: "Optional: project directory for project-level configs (default: current directory)",
          },
          timeoutMs: {
            type: "number",
            description: "Optional: per-server handshake timeout in milliseconds (default: 15000)",
          },
        },
      },
      handler: async (args) => {
        const { findings } = await scanMcpManifests(args);
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
          includeManifests: {
            type: "boolean",
            description: "Optional: also run the live manifest scan (starts configured stdio servers for a handshake; default false)",
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
  if (sub === "snapshot") {
    const code = await runSnapshotCli(process.argv.slice(3));
    process.exit(code);
  }
  if (sub !== undefined) {
    console.error(`Unknown subcommand '${sub}'. Use 'audit', 'snapshot', or run with no args for the MCP server.`);
    process.exit(2);
  }
  await mcp.start();
}

main().catch((err) => {
  console.error("[mcp-audit] Fatal error:", err);
  process.exit(1);
});
