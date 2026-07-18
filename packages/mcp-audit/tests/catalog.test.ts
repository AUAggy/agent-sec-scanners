import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { allRuleMetadata, getRuleMetadata } from "../src/rules/catalog.js";

/** Every ruleId the tools can emit must resolve to catalog metadata. */
const EMITTED_RULE_IDS = [
  "unpinned-server-version",
  "secrets-in-env-block",
  "server-no-provenance",
  "server-install-scripts",
  "server-low-maintenance-signal",
  "tool-description-injection-pattern",
  "tool-shadowing-collision",
  "destructive-tool-unannotated",
  "oversized-tool-description",
  "manifest-drift-since-baseline",
  "new-server-since-baseline",
  "config-source-unreadable",
  "registry-lookup-skipped",
  "manifest-scan-failed",
  "baseline-unreadable",
];

describe("allRuleMetadata", () => {
  it("returns exactly 15 catalog entries with no duplicates", () => {
    const ids = allRuleMetadata().map(r => r.ruleId);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
  });

  it("has non-empty threat and rationale on every entry", () => {
    for (const r of allRuleMetadata()) {
      expect(r.threat.length, `${r.ruleId} threat`).toBeGreaterThan(20);
      expect(r.rationale.length, `${r.ruleId} rationale`).toBeGreaterThan(20);
      expect(r.complianceFrameworks.length, `${r.ruleId} frameworks`).toBeGreaterThan(0);
    }
  });
});

describe("getRuleMetadata", () => {
  it("resolves every ruleId the tools emit", () => {
    for (const id of EMITTED_RULE_IDS) {
      expect(getRuleMetadata(id), `ruleId '${id}' must resolve`).toBeDefined();
    }
  });

  it("returns undefined for unknown ruleIds", () => {
    expect(getRuleMetadata("made-up-rule")).toBeUndefined();
  });
});

describe("examples/rules-catalog.json", () => {
  it("matches allRuleMetadata() exactly (regenerate via npm run build:catalog)", () => {
    const artifact = JSON.parse(
      readFileSync(new URL("../examples/rules-catalog.json", import.meta.url), "utf-8")
    );
    const expected = allRuleMetadata().map(r => ({
      ruleId: r.ruleId,
      title: r.title,
      severity: r.severity,
      appliesTo: r.appliesTo,
      complianceFrameworks: r.complianceFrameworks,
      threat: r.threat,
      rationale: r.rationale,
    }));
    expect(artifact.rules).toEqual(expected);
  });
});
