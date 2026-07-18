// src/registry/npm.ts
//
// npm registry lookups over the public HTTP API (global fetch; no extra
// dependency). Read-only GETs against registry.npmjs.org, nothing else.
// Parsing is split from fetching so tests run on fixture JSON offline.

import type { RegistryInfo } from "../types.js";

const REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 5000;

interface Packument {
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
  maintainers?: Array<{ name?: string }>;
  versions?: Record<string, { scripts?: Record<string, string> }>;
}

const INSTALL_SCRIPT_KEYS = ["preinstall", "install", "postinstall"];

/** Derive RegistryInfo from a packument plus the provenance check result. */
export function parsePackument(name: string, doc: Packument, hasProvenance: boolean | undefined): RegistryInfo {
  const latest = doc["dist-tags"]?.latest;
  const scripts = latest ? doc.versions?.[latest]?.scripts ?? {} : {};
  return {
    name,
    exists: true,
    latestVersion: latest,
    maintainerCount: doc.maintainers?.length,
    lastPublishDate: latest ? doc.time?.[latest] : undefined,
    hasInstallScript: INSTALL_SCRIPT_KEYS.some(k => k in scripts),
    hasProvenance,
  };
}

async function getJson(url: string): Promise<{ status: number; body?: unknown }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return { status: res.status };
  return { status: res.status, body: await res.json() };
}

/** Look up one package. Throws on network failure (the tool converts that
 * into a lookup-skipped finding); returns exists:false on a clean 404. */
export async function lookupPackage(name: string): Promise<RegistryInfo> {
  const packument = await getJson(`${REGISTRY}/${name.replace("/", "%2f")}`);
  if (packument.status === 404) return { name, exists: false };
  if (!packument.body) throw new Error(`registry returned ${packument.status} for ${name}`);

  const doc = packument.body as Packument;
  const latest = doc["dist-tags"]?.latest;

  let hasProvenance: boolean | undefined;
  if (latest) {
    try {
      const att = await getJson(`${REGISTRY}/-/npm/v1/attestations/${encodeURIComponent(name)}@${latest}`);
      hasProvenance = att.status === 200;
    } catch {
      hasProvenance = undefined; // provenance endpoint unreachable; rule skips
    }
  }
  return parsePackument(name, doc, hasProvenance);
}
