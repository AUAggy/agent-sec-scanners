// src/types.ts
//
// The finding schema lives in @miaggy/core; these are the pack's snapshot
// types. Collectors produce them; rules are pure functions over them.

/** The MCP clients whose configuration this pack discovers. */
export type McpClient = "claude-desktop" | "claude-code" | "cursor" | "vscode";

/** An npm package reference parsed from a server's launch command. */
export interface NpmPackageRef {
  /** The raw spec as written, e.g. "@scope/server" or "server@1.2.3". */
  spec: string;
  /** Package name without the version, e.g. "@scope/server". */
  name: string;
  /** The pinned version, if any. Absent = floating (whatever the registry serves). */
  versionSpec?: string;
}

/** One MCP server entry discovered in a client configuration file. */
export interface McpServerEntry {
  /** The server's key in the config file. */
  name: string;
  /** Absolute path of the config file it came from. */
  source: string;
  client: McpClient;
  command?: string;
  args: string[];
  env: Record<string, string>;
  /** Remote server URL for sse/http-style entries (no local command). */
  url?: string;
  /** Set when the launch command resolves an npm package (npx/bunx). */
  npmPackage?: NpmPackageRef;
}

/** A config file the collectors looked at. */
export interface ConfigSource {
  path: string;
  client: McpClient;
  status: "parsed" | "unreadable";
  /** Parse/read error message when status is "unreadable". */
  error?: string;
  serverCount: number;
}

/** What the collectors hand to the rules. */
export interface McpConfigSnapshot {
  servers: McpServerEntry[];
  sources: ConfigSource[];
}

/** npm registry facts about a server's package, fetched once per package. */
export interface RegistryInfo {
  name: string;
  exists: boolean;
  latestVersion?: string;
  maintainerCount?: number;
  /** ISO date of the most recent publish. */
  lastPublishDate?: string;
  /** True when the resolved version declares install/preinstall/postinstall. */
  hasInstallScript?: boolean;
  /** True when the resolved version has a registry provenance attestation. */
  hasProvenance?: boolean;
}
