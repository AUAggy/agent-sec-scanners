// src/rules/config-rules.ts
//
// Wave 1 static rules. Scope "mcp_server": items are
// { server: McpServerEntry, registry?: RegistryInfo }. Rules are pure; the
// registry-backed ones return null when registry data is absent (the tool
// emits a lookup-skipped finding so that absence is never silent).
//
// The recursion is deliberate: these rules encode the practices this
// project's own SECURITY.md and README tell users to check for.

import { OWASP_LLM_TOP10, OWASP_AGENTIC, NIST_AI_RMF, MITRE_ATLAS, type Finding } from "@miaggy/core";
import { ruleRegistry } from "./registry.js";
import type { McpServerEntry, RegistryInfo } from "../types.js";

interface ServerItem {
  server: McpServerEntry;
  registry?: RegistryInfo;
}

/** Days without a publish before a package counts as stale. A heuristic,
 * stated in the finding; tune per environment in a later version. */
export const STALE_PUBLISH_DAYS = 540;

/** Value shapes that identify well-known credential formats. */
const SECRET_VALUE_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  { family: "OpenAI/Anthropic-style key", pattern: /^sk-[A-Za-z0-9_-]{16,}$/ },
  { family: "AWS access key ID", pattern: /^AKIA[0-9A-Z]{16}$/ },
  { family: "GitHub token", pattern: /^gh[pousr]_[A-Za-z0-9]{20,}$/ },
  { family: "Slack token", pattern: /^xox[abprs]-/ },
  { family: "Google API key", pattern: /^AIza[0-9A-Za-z_-]{30,}$/ },
  { family: "GitLab token", pattern: /^glpat-[A-Za-z0-9_-]{20,}$/ },
];

const SECRET_KEY_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i;

/** True when the value is an indirection, not a literal secret:
 * "${VAR}", "$VAR", "%VAR%", or empty. */
function isEnvReference(value: string): boolean {
  return value === "" || /^\$\{[^}]+\}$/.test(value) || /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value) || /^%[^%]+%$/.test(value);
}

function classifySecret(key: string, value: string): string | null {
  if (isEnvReference(value)) return null;
  for (const { family, pattern } of SECRET_VALUE_PATTERNS) {
    if (pattern.test(value)) return family;
  }
  if (SECRET_KEY_NAME.test(key) && value.length >= 8) return "credential-named variable with a literal value";
  return null;
}

function base(server: McpServerEntry): Pick<Finding, "region" | "resource"> {
  return { region: "local", resource: `${server.client}:${server.name} (${server.source})` };
}

ruleRegistry.register({
  ruleId: "unpinned-server-version",
  title: "MCP server runs an unpinned npm package",
  description: "The server is launched via npx/bunx with no @version pin, so every client start executes whatever the registry serves at that moment.",
  threat: "A hijacked maintainer account or a malicious patch release becomes arbitrary code execution inside the agent host on the next client start, with no action by the user.",
  rationale: "Pinning turns a silent auto-upgrade channel into an explicit review point. This is the same guidance this project ships for its own install instructions.",
  severity: "high",
  appliesTo: "mcp_server",
  complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, OWASP_AGENTIC.ASI05_UNEXPECTED_CODE_EXEC, MITRE_ATLAS],
  check(item) {
    const { server } = item as unknown as ServerItem;
    const pkg = server.npmPackage;
    if (!pkg || pkg.versionSpec) return null;
    return {
      findingId: `mcp-unpinned-${server.client}-${server.name}`,
      ruleId: "unpinned-server-version",
      title: `Server '${server.name}' runs ${pkg.name} with no version pin`,
      severity: "high",
      status: "FAIL",
      ...base(server),
      details: `${server.command} ${server.args.join(" ")} resolves '${pkg.spec}' at launch time. Whatever version the npm registry serves is executed without review.`,
      remediation: `Pin the package in the config: change '${pkg.spec}' to '${pkg.name}@<version>' and bump deliberately after reviewing release notes.`,
      complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, OWASP_AGENTIC.ASI05_UNEXPECTED_CODE_EXEC, MITRE_ATLAS],
    };
  },
});

ruleRegistry.register({
  ruleId: "secrets-in-env-block",
  title: "Credential stored inline in MCP config",
  description: "A server's env block carries a literal credential value instead of an environment-variable reference.",
  threat: "Client config files are world-readable to local processes, sync to backups and dotfile repos, and get pasted into bug reports. A literal credential in one is a theft waiting for an occasion.",
  rationale: "Environment indirection (\"${VAR}\") or OS keychains keep the secret out of a file that routinely travels. The finding names the variable, never the value.",
  severity: "high",
  appliesTo: "mcp_server",
  complianceFrameworks: [OWASP_AGENTIC.ASI03_IDENTITY_PRIVILEGE, OWASP_LLM_TOP10.LLM02_SENSITIVE_INFO, NIST_AI_RMF],
  check(item) {
    const { server } = item as unknown as ServerItem;
    const hits: string[] = [];
    for (const [key, value] of Object.entries(server.env)) {
      const family = classifySecret(key, String(value));
      if (family) hits.push(`${key} (${family})`);
    }
    if (hits.length === 0) return null;
    return {
      findingId: `mcp-secrets-${server.client}-${server.name}`,
      ruleId: "secrets-in-env-block",
      title: `Server '${server.name}' has inline credential(s) in its env block`,
      severity: "high",
      status: "FAIL",
      ...base(server),
      details: `Literal credential value(s) found for: ${hits.join(", ")}. Values are redacted from this report.`,
      remediation: `Move the value(s) into your shell environment or OS keychain and reference them from the config (e.g. "\${${hits[0].split(" ")[0]}}").`,
      complianceFrameworks: [OWASP_AGENTIC.ASI03_IDENTITY_PRIVILEGE, OWASP_LLM_TOP10.LLM02_SENSITIVE_INFO, NIST_AI_RMF],
    };
  },
});

ruleRegistry.register({
  ruleId: "server-no-provenance",
  title: "Server package has no registry provenance",
  description: "The npm package behind this server has no provenance attestation binding the published tarball to a source repository and build.",
  threat: "Without provenance, a tampered or account-takeover release is indistinguishable from a legitimate one at install time; trust rests entirely on whoever controls the npm credentials.",
  rationale: "Provenance moves trust from a stealable token to a verifiable build. Once present, 'npm audit signatures' catches substitution mechanically.",
  severity: "medium",
  appliesTo: "mcp_server",
  complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, MITRE_ATLAS, NIST_AI_RMF],
  check(item) {
    const { server, registry } = item as unknown as ServerItem;
    if (!server.npmPackage || !registry || !registry.exists || registry.hasProvenance !== false) return null;
    return {
      findingId: `mcp-no-provenance-${server.client}-${server.name}`,
      ruleId: "server-no-provenance",
      title: `Package ${registry.name} publishes without provenance`,
      severity: "medium",
      status: "FAIL",
      ...base(server),
      details: `${registry.name}@${registry.latestVersion} has no provenance attestation on the npm registry.`,
      remediation: `Prefer servers published with npm provenance (verifiable via 'npm audit signatures'), or pin an audited version and review upgrades manually.`,
      complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, MITRE_ATLAS, NIST_AI_RMF],
    };
  },
});

ruleRegistry.register({
  ruleId: "server-install-scripts",
  title: "Server package declares install scripts",
  description: "The npm package behind this server declares preinstall/install/postinstall hooks.",
  threat: "Install hooks run arbitrary code at install time, before the server is ever started: the classic npm supply-chain execution primitive.",
  rationale: "MCP servers rarely need native builds. An install hook in a tool-server package deserves a manual look before the package is trusted.",
  severity: "medium",
  appliesTo: "mcp_server",
  complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, OWASP_AGENTIC.ASI05_UNEXPECTED_CODE_EXEC, MITRE_ATLAS],
  check(item) {
    const { server, registry } = item as unknown as ServerItem;
    if (!server.npmPackage || !registry || !registry.exists || !registry.hasInstallScript) return null;
    return {
      findingId: `mcp-install-scripts-${server.client}-${server.name}`,
      ruleId: "server-install-scripts",
      title: `Package ${registry.name} runs install scripts`,
      severity: "medium",
      status: "FAIL",
      ...base(server),
      details: `${registry.name}@${registry.latestVersion} declares one or more of preinstall/install/postinstall, which execute on the host at install time.`,
      remediation: `Review the package's install scripts before trusting it, or install with scripts disabled ('npm i --ignore-scripts') where the server supports it.`,
      complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, OWASP_AGENTIC.ASI05_UNEXPECTED_CODE_EXEC, MITRE_ATLAS],
    };
  },
});

ruleRegistry.register({
  ruleId: "server-low-maintenance-signal",
  title: "Server package shows low maintenance signals",
  description: `The npm package has a single maintainer and no publish in over ${STALE_PUBLISH_DAYS} days.`,
  threat: "Single-maintainer, long-stale packages are the easiest takeover targets (expired maintainer emails, unpatched dependencies) and the slowest to ship a fix when one is needed.",
  rationale: "Maintenance signals are weak evidence individually, so this is cataloged low: it informs review without failing a CI gate.",
  severity: "low",
  appliesTo: "mcp_server",
  complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, NIST_AI_RMF],
  check(item) {
    const { server, registry } = item as unknown as ServerItem;
    if (!server.npmPackage || !registry || !registry.exists) return null;
    if (registry.maintainerCount === undefined || !registry.lastPublishDate) return null;
    const daysSince = (Date.now() - Date.parse(registry.lastPublishDate)) / 86_400_000;
    if (registry.maintainerCount > 1 || daysSince < STALE_PUBLISH_DAYS) return null;
    return {
      findingId: `mcp-low-maintenance-${server.client}-${server.name}`,
      ruleId: "server-low-maintenance-signal",
      title: `Package ${registry.name} is single-maintainer and stale`,
      severity: "low",
      status: "FAIL",
      ...base(server),
      details: `${registry.name} has ${registry.maintainerCount} maintainer and its last publish was ${registry.lastPublishDate.slice(0, 10)} (over ${STALE_PUBLISH_DAYS} days ago).`,
      remediation: `Treat upgrades of this package with extra review, and consider an actively maintained alternative if one exists.`,
      complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, NIST_AI_RMF],
    };
  },
});
