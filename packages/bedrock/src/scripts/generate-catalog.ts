// src/scripts/generate-catalog.ts
//
// Writes examples/rules-catalog.json from allRuleMetadata() (ScoutSuite
// findings.json pattern). Run via `npm run build:catalog` after `npm run build`.
// The JSON artifact is generated — never hand-edited.

import { renderCatalogJson } from "@miaggy/core";
import { allRuleMetadata } from "../rules/catalog.js";
import { writeFileSync } from "node:fs";

const entries = allRuleMetadata();

writeFileSync(
  "examples/rules-catalog.json",
  renderCatalogJson(entries, {
    $schema: "https://example.com/bedrock-security-mcp/rules-catalog-v1.json",
    generatedBy: "bedrock-security-mcp — run `npm run build:catalog` to regenerate from src/rules/catalog.ts",
    note: "Single source of truth is src/rules (RuleSpec.threat/rationale + DETECTION_RULE_METADATA). This file is a generated artifact; do not edit by hand.",
  }),
  "utf-8"
);
console.log(`Wrote ${entries.length} rule entries to examples/rules-catalog.json`);
