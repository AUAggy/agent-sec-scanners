# Drift baseline format (version 2)

The baseline is the file `mcp-audit snapshot` writes and `mcp-audit audit --baseline <file>` reads. It records enough about your MCP configuration to detect change, and deliberately nothing more. It is plain JSON: read it, diff it, commit it to a private repo if you want history.

## Top level

```json
{
  "$schema": "https://example.com/miaggy-mcp-audit/baseline-v2.json",
  "version": 2,
  "createdAt": "2026-07-19T02:00:00.000Z",
  "servers": [ ... ]
}
```

`version` gates parsing: a reader that sees a version it does not support refuses with a `baseline-unreadable` finding rather than guessing. Breaking format changes increment it. **v2** made the server identity `client:name:source` (was `client:name`): the source is part of a server's identity, so the same server name configured in two places no longer collapses into one entry. A v1 baseline is refused; re-run `mcp-audit snapshot` to regenerate it.

## Per server

```json
{
  "key": "claude-desktop:notes-mcp:/Users/you/Library/Application Support/Claude/claude_desktop_config.json",
  "client": "claude-desktop",
  "name": "notes-mcp",
  "source": "/Users/you/Library/Application Support/Claude/claude_desktop_config.json",
  "spec": "notes-mcp@1.0.2",
  "envKeys": ["NOTES_API_KEY"],
  "manifest": {
    "serverVersion": "1.0.2",
    "toolNames": ["create_note", "read_note"],
    "toolsHash": "sha256:6b86b273..."
  }
}
```

- `key` (`client:name:source`) is the identity servers are matched on across snapshots. Source is included so two same-named servers in different config locations stay distinct.
- `spec` is the launch identity: the npm spec for npx/bunx servers, otherwise the command line or url.
- `envKeys` holds environment variable **names only**, sorted. Values never enter the baseline.
- `manifest` is `null` when the handshake failed or the server is remote; drift rules then skip manifest comparison for that server.
- `toolsHash` is `sha256:` over the canonical JSON of `[{ name, description }]` sorted by name. Descriptions are hashed, never stored, so a poisoned description cannot ride along inside the baseline file itself.

## What a diff produces

| Change | Finding | Severity |
|---|---|---|
| Launch spec, server version, tool list, or descriptions hash changed | `manifest-drift-since-baseline` | high |
| Server present now, absent from baseline | `new-server-since-baseline` | medium |
| Baseline file unreadable or unsupported version | `baseline-unreadable` | low (skip) |

Removed servers are not findings: removal is visible in the client and usually deliberate. Accept expected changes by taking a fresh snapshot.
