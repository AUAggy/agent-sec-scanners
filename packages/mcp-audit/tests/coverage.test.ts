import { describe, it, expect } from "vitest";
import { coverageResidual, coverageSkipFindings } from "../src/tools/audit-mcp-config.js";
import type { LaunchShape, McpServerEntry } from "../src/types.js";

function entry(overrides: Partial<McpServerEntry> & { launchShape: LaunchShape }): McpServerEntry {
  return {
    name: "srv",
    source: "/home/x/.config/some.json",
    client: "claude-code",
    args: [],
    env: {},
    ...overrides,
  };
}

describe("coverageResidual", () => {
  it("returns null for a resolved npm server (it is assessed by the Wave-1 rules)", () => {
    const clean = entry({
      launchShape: "npm",
      command: "npx",
      args: ["-y", "well-kept@2.1.0"],
      packageRef: { ecosystem: "npm", spec: "well-kept@2.1.0", name: "well-kept", versionSpec: "2.1.0" },
    });
    // The correctness point: a CLEAN npm server must not be labelled unassessed.
    expect(coverageResidual(clean)).toBeNull();
  });

  it("flags an npx entry that did not resolve to a package name", () => {
    const degenerate = entry({ launchShape: "npm", command: "npx", args: ["-y"] });
    expect(coverageResidual(degenerate)).toMatch(/did not resolve to an npm package/);
  });

  it("names the residual per launch shape", () => {
    // pypi WITH a resolved package: partially assessed — provenance/install cannot run
    expect(coverageResidual(entry({
      launchShape: "pypi", command: "uvx",
      packageRef: { ecosystem: "pypi", spec: "p@latest", name: "p", versionSpec: "latest" },
    }))).toMatch(/PyPI does not publish install-script or provenance/);
    // pypi without a resolved package: nothing ran
    expect(coverageResidual(entry({ launchShape: "pypi", command: "uvx" }))).toMatch(/did not resolve to a PyPI package/);
    expect(coverageResidual(entry({ launchShape: "container", command: "docker" }))).toMatch(/container/);
    expect(coverageResidual(entry({ launchShape: "remote", url: "http://x/mcp" }))).toMatch(/remote/);
    expect(coverageResidual(entry({ launchShape: "local-binary", command: "/opt/srv" }))).toMatch(/local or other runtime/);
  });
});

describe("coverageSkipFindings", () => {
  const clean = entry({
    name: "npm-clean", launchShape: "npm", command: "npx",
    packageRef: { ecosystem: "npm", spec: "a@1.0.0", name: "a", versionSpec: "1.0.0" },
  });
  const uvx = entry({ name: "py", launchShape: "pypi", command: "uvx" });
  const remote = entry({ name: "url", launchShape: "remote", url: "http://x/mcp" });

  it("emits exactly one NOT_APPLICABLE skip per unassessed server, none for clean npm", () => {
    const findings = coverageSkipFindings([clean, uvx, remote]);
    expect(findings).toHaveLength(2); // uvx + remote, NOT the clean npm server
    expect(findings.every(f => f.status === "NOT_APPLICABLE")).toBe(true);
    expect(findings.every(f => f.ruleId === "coverage-skip")).toBe(true);
    expect(findings.map(f => f.resource)).toEqual([
      "claude-code:py (/home/x/.config/some.json)",
      "claude-code:url (/home/x/.config/some.json)",
    ]);
  });

  it("makes findingIds unique by source, so same-named servers in two projects do not collide", () => {
    const a = entry({ name: "aws-docs", launchShape: "pypi", command: "uvx", source: "/proj/A" });
    const b = entry({ name: "aws-docs", launchShape: "pypi", command: "uvx", source: "/proj/B" });
    const ids = coverageSkipFindings([a, b]).map(f => f.findingId);
    expect(new Set(ids).size).toBe(2);
  });
});
