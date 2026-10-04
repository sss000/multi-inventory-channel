/**
 * Reconciliation Domain Service & Discrepancy Engine
 * Canonical Specification: Sections 26, 27, 29, 30, 31 of 01_ENGINEERING_SPEC.md & Prompt 19
 * 
 * Rules:
 * 1. Never hide discrepancies or negative inventory.
 * 2. Never auto-reconcile material differences or missing catalog mappings.
 * 3. Classify all discrepancies deterministically.
 * 4. The reconciliation engine must not automatically assume the external channel is wrong.
 * 5. CRITICAL MUTATION RULE: A detected external discrepancy must NOT by itself mutate the internal inventory ledger.
 * 6. Safe flow:
 *    Detect discrepancy -> Classify -> Gather evidence -> Determine source of truth ->
 *    Determine safe correction direction -> Approval if required -> Perform transactional mutation ->
 *    Synchronize affected channel(s) -> Verify external state -> Audit.
 * 7. Automatic correction requires:
 *    - known mapping
 *    - known source of truth
 *    - no unresolved competing event
 *    - permitted quantity delta
 *    - no manual lock
 *    - no high-risk state
 *    Otherwise: REQUIRES_APPROVAL
 */

import {
  ReconciliationResult,
  ReconciliationClassification,
  ReconciliationResultStatus,
  ReconciliationResultId,
  ReconciliationRunId,
  SkuId,
  UserId,
  DiscrepancyCause,
  SourceOfTruth,
  CorrectionDirection,
} from "./types.js";
import { ReconciliationInvariantError } from "./errors.js";

export interface ReconciliationPolicy {
  minorDifferenceThreshold: number; // e.g. 2 units
  allowAutoReconcileMinor: boolean;
  autoReconcileMaxDelta: number; // e.g. 1 unit
  staleThresholdMs: number; // e.g. 300,000ms = 5 mins
  requireApprovalForMaterial: boolean;
  defaultSourceOfTruth: SourceOfTruth;
}

export const DEFAULT_RECONCILIATION_POLICY: ReconciliationPolicy = {
  minorDifferenceThreshold: 2,
  allowAutoReconcileMinor: true,
  autoReconcileMaxDelta: 1,
  staleThresholdMs: 300_000,
  requireApprovalForMaterial: true,
  defaultSourceOfTruth: "INTERNAL_LEDGER",
};

export interface DiscrepancyEvidence {
  hasRecentPendingSync?: boolean;
  hasFailedSync?: boolean;
  recentOrderCount?: number;
  recentCancellationCount?: number;
  recentReturnCount?: number;
  unmappedSku?: boolean;
  externalObservedAt?: Date | string | null;
  isStaleSnapshot?: boolean;
  manualAdjustmentLogged?: boolean;
  warehouseRecountLogged?: boolean;
  channelSpecificRulesApplied?: boolean;
  activeLocksOrHighRisk?: boolean;
  competingUnresolvedEvents?: boolean;
  notes?: string;
  [key: string]: unknown;
}

export interface ClassifyDiscrepancyParams {
  internalQuantity?: number | null;
  externalQuantity?: number | null;
  policy?: Partial<ReconciliationPolicy>;
  externalObservedAt?: Date | string | null;
  isStale?: boolean;
}

export interface DiscrepancyCauseEvaluation {
  cause: DiscrepancyCause;
  explanation: string;
  confidence: number;
}

export interface SafeCorrectionParams {
  classification: ReconciliationClassification;
  difference: number;
  internalQuantity: number;
  externalQuantity: number;
  policy?: Partial<ReconciliationPolicy>;
  evidence?: DiscrepancyEvidence;
  sourceOfTruth?: SourceOfTruth;
}

export interface SafeCorrectionEvaluation {
  isAutoReconcilable: boolean;
  correctionDirection: CorrectionDirection;
  requiresApproval: boolean;
  sourceOfTruth: SourceOfTruth;
  targetQuantity: number;
  reason: string;
}

export interface CreateReconciliationResultParams {
  id?: ReconciliationResultId;
  reconciliationRunId: ReconciliationRunId;
  skuId: SkuId;
  internalQuantity?: number | null;
  externalQuantity?: number | null;
  policy?: Partial<ReconciliationPolicy>;
  evidence?: DiscrepancyEvidence;
  externalObservedAt?: Date | string | null;
  isStale?: boolean;
  sourceOfTruth?: SourceOfTruth;
}

/**
 * Classifies the difference between internal and external inventory counts.
 * Considers quantity delta, existence in catalogs, and external snapshot freshness.
 */
export function classifyDiscrepancy(
  internalQuantity?: number | null,
  externalQuantity?: number | null,
  policy: ReconciliationPolicy = DEFAULT_RECONCILIATION_POLICY,
  options?: { externalObservedAt?: Date | string | null; isStale?: boolean }
): {
  classification: ReconciliationClassification;
  difference: number;
  recommendedAction: string;
} {
  const internalExists = internalQuantity !== null && internalQuantity !== undefined;
  const externalExists = externalQuantity !== null && externalQuantity !== undefined;

  if (internalExists && !externalExists) {
    return {
      classification: "MISSING_EXTERNAL",
      difference: -(internalQuantity ?? 0),
      recommendedAction: "Verify channel listing or publish SKU to external marketplace.",
    };
  }

  if (!internalExists && externalExists) {
    return {
      classification: "MISSING_INTERNAL",
      difference: externalQuantity ?? 0,
      recommendedAction: "Map external SKU or import product into internal catalog.",
    };
  }

  if (!internalExists && !externalExists) {
    return {
      classification: "UNKNOWN",
      difference: 0,
      recommendedAction: "Both internal and external inventory quantities are missing.",
    };
  }

  const intQty = internalQuantity!;
  const extQty = externalQuantity!;
  const difference = extQty - intQty;

  // Freshness check: evaluate if external snapshot is stale
  let isStale = options?.isStale ?? false;
  if (!isStale && options?.externalObservedAt) {
    const observedTime = new Date(options.externalObservedAt).getTime();
    if (!isNaN(observedTime) && Date.now() - observedTime > policy.staleThresholdMs) {
      isStale = true;
    }
  }

  if (isStale && difference !== 0) {
    return {
      classification: "STALE_EXTERNAL",
      difference,
      recommendedAction: "External snapshot is older than freshness threshold. Refresh external snapshot before reconciling.",
    };
  }

  if (difference === 0) {
    return {
      classification: "MATCH",
      difference: 0,
      recommendedAction: "None. Quantities are perfectly aligned.",
    };
  }

  const absDiff = Math.abs(difference);
  if (absDiff <= policy.minorDifferenceThreshold) {
    return {
      classification: "MINOR_DIFFERENCE",
      difference,
      recommendedAction:
        absDiff <= policy.autoReconcileMaxDelta && policy.allowAutoReconcileMinor
          ? "Safe for automated reconciliation sync."
          : "Review minor discrepancy and trigger manual sync or recount.",
    };
  }

  return {
    classification: "MATERIAL_DIFFERENCE",
    difference,
    recommendedAction:
      "Material discrepancy detected. Requires manual review, warehouse recount, or channel sync inspection.",
  };
}

/**
 * Deterministically evaluates the most likely cause of a discrepancy based on evidence.
 * Section 30 of 01_ENGINEERING_SPEC.md: The engine must not automatically assume the external channel is wrong.
 */
export function evaluateDiscrepancyCause(
  classification: ReconciliationClassification,
  difference: number,
  evidence: DiscrepancyEvidence = {}
): DiscrepancyCauseEvaluation {
  if (classification === "MATCH") {
    return {
      cause: "NONE",
      explanation: "Internal and external quantities match perfectly.",
      confidence: 1.0,
    };
  }

  if (classification === "MISSING_INTERNAL" || evidence.unmappedSku) {
    return {
      cause: "MAPPING_ERROR",
      explanation: "SKU reported by channel is unmapped or missing in internal catalog.",
      confidence: 0.95,
    };
  }

  if (classification === "MISSING_EXTERNAL") {
    return {
      cause: "MAPPING_ERROR",
      explanation: "SKU exists in internal catalog but was not found on external channel.",
      confidence: 0.9,
    };
  }

  if (classification === "STALE_EXTERNAL" || evidence.isStaleSnapshot) {
    return {
      cause: "STALE_CACHE",
      explanation: "External channel data snapshot is stale or outdated beyond freshness threshold.",
      confidence: 0.9,
    };
  }

  if (evidence.hasFailedSync) {
    return {
      cause: "SYNCHRONIZATION_FAILURE",
      explanation: "Discrepancy corresponds to a recent synchronization job failure or conflict.",
      confidence: 0.9,
    };
  }

  if (evidence.hasRecentPendingSync) {
    return {
      cause: "DELAYED_UPDATE",
      explanation: "An outbound sync was recently transmitted or acknowledged and is still propagating externally.",
      confidence: 0.85,
    };
  }

  if (evidence.recentOrderCount && evidence.recentOrderCount > 0) {
    return {
      cause: "EXTERNAL_ORDER",
      explanation: `Recent external order(s) for ${evidence.recentOrderCount} unit(s) pending internal balance reduction.`,
      confidence: 0.85,
    };
  }

  if (evidence.recentCancellationCount && evidence.recentCancellationCount > 0) {
    return {
      cause: "CANCELLATION",
      explanation: `Recent order cancellation(s) for ${evidence.recentCancellationCount} unit(s) restoring inventory.`,
      confidence: 0.85,
    };
  }

  if (evidence.recentReturnCount && evidence.recentReturnCount > 0) {
    return {
      cause: "RETURN",
      explanation: `Recent return receipt(s) for ${evidence.recentReturnCount} unit(s) logged in inventory.`,
      confidence: 0.85,
    };
  }

  if (evidence.warehouseRecountLogged) {
    return {
      cause: "WAREHOUSE_ADJUSTMENT",
      explanation: "Recent warehouse cycle count or physical recount adjusted internal balance.",
      confidence: 0.85,
    };
  }

  if (evidence.manualAdjustmentLogged) {
    return {
      cause: "MANUAL_MARKETPLACE_ADJUSTMENT",
      explanation: "Manual inventory adjustment performed directly on channel or marketplace.",
      confidence: 0.8,
    };
  }

  if (evidence.channelSpecificRulesApplied) {
    return {
      cause: "CHANNEL_SPECIFIC_LOGIC",
      explanation: "Channel-specific fulfillment or buffer reservation logic applied by marketplace.",
      confidence: 0.8,
    };
  }

  return {
    cause: "UNKNOWN_CAUSE",
    explanation: "Discrepancy detected with no deterministic preceding event; manual investigation required.",
    confidence: 0.5,
  };
}

/**
 * Determines whether a discrepancy can safely be automatically corrected.
 * Conforms to Section 31 of 01_ENGINEERING_SPEC.md & Prompt 19:
 * 
 * Automatic correction requires:
 * 1. known mapping
 * 2. known source of truth
 * 3. no unresolved competing event
 * 4. permitted quantity delta
 * 5. no manual lock
 * 6. no high-risk state
 * Otherwise: REQUIRES_APPROVAL
 */
export function evaluateSafeCorrection(
  params: SafeCorrectionParams
): SafeCorrectionEvaluation {
  const policy: ReconciliationPolicy = {
    ...DEFAULT_RECONCILIATION_POLICY,
    ...params.policy,
  };
  const evidence = params.evidence || {};
  const sourceOfTruth: SourceOfTruth = params.sourceOfTruth || policy.defaultSourceOfTruth || "INTERNAL_LEDGER";

  if (params.classification === "MATCH") {
    return {
      isAutoReconcilable: true,
      correctionDirection: "NO_ACTION",
      requiresApproval: false,
      sourceOfTruth,
      targetQuantity: params.internalQuantity,
      reason: "Quantities match perfectly. No correction needed.",
    };
  }

  const knownMapping =
    params.classification !== "MISSING_INTERNAL" &&
    params.classification !== "MISSING_EXTERNAL" &&
    !evidence.unmappedSku;

  const knownSourceOfTruth = sourceOfTruth !== "UNKNOWN";

  const noUnresolvedCompetingEvents =
    !evidence.competingUnresolvedEvents &&
    !evidence.hasRecentPendingSync &&
    !evidence.hasFailedSync;

  const permittedQuantityDelta =
    policy.allowAutoReconcileMinor &&
    Math.abs(params.difference) <= policy.autoReconcileMaxDelta;

  const noManualLock = !evidence.activeLocksOrHighRisk;

  const noHighRiskState =
    params.classification !== "MATERIAL_DIFFERENCE" &&
    params.classification !== "STALE_EXTERNAL" &&
    params.classification !== "UNKNOWN";

  const isEligibleForAuto =
    knownMapping &&
    knownSourceOfTruth &&
    noUnresolvedCompetingEvents &&
    permittedQuantityDelta &&
    noManualLock &&
    noHighRiskState;

  if (isEligibleForAuto) {
    if (sourceOfTruth === "INTERNAL_LEDGER") {
      return {
        isAutoReconcilable: true,
        correctionDirection: "PUSH_TO_CHANNEL",
        requiresApproval: false,
        sourceOfTruth,
        targetQuantity: params.internalQuantity,
        reason: "Safe auto-reconciliation: updating channel to match internal ledger source of truth.",
      };
    } else {
      return {
        isAutoReconcilable: true,
        correctionDirection: "ADJUST_INTERNAL_LEDGER",
        requiresApproval: false,
        sourceOfTruth,
        targetQuantity: params.externalQuantity,
        reason: "Safe auto-reconciliation: updating internal ledger to match channel authority.",
      };
    }
  }

  // Not eligible for auto-reconciliation -> REQUIRES_APPROVAL
  const failureReasons: string[] = [];
  if (!knownMapping) failureReasons.push("unmapped SKU");
  if (!knownSourceOfTruth) failureReasons.push("unknown source of truth");
  if (!noUnresolvedCompetingEvents) failureReasons.push("unresolved competing events or sync in flight");
  if (!permittedQuantityDelta) failureReasons.push(`quantity delta (${Math.abs(params.difference)}) exceeds auto-reconcile limit (${policy.autoReconcileMaxDelta})`);
  if (!noManualLock) failureReasons.push("manual lock or freeze active");
  if (!noHighRiskState) failureReasons.push(`high-risk classification (${params.classification})`);

  return {
    isAutoReconcilable: false,
    correctionDirection: "REQUIRES_APPROVAL",
    requiresApproval: true,
    sourceOfTruth,
    targetQuantity: sourceOfTruth === "EXTERNAL_CHANNEL" ? params.externalQuantity : params.internalQuantity,
    reason: `Requires operator approval: ${failureReasons.join(", ")}.`,
  };
}

/**
 * Backward-compatible helper for auto-reconcilability.
 */
export function isAutoReconcilable(
  classification: ReconciliationClassification,
  difference: number,
  policy: ReconciliationPolicy = DEFAULT_RECONCILIATION_POLICY
): boolean {
  if (classification === "MATCH") return true;

  if (classification === "MINOR_DIFFERENCE") {
    return (
      policy.allowAutoReconcileMinor &&
      Math.abs(difference) <= policy.autoReconcileMaxDelta
    );
  }

  // MATERIAL_DIFFERENCE, MISSING_EXTERNAL, MISSING_INTERNAL, STALE_EXTERNAL, UNKNOWN must NEVER be auto-reconciled
  return false;
}

/**
 * Creates a domain ReconciliationResult record with evidence and safe correction analysis.
 */
export function createReconciliationResult(
  params: CreateReconciliationResultParams
): ReconciliationResult {
  const policy: ReconciliationPolicy = {
    ...DEFAULT_RECONCILIATION_POLICY,
    ...params.policy,
  };

  const { classification, difference, recommendedAction } = classifyDiscrepancy(
    params.internalQuantity,
    params.externalQuantity,
    policy,
    {
      externalObservedAt: params.externalObservedAt || params.evidence?.externalObservedAt,
      isStale: params.isStale || params.evidence?.isStaleSnapshot,
    }
  );

  const causeEval = evaluateDiscrepancyCause(classification, difference, params.evidence);

  const safeCorrection = evaluateSafeCorrection({
    classification,
    difference,
    internalQuantity: params.internalQuantity ?? 0,
    externalQuantity: params.externalQuantity ?? 0,
    policy,
    evidence: params.evidence,
    sourceOfTruth: params.sourceOfTruth,
  });

  const status: ReconciliationResultStatus =
    classification === "MATCH"
      ? "AUTO_RESOLVED"
      : "PENDING";

  const id: ReconciliationResultId =
    params.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    reconciliationRunId: params.reconciliationRunId,
    skuId: params.skuId,
    internalQuantity: params.internalQuantity ?? 0,
    externalQuantity: params.externalQuantity ?? 0,
    difference,
    classification,
    discrepancyCause: causeEval.cause,
    sourceOfTruth: safeCorrection.sourceOfTruth,
    correctionDirection: safeCorrection.correctionDirection,
    recommendedAction: `${recommendedAction} [Cause: ${causeEval.cause} - ${causeEval.explanation}] [Correction: ${safeCorrection.correctionDirection}]`,
    status,
    createdAt: new Date(),
    resolvedAt: classification === "MATCH" ? new Date() : undefined,
    evidence: params.evidence ? { ...params.evidence } : undefined,
  };
}

/**
 * Reconciles a result, transitioning its status.
 */
export function resolveReconciliationResult(
  result: ReconciliationResult,
  resolutionType: "AUTO" | "MANUAL" | "IGNORE",
  resolvedBy?: UserId
): ReconciliationResult {
  if (result.status === "AUTO_RESOLVED" || result.status === "MANUALLY_RESOLVED" || result.status === "IGNORED") {
    throw new ReconciliationInvariantError(
      `Reconciliation result '${result.id}' is already resolved with status '${result.status}'.`
    );
  }

  const nextStatus: ReconciliationResultStatus =
    resolutionType === "AUTO"
      ? "AUTO_RESOLVED"
      : resolutionType === "MANUAL"
      ? "MANUALLY_RESOLVED"
      : "IGNORED";

  return {
    ...result,
    status: nextStatus,
    resolvedAt: new Date(),
    resolvedBy: resolvedBy || result.resolvedBy,
  };
}
