# @miaggy/core

Shared audit engine for the `@miaggy` scanner family: finding schema, rule
registry, severity-weighted posture scoring, compliance framework tags,
injection signature families, markdown/HTML report renderers, and CLI + MCP
server scaffolding.

Packs own their collectors (all I/O) and rule data; rules are pure functions
over pack-defined snapshots. First consumer:
[bedrock-security-mcp](https://www.npmjs.com/package/bedrock-security-mcp).

Published with provenance via npm Trusted Publishing from
[AUAggy/agent-sec-scanners](https://github.com/AUAggy/agent-sec-scanners).

MIT.
