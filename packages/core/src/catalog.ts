// src/catalog.ts
//
// Rule-metadata catalog machinery. A pack composes its catalog from its
// registry rules plus any extra entries for findings constructed outside the
// registry (e.g. detection-layer findings built inline in a collector tool).

import type { RuleCatalogEntry, RuleRegistry } from "./registry.js";

export interface RuleCatalog {
  /** All catalog entries: registry rules first, then extra entries. */
  all(): RuleCatalogEntry[];
  /** Lookup metadata for a finding's ruleId. Returns undefined for unknown ruleIds.
   *  Supports wildcard entries (ruleId ending in '-*') for signature variants like
   *  prompt-injection-ignore-previous-instructions. Exact matches win. */
  get(ruleId: string): RuleCatalogEntry | undefined;
}

export function createRuleCatalog(sources: {
  registry?: RuleRegistry;
  extraEntries?: RuleCatalogEntry[];
}): RuleCatalog {
  const all = (): RuleCatalogEntry[] => [
    ...(sources.registry ? sources.registry.catalog() : []),
    ...(sources.extraEntries ?? []),
  ];
  return {
    all,
    get(ruleId: string): RuleCatalogEntry | undefined {
      const entries = all();
      const exact = entries.find(r => r.ruleId === ruleId);
      if (exact) return exact;
      return entries.find(r => r.ruleId.endsWith("-*") && ruleId.startsWith(r.ruleId.slice(0, -1)));
    },
  };
}

/** Header fields for a pack's generated rules-catalog.json artifact. */
export interface CatalogJsonHeader {
  $schema: string;
  generatedBy: string;
  note: string;
}

/** Render a pack's rules-catalog.json (ScoutSuite findings.json pattern).
 * The artifact is generated — never hand-edited; packs diff-check it in CI. */
export function renderCatalogJson(entries: RuleCatalogEntry[], header: CatalogJsonHeader): string {
  const catalog = {
    $schema: header.$schema,
    generatedBy: header.generatedBy,
    note: header.note,
    rules: entries.map(r => ({
      ruleId: r.ruleId,
      title: r.title,
      severity: r.severity,
      appliesTo: r.appliesTo,
      complianceFrameworks: r.complianceFrameworks,
      threat: r.threat,
      rationale: r.rationale,
    })),
  };
  return JSON.stringify(catalog, null, 2) + "\n";
}
