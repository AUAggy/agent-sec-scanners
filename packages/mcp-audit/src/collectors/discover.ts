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

/** Every config file this pack knows how to find, for a given project dir. */
export function candidatePaths(projectDir: string, home = homedir(), os = platform()): CandidatePath[] {
  const claudeDesktop =
    os === "darwin" ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json") :
    os === "win32" ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json") :
    join(home, ".config", "Claude", "claude_desktop_config.json");

  const vscodeUserSettings =
    os === "darwin" ? join(home, "Library", "Application Support", "Code", "User", "settings.json") :
    os === "win32" ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Code", "User", "settings.json") :
    join(home, ".config", "Code", "User", "settings.json");

  // Goose (Block): YAML config. On Windows it lives under %APPDATA%\Block\goose\config.
  const gooseConfig =
    os === "win32" ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Block", "goose", "config", "config.yaml") :
    join(home, ".config", "goose", "config.yaml");

  return [
    { path: claudeDesktop, client: "claude-desktop" },
    { path: join(projectDir, ".mcp.json"), client: "claude-code" },
    { path: join(projectDir, ".claude", "settings.json"), client: "claude-code" },
    { path: join(home, ".claude", "settings.json"), client: "claude-code" },
    { path: join(home, ".claude.json"), client: "claude-code" },
    { path: join(projectDir, ".cursor", "mcp.json"), client: "cursor" },
    { path: join(home, ".cursor", "mcp.json"), client: "cursor" },
    { path: join(projectDir, ".vscode", "mcp.json"), client: "vscode" },
    { path: vscodeUserSettings, client: "vscode" },
    { path: gooseConfig, client: "goose" },
  ];
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
