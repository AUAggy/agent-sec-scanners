// src/score.ts

import type { Finding } from "./types.js";

/**
 * Posture score: a violation-weighted 0-100 score, NOT a pass-rate.
 *
 * The tools only emit findings for violations (no per-check PASS), so a
 * pass-rate would be meaningless and a single synthetic "no signals" PASS
 * finding could inflate the score to 100%. This weighted formula is honest
 * about what it measures and needs no synthetic findings. Weights mirror AWS
 * Security Hub posture scoring: a single critical finding caps the score at
 * 75; four criticals floor it at 0.
 */
export function computePostureScore(findings: Finding[]): number {
  const weight = { critical: 25, high: 10, medium: 3, low: 1 };
  const deductions = findings
    .filter(f => f.status === "FAIL")
    .reduce((sum, f) => sum + (weight[f.severity] ?? 0), 0);
  return Math.max(0, 100 - deductions);
}
