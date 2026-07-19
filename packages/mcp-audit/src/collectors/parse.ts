// src/collectors/parse.ts
//
// Pure parsing: config file content in, server entries out. No filesystem
// access here; discover.ts owns paths and reads. This keeps the parsers
// fixture-testable.

import type { LaunchShape, McpClient, McpServerEntry, NpmPackageRef } from "../types.js";

/** Commands that resolve and run an npm package at launch time. */
const NPM_RUNNERS = new Set(["npx", "bunx"]);

/** Runner commands for other ecosystems, keyed by the launch shape they imply.
 * Matched on the command's basename so `/usr/bin/uvx` classifies too. */
const PYTHON_RUNNERS = new Set(["uvx", "pipx"]);
const CONTAINER_RUNNERS = new Set(["docker", "podman"]);
const DIRECT_RUNTIMES: Record<string, LaunchShape> = {
  node: "node",
  python: "python", python3: "python",
  deno: "deno",
  go: "go",
  ruby: "ruby", gem: "ruby",
  java: "jvm", jbang: "jvm",
  cargo: "rust",
};

function baseName(cmd: string): string {
  const i = Math.max(cmd.lastIndexOf("/"), cmd.lastIndexOf("\\"));
  return i >= 0 ? cmd.slice(i + 1) : cmd;
}

/** Classify how a server is launched. `undefined` command = a remote (url)
 * entry. An unrecognized command is a local binary on PATH or a bare path. */
export function deriveLaunchShape(command: string | undefined): LaunchShape {
  if (!command) return "remote";
  const c = baseName(command);
  if (NPM_RUNNERS.has(c)) return "npm";
  if (PYTHON_RUNNERS.has(c)) return "pypi";
  if (CONTAINER_RUNNERS.has(c)) return "container";
  return DIRECT_RUNTIMES[c] ?? "local-binary";
}

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

/** Valid PyPI project name (PEP 508/503 charset). Keeps arbitrary config
 * strings out of registry lookup URLs, same as NPM_NAME does for npm. */
const PYPI_NAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;

/** Parse the PyPI package spec out of a uvx/pipx invocation. Structurally the
 * same as the npm case (first non-flag arg, `@version` split); `pipx run <name>`
 * carries a "run" subcommand before the spec, which uvx does not. */
export function parsePypiPackageRef(command: string | undefined, args: string[]): NpmPackageRef | undefined {
  if (!command || !PYTHON_RUNNERS.has(baseName(command))) return undefined;
  const candidates = baseName(command) === "pipx" ? args.filter(a => a !== "run") : args;
  const spec = candidates.find(a => !a.startsWith("-"));
  if (!spec) return undefined;
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  if (name.length > 214 || !PYPI_NAME.test(name)) return undefined;
  return at > 0 ? { spec, name, versionSpec: spec.slice(at + 1) } : { spec, name };
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
  const launchShape = deriveLaunchShape(command);
  const entry: McpServerEntry = {
    name: sanitizeConfigString(name), source, client, command, args, env, launchShape,
  };
  if (typeof raw.url === "string") entry.url = sanitizeConfigString(raw.url);
  if (launchShape === "npm") {
    const pkg = parseNpmPackageRef(command, args);
    if (pkg) entry.packageRef = { ecosystem: "npm", ...pkg };
  } else if (launchShape === "pypi") {
    const pkg = parsePypiPackageRef(command, args);
    if (pkg) entry.packageRef = { ecosystem: "pypi", ...pkg };
  }
  return entry;
}

/** Parse one config file's content into server entries.
 * Understands the two common shapes:
 * - `{ "mcpServers": { name: {...} } }` (Claude Desktop, Claude Code, Cursor)
 * - `{ "servers": { name: {...} } }` or `{ "mcp": { "servers": {...} } }` (VS Code)
 * Throws on unparseable content; the caller turns that into an unreadable
 * source finding. */
export function parseConfigContent(content: string, path: string, client: McpClient): McpServerEntry[] {
  // VS Code and Zed settings.json permit comments (JSONC).
  const allowsComments = client === "vscode" || client === "zed";
  const parsed = JSON.parse(allowsComments ? stripJsonComments(content) : content);
  const entries: McpServerEntry[] = [];

  // The server table under any of the shapes clients use: `mcpServers` (Claude,
  // Cursor, Windsurf, Cline, Continue), `mcp.servers`/`servers` (VS Code),
  // `mcp_servers`/`context_servers` (Zed). Best-effort for the newer clients:
  // an unrecognized shape yields zero servers, never a crash.
  const table: Record<string, RawServer> | undefined =
    parsed?.mcpServers ?? parsed?.mcp?.servers ?? parsed?.servers ?? parsed?.mcp_servers ?? parsed?.context_servers;
  if (table && typeof table === "object") {
    for (const [name, raw] of Object.entries(table)) entries.push(toEntry(name, raw ?? {}, path, client));
  }

  // Claude Code stores project-scoped servers under `projects.<path>.mcpServers`
  // in ~/.claude.json. They are separate configured instances; the project path
  // goes into `source` so findings are attributable and per-server identity
  // stays distinct even when two projects reuse a server name.
  if (client === "claude-code" && parsed?.projects && typeof parsed.projects === "object") {
    for (const [projectPath, cfg] of Object.entries(parsed.projects as Record<string, unknown>)) {
      const ptable = (cfg as { mcpServers?: Record<string, RawServer> })?.mcpServers;
      if (!ptable || typeof ptable !== "object") continue;
      const projectSource = `${path} (project: ${sanitizeConfigString(projectPath)})`;
      for (const [name, raw] of Object.entries(ptable)) {
        entries.push(toEntry(name, raw ?? {}, projectSource, client));
      }
    }
  }

  return entries;
}

/** Strip matching single/double quotes from a scalar. */
function unquote(value: string): string {
  const t = value.trim();
  if (t.length >= 2 && ((t[0] === "'" && t.endsWith("'")) || (t[0] === '"' && t.endsWith('"')))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Parse a Goose config (`~/.config/goose/config.yaml`) — the one non-JSON
 * client. We do NOT take a YAML dependency: a supply-chain auditor adding a
 * runtime dep is against its own thesis, and this file is machine-generated
 * with a regular, narrow shape. This reads exactly that shape — the
 * `extensions:` map, 2-space block indentation, block sequences, flow `{}`/`[]`
 * — and reuses `toEntry`, so Goose entries get the same sanitization and
 * launch-shape/npm detection as every other client (Goose's `context7` server
 * launches via `npx`, so it lands in the npm path and is fully assessed).
 *
 * The discriminator for "is a server" is the same as the JSON path: the entry
 * names a `cmd` or a `uri`. Goose's `type: builtin` extensions have neither and
 * are excluded with no special-casing. Anything the reader does not recognize
 * throws, which the caller turns into an unreadable-source skip — never a
 * partial or silent entry. */
export function parseGooseConfig(content: string, path: string): McpServerEntry[] {
  const lines = content.split(/\r?\n/);
  let i = lines.findIndex(l => /^extensions:\s*$/.test(l));
  if (i === -1) return []; // no extensions configured; not an error
  i++;

  const entries: McpServerEntry[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break; // dedented out of the extensions block

    const nameMatch = /^ {2}([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (indent !== 2 || !nameMatch) {
      throw new Error(`unrecognized Goose extensions structure at line ${i + 1}`);
    }
    const name = nameMatch[1];
    i++;

    const raw: RawServer = { args: [] };
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") { i++; continue; }
      const ind = l.length - l.trimStart().length;
      if (ind <= 2) break; // next extension key, or end of block
      const body = l.trimStart();

      const seq = /^-\s+(.*)$/.exec(body);
      if (seq) { (raw.args as string[]).push(unquote(seq[1])); i++; continue; }

      const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(body);
      if (kv) {
        const key = kv[1];
        const val = kv[2].trim();
        if (key === "cmd" && val) raw.command = unquote(val);
        else if (key === "uri" && val) raw.url = unquote(val);
        // args come through the sequence branch; envs/env_keys are expected in
        // the empty flow form ({}/[]) on disk — a non-empty block env is not
        // consumed here (documented limitation; env values are never emitted
        // anyway, only keys for secret classification).
      }
      i++;
    }

    // Same discriminator as the JSON path: a launchable command or a url.
    if (raw.command || raw.url) entries.push(toEntry(name, raw, path, "goose"));
  }
  return entries;
}
