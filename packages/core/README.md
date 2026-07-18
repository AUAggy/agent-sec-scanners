# @miaggy/core

The shared engine behind the `@miaggy` scanner family: one finding schema,
one rule model, one scoring formula, and one report language, reused across
provider-specific security scanners ("packs"). The first pack built on it is
[bedrock-security-mcp](https://www.npmjs.com/package/bedrock-security-mcp),
an AWS Bedrock security auditor.

## What's inside

- **Finding schema** — the cross-pack contract: `findingId`, `ruleId`,
  severity (`critical`/`high`/`medium`/`low`), status (`FAIL`/`PASS`/`ERROR`/
  `NOT_APPLICABLE`), resource, details, remediation, compliance tags.
  Changing this schema is a major version.
- **Rule registry** — rules are pure functions over pack-collected snapshots;
  a rule that throws becomes an `ERROR` finding, never a crash.
- **Rule catalog** — metadata (threat scenario + rationale per rule) with
  exact-then-wildcard lookup, and a generator for a pack's committed
  `rules-catalog.json` artifact.
- **Posture scoring** — violation-weighted 0–100 (critical 25, high 10,
  medium 3, low 1; one critical caps the score at 75). Deliberately not a
  pass-rate.
- **Report renderers** — a markdown posture report and a self-contained
  single-file HTML report (no external assets); packs inject their branding,
  categories, and framework labels.
- **Injection signatures** — regex families for prompt-injection patterns in
  any text a pack collects (invocation logs, tool descriptions).
- **CLI + MCP scaffolding** — `createCli` (exit `0` clean / `1` on
  critical-or-high FAIL / `2` bad args, `--json`, `--out-dir`) and
  `createMcpServer` (stdio transport only; tool errors returned as `isError`
  responses).

## The seam

Packs own all I/O: they implement collectors that produce a pack-defined
snapshot, and register rules that are pure functions over it. Core never
performs network or filesystem access on a pack's behalf — which keeps every
pack's rule tests mock-free, and this package dependency-light.

## Compliance frameworks

Cross-pack tags shipped here: OWASP LLM Top 10 (2025), OWASP Top 10 for
Agentic Applications, NIST AI RMF, MITRE ATLAS. Provider-specific frameworks
(e.g. the AWS Well-Architected ML Lens) live in the pack that cites them.

## Stability

`0.x`: the API surface is shaped by its consumers and may change in minor
versions until 1.0. The finding schema is the stable part.

## Provenance

Published tokenless with npm provenance via Trusted Publishing from
[AUAggy/agent-sec-scanners](https://github.com/AUAggy/agent-sec-scanners).

MIT.
