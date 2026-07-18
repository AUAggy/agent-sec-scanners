// src/tools/scan-manifests.ts
//
// Tool 2: the live manifest scan. Explicitly invoked, never part of the
// default audit: it starts each configured stdio server for a handshake
// (initialize + tools/list, no tool calls) and evaluates the manifest rules.

import { NIST_AI_RMF, type Finding } from "@miaggy/core";
import { ruleRegistry } from "../rules/registry.js";
import "../rules/manifest-rules.js";
import { discoverMcpConfig } from "../collectors/discover.js";
import { collectManifests } from "../collectors/manifest.js";
import type { ToolManifest } from "../types.js";

export interface ScanManifestsInput {
  projectDir?: string;
  timeoutMs?: number;
}

export interface ManifestScanOutput {
  findings: Finding[];
  manifests: ToolManifest[];
}

/** Evaluate the manifest rules over collected manifests (pure; also used by
 * the drift snapshot path and tests). */
export function evaluateManifests(manifests: ToolManifest[]): Finding[] {
  const items = [
    ...manifests.flatMap(manifest =>
      manifest.tools.map(tool => ({ scope: "manifest_tool", data: { tool, manifest } }))
    ),
    { scope: "manifest_set", data: { manifests } },
  ];
  return ruleRegistry.evaluate(items);
}

export async function scanMcpManifests(input: ScanManifestsInput): Promise<ManifestScanOutput> {
  const snapshot = discoverMcpConfig(input.projectDir ?? process.cwd());
  const { manifests, failures, skippedRemote } = await collectManifests(snapshot, input.timeoutMs);

  const findings = evaluateManifests(manifests);

  for (const { server, error } of failures) {
    findings.push({
      findingId: `mcp-manifest-scan-failed-${server.client}-${server.name}`,
      ruleId: "manifest-scan-failed",
      title: `Manifest scan failed for server '${server.name}'`,
      severity: "low",
      status: "NOT_APPLICABLE",
      resource: `${server.client}:${server.name} (${server.source})`,
      region: "local",
      details: `The handshake with this server did not complete (${error}). Its tools were not audited.`,
      remediation: "Confirm the server starts from this machine (same command, args, and env as the client uses), then re-run the scan.",
      complianceFrameworks: [NIST_AI_RMF],
    });
  }
  for (const server of skippedRemote) {
    findings.push({
      findingId: `mcp-manifest-scan-failed-${server.client}-${server.name}`,
      ruleId: "manifest-scan-failed",
      title: `Manifest scan skipped for remote server '${server.name}'`,
      severity: "low",
      status: "NOT_APPLICABLE",
      resource: `${server.client}:${server.name} (${server.source})`,
      region: "local",
      details: "This entry is a remote (url) server; this version only handshakes local stdio servers. Its tools were not audited.",
      remediation: "Audit remote servers at their source, or run the scan from an environment that launches them locally.",
      complianceFrameworks: [NIST_AI_RMF],
    });
  }

  return { findings, manifests };
}
