// src/tools/generate-report.ts
//
// Tool 2: run the audit and render the posture report. Same contract as the
// bedrock pack: { markdown, htmlPath, findings }; CLI consumes findings for
// --json and the exit gate, the MCP handler consumes markdown.

import { writeFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { buildMarkdownReport, generateHtmlReport, type Finding } from "@miaggy/core";
import { auditMcpConfig } from "./audit-mcp-config.js";
import { scanMcpManifests } from "./scan-manifests.js";
import { MARKDOWN_CONTEXT, HTML_CONTEXT } from "../report/context.js";

export interface GenerateReportInput {
  projectDir?: string;
  title?: string;
  /** Also run the live manifest scan (starts each configured stdio server
   * for a handshake). Explicitly opt-in; the static audit never executes
   * a discovered server. */
  includeManifests?: boolean;
}

export interface McpAuditReportResult {
  markdown: string;
  htmlPath?: string;
  findings: Finding[];
}

export async function generateMcpAuditReport(input: GenerateReportInput): Promise<McpAuditReportResult> {
  const findings = await auditMcpConfig({ projectDir: input.projectDir });
  if (input.includeManifests) {
    const scan = await scanMcpManifests({ projectDir: input.projectDir });
    findings.push(...scan.findings);
  }

  const opts = { region: "local", accountId: hostname(), title: input.title };
  const markdown = buildMarkdownReport(findings, opts, MARKDOWN_CONTEXT);

  let htmlPath: string | undefined;
  const outputDir = process.env.MCP_AUDIT_OUTPUT_DIR;
  if (outputDir) {
    const html = generateHtmlReport(findings, opts, HTML_CONTEXT);
    const filename = `mcp-audit-${new Date().toISOString().slice(0, 10)}.html`;
    mkdirSync(outputDir, { recursive: true });
    htmlPath = `${outputDir}/${filename}`;
    writeFileSync(htmlPath, html, "utf-8");
  }

  return { markdown, htmlPath, findings };
}
