// src/cli.ts
//
// CLI entrypoint on the core scaffolding (exit codes 0/1/2, --json,
// --out-dir, CI gate). Flags, help text, and output are byte-identical to
// bedrock-security-mcp v0.1.x.

import { createCli } from "@miaggy/core";
import { generateAiPostureReport } from "./tools/generate-posture-report.js";

const HELP_TEXT = `bedrock-security-mcp audit — run a Bedrock security audit without an LLM

Usage: bedrock-security-mcp audit [options]

Options:
  --region <region>   AWS region (default: AWS_REGION or us-east-1)
  --role <roleName>   Audit a single IAM role only
  --hours <n>         Hours of CloudTrail/invocation-log history (default: 24, clamped to [1, 2160] = 90 days; CloudTrail's retention cap)
  --out-dir <path>    Directory to write the HTML report (default: current dir)
  --title <title>     Report title
  --json              Emit findings as JSON instead of markdown to stdout
  -h, --help          Show this help

Exit code: 0 if no critical- or high-severity FAIL findings, 1 if any present, 2 on bad args.
The MCP server (no args) is the interactive interface for Claude Desktop/Code.
`;

export const runCli = createCli({
  helpText: HELP_TEXT,
  outDirEnvVar: "BEDROCK_SECURITY_OUTPUT_DIR",
  defaultOutDir: process.env.BEDROCK_SECURITY_OUTPUT_DIR ?? ".",
  flags: [
    { flag: "--region", key: "region" },
    { flag: "--role", key: "roleName" },
    { flag: "--hours", key: "hoursBack", parse: Number },
  ],
  defaults: { region: process.env.AWS_REGION ?? "us-east-1" },
  run: async (args) => {
    const input: { roleName?: string; hoursBack?: number; title?: string } = {};
    if (args.roleName) input.roleName = args.roleName as string;
    if (args.hoursBack) input.hoursBack = args.hoursBack as number;
    if (args.title) input.title = args.title as string;
    return generateAiPostureReport(input, args.region as string);
  },
});
