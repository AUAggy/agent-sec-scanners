// src/tools/snapshot.ts
//
// The snapshot writer behind `mcp-audit snapshot`: captures the current
// config + live manifests into a baseline file. This is the only code path
// in the pack that writes state, and it only runs when explicitly invoked.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { discoverMcpConfig } from "../collectors/discover.js";
import { collectManifests } from "../collectors/manifest.js";
import { createBaseline, serializeBaseline } from "../baseline.js";

export interface SnapshotInput {
  projectDir?: string;
  outPath?: string;
  timeoutMs?: number;
}

export interface SnapshotResult {
  path: string;
  serverCount: number;
  manifestCount: number;
  failureCount: number;
}

export async function writeMcpBaseline(input: SnapshotInput): Promise<SnapshotResult> {
  const snapshot = discoverMcpConfig(input.projectDir ?? process.cwd());
  const { manifests, failures } = await collectManifests(snapshot, input.timeoutMs);
  const baseline = createBaseline(snapshot, manifests);
  const path = resolve(input.outPath ?? "mcp-audit-baseline.json");
  writeFileSync(path, serializeBaseline(baseline), "utf-8");
  return {
    path,
    serverCount: baseline.servers.length,
    manifestCount: manifests.length,
    failureCount: failures.length,
  };
}

const SNAPSHOT_HELP = `mcp-audit snapshot — record a drift baseline of your MCP configuration

Usage: mcp-audit snapshot [options]

Options:
  --project <path>    Project directory for project-level configs (default: current dir)
  --out <file>        Baseline file to write (default: ./mcp-audit-baseline.json)
  -h, --help          Show this help

Captures configured servers AND their live tool manifests, so it starts each
stdio server for a handshake (initialize + tools/list, no tool calls). The
baseline stores env variable names and hashed tool descriptions, never values.
Diff later with: mcp-audit audit --baseline <file>
`;

export async function runSnapshotCli(argv: string[]): Promise<number> {
  const input: SnapshotInput = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project": { const v = argv[++i]; if (v !== undefined) input.projectDir = v; break; }
      case "--out":     { const v = argv[++i]; if (v !== undefined) input.outPath = v; break; }
      case "-h": case "--help":
        console.error(SNAPSHOT_HELP);
        return 0;
      default:
        console.error(`Unknown argument: ${a}`);
        console.error(SNAPSHOT_HELP);
        return 2;
    }
  }
  const result = await writeMcpBaseline(input);
  console.error(
    `Baseline written to ${result.path} (${result.serverCount} server(s), ${result.manifestCount} manifest(s)` +
    (result.failureCount ? `, ${result.failureCount} handshake failure(s)` : "") + `)`
  );
  return 0;
}
