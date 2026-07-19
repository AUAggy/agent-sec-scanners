# agent-sec-scanners

Security scanners for AI workloads, built on one shared engine. Today there are
two: an auditor for the MCP servers your agent is wired to run, and an auditor
for AWS Bedrock. Both speak the same finding format, score posture the same way,
and print the same reports.

## The line I never read

Open your Claude Desktop config, your `.mcp.json`, or Cursor's equivalent. Most
entries have a line like this:

```json
"args": ["-y", "some-mcp-server"]
```

I put those lines there myself, following a README, without reading what they
say. The line says: every time my client starts, fetch whatever version of this
package the registry serves right now, and run it. Inside a process holding my
API tokens. Wired into my model's context. Not once, after review; every
session, unattended, until I change the line.

A dependency in `package.json` gets a lockfile, a review when it changes, and a
CI run before it ships. The servers in an MCP config get none of that. There is
no lockfile for your agent's tool chain. That gap is what this repo audits.

## `@miaggy/mcp-audit`: read your agent's tool chain before it runs

```bash
npx -y @miaggy/mcp-audit@0.3.0 audit
```

It finds the MCP servers configured on your machine, checks each one, and prints
findings with a severity, a concrete threat, and a fix. It runs in about five
seconds and exits non-zero on anything high or worse, so a CI job can fail on it.

Three layers, each optional and clearly separated:

**Static audit (default).** Parses your config files and queries the package
registry. It never runs anything it finds. Checks: unpinned versions (no
`@version`, a dist-tag, or a range all mean the registry decides what runs next
session); credentials pasted into env blocks (the finding names the variable,
never the value); packages published without provenance; packages that declare
install scripts; and single-maintainer packages gone stale.

**Manifest scan (`--manifests`, opt-in).** A tool description is text a server
hands your client, which hands your model, on every session. You see a name like
`lookup_weather` in a menu; your model sees the full description, which can say
anything. This layer reads them for you. It starts each server with a
handshake-only client (`initialize` and `tools/list`, never a tool call), then
shuts it down. It flags prompt-injection language in descriptions, the same tool
name exposed by two servers, destructive-sounding tools with no safety
annotations, and descriptions long enough to hide instructions.

**Drift (`snapshot` + `--baseline`).** The scary update is the one that changes
nothing you can see: same server, same tool names, one description quietly
rewritten in a patch release. `snapshot` records a baseline (launch specs, tool
names, and a hash over the descriptions; values are never stored, so the file is
safe to commit). A later `audit --baseline` flags a changed description under
identical tool names as high severity.

Every discovered server appears in the report, whether or not a rule assessed
it. A `docker` server, a `url` server, or a package registry the audit cannot
reach shows up as a named "not assessed" entry with the reason. An empty
findings list means the audit looked and found nothing, not that it skipped a
server. What it covers and what it defers is written down in
[the pack README](packages/mcp-audit#coverage).

## Install and run

```bash
npx -y @miaggy/mcp-audit@0.3.0 audit                  # static, ~5s, exits 1 on high+
npx -y @miaggy/mcp-audit@0.3.0 audit --manifests       # plus the live handshake scan
npx -y @miaggy/mcp-audit@0.3.0 snapshot                # record a drift baseline
npx -y @miaggy/mcp-audit@0.3.0 audit --baseline mcp-audit-baseline.json
```

Add `--json` for machine output. Or add it to your client as an MCP server,
pinned, and ask your model to audit its own tool chain. The install line pins a
version because the rules would flag it if it did not.

## How it compares

mcp-audit works at the configuration layer: the servers you have wired up, their
supply-chain posture, the tool descriptions they inject, and how those change
over time. That is a different layer from the tools it sits next to.

- **`npm audit` and package-supply-chain scanners** read your `package.json`.
  They do not read MCP config files, so they never see the servers your agent
  actually launches, and they do not look at tool descriptions.
- **Container and image scanners (Trivy, Grype)** inspect image layers. mcp-audit
  does not; it names `docker` servers and defers their images to those tools by
  design (assessing a private registry needs credentials a read-only auditor
  should not hold).
- **MCP gateways and proxies** sit in the request path at runtime. mcp-audit
  reads configuration before anything runs, and needs no network position.
- **Hosted MCP security services** run in an account with a dashboard. mcp-audit
  runs locally, keeps no state beyond a baseline file you create on purpose, and
  needs no login. The trade-off is the reverse: no fleet view, no history server.

If you want a CI gate and a local audit you can read end to end, that is what
this is. If you want a managed fleet dashboard, this is not that.

## One engine, more than one scanner

The reporting half of a security scanner (finding schema, severity, scoring,
compliance mappings, report rendering) has nothing to do with what is being
scanned. So it lives in `@miaggy/core`, and each scanner is a thin pack on top.

- [`@miaggy/core`](packages/core) is the engine: a finding schema, a rule
  registry where every rule ships a threat and a rationale, posture scoring
  (100 minus weighted violations; one critical caps the score at 75),
  prompt-injection signature families, a markdown report and a self-contained
  HTML report, and CLI and MCP scaffolding.
- [`@miaggy/mcp-audit`](packages/mcp-audit) is the MCP auditor above.
- [`bedrock-security-mcp`](packages/bedrock) audits AWS Bedrock: IAM exposure,
  invocation logging, guardrail coverage, and prompt-injection signals. It runs
  as a CLI or an MCP server.

The engine was extracted from the Bedrock scanner under a contract: golden-file
tests pinned the old scanner's output byte for byte before any code moved, and
the rebuilt version had to reproduce it exactly. It did. The result is that the
second scanner, collectors and rules and fixtures and all, took days rather than
months, and both scanners emit the same finding schema, the same posture score,
the same reports, and the same CI gate.

## Design decisions and trade-offs

- **Read-only by construction, checked with grep.** The Bedrock pack makes only
  read AWS calls; the MCP pack never invokes a discovered tool. Both properties
  are a `grep` a reviewer can run (see below). The cost: the static layer cannot
  see runtime behavior, which is why the manifest scan is a separate, opt-in step
  that says plainly what it does.
- **Local and stateless.** No account, no server, no stored data except the
  drift baseline you write yourself. Trade-off stated above.
- **Coverage honesty over a clean number.** A scanner that reports clean while
  blind is worse than no scanner, so every server the audit cannot assess is
  named with a reason instead of dropped.
- **Assess what a public registry can answer.** npm and PyPI packages are
  checked; container images are named and deferred to an image scanner, because
  assessing them needs per-registry authentication that a config auditor has no
  business holding.
- **Signature-based injection detection.** A small set of regex families over
  tool descriptions. Treat a hit as text worth reading, not a verdict. The
  trade-off is no false confidence from a model you cannot inspect.
- **Published with provenance, no tokens.** Releases come from GitHub Actions via
  npm Trusted Publishing. There are no npm tokens to steal.

## Verifiable claims

Nothing here asks you to take a claim on faith. Check the provenance:

```bash
npm install @miaggy/mcp-audit && npm audit signatures
```

Check the read-only and no-exec properties:

```bash
grep -r '\.send(new' packages/bedrock/src/ | grep -iv 'List\|Get\|Lookup\|Describe\|Filter'   # must be empty
grep -rn 'callTool\|child_process' packages/mcp-audit/src/                                     # must be empty
```

248 tests run across the workspace, including a deliberately malicious MCP server
that is spawned over real stdio in the integration suite to prove every manifest
rule fires. Report output is pinned by golden-file tests, so a scanner's reports
cannot drift under refactoring.

## Layout and releases

npm workspaces. A GitHub release tagged `core-vX.Y.Z`, `bedrock-vX.Y.Z`, or
`mcp-audit-vX.Y.Z` publishes that workspace; prerelease tags publish under the
npm dist-tag `next`, so `latest` moves only on a final release. Publish `core`
before a pack that depends on a new core version.

MIT.
