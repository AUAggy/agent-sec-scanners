// @miaggy/core — shared audit engine for the scanner family.
//
// One engine, N packs, one report language: findings, rules, scoring,
// compliance tags, report renderers, injection signatures, and CLI/MCP
// scaffolding. Packs own their collectors (all I/O) and rule data; rules are
// pure functions over pack-defined snapshots, which keeps pack test suites
// mock-free.

export * from "./types.js";
export * from "./compliance.js";
export * from "./registry.js";
export * from "./catalog.js";
export * from "./score.js";
export * from "./signatures.js";
export * from "./report/markdown.js";
export * from "./report/html.js";
export * from "./cli.js";
export * from "./mcp-server.js";
