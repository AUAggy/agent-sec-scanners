import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parsePackument } from "../src/registry/npm.js";

const packument = JSON.parse(
  readFileSync(new URL("./fixtures/packument.json", import.meta.url), "utf-8")
);

describe("parsePackument", () => {
  it("extracts version, maintainers, publish date, and install-script flag", () => {
    const info = parsePackument("example-tools-mcp", packument, false);
    expect(info).toEqual({
      name: "example-tools-mcp",
      exists: true,
      latestVersion: "0.3.1",
      maintainerCount: 1,
      lastPublishDate: "2024-09-02T10:00:00.000Z",
      hasInstallScript: true,
      hasProvenance: false,
    });
  });

  it("carries an inconclusive provenance check as undefined", () => {
    expect(parsePackument("example-tools-mcp", packument, undefined).hasProvenance).toBeUndefined();
  });

  it("handles a minimal packument without crashing", () => {
    const info = parsePackument("x", {}, undefined);
    expect(info.exists).toBe(true);
    expect(info.latestVersion).toBeUndefined();
    expect(info.hasInstallScript).toBe(false);
  });
});
