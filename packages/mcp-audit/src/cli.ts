// src/cli.ts

import { createCli } from "@miaggy/core";
import { generateMcpAuditReport } from "./tools/generate-report.js";

const HELP_TEXT = `mcp-audit audit — audit configured MCP servers for supply-chain risk

Usage: mcp-audit audit [options]

Options:
  --project <path>    Project directory to scan for project-level MCP configs (default: current dir)
  --out-dir <path>    Directory to write the HTML report (default: current dir)
  --title <title>     Report title
  --json              Emit findings as JSON instead of markdown to stdout
  -h, --help          Show this help

Scans Claude Desktop, Claude Code, Cursor, and VS Code MCP configuration.
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
  ],
  defaults: {},
  run: async (args) => {
    const input: { projectDir?: string; title?: string } = {};
    if (args.projectDir) input.projectDir = args.projectDir as string;
    if (args.title) input.title = args.title as string;
    return generateMcpAuditReport(input);
  },
});
