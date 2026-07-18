// src/rules/catalog.ts
//
// Pack catalog: registry rules + metadata for findings the audit tool
// constructs outside the registry (skip findings).

import { createRuleCatalog, NIST_AI_RMF } from "@miaggy/core";
import { ruleRegistry, type RuleCatalogEntry } from "./registry.js";
// Register rules wherever the catalog is consumed.
import "./config-rules.js";
import "./manifest-rules.js";
import "./drift-rules.js";

const TOOL_FINDING_METADATA: RuleCatalogEntry[] = [
  {
    ruleId: "config-source-unreadable",
    title: "MCP config file could not be read",
    description: "A client configuration file exists but could not be parsed; its servers were not audited.",
    threat: "An unparseable config silently hides servers from the audit; the user believes coverage is complete when part of it is dark.",
    rationale: "The honest output for a broken discovery path is a skip finding, never a silent empty. Same pattern as the bedrock pack's detection tool.",
    severity: "low",
    appliesTo: "config_source",
    complianceFrameworks: [NIST_AI_RMF],
  },
  {
    ruleId: "manifest-scan-failed",
    title: "Tool manifest not scanned",
    description: "A configured server's manifest could not be collected (handshake failed, or the entry is remote); its tools were not audited.",
    threat: "An unscanned server silently escapes the manifest rules; a clean scan would overstate coverage.",
    rationale: "Every server the scan cannot reach is named in the report, so absence of findings is never mistaken for absence of risk.",
    severity: "low",
    appliesTo: "mcp_server",
    complianceFrameworks: [NIST_AI_RMF],
  },
  {
    ruleId: "baseline-unreadable",
    title: "Drift baseline could not be read",
    description: "The file passed to --baseline could not be read or parsed; drift detection did not run.",
    threat: "A silently ignored baseline turns drift detection off while the user believes it ran.",
    rationale: "The honest output for a broken baseline is a skip finding, never a silent pass.",
    severity: "low",
    appliesTo: "baseline_diff",
    complianceFrameworks: [NIST_AI_RMF],
  },
  {
    ruleId: "registry-lookup-skipped",
    title: "npm registry lookup skipped",
    description: "Registry facts for a package could not be fetched (offline or registry error); provenance, install-script, and maintenance rules did not run for it.",
    threat: "Missing registry data silently disables three rules; a clean report would overstate what was checked.",
    rationale: "Surfacing the skipped lookup keeps the report honest about coverage instead of implying the registry-backed checks passed.",
    severity: "low",
    appliesTo: "mcp_server",
    complianceFrameworks: [NIST_AI_RMF],
  },
  {
    ruleId: "coverage-skip",
    title: "MCP server discovered but not fully assessed",
    description: "A configured server was discovered, but its launch shape (e.g. uvx, docker, a local binary, or a remote url) has no registry adapter, so the supply-chain rules could not run for it.",
    threat: "A server the audit cannot assess silently escapes the supply-chain rules; a clean report would overstate coverage for launch shapes the tool does not yet cover.",
    rationale: "Every discovered server the rules cannot reach is named in the report with its residual, so an empty findings list is never mistaken for 'looked and found nothing'.",
    severity: "low",
    appliesTo: "mcp_server",
    complianceFrameworks: [NIST_AI_RMF],
  },
];

const catalog = createRuleCatalog({
  registry: ruleRegistry,
  extraEntries: TOOL_FINDING_METADATA,
});

/** All rule catalog entries: registry rules + tool-constructed findings. */
export function allRuleMetadata(): RuleCatalogEntry[] {
  return catalog.all();
}

/** Lookup metadata for a finding's ruleId. */
export function getRuleMetadata(ruleId: string): RuleCatalogEntry | undefined {
  return catalog.get(ruleId);
}
