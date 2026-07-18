// src/tools/audit-mcp-config.ts
//
// Tool 1: discover configured MCP servers, fetch registry facts, evaluate
// rules, and surface every coverage gap as a skip finding.

import type { Finding } from "@miaggy/core";
import { ruleRegistry } from "../rules/registry.js";
import "../rules/config-rules.js";
import { discoverMcpConfig } from "../collectors/discover.js";
import { lookupPackage } from "../registry/npm.js";
import { NIST_AI_RMF } from "@miaggy/core";
import type { McpConfigSnapshot, RegistryInfo } from "../types.js";

export interface AuditMcpConfigInput {
  /** Project directory for project-level configs. Default: process.cwd(). */
  projectDir?: string;
}

/** Fetch registry info for every distinct package, tolerating failures. */
async function lookupAll(snapshot: McpConfigSnapshot): Promise<Map<string, RegistryInfo | "failed">> {
  const names = [...new Set(snapshot.servers.flatMap(s => (s.npmPackage ? [s.npmPackage.name] : [])))];
  const results = new Map<string, RegistryInfo | "failed">();
  await Promise.all(names.map(async name => {
    try {
      results.set(name, await lookupPackage(name));
    } catch {
      results.set(name, "failed");
    }
  }));
  return results;
}

export async function auditMcpConfig(input: AuditMcpConfigInput): Promise<Finding[]> {
  const snapshot = discoverMcpConfig(input.projectDir ?? process.cwd());
  const registryByName = await lookupAll(snapshot);

  const items = snapshot.servers.map(server => ({
    scope: "mcp_server",
    data: {
      server,
      registry: server.npmPackage && registryByName.get(server.npmPackage.name) !== "failed"
        ? (registryByName.get(server.npmPackage.name) as RegistryInfo | undefined)
        : undefined,
    },
  }));

  const findings = ruleRegistry.evaluate(items);

  // Coverage skips: never a silent empty.
  for (const source of snapshot.sources) {
    if (source.status !== "unreadable") continue;
    findings.push({
      findingId: `mcp-config-unreadable-${source.client}-${source.path.replace(/[^A-Za-z0-9]+/g, "-")}`,
      ruleId: "config-source-unreadable",
      title: `Could not parse MCP config: ${source.path}`,
      severity: "low",
      status: "NOT_APPLICABLE",
      resource: source.path,
      region: "local",
      details: `The file exists but could not be parsed (${source.error}). Any servers it configures were not audited.`,
      remediation: "Fix the file's syntax, then re-run the audit.",
      complianceFrameworks: [NIST_AI_RMF],
    });
  }
  for (const [name, info] of registryByName) {
    if (info !== "failed") continue;
    findings.push({
      findingId: `mcp-registry-skipped-${name.replace(/[^A-Za-z0-9]+/g, "-")}`,
      ruleId: "registry-lookup-skipped",
      title: `npm registry lookup skipped for ${name}`,
      severity: "low",
      status: "NOT_APPLICABLE",
      resource: name,
      region: "local",
      details: `Registry facts for ${name} could not be fetched (offline or registry error). The provenance, install-script, and maintenance rules did not run for this package.`,
      remediation: "Re-run the audit with network access to registry.npmjs.org.",
      complianceFrameworks: [NIST_AI_RMF],
    });
  }

  return findings;
}
