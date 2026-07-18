// src/rules/manifest-rules.ts
//
// Wave 2 rules over live tool manifests. Two scopes:
// - "manifest_tool": one tool from one server ({ tool, manifest })
// - "manifest_set": every collected manifest at once ({ manifests }),
//   for cross-server checks.
// Tool descriptions are raw untrusted text; findings only ever embed
// sanitized, capped excerpts.

import { INJECTION_SIGNATURES, OWASP_LLM_TOP10, OWASP_AGENTIC, NIST_AI_RMF, MITRE_ATLAS, type Finding } from "@miaggy/core";
import { ruleRegistry } from "./registry.js";
import { sanitizeConfigString } from "../collectors/parse.js";
import type { ManifestTool, ToolManifest } from "../types.js";

interface ToolItem {
  tool: ManifestTool;
  manifest: ToolManifest;
}

interface SetItem {
  manifests: ToolManifest[];
}

/** Description length past which a tool description is a poisoning smell.
 * Genuine descriptions fit in a few hundred characters; multi-thousand
 * character "descriptions" are where smuggled instructions hide. */
export const OVERSIZED_DESCRIPTION_CHARS = 2000;

const DESTRUCTIVE_VERBS = [
  "delete", "remove", "drop", "destroy", "erase", "wipe", "overwrite",
  "send", "pay", "transfer", "purchase", "buy",
  "execute", "kill", "terminate", "deploy", "publish",
];

function base(manifest: ToolManifest): Pick<Finding, "region" | "resource"> {
  return { region: "local", resource: `${manifest.client}:${manifest.serverName} (${manifest.source})` };
}

ruleRegistry.register({
  ruleId: "tool-description-injection-pattern",
  title: "Tool description matches a prompt-injection signature",
  description: "A tool's name or description matches a known prompt-injection signature family (ignore-previous-instructions, system-prompt-leak, roleplay-jailbreak, token-smuggling).",
  threat: "Tool descriptions are injected into the model's context by every MCP client. A poisoned description instructs the model directly: exfiltrate data, call other tools, ignore its instructions. The user never sees it.",
  rationale: "The same signature families this engine runs against invocation logs apply to tool descriptions, which are the highest-leverage injection surface in an agent's tool chain.",
  severity: "critical",
  appliesTo: "manifest_tool",
  complianceFrameworks: [OWASP_LLM_TOP10.LLM01_PROMPT_INJECTION, OWASP_AGENTIC.ASI01_GOAL_HIJACK, MITRE_ATLAS],
  check(item) {
    const { tool, manifest } = item as unknown as ToolItem;
    const text = `${tool.name} ${tool.description}`;
    const families = INJECTION_SIGNATURES.filter(s => s.patterns.some(p => p.test(text))).map(s => s.name);
    if (families.length === 0) return null;
    return {
      findingId: `mcp-tool-injection-${manifest.client}-${manifest.serverName}-${tool.name}`,
      ruleId: "tool-description-injection-pattern",
      title: `Tool '${tool.name}' description matches injection signature(s): ${families.join(", ")}`,
      severity: "critical",
      status: "FAIL",
      ...base(manifest),
      details: `Matched famil${families.length > 1 ? "ies" : "y"}: ${families.join(", ")}. Sanitized excerpt: "${sanitizeConfigString(tool.description).slice(0, 160)}"`,
      remediation: `Remove this server from your configuration until the description is explained. A tool description that addresses the model is an attack, not documentation.`,
      complianceFrameworks: [OWASP_LLM_TOP10.LLM01_PROMPT_INJECTION, OWASP_AGENTIC.ASI01_GOAL_HIJACK, MITRE_ATLAS],
    };
  },
});

ruleRegistry.register({
  ruleId: "tool-shadowing-collision",
  title: "Same tool name exposed by multiple servers",
  description: "Two or more configured servers expose a tool with the same name.",
  threat: "When names collide, the client or model may route a call to the wrong server. A malicious server that shadows a trusted tool name (e.g. read_file) receives the arguments meant for the real one.",
  rationale: "Name routing is the only addressing MCP tools have; collisions are ambiguity an attacker can occupy. Cross-server visibility is exactly what a config-level auditor can check and a single server cannot.",
  severity: "high",
  appliesTo: "manifest_set",
  complianceFrameworks: [OWASP_AGENTIC.ASI02_TOOL_MISUSE, OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, NIST_AI_RMF],
  check(item) {
    const { manifests } = item as unknown as SetItem;
    const byName = new Map<string, string[]>();
    for (const m of manifests) {
      for (const t of m.tools) {
        const owners = byName.get(t.name) ?? [];
        owners.push(`${m.client}:${m.serverName}`);
        byName.set(t.name, owners);
      }
    }
    const collisions = [...byName.entries()].filter(([, owners]) => new Set(owners).size > 1);
    if (collisions.length === 0) return null;
    const listing = collisions.map(([name, owners]) => `'${name}' (${[...new Set(owners)].join(", ")})`).join("; ");
    return {
      findingId: `mcp-tool-shadowing`,
      ruleId: "tool-shadowing-collision",
      title: `Tool name collision across servers: ${collisions.map(([n]) => `'${n}'`).join(", ")}`,
      severity: "high",
      status: "FAIL",
      resource: "mcp:tool-namespace",
      region: "local",
      details: `Colliding tool names: ${listing}. Calls addressed by name alone may be routed to either server.`,
      remediation: "Remove or rename one side of each collision, or drop the server you trust less. Verify which server actually serves the shadowed name in your client.",
      complianceFrameworks: [OWASP_AGENTIC.ASI02_TOOL_MISUSE, OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, NIST_AI_RMF],
    };
  },
});

ruleRegistry.register({
  ruleId: "destructive-tool-unannotated",
  title: "Destructive-sounding tool without safety annotations",
  description: "A tool whose name or description uses destructive verbs (delete, send, pay, execute, ...) declares neither readOnlyHint nor destructiveHint.",
  threat: "Clients use annotations to decide when to ask the human. An unannotated destructive tool gets called with the same ceremony as a read-only one.",
  rationale: "Annotations are the only machine-readable safety contract MCP tools carry. Their absence on a destructive capability removes the client's chance to interpose a confirmation.",
  severity: "medium",
  appliesTo: "manifest_tool",
  complianceFrameworks: [OWASP_AGENTIC.ASI02_TOOL_MISUSE, OWASP_LLM_TOP10.LLM06_EXCESSIVE_AGENCY, NIST_AI_RMF],
  check(item) {
    const { tool, manifest } = item as unknown as ToolItem;
    const annotated = tool.annotations?.readOnlyHint === true || tool.annotations?.destructiveHint !== undefined;
    if (annotated) return null;
    const normalized = `${tool.name.replace(/[_-]+/g, " ")} ${tool.description}`.toLowerCase();
    const verbs = DESTRUCTIVE_VERBS.filter(v => new RegExp(`\\b${v}`, "i").test(normalized));
    if (verbs.length === 0) return null;
    return {
      findingId: `mcp-destructive-unannotated-${manifest.client}-${manifest.serverName}-${tool.name}`,
      ruleId: "destructive-tool-unannotated",
      title: `Tool '${tool.name}' sounds destructive (${verbs.join(", ")}) but carries no safety annotations`,
      severity: "medium",
      status: "FAIL",
      ...base(manifest),
      details: `Matched verb(s): ${verbs.join(", ")}. The tool declares neither readOnlyHint nor destructiveHint, so clients cannot single it out for confirmation.`,
      remediation: "Prefer servers that annotate destructive tools (destructiveHint: true) and mark read-only ones (readOnlyHint: true). Treat calls to this tool as requiring manual review.",
      complianceFrameworks: [OWASP_AGENTIC.ASI02_TOOL_MISUSE, OWASP_LLM_TOP10.LLM06_EXCESSIVE_AGENCY, NIST_AI_RMF],
    };
  },
});

ruleRegistry.register({
  ruleId: "oversized-tool-description",
  title: "Tool description is anomalously long",
  description: `A tool description exceeds ${OVERSIZED_DESCRIPTION_CHARS} characters: a context-poisoning smell.`,
  threat: "Very long descriptions are where smuggled instructions hide: the visible opening reads normally while later paragraphs steer the model.",
  rationale: "Length is a weak signal on its own, so this is cataloged low: it directs human review to the descriptions worth reading in full.",
  severity: "low",
  appliesTo: "manifest_tool",
  complianceFrameworks: [OWASP_LLM_TOP10.LLM01_PROMPT_INJECTION, NIST_AI_RMF],
  check(item) {
    const { tool, manifest } = item as unknown as ToolItem;
    if (tool.descriptionLength <= OVERSIZED_DESCRIPTION_CHARS) return null;
    return {
      findingId: `mcp-oversized-description-${manifest.client}-${manifest.serverName}-${tool.name}`,
      ruleId: "oversized-tool-description",
      title: `Tool '${tool.name}' has a ${tool.descriptionLength}-character description`,
      severity: "low",
      status: "FAIL",
      ...base(manifest),
      details: `Description length ${tool.descriptionLength} exceeds the ${OVERSIZED_DESCRIPTION_CHARS}-character review threshold. Sanitized excerpt: "${sanitizeConfigString(tool.description).slice(0, 160)}"`,
      remediation: "Read the full description before trusting the tool; genuine tool documentation fits in a few hundred characters.",
      complianceFrameworks: [OWASP_LLM_TOP10.LLM01_PROMPT_INJECTION, NIST_AI_RMF],
    };
  },
});
