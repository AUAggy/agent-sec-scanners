// src/cli.ts

import { createCli } from "@miaggy/core";
import { generateMcpAuditReport } from "./tools/generate-report.js";

const HELP_TEXT = `mcp-audit audit — audit configured MCP servers for supply-chain risk

Usage: mcp-audit audit [options]

Options:
  --project <path>    Project directory to scan for project-level MCP configs (default: current dir)
  --manifests         Also scan live tool manifests: starts each configured stdio
                      server for an initialize/tools-list handshake (no tool is
                      ever called), then shuts it down
  --baseline <file>   Diff against a baseline from 'mcp-audit snapshot' and flag
                      drift (implies the manifest scan)
  --out-dir <path>    Directory to write the HTML report (default: current dir)
  --title <title>     Report title
  --json              Emit findings as JSON instead of markdown to stdout
  -h, --help          Show this help

Scans Claude Desktop, Claude Code, Cursor, and VS Code MCP configuration.
The static audit never executes a discovered server; --manifests is the
explicit opt-in that does (handshake only, with the server's configured env).
Registry rules need network access to registry.npmjs.org; without it they are
reported as skipped, never silently passed.

Exit code: 0 if no critical- or high-severity FAIL findings, 1 if any present, 2 on bad args.
The MCP server (no args) is the interactive interface for Claude Desktop/Code.
`;

export const runCli = createCli({
  helpText: HELP_TEXT,
  outDirEnvVar: "MCP_AUDIT_OUTPUT_DIR",
  defaultOutDir: process.env.MCP_AUDIT_OUTPUT_DIR ?? ".",
  flags: [
    { flag: "--project", key: "projectDir" },
    { flag: "--manifests", key: "includeManifests", boolean: true },
    { flag: "--baseline", key: "baselinePath" },
  ],
  defaults: {},
  run: async (args) => {
    const input: { projectDir?: string; title?: string; includeManifests?: boolean; baselinePath?: string } = {};
    if (args.projectDir) input.projectDir = args.projectDir as string;
    if (args.title) input.title = args.title as string;
    if (args.includeManifests) input.includeManifests = true;
    if (args.baselinePath) input.baselinePath = args.baselinePath as string;
    return generateMcpAuditReport(input);
  },
});
