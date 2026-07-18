// src/collectors/manifest.ts
//
// Live manifest collector. Starts each configured stdio server with a
// handshake-only MCP client: initialize, tools/list, shut down. It NEVER
// invokes a tool (the grep gate proves no tool-invocation API appears in
// this package) and never spawns a process itself; the SDK's stdio
// transport owns the child process.
//
// The server receives its configured env on top of the SDK's minimal default
// environment: it needs its env to start, and the user already runs these
// servers with exactly that env. Documented in the README and tool
// description.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { sanitizeConfigString } from "./parse.js";
import type { McpConfigSnapshot, McpServerEntry, ManifestTool, ToolManifest } from "../types.js";

export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000;

/** Handshake one server and return its tool manifest. Throws on spawn
 * failure, protocol failure, or timeout; the caller converts that into a
 * skip finding. Tool names are sanitized; descriptions are kept raw for
 * signature scanning and are only ever emitted through sanitized excerpts. */
export async function fetchManifest(
  server: McpServerEntry,
  timeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS
): Promise<ToolManifest> {
  if (!server.command) throw new Error("server has no command (remote/url entry)");

  const client = new Client({ name: "mcp-audit", version: "0.2.0" });
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    env: { ...getDefaultEnvironment(), ...server.env },
    stderr: "ignore",
  });

  let timer: NodeJS.Timeout | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`handshake timed out after ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();
  });

  try {
    const result = await Promise.race([
      (async () => {
        await client.connect(transport);
        const { tools } = await client.listTools();
        const info = client.getServerVersion();
        return { tools, info };
      })(),
      watchdog,
    ]);

    const tools: ManifestTool[] = result.tools.map(t => ({
      name: sanitizeConfigString(t.name),
      description: typeof t.description === "string" ? t.description : "",
      descriptionLength: typeof t.description === "string" ? t.description.length : 0,
      annotations: t.annotations,
    }));

    return {
      serverName: server.name,
      client: server.client,
      source: server.source,
      serverInfoName: result.info?.name ? sanitizeConfigString(result.info.name) : undefined,
      serverVersion: result.info?.version ? sanitizeConfigString(result.info.version) : undefined,
      tools,
    };
  } finally {
    if (timer) clearTimeout(timer);
    await client.close().catch(() => {});
  }
}

export interface ManifestScanResult {
  manifests: ToolManifest[];
  /** Stdio servers whose handshake failed, with a sanitized reason. */
  failures: Array<{ server: McpServerEntry; error: string }>;
  /** url-only entries: not scanned in this version. */
  skippedRemote: McpServerEntry[];
}

/** Handshake every stdio server in the snapshot, sequentially (one child
 * process at a time; an audit is not a load test). */
export async function collectManifests(
  snapshot: McpConfigSnapshot,
  timeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS
): Promise<ManifestScanResult> {
  const manifests: ToolManifest[] = [];
  const failures: ManifestScanResult["failures"] = [];
  const skippedRemote: McpServerEntry[] = [];

  for (const server of snapshot.servers) {
    if (!server.command) {
      skippedRemote.push(server);
      continue;
    }
    try {
      manifests.push(await fetchManifest(server, timeoutMs));
    } catch (err) {
      failures.push({ server, error: sanitizeConfigString((err as Error).message) });
    }
  }
  return { manifests, failures, skippedRemote };
}
