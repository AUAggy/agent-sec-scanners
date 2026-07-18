// src/collectors/parse.ts
//
// Pure parsing: config file content in, server entries out. No filesystem
// access here; discover.ts owns paths and reads. This keeps the parsers
// fixture-testable.

import type { McpClient, McpServerEntry, NpmPackageRef } from "../types.js";

/** Commands that resolve and run an npm package at launch time. */
const NPM_RUNNERS = new Set(["npx", "bunx"]);

/** Parse the npm package spec out of a runner invocation, if there is one.
 * The first non-flag argument is the spec (matches npx behavior for the
 * config shapes MCP clients generate). */
export function parseNpmPackageRef(command: string | undefined, args: string[]): NpmPackageRef | undefined {
  if (!command || !NPM_RUNNERS.has(command)) return undefined;
  const spec = args.find(a => !a.startsWith("-"));
  if (!spec) return undefined;
  // "@scope/name@1.2.3" and "name@1.2.3": a version separator is an "@" past
  // position 0. "@scope/name" alone has no separator after the scope slash.
  const at = spec.lastIndexOf("@");
  if (at > 0) {
    return { spec, name: spec.slice(0, at), versionSpec: spec.slice(at + 1) };
  }
  return { spec, name: spec };
}

/** Strip // and /* *​/ comments so VS Code-style JSONC parses. Naive but
 * sufficient for settings files; strings containing "//" (URLs) survive
 * because the pattern requires the slashes to start outside a quote pair on
 * common config shapes. Parse failures still degrade to an unreadable
 * source finding, never a crash. */
export function stripJsonComments(text: string): string {
  return text
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

interface RawServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

function toEntry(name: string, raw: RawServer, source: string, client: McpClient): McpServerEntry {
  const command = typeof raw.command === "string" ? raw.command : undefined;
  const args = Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === "string") : [];
  const env = raw.env && typeof raw.env === "object" ? raw.env : {};
  const entry: McpServerEntry = { name, source, client, command, args, env };
  if (typeof raw.url === "string") entry.url = raw.url;
  const pkg = parseNpmPackageRef(command, args);
  if (pkg) entry.npmPackage = pkg;
  return entry;
}

/** Parse one config file's content into server entries.
 * Understands the two common shapes:
 * - `{ "mcpServers": { name: {...} } }` (Claude Desktop, Claude Code, Cursor)
 * - `{ "servers": { name: {...} } }` or `{ "mcp": { "servers": {...} } }` (VS Code)
 * Throws on unparseable content; the caller turns that into an unreadable
 * source finding. */
export function parseConfigContent(content: string, path: string, client: McpClient): McpServerEntry[] {
  const parsed = JSON.parse(client === "vscode" ? stripJsonComments(content) : content);
  const table: Record<string, RawServer> | undefined =
    parsed?.mcpServers ?? parsed?.mcp?.servers ?? parsed?.servers;
  if (!table || typeof table !== "object") return [];
  return Object.entries(table).map(([name, raw]) => toEntry(name, raw ?? {}, path, client));
}
