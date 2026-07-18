import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { parseNpmPackageRef, parseConfigContent, stripJsonComments, sanitizeConfigString, deriveLaunchShape, parseGooseConfig } from "../src/collectors/parse.js";
import { collectSource } from "../src/collectors/discover.js";
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
    expect(byName["unpinned-tools"].npmPackage).toEqual({ spec: "example-tools-mcp", name: "example-tools-mcp" });
    expect(byName["leaky-notes"].env.NOTES_API_KEY).toContain("sk-");
    expect(byName["pinned-clean"].npmPackage!.versionSpec).toBe("2.1.0");
    expect(byName["local-script"].npmPackage).toBeUndefined();
  });

  it("parses VS Code JSONC with the mcp.servers shape", () => {
    const content = readFileSync(fixturePath("vscode-settings.json"), "utf-8");
    const servers = parseConfigContent(content, "/x/settings.json", "vscode");
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("vscode-unpinned");
    expect(servers[0].npmPackage!.versionSpec).toBeUndefined();
  });

  it("returns empty for configs without a server table", () => {
    expect(parseConfigContent("{}", "/x.json", "claude-code")).toEqual([]);
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
    expect(context7.npmPackage).toEqual({ spec: "@upstash/context7-mcp", name: "@upstash/context7-mcp" });
  });

  it("classifies a bare-path Goose server as a local binary (no npm package)", () => {
    const notes = parseGooseConfig(yaml(), "/p").find(s => s.name === "local-notes")!;
    expect(notes.launchShape).toBe("local-binary");
    expect(notes.npmPackage).toBeUndefined();
  });

  it("returns [] when there is no extensions block (not an error)", () => {
    expect(parseGooseConfig("GOOSE_MODEL: gpt-4o\n", "/p")).toEqual([]);
  });

  it("throws on an unrecognized structure, so the caller degrades to a skip", () => {
    const malformed = "extensions:\n  - this-is-a-sequence-not-a-map\n";
    expect(() => parseGooseConfig(malformed, "/p")).toThrow();
  });
});
