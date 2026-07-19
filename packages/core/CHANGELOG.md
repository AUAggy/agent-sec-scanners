# Changelog

Notable changes to `@miaggy/core`. Follows semantic versioning.

## 0.3.0

### Added

- Report contexts accept an optional `metaLabels` field, so a pack can relabel
  the report's account and region meta line (mcp-audit uses "Machine" and
  "Scope"). Packs that omit it render as before.
- The HTML and markdown renderers now list `NOT_APPLICABLE` findings in a "Not
  assessed" section, so coverage and skip findings appear in the human report
  instead of only in the JSON output. Reports with no such findings render as
  before (the section is omitted).

### Changed

- The `roleplay-jailbreak` injection signature now matches the article "an" as
  well as "a", for example "pretend you are an uncensored model". This closes a
  previously documented detection gap.
