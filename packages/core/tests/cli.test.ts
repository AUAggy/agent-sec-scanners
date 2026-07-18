import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCli, hasBlockingFindings, type ReportRunResult } from "../src/cli.js";
import type { Finding } from "../src/types.js";

function finding(severity: Finding["severity"], status: Finding["status"] = "FAIL"): Finding {
  return {
    findingId: `f-${severity}`,
    ruleId: "r",
    title: "t",
    severity,
    status,
    resource: "res",
    region: "global",
    details: "d",
    remediation: "m",
    complianceFrameworks: [],
  };
}

const HELP = "usage: test-pack audit [options]";

function makeCli(result: ReportRunResult, runSpy = vi.fn()) {
  const cli = createCli({
    helpText: HELP,
    outDirEnvVar: "TEST_PACK_OUTPUT_DIR",
    defaultOutDir: ".",
    flags: [
      { flag: "--region", key: "region" },
      { flag: "--hours", key: "hoursBack", parse: Number },
    ],
    defaults: { region: "us-east-1" },
    run: runSpy.mockResolvedValue(result),
  });
  return { cli, runSpy };
}

const CLEAN: ReportRunResult = { markdown: "# report", findings: [finding("low")] };

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.TEST_PACK_OUTPUT_DIR;
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
});

describe("hasBlockingFindings", () => {
  it("blocks on critical or high FAIL only", () => {
    expect(hasBlockingFindings([finding("critical")])).toBe(true);
    expect(hasBlockingFindings([finding("high")])).toBe(true);
    expect(hasBlockingFindings([finding("medium"), finding("low")])).toBe(false);
    expect(hasBlockingFindings([finding("critical", "PASS"), finding("high", "ERROR")])).toBe(false);
  });
});

describe("createCli", () => {
  it("prints help to stderr and exits 0 on -h/--help", async () => {
    const { cli, runSpy } = makeCli(CLEAN);
    expect(await cli(["--help"])).toBe(0);
    expect(errSpy).toHaveBeenCalledWith(HELP);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("exits 2 on unknown arguments", async () => {
    const { cli, runSpy } = makeCli(CLEAN);
    expect(await cli(["--bogus"])).toBe(2);
    expect(errSpy).toHaveBeenCalledWith("Unknown argument: --bogus");
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("passes defaults, pack flags, and title to run()", async () => {
    const { cli, runSpy } = makeCli(CLEAN);
    await cli(["--region", "ap-southeast-2", "--hours", "48", "--title", "My Report"]);
    expect(runSpy).toHaveBeenCalledWith({
      region: "ap-southeast-2",
      hoursBack: 48,
      title: "My Report",
    });
  });

  it("keeps the default when a pack flag has no value", async () => {
    const { cli, runSpy } = makeCli(CLEAN);
    await cli(["--region"]);
    expect(runSpy).toHaveBeenCalledWith({ region: "us-east-1" });
  });

  it("supports presence-only boolean flags that consume no value", async () => {
    const runSpy = vi.fn().mockResolvedValue(CLEAN);
    const cli = createCli({
      helpText: HELP,
      outDirEnvVar: "TEST_PACK_OUTPUT_DIR",
      defaultOutDir: ".",
      flags: [
        { flag: "--deep", key: "deep", boolean: true },
        { flag: "--region", key: "region" },
      ],
      defaults: {},
      run: runSpy,
    });
    await cli(["--deep", "--region", "us-west-2"]);
    expect(runSpy).toHaveBeenCalledWith({ deep: true, region: "us-west-2" });
  });

  it("sets the out-dir env var before running", async () => {
    const runSpy = vi.fn(async () => {
      expect(process.env.TEST_PACK_OUTPUT_DIR).toBe("/tmp/out");
      return CLEAN;
    });
    const { cli } = makeCli(CLEAN, runSpy as any);
    await cli(["--out-dir", "/tmp/out"]);
    expect(runSpy).toHaveBeenCalled();
  });

  it("prints markdown to stdout by default", async () => {
    const { cli } = makeCli(CLEAN);
    expect(await cli([])).toBe(0);
    expect(logSpy).toHaveBeenCalledWith("# report");
  });

  it("prints findings JSON with --json", async () => {
    const { cli } = makeCli(CLEAN);
    await cli(["--json"]);
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(CLEAN.findings, null, 2));
  });

  it("notes the HTML path on stderr when present", async () => {
    const { cli } = makeCli({ ...CLEAN, htmlPath: "/tmp/r.html" });
    await cli([]);
    expect(errSpy).toHaveBeenCalledWith("HTML report written to /tmp/r.html");
  });

  it("exits 1 when blocking findings are present", async () => {
    const { cli } = makeCli({ markdown: "# report", findings: [finding("high")] });
    expect(await cli([])).toBe(1);
  });
});
