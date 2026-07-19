// src/registry/pypi.ts
//
// PyPI registry lookups over the public JSON API (global fetch; no extra
// dependency). Read-only GETs against pypi.org, nothing else. Parsing is split
// from fetching so tests run on fixture JSON offline.
//
// Coverage note (verified against the live packument): PyPI's JSON exposes the
// latest version, per-release upload timestamps, and owner roles, but NOT
// install-script hooks or PEP 740 provenance. So hasInstallScript and
// hasProvenance are left undefined — the corresponding rules correctly do not
// fire, and the audit tool names those two as the residual for a PyPI server
// (never a fabricated pass).

import type { RegistryInfo } from "../types.js";

const PYPI = "https://pypi.org/pypi";
const TIMEOUT_MS = 5000;

interface PypiDocument {
  info?: { version?: string };
  releases?: Record<string, Array<{ upload_time_iso_8601?: string }>>;
  ownership?: { roles?: unknown[] };
}

/** PEP 503 normalization: lowercase and collapse runs of -, _, . to a single
 * dash. Applied only to the lookup URL; the display name keeps its original
 * form. */
export function normalizePypiName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/** Derive RegistryInfo from a PyPI JSON document. Pure; unit-tested on fixtures. */
export function parsePypiDocument(name: string, doc: PypiDocument): RegistryInfo {
  const latest = doc.info?.version;
  const releaseFiles = latest ? doc.releases?.[latest] ?? [] : [];
  const uploadTimes = releaseFiles.map(f => f.upload_time_iso_8601).filter((t): t is string => !!t).sort();
  const owners = Array.isArray(doc.ownership?.roles) ? doc.ownership!.roles!.length : undefined;
  return {
    name,
    exists: true,
    latestVersion: latest,
    // `ownership.roles` is a newer PyPI field; absent on older responses, in
    // which case maintainerCount stays undefined and the maintenance rule skips.
    maintainerCount: owners,
    lastPublishDate: uploadTimes.length ? uploadTimes[uploadTimes.length - 1] : undefined,
    // Not exposed by the packument (see coverage note above).
    hasInstallScript: undefined,
    hasProvenance: undefined,
  };
}

async function getJson(url: string): Promise<{ status: number; body?: unknown }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return { status: res.status };
  return { status: res.status, body: await res.json() };
}

/** Look up one PyPI package. Throws on network failure (the tool converts that
 * into a lookup-skipped finding); returns exists:false on a clean 404. */
export async function lookupPypiPackage(name: string): Promise<RegistryInfo> {
  const res = await getJson(`${PYPI}/${encodeURIComponent(normalizePypiName(name))}/json`);
  if (res.status === 404) return { name, exists: false };
  if (!res.body) throw new Error(`registry returned ${res.status} for ${name}`);
  return parsePypiDocument(name, res.body as PypiDocument);
}
