// src/tools/generate-report.ts
//
// Tool 2: run the audit and render the posture report. Same contract as the
// bedrock pack: { markdown, htmlPath, findings }; CLI consumes findings for
// --json and the exit gate, the MCP handler consumes markdown.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { buildMarkdownReport, generateHtmlReport, NIST_AI_RMF, type Finding } from "@miaggy/core";
import { auditMcpConfig } from "./audit-mcp-config.js";
import { scanMcpManifests } from "./scan-manifests.js";
import { ruleRegistry } from "../rules/registry.js";
import "../rules/drift-rules.js";
import { parseBaseline, createBaseline, diffBaseline } from "../baseline.js";
import { discoverMcpConfig } from "../collectors/discover.js";
import { sanitizeConfigString } from "../collectors/parse.js";
import { MARKDOWN_CONTEXT, HTML_CONTEXT } from "../report/context.js";

export interface GenerateReportInput {
  projectDir?: string;
  title?: string;
  /** Also run the live manifest scan (starts each configured stdio server
   * for a handshake). Explicitly opt-in; the static audit never executes
   * a discovered server. */
  includeManifests?: boolean;
  /** Diff against a baseline file from `mcp-audit snapshot`. Implies the
   * manifest scan (drift needs current manifests to compare). */
  baselinePath?: string;
}

export interface McpAuditReportResult {
  markdown: string;
  htmlPath?: string;
  findings: Finding[];
}

export async function generateMcpAuditReport(input: GenerateReportInput): Promise<McpAuditReportResult> {
  const findings = await auditMcpConfig({ projectDir: input.projectDir });
  if (input.includeManifests || input.baselinePath) {
    const scan = await scanMcpManifests({ projectDir: input.projectDir });
    findings.push(...scan.findings);

    if (input.baselinePath) {
      try {
        const stored = parseBaseline(readFileSync(input.baselinePath, "utf-8"));
        const current = createBaseline(discoverMcpConfig(input.projectDir ?? process.cwd()), scan.manifests);
        const drifts = diffBaseline(stored, current);
        findings.push(...ruleRegistry.evaluate(
          drifts.map(drift => ({
            scope: "baseline_diff",
            data: { drift, baselineCreatedAt: stored.createdAt },
          }))
        ));
      } catch (err) {
        findings.push({
          findingId: "mcp-baseline-unreadable",
          ruleId: "baseline-unreadable",
          title: `Baseline file could not be read: ${input.baselinePath}`,
          severity: "low",
          status: "NOT_APPLICABLE",
          resource: input.baselinePath,
          region: "local",
          details: `Drift detection did not run (${sanitizeConfigString((err as Error).message)}).`,
          remediation: "Re-create the baseline with 'mcp-audit snapshot' and pass its path to --baseline.",
          complianceFrameworks: [NIST_AI_RMF],
        });
      }
    }
  }

  const opts = { region: "local", accountId: hostname(), title: input.title };
  const markdown = buildMarkdownReport(findings, opts, MARKDOWN_CONTEXT);

  let htmlPath: string | undefined;
  const outputDir = process.env.MCP_AUDIT_OUTPUT_DIR;
  if (outputDir) {
    const html = generateHtmlReport(findings, opts, HTML_CONTEXT);
    // Local date, not UTC: the filename should match the user's calendar day.
    // (toISOString() is UTC and reads a day behind for UTC+ timezones.)
    const d = new Date();
    const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const filename = `mcp-audit-${localDate}.html`;
    mkdirSync(outputDir, { recursive: true });
    htmlPath = `${outputDir}/${filename}`;
    writeFileSync(htmlPath, html, "utf-8");
  }

  return { markdown, htmlPath, findings };
}
