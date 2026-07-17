// src/cli.ts
//
// Shared CLI scaffolding. Encodes the family conventions: exit codes 0/1/2,
// --json, --out-dir, --title, -h/--help, markdown to stdout, HTML path note
// to stderr, and the CI gate (critical/high FAIL → exit 1).

import type { Finding } from "./types.js";

/** What a pack's audit run returns to the CLI. */
export interface ReportRunResult {
  markdown: string;
  htmlPath?: string;
  /** The raw findings the report was built from. Lets CLI/CI consumers compute
   * exit codes and emit JSON without re-running the tools. */
  findings: Finding[];
}

/** A pack-specific flag beyond the shared set, e.g. "--region" or "--hours". */
export interface CliFlag {
  /** The literal flag token, e.g. "--region". */
  flag: string;
  /** Key set on the parsed args object passed to run(), e.g. "region". */
  key: string;
  /** Applied to the raw string value (e.g. Number). Default: identity. */
  parse?: (raw: string) => unknown;
}

export interface CliConfig {
  /** Full help text, printed to stderr on -h/--help and on bad args. */
  helpText: string;
  /** Env var that tells the pack's report writer where to put HTML output. */
  outDirEnvVar: string;
  /** Default HTML output dir when --out-dir is absent. */
  defaultOutDir: string;
  /** Pack-specific flags beyond the shared --out-dir/--title/--json/-h. */
  flags: CliFlag[];
  /** Initial values for parsed args (e.g. region from an env var). */
  defaults: Record<string, unknown>;
  /** Runs the audit with the parsed args (pack flags + optional title). */
  run: (args: Record<string, unknown>) => Promise<ReportRunResult>;
}

/** The family CI gate: critical- or high-severity FAIL findings block. */
export function hasBlockingFindings(findings: Finding[]): boolean {
  return findings.some(
    f => (f.severity === "critical" || f.severity === "high") && f.status === "FAIL"
  );
}

/** Build a CLI entrypoint. Returns the process exit code: 0 clean, 1 blocking
 * findings present, 2 bad args. */
export function createCli(config: CliConfig): (argv: string[]) => Promise<number> {
  return async (argv: string[]): Promise<number> => {
    const args: Record<string, unknown> = { ...config.defaults };
    let outDir = config.defaultOutDir;
    let title: string | undefined;
    let json = false;

    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      const spec = config.flags.find(f => f.flag === a);
      if (spec) {
        const raw = argv[++i];
        if (raw !== undefined) args[spec.key] = spec.parse ? spec.parse(raw) : raw;
        continue;
      }
      switch (a) {
        case "--out-dir": outDir = argv[++i] ?? outDir; break;
        case "--title":   title = argv[++i]; break;
        case "--json":    json = true; break;
        case "-h": case "--help":
          console.error(config.helpText);
          return 0;
        default:
          console.error(`Unknown argument: ${a}`);
          console.error(config.helpText);
          return 2;
      }
    }

    // Drive the report writer via env so HTML lands in the chosen dir.
    process.env[config.outDirEnvVar] = outDir;

    if (title) args.title = title;
    const result = await config.run(args);

    if (json) {
      console.log(JSON.stringify(result.findings, null, 2));
    } else {
      console.log(result.markdown);
    }
    if (result.htmlPath) {
      console.error(`HTML report written to ${result.htmlPath}`);
    }

    return hasBlockingFindings(result.findings) ? 1 : 0;
  };
}
