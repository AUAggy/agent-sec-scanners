import { describe, it, expect } from "vitest";
import { createRuleRegistry, type RuleSpec } from "../src/registry.js";
import type { Finding } from "../src/types.js";

function spec(overrides: Partial<RuleSpec>): RuleSpec {
  return {
    ruleId: "test-rule",
    title: "Test rule",
    description: "A test rule.",
    threat: "Something concrete goes wrong in a specific way.",
    rationale: "Checking this reduces a specific risk for a specific reason.",
    severity: "high",
    appliesTo: "test_scope",
    complianceFrameworks: ["NIST_AI_RMF"],
    check: () => null,
    ...overrides,
  };
}

function finding(ruleId: string): Finding {
  return {
    findingId: `f-${ruleId}`,
    ruleId,
    title: "t",
    severity: "high",
    status: "FAIL",
    resource: "r",
    region: "global",
    details: "d",
    remediation: "m",
    complianceFrameworks: ["NIST_AI_RMF"],
  };
}

describe("RuleRegistry", () => {
  it("registers and retrieves rules", () => {
    const reg = createRuleRegistry();
    reg.register(spec({ ruleId: "a" }));
    expect(reg.get("a")).toBeDefined();
    expect(reg.get("missing")).toBeUndefined();
    expect(reg.all()).toHaveLength(1);
  });

  it("filters by scope", () => {
    const reg = createRuleRegistry();
    reg.register(spec({ ruleId: "a", appliesTo: "scope_1" }));
    reg.register(spec({ ruleId: "b", appliesTo: "scope_2" }));
    expect(reg.forScope("scope_1").map(r => r.ruleId)).toEqual(["a"]);
  });

  it("catalog() strips the check function and keeps metadata", () => {
    const reg = createRuleRegistry();
    reg.register(spec({ ruleId: "a" }));
    const [entry] = reg.catalog();
    expect(entry.ruleId).toBe("a");
    expect(entry.threat.length).toBeGreaterThan(20);
    expect("check" in entry).toBe(false);
  });

  it("evaluate() collects findings from matching scopes only", () => {
    const reg = createRuleRegistry();
    reg.register(spec({ ruleId: "fires", appliesTo: "s1", check: () => finding("fires") }));
    reg.register(spec({ ruleId: "wrong-scope", appliesTo: "s2", check: () => finding("wrong-scope") }));
    reg.register(spec({ ruleId: "passes", appliesTo: "s1", check: () => null }));
    const findings = reg.evaluate([{ scope: "s1", data: {} }]);
    expect(findings.map(f => f.ruleId)).toEqual(["fires"]);
  });

  it("evaluate() converts a throwing rule into an ERROR finding", () => {
    const reg = createRuleRegistry();
    reg.register(spec({
      ruleId: "boom",
      appliesTo: "s1",
      check: () => { throw new Error("kaput"); },
    }));
    const [f] = reg.evaluate([{ scope: "s1", data: {} }]);
    expect(f.status).toBe("ERROR");
    expect(f.severity).toBe("low");
    expect(f.ruleId).toBe("boom");
    expect(f.findingId).toMatch(/^boom-error-\d+$/);
    expect(f.details).toContain("kaput");
  });
});
