// src/types.ts

/** Severity levels aligned to GuardDuty → SPM mapping */
export type Severity = "critical" | "high" | "medium" | "low";

/** Finding status */
export type FindingStatus = "FAIL" | "PASS" | "ERROR" | "NOT_APPLICABLE";

/** The universal output type — every scanner tool returns this.
 * This schema is the engine's contract; changing it is a major version. */
export interface Finding {
  findingId: string;                   // e.g. "bedrock-iam-wildcard-action-AdminRole"
  ruleId: string;                      // e.g. "wildcard-bedrock-action"
  title: string;                       // Human-readable, e.g. "AdminRole has wildcard bedrock:*"
  severity: Severity;
  status: FindingStatus;
  resource: string;                    // ARN, config path, server name — pack-defined
  region: string;                      // pack-defined; "global" for non-regional resources
  details: string;                     // What's wrong, with specifics
  remediation: string;                 // Concrete fix steps or commands
  complianceFrameworks: string[];      // e.g. OWASP LLM Top 10, OWASP Agentic, NIST AI RMF, MITRE ATLAS
  reference?: string;                  // Link to docs or relevant standard
}
