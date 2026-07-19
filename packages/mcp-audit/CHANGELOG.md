# Changelog

Notable changes to `@miaggy/mcp-audit`. Follows semantic versioning.

## 0.3.0

The static audit now accounts for every server it discovers, assesses PyPI
(`uvx`/`pipx`) servers, and reads more client config locations.

### Breaking

- **Drift baseline format is now version 2.** A server's identity changed from
  `client:name` to `client:name:source`, so two servers with the same name in
  different config locations no longer collapse into one baseline entry.
  Version-1 baselines are rejected on read as a `baseline-unreadable` finding.
  To migrate, run `mcp-audit snapshot` again to regenerate
  `mcp-audit-baseline.json`.

### Added

- Coverage-skip findings. Every discovered server that no rule assessed now
  produces a `NOT_APPLICABLE` finding naming the server, its launch shape, and
  why no rule ran. An empty findings list now means the tool looked and found
  nothing. Before, it could also mean the tool never looked at a server.
- PyPI servers. Servers launched with `uvx` or `pipx` are read as PyPI packages
  and checked for version pinning and maintenance signals; `uvx foo@latest` now
  reports as unpinned. PyPI publishes no install-script or provenance data, so
  those two rules cannot run for PyPI servers, and the coverage-skip names them
  as the residual.
- Project-scoped servers. Servers under `projects.<path>.mcpServers` in
  `~/.claude.json` (Claude Code) are now discovered, with the project path
  recorded in the finding's source.
- More clients. Goose (`config.yaml`) is fully supported, read without adding a
  YAML dependency. Windsurf, Cline, Continue, and Zed are supported on a
  best-effort basis: their config schemas change between versions, and an
  unrecognized shape yields zero servers rather than an error.
- VS Code variants. User settings are read from the `Code`, `Code - Insiders`,
  and `VSCodium` directories per OS, not only `Code`.

### Changed

- **Container images are out of scope, by design.** `docker` and `podman`
  servers are discovered and named with a coverage-skip, but their images are
  not assessed. Assessing them needs per-registry authentication and image-layer
  inspection, which is a container scanner's job (Trivy, Grype, Docker Scout).
  The README states the boundary.
- The report footer reads the version from `package.json` instead of a
  hardcoded string.
- The HTML report filename uses the local calendar date instead of the UTC date.

### Fixed

- Finding IDs include the config source, so two same-named servers in different
  locations no longer produce colliding IDs that a report could merge into one.
