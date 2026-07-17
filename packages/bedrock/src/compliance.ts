// src/compliance.ts
//
// Cross-pack framework tags come from @miaggy/core; the AWS Well-Architected
// ML Lens is this pack's provider-specific framework.

export { OWASP_LLM_TOP10, OWASP_AGENTIC, NIST_AI_RMF, MITRE_ATLAS } from "@miaggy/core";

/** AWS Well-Architected Framework — Machine Learning Lens */
export const AWS_WA_ML_LENS = {
  SEC_3:  "AWS_WA_ML:SEC-3" as const,   // Identity & access management for ML resources
  SEC_6:  "AWS_WA_ML:SEC-6" as const,   // Data protection for ML workloads
  SEC_10: "AWS_WA_ML:SEC-10" as const,  // Incident response readiness
  OPS_8:  "AWS_WA_ML:OPS-8" as const,   // Monitoring & observability for ML
} as const;
