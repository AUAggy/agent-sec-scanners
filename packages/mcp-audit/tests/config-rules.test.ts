import { describe, it, expect } from "vitest";
import { ruleRegistry } from "../src/rules/registry.js";
import "../src/rules/config-rules.js";
import { STALE_PUBLISH_DAYS } from "../src/rules/config-rules.js";
import type { McpServerEntry, RegistryInfo } from "../src/types.js";

function rule(ruleId: string) {
  const spec = ruleRegistry.get(ruleId);
  expect(spec, `rule ${ruleId} must be registered`).toBeDefined();
  return spec!;
}

function server(overrides: Partial<McpServerEntry>): McpServerEntry {
  return {
    name: "test-server",
    source: "/tmp/config.json",
    client: "claude-desktop",
    command: "npx",
    args: ["-y", "test-mcp@1.0.0"],
    env: {},
    launchShape: "npm",
    packageRef: { ecosystem: "npm", spec: "test-mcp@1.0.0", name: "test-mcp", versionSpec: "1.0.0" },
    ...overrides,
  };
}

function registry(overrides: Partial<RegistryInfo>): RegistryInfo {
  return {
    name: "test-mcp",
    exists: true,
    latestVersion: "1.0.0",
    maintainerCount: 3,
    lastPublishDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    hasInstallScript: false,
    hasProvenance: true,
    ...overrides,
  };
}

describe("unpinned-server-version", () => {
  it("fires high on npx with no version pin", () => {
    const f = rule("unpinned-server-version").check({
      server: server({ args: ["-y", "test-mcp"], packageRef: { ecosystem: "npm", spec: "test-mcp", name: "test-mcp" } }),
    });
    expect(f).not.toBeNull();
    expect(f!.severity).toBe("high");
    expect(f!.status).toBe("FAIL");
    expect(f!.details).toContain("test-mcp");
    expect(f!.complianceFrameworks).toContain("OWASP_AGENTIC:ASI04");
  });

  it("gives same-named servers in different sources distinct findingIds (no collision)", () => {
    const a = rule("unpinned-server-version").check({
      server: server({ name: "aws-docs", source: "/home/x/.claude.json (project: /p/A)", args: ["-y", "d"], packageRef: { ecosystem: "npm", spec: "d", name: "d" } }),
    });
    const b = rule("unpinned-server-version").check({
      server: server({ name: "aws-docs", source: "/home/x/.claude.json (project: /p/B)", args: ["-y", "d"], packageRef: { ecosystem: "npm", spec: "d", name: "d" } }),
    });
    expect(a!.findingId).not.toBe(b!.findingId);
  });

  it("is suppressed on an exact version pin, including prerelease", () => {
    expect(rule("unpinned-server-version").check({ server: server({}) })).toBeNull();
    expect(rule("unpinned-server-version").check({
      server: server({ packageRef: { ecosystem: "npm", spec: "test-mcp@2.0.0-rc.1", name: "test-mcp", versionSpec: "2.0.0-rc.1" } }),
    })).toBeNull();
  });

  it("fires on floating specs: dist-tags and ranges", () => {
    for (const versionSpec of ["latest", "^1.0.0", "~1.2.0", "1.x"]) {
      const f = rule("unpinned-server-version").check({
        server: server({ packageRef: { ecosystem: "npm", spec: `test-mcp@${versionSpec}`, name: "test-mcp", versionSpec } }),
      });
      expect(f, versionSpec).not.toBeNull();
      expect(f!.details).toContain("floating");
    }
  });

  it("is suppressed on non-npm launch commands", () => {
    const f = rule("unpinned-server-version").check({
      server: server({ command: "node", args: ["./local.js"], packageRef: undefined }),
    });
    expect(f).toBeNull();
  });
});

describe("secrets-in-env-block", () => {
  it("fires high on a literal API key and names the variable, not the value", () => {
    const f = rule("secrets-in-env-block").check({
      server: server({ env: { MY_API_KEY: "sk-FAKEFAKEFAKEFAKEFAKEFAKE1234" } }),
    });
    expect(f).not.toBeNull();
    expect(f!.severity).toBe("high");
    expect(f!.details).toContain("MY_API_KEY");
    expect(f!.details).not.toContain("FAKEFAKE");
  });

  it("fires on credential-named variables with literal values", () => {
    const f = rule("secrets-in-env-block").check({
      server: server({ env: { DB_PASSWORD: "hunter2hunter2" } }),
    });
    expect(f).not.toBeNull();
  });

  it("is suppressed for env references and non-secret values", () => {
    const f = rule("secrets-in-env-block").check({
      server: server({ env: { API_KEY: "${MY_KEY}", HOME_REGION: "us-east-1", DEBUG: "1" } }),
    });
    expect(f).toBeNull();
  });
});

describe("server-no-provenance", () => {
  it("fires medium when the package lacks provenance", () => {
    const f = rule("server-no-provenance").check({
      server: server({}),
      registry: registry({ hasProvenance: false }),
    });
    expect(f).not.toBeNull();
    expect(f!.severity).toBe("medium");
  });

  it("is suppressed with provenance, without registry data, or when the provenance check itself was inconclusive", () => {
    expect(rule("server-no-provenance").check({ server: server({}), registry: registry({}) })).toBeNull();
    expect(rule("server-no-provenance").check({ server: server({}) })).toBeNull();
    expect(rule("server-no-provenance").check({
      server: server({}), registry: registry({ hasProvenance: undefined }),
    })).toBeNull();
  });
});

describe("server-install-scripts", () => {
  it("fires medium when install scripts are declared", () => {
    const f = rule("server-install-scripts").check({
      server: server({}),
      registry: registry({ hasInstallScript: true }),
    });
    expect(f).not.toBeNull();
    expect(f!.severity).toBe("medium");
  });

  it("is suppressed without install scripts or without registry data", () => {
    expect(rule("server-install-scripts").check({ server: server({}), registry: registry({}) })).toBeNull();
    expect(rule("server-install-scripts").check({ server: server({}) })).toBeNull();
  });
});

describe("server-low-maintenance-signal", () => {
  it("fires low on single maintainer + stale publish", () => {
    const f = rule("server-low-maintenance-signal").check({
      server: server({}),
      registry: registry({ maintainerCount: 1, lastPublishDate: "2024-01-01T00:00:00.000Z" }),
    });
    expect(f).not.toBeNull();
    expect(f!.severity).toBe("low");
    expect(f!.details).toContain(String(STALE_PUBLISH_DAYS));
  });

  it("is suppressed for multi-maintainer or recently published packages", () => {
    expect(rule("server-low-maintenance-signal").check({
      server: server({}),
      registry: registry({ maintainerCount: 2, lastPublishDate: "2024-01-01T00:00:00.000Z" }),
    })).toBeNull();
    expect(rule("server-low-maintenance-signal").check({
      server: server({}),
      registry: registry({ maintainerCount: 1 }),
    })).toBeNull();
  });
});

describe("evaluate() over a mixed set", () => {
  it("fires the expected rules for a risky server", () => {
    const findings = ruleRegistry.evaluate([{
      scope: "mcp_server",
      data: {
        server: server({
          args: ["-y", "risky-mcp"],
          packageRef: { ecosystem: "npm", spec: "risky-mcp", name: "risky-mcp" },
          env: { TOKEN: "ghp_FAKEFAKEFAKEFAKEFAKE12345" },
        }),
        registry: registry({
          name: "risky-mcp", hasProvenance: false, hasInstallScript: true,
          maintainerCount: 1, lastPublishDate: "2024-01-01T00:00:00.000Z",
        }),
      },
    }]);
    expect(findings.map(f => f.ruleId).sort()).toEqual([
      "secrets-in-env-block",
      "server-install-scripts",
      "server-low-maintenance-signal",
      "server-no-provenance",
      "unpinned-server-version",
    ]);
  });
});
