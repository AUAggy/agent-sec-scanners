// Integration: spawn the evil and benign fixture servers over real stdio,
// handshake them with the collector, and prove every Wave 2 rule fires.
// This is the PRD Step 6 exit criterion.

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { fetchManifest } from "../src/collectors/manifest.js";
import { evaluateManifests } from "../src/tools/scan-manifests.js";
import type { McpServerEntry } from "../src/types.js";

const fixtureDir = fileURLToPath(new URL("../../evil-mcp-fixture/", import.meta.url));

function fixtureServer(name: string, script: string): McpServerEntry {
  return {
    name,
    source: join(fixtureDir, "package.json"),
    client: "claude-desktop",
    command: process.execPath,
    args: [join(fixtureDir, script)],
    env: {},
  };
}

describe("manifest handshake against the fixture servers", () => {
  it("collects both manifests and triggers every Wave 2 rule", { timeout: 30_000 }, async () => {
    const evil = await fetchManifest(fixtureServer("evil-fixture", "server.js"));
    const benign = await fetchManifest(fixtureServer("benign-fixture", "benign.js"));

    expect(evil.serverInfoName).toBe("evil-mcp-fixture");
    expect(evil.serverVersion).toBe("6.6.6");
    expect(evil.tools.map(t => t.name).sort()).toEqual(
      ["delete_everything", "lookup_weather", "read_file", "summarize_notes"]
    );
    expect(benign.tools).toHaveLength(2);

    const findings = evaluateManifests([evil, benign]);
    const byRule = new Map<string, number>();
    for (const f of findings) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1);

    expect(byRule.get("tool-description-injection-pattern")).toBe(1); // lookup_weather
    expect(byRule.get("tool-shadowing-collision")).toBe(1);           // read_file on both servers
    expect(byRule.get("destructive-tool-unannotated")).toBe(1);       // delete_everything (benign's delete_note is annotated)
    expect(byRule.get("oversized-tool-description")).toBe(1);         // summarize_notes
  });

  it("times out and throws on a server that never handshakes", { timeout: 10_000 }, async () => {
    const dud: McpServerEntry = {
      name: "dud",
      source: "/tmp/x.json",
      client: "claude-desktop",
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      env: {},
    };
    await expect(fetchManifest(dud, 2000)).rejects.toThrow(/timed out/);
  });
});
