# @miaggy/mcp-audit

Audits the MCP servers a machine is configured to run, for supply-chain risk. It reads the config files of Claude Desktop, Claude Code, Cursor, and VS Code, checks each configured npm package against the public registry, and reports findings with threat rationale, a posture score, and a remediation roadmap. It never executes a server it finds.

## Checks (Wave 1)

| Rule | Severity | What it catches |
|---|---|---|
| `unpinned-server-version` | high | `npx -y some-mcp` with no `@version`: every client start runs whatever the registry serves |
| `secrets-in-env-block` | high | Literal API keys or tokens in a config env block (the finding names the variable, never the value) |
| `server-no-provenance` | medium | Package has no npm provenance attestation binding it to a source build |
| `server-install-scripts` | medium | Package declares preinstall/install/postinstall hooks |
| `server-low-maintenance-signal` | low | Single maintainer and no publish in over 540 days |

Unreadable config files and failed registry lookups become skip findings, never a silent empty: the report always states what was not checked.

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
