import { describe, it, expect } from "vitest";
import { createRuleCatalog, renderCatalogJson } from "../src/catalog.js";
import { createRuleRegistry, type RuleCatalogEntry, type RuleSpec } from "../src/registry.js";

function entry(overrides: Partial<RuleCatalogEntry>): RuleCatalogEntry {
  return {
    ruleId: "extra-rule",
    title: "Extra rule",
    description: "An extra entry.",
    threat: "Something concrete goes wrong in a specific way.",
    rationale: "Checking this reduces a specific risk for a specific reason.",
    severity: "medium",
    appliesTo: "detection",
    complianceFrameworks: ["NIST_AI_RMF"],
    ...overrides,
  };
}

function spec(ruleId: string): RuleSpec {
  return { ...entry({ ruleId }), check: () => null };
}

describe("createRuleCatalog", () => {
  it("lists registry entries first, then extra entries", () => {
    const reg = createRuleRegistry();
    reg.register(spec("reg-rule"));
    const cat = createRuleCatalog({ registry: reg, extraEntries: [entry({ ruleId: "extra-rule" })] });
    expect(cat.all().map(e => e.ruleId)).toEqual(["reg-rule", "extra-rule"]);
  });

  it("works with only extra entries or only a registry", () => {
    expect(createRuleCatalog({ extraEntries: [entry({})] }).all()).toHaveLength(1);
    const reg = createRuleRegistry();
    reg.register(spec("only"));
    expect(createRuleCatalog({ registry: reg }).all()).toHaveLength(1);
  });

  it("resolves exact ruleIds", () => {
    const cat = createRuleCatalog({ extraEntries: [entry({ ruleId: "off-hours-usage" })] });
    expect(cat.get("off-hours-usage")!.ruleId).toBe("off-hours-usage");
  });

  it("resolves wildcard variants (ruleId ending in -*)", () => {
    const cat = createRuleCatalog({ extraEntries: [entry({ ruleId: "prompt-injection-*", severity: "critical" })] });
    const meta = cat.get("prompt-injection-ignore-previous-instructions");
    expect(meta).toBeDefined();
    expect(meta!.ruleId).toBe("prompt-injection-*");
    expect(meta!.severity).toBe("critical");
  });

  it("prefers exact matches over wildcard matches", () => {
    const cat = createRuleCatalog({
      extraEntries: [
        entry({ ruleId: "prompt-injection-*" }),
        entry({ ruleId: "prompt-injection-special", severity: "low" }),
      ],
    });
    expect(cat.get("prompt-injection-special")!.severity).toBe("low");
  });

  it("returns undefined for unknown ruleIds", () => {
    expect(createRuleCatalog({}).get("made-up-rule")).toBeUndefined();
  });
});

describe("renderCatalogJson", () => {
  it("renders the exact artifact shape with a trailing newline", () => {
    const json = renderCatalogJson([entry({ ruleId: "r1" })], {
      $schema: "https://example.com/schema.json",
      generatedBy: "test",
      note: "generated",
    });
    expect(json.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual(["$schema", "generatedBy", "note", "rules"]);
    expect(Object.keys(parsed.rules[0])).toEqual([
      "ruleId", "title", "severity", "appliesTo", "complianceFrameworks", "threat", "rationale",
    ]);
    expect(parsed.rules[0].ruleId).toBe("r1");
  });
});
