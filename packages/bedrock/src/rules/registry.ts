// src/rules/registry.ts
//
// The registry machinery lives in @miaggy/core; this pack owns its singleton
// instance, which the rule modules populate on import.

import { createRuleRegistry } from "@miaggy/core";

export type { RuleSpec, RuleCatalogEntry } from "@miaggy/core";

/** Singleton rule registry for the bedrock pack */
export const ruleRegistry = createRuleRegistry();
