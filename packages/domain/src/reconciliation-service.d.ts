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
import { ReconciliationResult, ReconciliationClassification, ReconciliationResultId, ReconciliationRunId, SkuId, UserId, DiscrepancyCause, SourceOfTruth, CorrectionDirection } from "./types.js";
export interface ReconciliationPolicy {
    minorDifferenceThreshold: number;
    allowAutoReconcileMinor: boolean;
    autoReconcileMaxDelta: number;
    staleThresholdMs: number;
    requireApprovalForMaterial: boolean;
    defaultSourceOfTruth: SourceOfTruth;
}
export declare const DEFAULT_RECONCILIATION_POLICY: ReconciliationPolicy;
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
export declare function classifyDiscrepancy(internalQuantity?: number | null, externalQuantity?: number | null, policy?: ReconciliationPolicy, options?: {
    externalObservedAt?: Date | string | null;
    isStale?: boolean;
}): {
    classification: ReconciliationClassification;
    difference: number;
    recommendedAction: string;
};
/**
 * Deterministically evaluates the most likely cause of a discrepancy based on evidence.
 * Section 30 of 01_ENGINEERING_SPEC.md: The engine must not automatically assume the external channel is wrong.
 */
export declare function evaluateDiscrepancyCause(classification: ReconciliationClassification, difference: number, evidence?: DiscrepancyEvidence): DiscrepancyCauseEvaluation;
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
export declare function evaluateSafeCorrection(params: SafeCorrectionParams): SafeCorrectionEvaluation;
/**
 * Backward-compatible helper for auto-reconcilability.
 */
export declare function isAutoReconcilable(classification: ReconciliationClassification, difference: number, policy?: ReconciliationPolicy): boolean;
/**
 * Creates a domain ReconciliationResult record with evidence and safe correction analysis.
 */
export declare function createReconciliationResult(params: CreateReconciliationResultParams): ReconciliationResult;
/**
 * Reconciles a result, transitioning its status.
 */
export declare function resolveReconciliationResult(result: ReconciliationResult, resolutionType: "AUTO" | "MANUAL" | "IGNORE", resolvedBy?: UserId): ReconciliationResult;
//# sourceMappingURL=reconciliation-service.d.ts.map