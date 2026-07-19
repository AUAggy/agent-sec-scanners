// src/baseline.ts
//
// The drift baseline: an explicit, opt-in, human-readable JSON file the
// user creates with `mcp-audit snapshot` and diffs with `--baseline`.
// No hidden state; nothing is written without the snapshot command. The
// format is a first-class artifact, specified in docs/baseline-format.md.

import { createHash } from "node:crypto";
import type { McpConfigSnapshot, McpServerEntry, ToolManifest } from "./types.js";

export const BASELINE_VERSION = 1;
export const BASELINE_SCHEMA = "https://example.com/miaggy-mcp-audit/baseline-v1.json";

export interface BaselineManifest {
  serverVersion?: string;
  /** Sorted tool names. */
  toolNames: string[];
  /** "sha256:<hex>" over the canonical tool list (names + descriptions,
   * sorted by name). Descriptions are hashed, never stored. */
  toolsHash: string;
}

export interface BaselineServer {
  /** `${client}:${name}` — the identity servers are matched on. */
  key: string;
  client: string;
  name: string;
  source: string;
  /** Launch identity: npm spec when the server is npx/bunx-launched,
   * otherwise the command line or url. */
  spec: string;
  /** Env variable NAMES only, sorted. Values never enter the baseline. */
  envKeys: string[];
  /** null when the manifest was not captured (handshake failed or skipped). */
  manifest: BaselineManifest | null;
}

export interface Baseline {
  $schema: string;
  version: typeof BASELINE_VERSION;
  createdAt: string;
  servers: BaselineServer[];
}

export function serverKey(server: Pick<McpServerEntry, "client" | "name">): string {
  return `${server.client}:${server.name}`;
}

export function hashTools(manifest: ToolManifest): string {
  const canonical = manifest.tools
    .map(t => ({ name: t.name, description: t.description }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

export function createBaseline(snapshot: McpConfigSnapshot, manifests: ToolManifest[]): Baseline {
  const manifestByKey = new Map(manifests.map(m => [`${m.client}:${m.serverName}`, m]));
  const servers: BaselineServer[] = snapshot.servers.map(server => {
    const m = manifestByKey.get(serverKey(server));
    return {
      key: serverKey(server),
      client: server.client,
      name: server.name,
      source: server.source,
      spec: server.packageRef?.spec ?? server.url ?? [server.command, ...server.args].filter(Boolean).join(" "),
      envKeys: Object.keys(server.env).sort(),
      manifest: m
        ? {
            serverVersion: m.serverVersion,
            toolNames: m.tools.map(t => t.name).sort(),
            toolsHash: hashTools(m),
          }
        : null,
    };
  });
  return {
    $schema: BASELINE_SCHEMA,
    version: BASELINE_VERSION,
    createdAt: new Date().toISOString(),
    servers,
  };
}

export function serializeBaseline(baseline: Baseline): string {
  return JSON.stringify(baseline, null, 2) + "\n";
}

/** Parse and validate a baseline document. Throws with a plain message on
 * anything unusable; the caller turns that into a baseline-unreadable
 * finding. */
export function parseBaseline(text: string): Baseline {
  const doc = JSON.parse(text);
  if (doc?.version !== BASELINE_VERSION) {
    throw new Error(`unsupported baseline version ${doc?.version ?? "(missing)"} (expected ${BASELINE_VERSION})`);
  }
  if (!Array.isArray(doc.servers)) throw new Error("baseline has no servers array");
  return doc as Baseline;
}

export type DriftItem =
  | { kind: "new-server"; current: BaselineServer }
  | { kind: "manifest-drift"; before: BaselineServer; after: BaselineServer; changes: string[] };

/** Diff a stored baseline against the current state. Emits one item per new
 * server and one per changed server. Servers that disappeared are not
 * findings (removal is visible and usually deliberate). */
export function diffBaseline(baseline: Baseline, current: Baseline): DriftItem[] {
  const before = new Map(baseline.servers.map(s => [s.key, s]));
  const items: DriftItem[] = [];
  for (const cur of current.servers) {
    const prev = before.get(cur.key);
    if (!prev) {
      items.push({ kind: "new-server", current: cur });
      continue;
    }
    const changes: string[] = [];
    if (prev.spec !== cur.spec) {
      changes.push(`launch spec changed: '${prev.spec}' -> '${cur.spec}'`);
    }
    if (prev.manifest && cur.manifest) {
      if (prev.manifest.serverVersion !== cur.manifest.serverVersion) {
        changes.push(`server version changed: ${prev.manifest.serverVersion ?? "?"} -> ${cur.manifest.serverVersion ?? "?"}`);
      }
      const added = cur.manifest.toolNames.filter(n => !prev.manifest!.toolNames.includes(n));
      const removed = prev.manifest.toolNames.filter(n => !cur.manifest!.toolNames.includes(n));
      if (added.length) changes.push(`tools added: ${added.join(", ")}`);
      if (removed.length) changes.push(`tools removed: ${removed.join(", ")}`);
      if (!added.length && !removed.length && prev.manifest.toolsHash !== cur.manifest.toolsHash) {
        changes.push("tool descriptions changed (same tool names, different content hash)");
      }
    }
    if (changes.length) items.push({ kind: "manifest-drift", before: prev, after: cur, changes });
  }
  return items;
}
