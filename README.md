# agent-sec-scanners

Security scanners for AI workloads, built on one shared audit engine. Every scanner in this repo emits the same finding schema, scores posture the same way, cites the same compliance frameworks, and renders the same reports, whatever it is auditing.

| Package | npm | What it is |
|---|---|---|
| [`packages/core`](packages/core) | [@miaggy/core](https://www.npmjs.com/package/@miaggy/core) | The engine: finding schema, rule registry, catalog, scoring, report renderers, CLI and MCP scaffolding |
| [`packages/bedrock`](packages/bedrock) | [bedrock-security-mcp](https://www.npmjs.com/package/bedrock-security-mcp) | AWS Bedrock security auditor: IAM, invocation logging, guardrails, prompt-injection signals. MCP server plus CI-grade CLI |

## The engine

`@miaggy/core` carries everything a scanner needs except the scanning:

- A finding schema with severity (`critical` to `low`), status (`FAIL`, `PASS`, `ERROR`, `NOT_APPLICABLE`), resource, remediation, and compliance tags. Changing it is a major version.
- A rule registry where every rule ships a concrete threat scenario and a rationale, surfaced in reports next to the finding. A rule that throws becomes an `ERROR` finding instead of a crash.
- Posture scoring that is deliberately not a pass rate: 100 minus weighted violations (critical 25, high 10, medium 3, low 1). One critical caps the score at 75.
- Regex signature families for prompt-injection patterns in any text a scanner collects, from invocation logs to tool descriptions.
- A markdown posture report and a self-contained single-file HTML report with no external assets.
- CLI scaffolding with fixed exit semantics (0 clean, 1 on any critical or high FAIL, 2 on bad arguments) and MCP server scaffolding, stdio transport only.

Packs own all I/O. A pack implements collectors that build a snapshot, and registers rules that are pure functions over it. The engine never touches the network or filesystem on a pack's behalf, which is why every pack's rule tests run without mocks.

## The compatibility promise

`bedrock-security-mcp` shipped standalone as 0.1.x and was rebuilt on the engine for 0.2.0 with byte-identical output. That claim is enforced, not asserted: golden-file snapshots of rule output, both report formats, and the JSON serialization were committed before any code moved, and the pack's test suite fails on a one-byte deviation. See [`packages/bedrock/tests/goldens/`](packages/bedrock/tests/goldens/).

## Verifiable claims

Releases are published from this repo by GitHub Actions using npm Trusted Publishing. No npm tokens exist. Check the provenance yourself:

```bash
npm install bedrock-security-mcp && npm audit signatures
```

The Bedrock pack is read-only against AWS by construction. The grep gate that CI and reviewers use:

```bash
grep -r '\.send(new' packages/bedrock/src/ | grep -iv 'List\|Get\|Lookup\|Describe\|Filter'   # must be empty
```

## Layout and releases

npm workspaces. A GitHub release tagged `core-vX.Y.Z` or `bedrock-vX.Y.Z` publishes that workspace; prerelease tags publish under the npm dist-tag `next`, so `latest` only ever moves on a final release.

MIT.
