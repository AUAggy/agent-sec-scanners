// src/scripts/generate-sample-report.ts
//
// Writes examples/sample-report.html from a sanitized, synthetic snapshot.
// Everything here is fabricated: invented server and package names, example
// paths, no real machine data and no real third-party packages named as risky.
// The snapshot is deliberately diverse so the sample shows the whole 0.3 story
// in one report: full npm assessment, a server that passes, a PyPI (uvx) server
// with its provenance/install residual, and coverage-skips for a remote and a
// container server. Run via `npm run build:sample` after build.

import { writeFileSync } from "node:fs";
import { generateHtmlReport } from "@miaggy/core";
import { ruleRegistry } from "../rules/registry.js";
import "../rules/config-rules.js";
import { coverageSkipFindings } from "../tools/audit-mcp-config.js";
import { HTML_CONTEXT } from "../report/context.js";
import type { McpServerEntry, RegistryInfo } from "../types.js";

function server(name: string, overrides: Partial<McpServerEntry>): McpServerEntry {
  return {
    name,
    source: "/Users/dev/Library/Application Support/Claude/claude_desktop_config.json",
    client: "claude-desktop",
    command: "npx",
    args: ["-y", name],
    env: {},
    launchShape: "npm",
    packageRef: { ecosystem: "npm", spec: name, name },
    ...overrides,
  };
}

// npm server launched unpinned, published without provenance, with install
// scripts, by a single maintainer whose last release is stale.
const devTools = server("dev-tools-mcp", {});
const registryDevTools: RegistryInfo = {
  name: "dev-tools-mcp", exists: true, latestVersion: "0.3.1", maintainerCount: 1,
  lastPublishDate: "2024-08-02T10:00:00.000Z", hasInstallScript: true, hasProvenance: false,
};

// npm server that is well-published but carries an inline credential.
const notes = server("notes-mcp", {
  args: ["-y", "notes-mcp@1.4.0"],
  env: { NOTES_API_KEY: "sk-EXAMPLEEXAMPLEEXAMPLEEXAMPLE" },
  packageRef: { ecosystem: "npm", spec: "notes-mcp@1.4.0", name: "notes-mcp", versionSpec: "1.4.0" },
});
const registryNotes: RegistryInfo = {
  name: "notes-mcp", exists: true, latestVersion: "1.4.0", maintainerCount: 5,
  lastPublishDate: new Date(Date.now() - 15 * 86_400_000).toISOString(),
  hasInstallScript: false, hasProvenance: true,
};

// npm server that passes every check: pinned, provenance, no scripts, active.
const wellKept = server("well-kept-mcp", {
  args: ["-y", "well-kept-mcp@2.1.0"],
  packageRef: { ecosystem: "npm", spec: "well-kept-mcp@2.1.0", name: "well-kept-mcp", versionSpec: "2.1.0" },
});
const registryWellKept: RegistryInfo = {
  name: "well-kept-mcp", exists: true, latestVersion: "2.1.0", maintainerCount: 4,
  lastPublishDate: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  hasInstallScript: false, hasProvenance: true,
};

// PyPI server (uvx), unpinned. Pinning is assessed; PyPI publishes no
// install-script or provenance data, so those become the coverage-skip residual.
const docsSearch = server("docs-search", {
  source: "/Users/dev/.claude.json (project: /Users/dev/work/api)",
  client: "claude-code",
  command: "uvx",
  args: ["docs-search-mcp@latest"],
  launchShape: "pypi",
  packageRef: { ecosystem: "pypi", spec: "docs-search-mcp@latest", name: "docs-search-mcp", versionSpec: "latest" },
});
const registryDocsSearch: RegistryInfo = {
  name: "docs-search-mcp", exists: true, latestVersion: "3.2.0", maintainerCount: 3,
  lastPublishDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  hasInstallScript: undefined, hasProvenance: undefined,
};

// Remote (url) server: no local package to assess.
const remoteApi = server("remote-api", {
  source: "/Users/dev/.cursor/mcp.json",
  client: "cursor",
  command: undefined,
  args: [],
  url: "https://mcp.example.com/sse",
  launchShape: "remote",
  packageRef: undefined,
});

// Container server: discovered and named, image out of scope.
const imageServer = server("image-tools", {
  source: "/Users/dev/.vscode/mcp.json",
  client: "vscode",
  command: "docker",
  args: ["run", "-i", "acme/image-mcp:latest"],
  launchShape: "container",
  packageRef: undefined,
});

const ruleFindings = ruleRegistry.evaluate([
  { scope: "mcp_server", data: { server: devTools, registry: registryDevTools } },
  { scope: "mcp_server", data: { server: notes, registry: registryNotes } },
  { scope: "mcp_server", data: { server: wellKept, registry: registryWellKept } },
  { scope: "mcp_server", data: { server: docsSearch, registry: registryDocsSearch } },
]);

const allServers = [devTools, notes, wellKept, docsSearch, remoteApi, imageServer];
const findings = [...ruleFindings, ...coverageSkipFindings(allServers)];

const html = generateHtmlReport(findings, { region: "local", accountId: "workstation-01" }, HTML_CONTEXT);
writeFileSync("examples/sample-report.html", html, "utf-8");
console.log(`Wrote examples/sample-report.html with ${findings.length} findings`);
