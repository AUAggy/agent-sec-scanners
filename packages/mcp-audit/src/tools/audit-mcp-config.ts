// src/tools/audit-mcp-config.ts
//
// Tool 1: discover configured MCP servers, fetch registry facts, evaluate
// rules, and surface every coverage gap as a skip finding.

import { NIST_AI_RMF, type Finding } from "@miaggy/core";
import { ruleRegistry } from "../rules/registry.js";
import "../rules/config-rules.js";
import { discoverMcpConfig } from "../collectors/discover.js";
import { lookupPackage } from "../registry/npm.js";
import { lookupPypiPackage } from "../registry/pypi.js";
import type { McpConfigSnapshot, McpServerEntry, RegistryInfo, RegistryRef } from "../types.js";

const refKey = (ref: RegistryRef) => `${ref.ecosystem}:${ref.name}`;

/** findingId-safe slug for paths and package names. */
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-");

/** Why a discovered server was not fully assessed, or null if it was.
 *
 * A server is fully assessed only when a registry adapter covers its launch
 * shape AND the package resolved. Everything else gets a coverage-skip naming
 * the residual — so an empty findings list never reads as "clean" for a server
 * we could not examine. Note the correctness point: a *clean* npm server (no
 * violations) returns null here and correctly gets NO skip; the inline-secrets
 * check runs for every shape, so the residual only ever concerns the
 * registry-backed rules. An npm lookup that failed on the network is already
 * reported as `registry-lookup-skipped` and is excluded here. */
export function coverageResidual(server: McpServerEntry): string | null {
  const shape = server.launchShape;
  if (shape === "npm" && server.packageRef) return null; // assessed by Wave-1 rules
  const ran = "The inline-secrets check ran against its env block.";
  switch (shape) {
    case "npm":
      return `This npx/bunx entry did not resolve to an npm package name, so the registry supply-chain rules (pinning, provenance, install scripts, maintenance) did not run. ${ran}`;
    case "pypi":
      return server.packageRef
        ? `Launch shape 'pypi' (uvx/pipx): pinning and maintenance were assessed against PyPI, but PyPI does not publish install-script or provenance data, so those two supply-chain rules cannot run for this server. ${ran}`
        : `Launch shape 'pypi' (uvx/pipx): the launch command did not resolve to a PyPI package name, so the registry supply-chain rules did not run. ${ran}`;
    case "container":
      return `Launch shape 'container' (docker/podman): image supply-chain assessment is not available in this version, so no pinning or provenance rule ran. ${ran}`;
    case "remote":
      return `This is a remote (url) server with no local package to assess, so the Wave-1 registry rules do not apply. The opt-in --manifests scan can inspect its live tools. ${ran}`;
    default:
      return `Launch shape '${shape}' names a local or other runtime with no package registry to query, so the registry supply-chain rules did not run. ${ran}`;
  }
}

/** A NOT_APPLICABLE coverage-skip for every discovered server no registry
 * adapter fully assessed. Pure over the server list (no fs/network), so the
 * "every server is accounted for" property is unit-testable. */
export function coverageSkipFindings(servers: McpServerEntry[]): Finding[] {
  const out: Finding[] = [];
  for (const server of servers) {
    const residual = coverageResidual(server);
    if (!residual) continue;
    out.push({
      findingId: `mcp-coverage-skip-${server.client}-${slug(server.name)}-${slug(server.source)}`,
      ruleId: "coverage-skip",
      title: `Server '${server.name}' was discovered but not fully assessed`,
      severity: "low",
      status: "NOT_APPLICABLE",
      resource: `${server.client}:${server.name} (${server.source})`,
      region: "local",
      details: residual,
      remediation: "Review this server's supply chain manually, or run a version/mode that covers its launch shape.",
      complianceFrameworks: [NIST_AI_RMF],
    });
  }
  return out;
}

export interface AuditMcpConfigInput {
  /** Project directory for project-level configs. Default: process.cwd(). */
  projectDir?: string;
}

interface LookupResult {
  ref: RegistryRef;
  info: RegistryInfo | "failed";
}

/** Fetch registry info for every distinct package, dispatching to the npm or
 * PyPI adapter by ecosystem, tolerating failures. Keyed by ecosystem:name so
 * an npm and a PyPI package of the same name never collide. */
async function lookupAll(snapshot: McpConfigSnapshot): Promise<Map<string, LookupResult>> {
  const refs = new Map<string, RegistryRef>();
  for (const s of snapshot.servers) if (s.packageRef) refs.set(refKey(s.packageRef), s.packageRef);
  const results = new Map<string, LookupResult>();
  await Promise.all([...refs.values()].map(async ref => {
    try {
      const info = ref.ecosystem === "pypi" ? await lookupPypiPackage(ref.name) : await lookupPackage(ref.name);
      results.set(refKey(ref), { ref, info });
    } catch {
      results.set(refKey(ref), { ref, info: "failed" });
    }
  }));
  return results;
}

export async function auditMcpConfig(input: AuditMcpConfigInput): Promise<Finding[]> {
  const snapshot = discoverMcpConfig(input.projectDir ?? process.cwd());
  const lookups = await lookupAll(snapshot);

  const items = snapshot.servers.map(server => {
    const result = server.packageRef ? lookups.get(refKey(server.packageRef)) : undefined;
    return {
      scope: "mcp_server",
      data: {
        server,
        registry: result && result.info !== "failed" ? result.info : undefined,
      },
    };
  });

  const findings = ruleRegistry.evaluate(items);

  // Coverage: every discovered server is accounted for. A server whose launch
  // shape no registry adapter can assess surfaces as a NOT_APPLICABLE skip that
  // names the residual, so an empty findings list never reads as "clean" for
  // it. NOT_APPLICABLE does not affect the posture score, so this restores
  // honesty without moving the number.
  findings.push(...coverageSkipFindings(snapshot.servers));

  // Coverage skips: never a silent empty.
  for (const source of snapshot.sources) {
    if (source.status !== "unreadable") continue;
    findings.push({
      findingId: `mcp-config-unreadable-${source.client}-${slug(source.path)}`,
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
  for (const { ref, info } of lookups.values()) {
    if (info !== "failed") continue;
    const host = ref.ecosystem === "pypi" ? "pypi.org" : "registry.npmjs.org";
    findings.push({
      findingId: `mcp-registry-skipped-${ref.ecosystem}-${slug(ref.name)}`,
      ruleId: "registry-lookup-skipped",
      title: `Registry lookup skipped for ${ref.name}`,
      severity: "low",
      status: "NOT_APPLICABLE",
      resource: ref.name,
      region: "local",
      details: `Registry facts for ${ref.name} could not be fetched from ${host} (offline or registry error). The provenance, install-script, and maintenance rules did not run for this package.`,
      remediation: `Re-run the audit with network access to ${host}.`,
      complianceFrameworks: [NIST_AI_RMF],
    });
  }

  return findings;
}
