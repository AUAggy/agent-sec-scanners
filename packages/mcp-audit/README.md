# @miaggy/mcp-audit

Audits the MCP servers a machine is configured to run, for supply-chain risk and tool-manifest poisoning. It reads the config files of Claude Desktop, Claude Code, Cursor, and VS Code, checks each configured npm package against the public registry, and reports findings with threat rationale, a posture score, and a remediation roadmap.

Two modes with an explicit line between them: the **static audit never executes a discovered server**. The **manifest scan** (`--manifests`, or the `scan_mcp_manifests` tool) is the opt-in that does: it starts each configured stdio server with a handshake-only MCP client — initialize and tools/list, never a tool call — then shuts it down. Scanned servers receive their configured env, which they need to start; you already run them with exactly that env.

## Static checks

| Rule | Severity | What it catches |
|---|---|---|
| `unpinned-server-version` | high | `npx -y some-mcp` with no `@version`: every client start runs whatever the registry serves |
| `secrets-in-env-block` | high | Literal API keys or tokens in a config env block (the finding names the variable, never the value) |
| `server-no-provenance` | medium | Package has no npm provenance attestation binding it to a source build |
| `server-install-scripts` | medium | Package declares preinstall/install/postinstall hooks |
| `server-low-maintenance-signal` | low | Single maintainer and no publish in over 540 days |

## Manifest checks (opt-in scan)

| Rule | Severity | What it catches |
|---|---|---|
| `tool-description-injection-pattern` | critical | A tool description that matches a prompt-injection signature family — instructions addressed to the model, not documentation |
| `tool-shadowing-collision` | high | The same tool name exposed by two servers; calls routed by name alone can land on the wrong one |
| `destructive-tool-unannotated` | medium | Delete/send/pay/execute-sounding tools with neither `readOnlyHint` nor `destructiveHint` |
| `oversized-tool-description` | low | Multi-thousand-character descriptions, where smuggled instructions hide |

## Drift detection

Record a baseline once, then flag anything that changes:

```bash
npx -y @miaggy/mcp-audit snapshot                       # writes mcp-audit-baseline.json
npx -y @miaggy/mcp-audit audit --baseline mcp-audit-baseline.json
```

The diff flags changed servers (`manifest-drift-since-baseline`, high — including the rug-pull shape where tool names stay identical but a description changes) and additions (`new-server-since-baseline`, medium). The baseline stores env variable names and hashed tool descriptions, never values; the format is specified in [`docs/baseline-format.md`](docs/baseline-format.md). Accept expected changes by taking a fresh snapshot. Snapshotting captures live manifests, so it performs the same handshake as `--manifests`.

Unreadable config files, failed registry lookups, unscannable servers, and unreadable baselines become skip findings, never a silent empty: the report always states what was not checked.

## Usage

As a CLI, for humans and CI:

```bash
npx -y @miaggy/mcp-audit audit
# exit 0 clean, 1 on any high-severity finding, 2 on bad args
```

As an MCP server (ask your client to audit its own configuration):

```json
{
  "mcpServers": {
    "mcp-audit": {
      "command": "npx",
      "args": ["-y", "@miaggy/mcp-audit@0.1.0"]
    }
  }
}
```

Yes, the config above pins the version. The rules in this package encode the same practices this project ships with: pinned versions, provenance (verify with `npm audit signatures`), no install scripts.

Built on [@miaggy/core](https://www.npmjs.com/package/@miaggy/core). Findings map to the OWASP Top 10 for Agentic Applications, OWASP LLM Top 10 (2025), NIST AI RMF, and MITRE ATLAS. The full rule catalog with per-rule threat and rationale is committed at [`examples/rules-catalog.json`](examples/rules-catalog.json).

MIT.
