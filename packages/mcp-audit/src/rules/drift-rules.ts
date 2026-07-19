// src/rules/drift-rules.ts
//
// Wave 3 rules. Scope "baseline_diff": items are
// { drift: DriftItem, baselineCreatedAt: string } produced by diffBaseline.

import { OWASP_AGENTIC, NIST_AI_RMF, MITRE_ATLAS } from "@miaggy/core";
import { ruleRegistry } from "./registry.js";
import type { DriftItem } from "../baseline.js";

interface DriftRuleItem {
  drift: DriftItem;
  baselineCreatedAt: string;
}

ruleRegistry.register({
  ruleId: "manifest-drift-since-baseline",
  title: "Server drifted from the recorded baseline",
  description: "A server's launch spec, version, tool list, or tool descriptions changed since the baseline snapshot.",
  threat: "Silent change is how a compromised update lands: same server name, new behavior. A changed tool description with unchanged tool names is the classic rug-pull shape.",
  rationale: "The baseline turns 'my tools changed' from unknowable into a diff. High severity because unreviewed change in an agent's tool chain is exactly what this pack exists to catch.",
  severity: "high",
  appliesTo: "baseline_diff",
  complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, MITRE_ATLAS, NIST_AI_RMF],
  check(item) {
    const { drift, baselineCreatedAt } = item as unknown as DriftRuleItem;
    if (drift.kind !== "manifest-drift") return null;
    return {
      findingId: `mcp-drift-${drift.after.key.replace(/[^A-Za-z0-9]+/g, "-")}`,
      ruleId: "manifest-drift-since-baseline",
      title: `Server '${drift.after.name}' changed since the baseline`,
      severity: "high",
      status: "FAIL",
      resource: `${drift.after.client}:${drift.after.name} (${drift.after.source})`,
      region: "local",
      details: `Baseline from ${baselineCreatedAt.slice(0, 10)}. Changes: ${drift.changes.join("; ")}.`,
      remediation: "Review each change (release notes, diff the package). If the change is expected, take a fresh snapshot to accept it as the new baseline.",
      complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, MITRE_ATLAS, NIST_AI_RMF],
    };
  },
});

ruleRegistry.register({
  ruleId: "new-server-since-baseline",
  title: "Server added since the recorded baseline",
  description: "A configured server exists that was not present in the baseline snapshot.",
  threat: "A server added outside the reviewed set expands the agent's tool chain without review — whether by a teammate, an installer, or an attacker with config write access.",
  rationale: "Medium, not high: new servers are often legitimate. The point is that additions surface for review instead of blending in.",
  severity: "medium",
  appliesTo: "baseline_diff",
  complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, NIST_AI_RMF],
  check(item) {
    const { drift, baselineCreatedAt } = item as unknown as DriftRuleItem;
    if (drift.kind !== "new-server") return null;
    return {
      findingId: `mcp-new-server-${drift.current.key.replace(/[^A-Za-z0-9]+/g, "-")}`,
      ruleId: "new-server-since-baseline",
      title: `Server '${drift.current.name}' was added since the baseline`,
      severity: "medium",
      status: "FAIL",
      resource: `${drift.current.client}:${drift.current.name} (${drift.current.source})`,
      region: "local",
      details: `Not present in the baseline from ${baselineCreatedAt.slice(0, 10)}. Launch spec: '${drift.current.spec}'.`,
      remediation: "Confirm who added this server and why. If it belongs, take a fresh snapshot to include it in the baseline.",
      complianceFrameworks: [OWASP_AGENTIC.ASI04_SUPPLY_CHAIN, NIST_AI_RMF],
    };
  },
});
