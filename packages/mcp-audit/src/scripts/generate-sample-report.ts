// src/scripts/generate-sample-report.ts
//
// Writes examples/sample-report.html from a sanitized, synthetic snapshot
// (no real machine data). Run via `npm run build:sample` after build.

import { writeFileSync } from "node:fs";
import { generateHtmlReport } from "@miaggy/core";
import { ruleRegistry } from "../rules/registry.js";
import "../rules/config-rules.js";
import { HTML_CONTEXT } from "../report/context.js";
import type { McpServerEntry, RegistryInfo } from "../types.js";

function server(name: string, overrides: Partial<McpServerEntry>): McpServerEntry {
  return {
    name,
    source: "/Users/example/Library/Application Support/Claude/claude_desktop_config.json",
    client: "claude-desktop",
    command: "npx",
    args: ["-y", name],
    env: {},
    npmPackage: { spec: name, name },
    ...overrides,
  };
}

const registryClean: RegistryInfo = {
  name: "well-kept-mcp", exists: true, latestVersion: "2.1.0", maintainerCount: 3,
  lastPublishDate: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  hasInstallScript: false, hasProvenance: true,
};

const registryRisky: RegistryInfo = {
  name: "example-tools-mcp", exists: true, latestVersion: "0.3.1", maintainerCount: 1,
  lastPublishDate: "2024-09-02T10:00:00.000Z",
  hasInstallScript: true, hasProvenance: false,
};

const findings = ruleRegistry.evaluate([
  { scope: "mcp_server", data: { server: server("example-tools-mcp", {}), registry: registryRisky } },
  {
    scope: "mcp_server",
    data: {
      server: server("notes-mcp", {
        args: ["-y", "notes-mcp"],
        env: { NOTES_API_KEY: "sk-EXAMPLEEXAMPLEEXAMPLEEXAMPLE" },
        npmPackage: { spec: "notes-mcp", name: "notes-mcp" },
      }),
      registry: undefined,
    },
  },
  {
    scope: "mcp_server",
    data: {
      server: server("well-kept-mcp", {
        args: ["-y", "well-kept-mcp@2.1.0"],
        npmPackage: { spec: "well-kept-mcp@2.1.0", name: "well-kept-mcp", versionSpec: "2.1.0" },
      }),
      registry: registryClean,
    },
  },
]);

const html = generateHtmlReport(findings, { region: "local", accountId: "workstation-01" }, HTML_CONTEXT);
writeFileSync("examples/sample-report.html", html, "utf-8");
console.log(`Wrote examples/sample-report.html with ${findings.length} findings`);
