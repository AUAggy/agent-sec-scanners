import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parsePypiDocument, normalizePypiName } from "../src/registry/pypi.js";

const doc = JSON.parse(readFileSync(new URL("./fixtures/pypi-document.json", import.meta.url), "utf-8"));

describe("parsePypiDocument", () => {
  it("extracts version, last publish (latest release), and owner count", () => {
    const info = parsePypiDocument("awslabs.aws-pricing-mcp-server", doc);
    expect(info).toEqual({
      name: "awslabs.aws-pricing-mcp-server",
      exists: true,
      latestVersion: "1.0.31",
      maintainerCount: 2,
      // the LATER of the two 1.0.31 uploads
      lastPublishDate: "2026-06-09T13:45:53.285175Z",
      // PyPI does not publish these; left undefined so the rules do not fire
      hasInstallScript: undefined,
      hasProvenance: undefined,
    });
  });

  it("leaves maintainerCount undefined when ownership is absent (older responses)", () => {
    const info = parsePypiDocument("x", { info: { version: "1.0.0" }, releases: { "1.0.0": [] } });
    expect(info.maintainerCount).toBeUndefined();
    expect(info.exists).toBe(true);
  });
});

describe("normalizePypiName (PEP 503)", () => {
  it("lowercases and collapses runs of - _ . to a single dash", () => {
    expect(normalizePypiName("AWSLabs.Aws_Pricing--MCP")).toBe("awslabs-aws-pricing-mcp");
    expect(normalizePypiName("already-normal")).toBe("already-normal");
  });
});
