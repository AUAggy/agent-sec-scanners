// src/collectors/discover.ts
//
// Filesystem discovery of MCP client configuration. Reads only; never
// executes anything it finds. A file that exists but cannot be parsed
// becomes an unreadable source (surfaced as a skip finding), never a crash
// and never a silent empty.

import { readFileSync, existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { ConfigSource, McpClient, McpConfigSnapshot, McpServerEntry } from "../types.js";
import { parseConfigContent, parseGooseConfig } from "./parse.js";

interface CandidatePath {
  path: string;
  client: McpClient;
}

/** VS Code and its config-compatible forks. VS Code's MCP settings and any
 * VS Code extension's storage (e.g. Cline) live under a per-product directory
 * that differs by editor — `Code`, `Code - Insiders`, `VSCodium`. Enumerating
 * the known variants is degrade-safe (a path for an editor you don't run is
 * simply absent) and best-effort (new forks appear); the covered set is
 * documented in the README. Cursor and Windsurf are forks with their own MCP
 * config mechanisms and are handled separately. */
const VSCODE_VARIANTS = ["Code", "Code - Insiders", "VSCodium"];

function appDataDir(name: string, home: string, os: NodeJS.Platform): string {
  return os === "darwin" ? join(home, "Library", "Application Support", name) :
    os === "win32" ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), name) :
    join(home, ".config", name);
}

/** Every config file this pack knows how to find, for a given project dir. */
export function candidatePaths(projectDir: string, home = homedir(), os = platform()): CandidatePath[] {
  const paths: CandidatePath[] = [
    { path: join(appDataDir("Claude", home, os), "claude_desktop_config.json"), client: "claude-desktop" },
    { path: join(projectDir, ".mcp.json"), client: "claude-code" },
    { path: join(projectDir, ".claude", "settings.json"), client: "claude-code" },
    { path: join(home, ".claude", "settings.json"), client: "claude-code" },
    { path: join(home, ".claude.json"), client: "claude-code" },
    { path: join(projectDir, ".cursor", "mcp.json"), client: "cursor" },
    { path: join(home, ".cursor", "mcp.json"), client: "cursor" },
    { path: join(projectDir, ".vscode", "mcp.json"), client: "vscode" },
  ];

  // VS Code family: user settings + Cline extension storage, per known variant.
  for (const variant of VSCODE_VARIANTS) {
    const userDir = join(appDataDir(variant, home, os), "User");
    paths.push({ path: join(userDir, "settings.json"), client: "vscode" });
    paths.push({ path: join(userDir, "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"), client: "cline" });
  }

  // Other JSON-config clients (home-level). Best-effort: schemas vary by version;
  // an unrecognized shape parses to zero servers, never a crash.
  paths.push({ path: join(home, ".codeium", "windsurf", "mcp_config.json"), client: "windsurf" });
  paths.push({ path: join(home, ".windsurf", "mcp_config.json"), client: "windsurf" });
  paths.push({ path: join(home, ".continue", "config.json"), client: "continue" });
  // Zed uses ~/.config/zed on macOS and Linux; %LOCALAPPDATA%\Zed on Windows.
  paths.push({
    path: os === "win32"
      ? join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Zed", "settings.json")
      : join(home, ".config", "zed", "settings.json"),
    client: "zed",
  });

  // Goose (Block): YAML config, its own reader.
  paths.push({
    path: os === "win32"
      ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Block", "goose", "config", "config.yaml")
      : join(home, ".config", "goose", "config.yaml"),
    client: "goose",
  });

  return paths;
}

/** Read and parse one candidate. Absent files are skipped silently (absence
 * is normal); present-but-unparseable files come back as unreadable. */
export function collectSource(candidate: CandidatePath): { source: ConfigSource; servers: McpServerEntry[] } | null {
  if (!existsSync(candidate.path)) return null;
  try {
    const content = readFileSync(candidate.path, "utf-8");
    const servers = candidate.client === "goose"
      ? parseGooseConfig(content, candidate.path)
      : parseConfigContent(content, candidate.path, candidate.client);
    return {
      source: { path: candidate.path, client: candidate.client, status: "parsed", serverCount: servers.length },
      servers,
    };
  } catch (err) {
    return {
      source: {
        path: candidate.path,
        client: candidate.client,
        status: "unreadable",
        error: (err as Error).message,
        serverCount: 0,
      },
      servers: [],
    };
  }
}

/** Discover every configured MCP server visible from this machine + project. */
export function discoverMcpConfig(projectDir: string): McpConfigSnapshot {
  const servers: McpServerEntry[] = [];
  const sources: ConfigSource[] = [];
  for (const candidate of candidatePaths(projectDir)) {
    const result = collectSource(candidate);
    if (!result) continue;
    sources.push(result.source);
    servers.push(...result.servers);
  }
  return { servers, sources };
}
