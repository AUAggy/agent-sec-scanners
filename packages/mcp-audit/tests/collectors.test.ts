import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { parseNpmPackageRef, parsePypiPackageRef, parseConfigContent, stripJsonComments, sanitizeConfigString, deriveLaunchShape, parseGooseConfig } from "../src/collectors/parse.js";
import { collectSource, candidatePaths } from "../src/collectors/discover.js";
import { readFileSync } from "node:fs";

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/configs/${name}`, import.meta.url));
}

describe("parseNpmPackageRef", () => {
  it("parses unpinned specs", () => {
    expect(parseNpmPackageRef("npx", ["-y", "foo-mcp"])).toEqual({ spec: "foo-mcp", name: "foo-mcp" });
  });

  it("parses pinned and scoped specs", () => {
    expect(parseNpmPackageRef("npx", ["-y", "foo-mcp@1.2.3"]))
      .toEqual({ spec: "foo-mcp@1.2.3", name: "foo-mcp", versionSpec: "1.2.3" });
    expect(parseNpmPackageRef("npx", ["-y", "@scope/foo"]))
      .toEqual({ spec: "@scope/foo", name: "@scope/foo" });
    expect(parseNpmPackageRef("bunx", ["@scope/foo@0.1.0"]))
      .toEqual({ spec: "@scope/foo@0.1.0", name: "@scope/foo", versionSpec: "0.1.0" });
  });

  it("returns undefined for non-runner commands and flag-only args", () => {
    expect(parseNpmPackageRef("node", ["./server.js"])).toBeUndefined();
    expect(parseNpmPackageRef("npx", ["-y"])).toBeUndefined();
    expect(parseNpmPackageRef(undefined, [])).toBeUndefined();
  });

  it("rejects specs that are not valid npm names (no registry lookups for junk)", () => {
    expect(parseNpmPackageRef("npx", ["a/b/c?x=1"])).toBeUndefined();
    expect(parseNpmPackageRef("npx", ["./local-dir"])).toBeUndefined();
    expect(parseNpmPackageRef("npx", ["https://evil.example/pkg"])).toBeUndefined();
    expect(parseNpmPackageRef("npx", ["x".repeat(215)])).toBeUndefined();
  });
});

describe("sanitizeConfigString", () => {
  const ESC = String.fromCharCode(27);
  const ZWSP = String.fromCharCode(0x200b);

  it("strips control characters, ANSI escapes, and hidden unicode", () => {
    expect(sanitizeConfigString(`bad\nname${ESC}[31mred${ZWSP}end`)).toBe("bad name [31mred end");
    expect(sanitizeConfigString("tab\there")).toBe("tab here");
  });

  it("caps length at 200", () => {
    expect(sanitizeConfigString("a".repeat(500))).toHaveLength(200);
  });

  it("is applied to server names, args, and env keys at parse time", () => {
    const evil = JSON.stringify({
      mcpServers: {
        "bad\nname": {
          command: "npx",
          args: ["-y", `pkg${ESC}[0m`],
          env: { "KEY\n1": "v" },
        },
      },
    });
    const [s] = parseConfigContent(evil, "/x.json", "claude-desktop");
    expect(s.name).toBe("bad name");
    expect(s.args[1]).not.toContain(ESC);
    expect(Object.keys(s.env)[0]).toBe("KEY 1");
  });
});

describe("parseConfigContent", () => {
  it("parses the mcpServers shape with env and npm refs", () => {
    const content = readFileSync(fixturePath("claude_desktop_config.json"), "utf-8");
    const servers = parseConfigContent(content, "/x/config.json", "claude-desktop");
    expect(servers).toHaveLength(4);
    const byName = Object.fromEntries(servers.map(s => [s.name, s]));
    expect(byName["unpinned-tools"].packageRef).toEqual({ ecosystem: "npm", spec: "example-tools-mcp", name: "example-tools-mcp" });
    expect(byName["leaky-notes"].env.NOTES_API_KEY).toContain("sk-");
    expect(byName["pinned-clean"].packageRef!.versionSpec).toBe("2.1.0");
    expect(byName["local-script"].packageRef).toBeUndefined();
  });

  it("parses VS Code JSONC with the mcp.servers shape", () => {
    const content = readFileSync(fixturePath("vscode-settings.json"), "utf-8");
    const servers = parseConfigContent(content, "/x/settings.json", "vscode");
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("vscode-unpinned");
    expect(servers[0].packageRef!.versionSpec).toBeUndefined();
  });

  it("returns empty for configs without a server table", () => {
    expect(parseConfigContent("{}", "/x.json", "claude-code")).toEqual([]);
  });

  it("parses Zed context_servers (snake_case) tolerating comments (JSONC)", () => {
    const zed = '{\n  // Zed settings\n  "context_servers": { "docs": { "command": "npx", "args": ["-y", "docs-mcp@1.0.0"] } }\n}';
    const servers = parseConfigContent(zed, "/x/settings.json", "zed");
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("docs");
    expect(servers[0].packageRef?.versionSpec).toBe("1.0.0");
  });

  it("parses Windsurf/Continue mcpServers via the standard shape", () => {
    const ws = JSON.stringify({ mcpServers: { s: { command: "npx", args: ["-y", "s-mcp"] } } });
    expect(parseConfigContent(ws, "/x/mcp_config.json", "windsurf")).toHaveLength(1);
    expect(parseConfigContent(ws, "/x/config.json", "continue")).toHaveLength(1);
  });
});

describe("stripJsonComments", () => {
  it("preserves URLs inside strings", () => {
    const text = '{ "url": "https://example.com/path" }';
    expect(JSON.parse(stripJsonComments(text)).url).toBe("https://example.com/path");
  });
});

describe("collectSource", () => {
  it("returns servers for a parseable file", () => {
    const result = collectSource({ path: fixturePath("claude_desktop_config.json"), client: "claude-desktop" });
    expect(result).not.toBeNull();
    expect(result!.source.status).toBe("parsed");
    expect(result!.source.serverCount).toBe(4);
  });

  it("degrades a broken file to an unreadable source, never a throw", () => {
    const result = collectSource({ path: fixturePath("broken.json"), client: "claude-code" });
    expect(result).not.toBeNull();
    expect(result!.source.status).toBe("unreadable");
    expect(result!.source.error).toBeTruthy();
    expect(result!.servers).toEqual([]);
  });

  it("returns null for absent files (absence is not an error)", () => {
    expect(collectSource({ path: fixturePath("does-not-exist.json"), client: "cursor" })).toBeNull();
  });
});

describe("candidatePaths", () => {
  it("checks every VS Code variant, so VSCodium/Insiders are covered (not just Code)", () => {
    const paths = candidatePaths("/proj", "/home/u", "darwin").map(p => p.path);
    expect(paths.some(p => p.includes("VSCodium/User/settings.json"))).toBe(true);
    expect(paths.some(p => p.includes("Code - Insiders/User/settings.json"))).toBe(true);
    expect(paths.some(p => p.includes("Application Support/Code/User/settings.json"))).toBe(true);
  });

  it("includes the best-effort clients, with Cline riding each VS Code variant", () => {
    const cps = candidatePaths("/proj", "/home/u", "linux");
    const byClient = (c: string) => cps.filter(p => p.client === c).map(p => p.path);
    expect(byClient("cline")).toHaveLength(3); // one per VS Code variant
    expect(byClient("cline")[0]).toContain("saoudrizwan.claude-dev");
    expect(byClient("windsurf").some(p => p.includes(".codeium/windsurf/mcp_config.json"))).toBe(true);
    expect(byClient("continue")[0]).toContain(".continue/config.json");
    expect(byClient("zed")[0]).toContain(".config/zed/settings.json");
  });
});

describe("parseConfigContent: Claude Code project-scoped servers", () => {
  const content = () => readFileSync(fixturePath("claude-json-with-projects.json"), "utf-8");

  it("discovers top-level AND projects.<path>.mcpServers entries", () => {
    const servers = parseConfigContent(content(), "/home/x/.claude.json", "claude-code");
    expect(servers.map(s => s.name).sort()).toEqual(["aws-docs", "aws-docs", "top-level"]);
  });

  it("encodes the project path into source, so two same-named servers stay distinct", () => {
    const servers = parseConfigContent(content(), "/home/x/.claude.json", "claude-code");
    const awsDocs = servers.filter(s => s.name === "aws-docs");
    expect(awsDocs).toHaveLength(2);
    const sources = awsDocs.map(s => s.source).sort();
    expect(sources[0]).toContain("projA");
    expect(sources[1]).toContain("projB");
    expect(new Set(sources).size).toBe(2);
  });

  it("does not read projects for non-Claude-Code clients", () => {
    const servers = parseConfigContent(content(), "/x/cursor.json", "cursor");
    expect(servers.map(s => s.name)).toEqual(["top-level"]); // projects ignored
  });
});

describe("parsePypiPackageRef", () => {
  it("parses uvx specs with and without a version, matching PyPI names", () => {
    expect(parsePypiPackageRef("uvx", ["awslabs.aws-pricing-mcp-server@latest"]))
      .toEqual({ spec: "awslabs.aws-pricing-mcp-server@latest", name: "awslabs.aws-pricing-mcp-server", versionSpec: "latest" });
    expect(parsePypiPackageRef("uvx", ["some.pkg"]))
      .toEqual({ spec: "some.pkg", name: "some.pkg" });
  });

  it("skips the pipx 'run' subcommand", () => {
    expect(parsePypiPackageRef("pipx", ["run", "some-tool@1.2.3"]))
      .toEqual({ spec: "some-tool@1.2.3", name: "some-tool", versionSpec: "1.2.3" });
  });

  it("returns undefined for non-python runners and flag-only args", () => {
    expect(parsePypiPackageRef("npx", ["-y", "foo"])).toBeUndefined();
    expect(parsePypiPackageRef("uvx", ["-q"])).toBeUndefined();
  });

  it("tags a uvx entry as a pypi packageRef through parseConfigContent", () => {
    const cfg = JSON.stringify({ mcpServers: { doc: { command: "uvx", args: ["awslabs.aws-documentation-mcp-server@latest"] } } });
    const [s] = parseConfigContent(cfg, "/x.json", "claude-code");
    expect(s.launchShape).toBe("pypi");
    expect(s.packageRef).toEqual({ ecosystem: "pypi", spec: "awslabs.aws-documentation-mcp-server@latest", name: "awslabs.aws-documentation-mcp-server", versionSpec: "latest" });
  });
});

describe("deriveLaunchShape", () => {
  it("classifies npm runners", () => {
    expect(deriveLaunchShape("npx")).toBe("npm");
    expect(deriveLaunchShape("bunx")).toBe("npm");
  });

  it("classifies python, container, and direct runtimes", () => {
    expect(deriveLaunchShape("uvx")).toBe("pypi");
    expect(deriveLaunchShape("pipx")).toBe("pypi");
    expect(deriveLaunchShape("docker")).toBe("container");
    expect(deriveLaunchShape("podman")).toBe("container");
    expect(deriveLaunchShape("node")).toBe("node");
    expect(deriveLaunchShape("python3")).toBe("python");
    expect(deriveLaunchShape("deno")).toBe("deno");
    expect(deriveLaunchShape("cargo")).toBe("rust");
  });

  it("matches on the command basename, so absolute paths classify too", () => {
    expect(deriveLaunchShape("/usr/local/bin/uvx")).toBe("pypi");
    expect(deriveLaunchShape("/opt/homebrew/bin/node")).toBe("node");
  });

  it("treats an unknown command as a local binary and no command as remote", () => {
    expect(deriveLaunchShape("/opt/tools/my-server")).toBe("local-binary");
    expect(deriveLaunchShape("my-server")).toBe("local-binary");
    expect(deriveLaunchShape(undefined)).toBe("remote");
  });
});

describe("parseGooseConfig", () => {
  const yaml = () => readFileSync(fixturePath("goose-config.yaml"), "utf-8");

  it("extracts only launchable extensions (builtins have no cmd/uri, so fall out)", () => {
    const servers = parseGooseConfig(yaml(), "/home/x/.config/goose/config.yaml");
    expect(servers.map(s => s.name).sort()).toEqual(["context7", "local-notes"]);
  });

  it("routes a Goose npx server into the npm path, fully assessable", () => {
    const context7 = parseGooseConfig(yaml(), "/p").find(s => s.name === "context7")!;
    expect(context7.client).toBe("goose");
    expect(context7.command).toBe("npx");
    expect(context7.args).toEqual(["-y", "@upstash/context7-mcp"]);
    expect(context7.launchShape).toBe("npm");
    // unpinned: no @version on the spec
    expect(context7.packageRef).toEqual({ ecosystem: "npm", spec: "@upstash/context7-mcp", name: "@upstash/context7-mcp" });
  });

  it("classifies a bare-path Goose server as a local binary (no npm package)", () => {
    const notes = parseGooseConfig(yaml(), "/p").find(s => s.name === "local-notes")!;
    expect(notes.launchShape).toBe("local-binary");
    expect(notes.packageRef).toBeUndefined();
  });

  it("returns [] when there is no extensions block (not an error)", () => {
    expect(parseGooseConfig("GOOSE_MODEL: gpt-4o\n", "/p")).toEqual([]);
  });

  it("throws on an unrecognized structure, so the caller degrades to a skip", () => {
    const malformed = "extensions:\n  - this-is-a-sequence-not-a-map\n";
    expect(() => parseGooseConfig(malformed, "/p")).toThrow();
  });
});
