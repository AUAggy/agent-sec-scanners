#!/usr/bin/env node
// src/index.ts

import { createMcpServer } from "@miaggy/core";
import { auditBedrockPosture } from "./tools/audit-bedrock-posture.js";
import { findPromptInjectionSignals } from "./tools/find-prompt-injection.js";
import { generateAiPostureReport } from "./tools/generate-posture-report.js";
import { runCli } from "./cli.js";

const REGION = process.env.AWS_REGION ?? "us-east-1";

// ── Tool registry (flat array, cloud-audit-mcp pattern) ──────
const mcp = createMcpServer({
  name: "bedrock-security-mcp",
  version: "0.1.0",
  startupLine: `[bedrock-security-mcp] MCP server running in ${REGION}`,
  tools: [
    {
      name: "audit_bedrock_posture",
      description: "Audit AWS Bedrock security posture: model-invocation logging and KMS encryption, Guardrail quality (prompt-attack filter strength, PII, denied topics, grounding), and IAM roles with overly-broad Bedrock permissions (managed + inline policies, trust policies, cross-account access).",
      inputSchema: {
        type: "object" as const,
        properties: {
          roleName: {
            type: "string",
            description: "Optional: audit a specific role instead of all roles",
          },
        },
      },
      handler: async (args) => {
        const findings = await auditBedrockPosture(args, REGION);
        return JSON.stringify(findings, null, 2);
      },
    },
    {
      name: "find_prompt_injection_signals",
      description: "Detect prompt-injection signals in Bedrock usage. Scans CloudTrail for off-hours and per-principal volume anomalies and flags invocations made without a guardrail attached; scans Bedrock model-invocation logs (CloudWatch Logs destination) for known prompt-injection signatures and excessive token consumption. Verifies CloudTrail management-event logging is enabled before relying on it. Content scanning requires model-invocation logging to be enabled; when it is off, reports a skip finding (see bedrock-logging-disabled).",
      inputSchema: {
        type: "object" as const,
        properties: {
          hoursBack: {
            type: "number",
            description: "How many hours of history to scan (default: 24, clamped to [1, 90])",
          },
          maxEvents: {
            type: "number",
            description: "Maximum events to analyze per source (default: 100, clamped to [1, 1000])",
          },
          tokenThreshold: {
            type: "number",
            description: "Token-count threshold for the excessive-tokens check (default: 100000)",
          },
        },
      },
      handler: async (args) => {
        const findings = await findPromptInjectionSignals(args, REGION);
        return JSON.stringify(findings, null, 2);
      },
    },
    {
      name: "generate_ai_posture_report",
      description: "Run all Bedrock security checks (IAM + prompt injection) and produce a board-ready markdown posture report with a remediation roadmap.",
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
        const result = await generateAiPostureReport(args, REGION);
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
// No args → MCP stdio server (Claude Desktop / Claude Code).
// `audit` subcommand → LLM-free CLI (see src/cli.ts).
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
  console.error("[bedrock-security-mcp] Fatal error:", err);
  process.exit(1);
});
