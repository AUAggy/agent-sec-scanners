// src/rules/registry.ts

import { createRuleRegistry } from "@miaggy/core";

export type { RuleSpec, RuleCatalogEntry } from "@miaggy/core";

/** Singleton rule registry for the mcp-audit pack */
export const ruleRegistry = createRuleRegistry();
