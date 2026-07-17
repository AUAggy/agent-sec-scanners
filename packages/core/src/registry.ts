// src/registry.ts

import type { Finding } from "./types.js";

/** Metadata for a single rule */
export interface RuleSpec {
  ruleId: string;
  title: string;
  description: string;
  /** Concrete threat scenario this rule detects (the "what goes wrong"). */
  threat: string;
  /** Why this check reduces risk in this architecture (the "why it's not theatre").
   * For critical/high rules this is the Level A threat-modeled opinion; for
   * medium/low it names the normative reason. */
  rationale: string;
  severity: Finding["severity"];
  appliesTo: string;                       // pack-defined scope, e.g. "iam_role" | "iam_statement"
  complianceFrameworks: string[];
  /** The check function. Returns a finding if the rule is violated, null if it passes. */
  check: (item: Record<string, unknown>) => Finding | null;
}

/** Catalog entry surfaced to reports and the rules-catalog.json artifact. */
export interface RuleCatalogEntry {
  ruleId: string;
  title: string;
  description: string;
  threat: string;
  rationale: string;
  severity: Finding["severity"];
  appliesTo: string;
  complianceFrameworks: string[];
}

/** Rule registry. Each pack creates its own instance and registers its rules. */
export class RuleRegistry {
  private rules = new Map<string, RuleSpec>();

  register(spec: RuleSpec): void {
    if (this.rules.has(spec.ruleId)) {
      console.warn(`[rules] Overriding existing rule: ${spec.ruleId}`);
    }
    this.rules.set(spec.ruleId, spec);
  }

  get(ruleId: string): RuleSpec | undefined {
    return this.rules.get(ruleId);
  }

  /** All registered rules */
  all(): RuleSpec[] {
    return [...this.rules.values()];
  }

  /** Catalog entries for all registered rules (no check function — portable metadata). */
  catalog(): RuleCatalogEntry[] {
    return this.all().map(r => ({
      ruleId: r.ruleId,
      title: r.title,
      description: r.description,
      threat: r.threat,
      rationale: r.rationale,
      severity: r.severity,
      appliesTo: r.appliesTo,
      complianceFrameworks: r.complianceFrameworks,
    }));
  }

  /** Rules that apply to a given scope */
  forScope(scope: string): RuleSpec[] {
    return this.all().filter(r => r.appliesTo === scope);
  }

  /** Run all rules against a set of items, returning all violations */
  evaluate(items: Array<{ scope: string; data: Record<string, unknown> }>): Finding[] {
    const findings: Finding[] = [];
    for (const item of items) {
      for (const rule of this.forScope(item.scope)) {
        try {
          const finding = rule.check(item.data);
          if (finding) findings.push(finding);
        } catch (err) {
          findings.push({
            findingId: `${rule.ruleId}-error-${Date.now()}`,
            ruleId: rule.ruleId,
            title: `Rule evaluation error: ${rule.title}`,
            severity: "low",
            status: "ERROR",
            resource: "rule-engine",
            region: "unknown",
            details: `Rule '${rule.ruleId}' failed: ${(err as Error).message}`,
            remediation: "Check AWS API permissions and try again.",
            complianceFrameworks: rule.complianceFrameworks,
          });
        }
      }
    }
    return findings;
  }
}

export function createRuleRegistry(): RuleRegistry {
  return new RuleRegistry();
}
