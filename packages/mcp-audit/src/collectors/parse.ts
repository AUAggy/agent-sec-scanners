// src/collectors/parse.ts
//
// Pure parsing: config file content in, server entries out. No filesystem
// access here; discover.ts owns paths and reads. This keeps the parsers
// fixture-testable.

import type { McpClient, McpServerEntry, NpmPackageRef } from "../types.js";

/** Commands that resolve and run an npm package at launch time. */
const NPM_RUNNERS = new Set(["npx", "bunx"]);

/** Valid npm package name (scoped or not). Anything else is not treated as
 * an npm reference, which also keeps arbitrary config strings out of
 * registry lookup URLs. */
const NPM_NAME = /^(@[a-z0-9~][\w.~-]*\/)?[a-z0-9~][\w.~-]*$/i;

/** Config files are untrusted input that ends up in report output and MCP
 * tool responses. Strip control characters (ANSI escapes, newlines that
 * would forge report lines) and cap length at the trust boundary. */
export function sanitizeConfigString(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\ufeff]+/g, " ").slice(0, 200);
}

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
  const name = at > 0 ? spec.slice(0, at) : spec;
  if (name.length > 214 || !NPM_NAME.test(name)) return undefined;
  if (at > 0) {
    return { spec, name, versionSpec: spec.slice(at + 1) };
  }
  return { spec, name };
}

/** Strip whole-line and block comments so VS Code-style JSONC parses.
 * Naive but sufficient for settings files; strings containing "//" (URLs)
 * survive because only lines that start with "//" are removed. Trailing
 * same-line comments still fail JSON.parse, which degrades to an unreadable
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
  const command = typeof raw.command === "string" ? sanitizeConfigString(raw.command) : undefined;
  const args = Array.isArray(raw.args)
    ? raw.args.filter((a): a is string => typeof a === "string").map(sanitizeConfigString)
    : [];
  // Env KEYS are sanitized because they appear in findings; VALUES are kept
  // raw for secret classification and are never emitted anywhere.
  const env: Record<string, string> = {};
  if (raw.env && typeof raw.env === "object") {
    for (const [k, v] of Object.entries(raw.env)) env[sanitizeConfigString(k)] = v;
  }
  const entry: McpServerEntry = { name: sanitizeConfigString(name), source, client, command, args, env };
  if (typeof raw.url === "string") entry.url = sanitizeConfigString(raw.url);
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
