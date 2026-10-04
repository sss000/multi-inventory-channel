/**
 * Multichannel Reconciliation Engine
 * Canonical Specification: Sections 29, 30, 31, 53 of 01_ENGINEERING_SPEC.md & Prompt 19
 *
 * Rules:
 * 1. Compare internal and external inventory counts.
 * 2. Classify: MATCH, MINOR_DIFFERENCE, MATERIAL_DIFFERENCE, MISSING_EXTERNAL, MISSING_INTERNAL, STALE_EXTERNAL, UNKNOWN.
 * 3. Never automatically assume the external channel is wrong.
 * 4. Deterministically evaluate causes: delayed update, external order, cancellation, return,
 *    manual marketplace adjustment, warehouse adjustment, mapping error, stale cache,
 *    synchronization failure, channel-specific inventory logic.
 * 5. CRITICAL MUTATION RULE: A detected external discrepancy must NOT by itself mutate the internal inventory ledger.
 * 6. Safe flow: Detect discrepancy -> Classify -> Gather evidence -> Determine source of truth ->
 *    Determine safe correction direction -> Approval if required -> Transactional mutation -> Synchronize channel -> Verify -> Audit.
 * 7. Safe auto-reconciliation criteria: known mapping, known source of truth, no unresolved competing event,
 *    permitted quantity delta, no manual lock, no high-risk state. Otherwise REQUIRES_APPROVAL.
 */

import {
  ReconciliationPolicy,
  DEFAULT_RECONCILIATION_POLICY,
  DiscrepancyEvidence,
  classifyDiscrepancy,
  evaluateDiscrepancyCause,
  evaluateSafeCorrection,
  ReconciliationInvariantError,
  TenantAccessDeniedError,
} from "@platform/domain";
import {
  ReconciliationDatabaseService,
  ReconciliationRunRow,
  ReconciliationResultRow,
  InventoryLedgerService,
} from "@platform/database";
import { ChannelAdapter } from "../adapter.js";
import {
  RunReconciliationParams,
  ReconciliationRunSummary,
  ApproveResultParams,
  RejectResultParams,
  ReconciliationAuditEvent,
} from "./types.js";

export class ReconciliationEngine {
  private auditEvents: ReconciliationAuditEvent[] = [];

  constructor(
    private readonly dbService: ReconciliationDatabaseService,
    private readonly ledgerService: InventoryLedgerService,
    private readonly adapterResolver?: (channelAccountId: string) => Promise<ChannelAdapter | null>,
    private readonly auditLogger?: (event: ReconciliationAuditEvent) => Promise<void>
  ) {}

  getDbService(): ReconciliationDatabaseService {
    return this.dbService;
  }

  getLedgerService(): InventoryLedgerService {
    return this.ledgerService;
  }

  getAuditEvents(): readonly ReconciliationAuditEvent[] {
    return this.auditEvents;
  }

  private async recordAudit(
    eventData: Omit<ReconciliationAuditEvent, "id" | "timestamp">
  ): Promise<ReconciliationAuditEvent> {
    const event: ReconciliationAuditEvent = {
      id: `rec_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...eventData,
    };
    this.auditEvents.push(event);
    if (this.auditLogger) {
      try {
        await this.auditLogger(event);
      } catch (err) {
        console.error("Failed to write reconciliation audit log:", err);
      }
    }
    return event;
  }

  /**
   * Executes a full reconciliation run comparing internal and external quantities.
   * STRICT MUTATION INVARIANT:
   * Discrepancy detection never directly mutates the internal ledger.
   * Auto-reconciliation only executes if strict criteria are met.
   */
  async runReconciliation(params: RunReconciliationParams): Promise<ReconciliationRunSummary> {
    const {
      organizationId,
      channelAccountId,
      warehouseId,
      actorId,
      actorType = "SYSTEM",
      correlationId = `rec_run_${Date.now()}`,
    } = params;

    const policy: ReconciliationPolicy = {
      ...DEFAULT_RECONCILIATION_POLICY,
      ...params.policy,
    };

    // 1. Resolve Channel Adapter
    const adapter =
      params.adapter ||
      (this.adapterResolver ? await this.adapterResolver(channelAccountId) : null);

    if (!adapter) {
      throw new Error(`Channel adapter not found for channel account '${channelAccountId}'.`);
    }

    // 2. Start the Reconciliation Run in DB
    const run = await this.dbService.startRun({
      organizationId,
      channelAccountId,
      warehouseId: warehouseId ?? null,
    });

    await this.recordAudit({
      organizationId,
      action: "RUN_STARTED",
      entityType: "reconciliation_run",
      entityId: run.id,
      actorId,
      actorType,
      details: { channelAccountId, warehouseId, policy },
    });

    try {
      // 3. Prepare SKU Mappings
      const mappings = params.skuMappings || [];
      const mappedSkuIds = new Set(mappings.map((m) => m.skuId));
      const mappedExtIds = new Set(mappings.map((m) => m.externalSkuId));

      // 4. Fetch External Channel Inventory Snapshots
      const externalSkuIdsToFetch = mappings.map((m) => m.externalSkuId);
      let externalSnapshots: {
        externalSkuId: string;
        quantity: number;
        observedAt: Date;
      }[] = [];

      if (externalSkuIdsToFetch.length > 0 && typeof adapter.fetchInventoryLevels === "function") {
        try {
          externalSnapshots = await adapter.fetchInventoryLevels(externalSkuIdsToFetch);
        } catch (err) {
          console.warn("Error fetching inventory levels from adapter:", err);
        }
      }

      const externalSnapshotMap = new Map<string, { quantity: number; observedAt: Date }>();
      for (const snap of externalSnapshots) {
        externalSnapshotMap.set(snap.externalSkuId, {
          quantity: snap.quantity,
          observedAt: snap.observedAt,
        });
      }

      // 5. Gather evidence map
      const evidenceMap = params.evidenceMap;
      const getEvidenceForSku = (skuId: string): DiscrepancyEvidence => {
        if (!evidenceMap) return {};
        if (evidenceMap instanceof Map) return evidenceMap.get(skuId) || {};
        return evidenceMap[skuId] || {};
      };

      const results: ReconciliationResultRow[] = [];
      let autoResolvedCount = 0;
      let pendingApprovalCount = 0;

      // 6. Compare mapped SKUs
      for (const mapping of mappings) {
        const { skuId, externalSkuId } = mapping;
        const itemWarehouseId = mapping.warehouseId || warehouseId || "default";

        // Query internal ledger balance
        const balance = await this.ledgerService.getBalance(
          organizationId,
          skuId,
          itemWarehouseId
        );
        const internalQuantity = balance ? balance.on_hand : null;

        // Query external snapshot
        const snap = externalSnapshotMap.get(externalSkuId);
        const externalQuantity = snap !== undefined ? snap.quantity : null;

        const evidence = getEvidenceForSku(skuId);

        // Discrepancy classification
        const { classification, difference, recommendedAction } = classifyDiscrepancy(
          internalQuantity,
          externalQuantity,
          policy,
          {
            externalObservedAt: snap?.observedAt || evidence.externalObservedAt,
            isStale: evidence.isStaleSnapshot,
          }
        );

        // Deterministic cause evaluation
        const causeEval = evaluateDiscrepancyCause(classification, difference, evidence);

        // Safe auto-correction evaluation
        const safeCorrection = evaluateSafeCorrection({
          classification,
          difference,
          internalQuantity: internalQuantity ?? 0,
          externalQuantity: externalQuantity ?? 0,
          policy,
          evidence,
          sourceOfTruth: params.sourceOfTruth,
        });

        const resultId = `rec_res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();

        let status: ReconciliationResultRow["status"] = "PENDING";
        let resolvedAt: string | null = null;

        // CRITICAL MUTATION RULE:
        // Comparison/detection NEVER directly mutates the internal ledger.
        // Mutation only occurs after safe criteria are verified or manual approval is given.
        if (classification === "MATCH") {
          status = "AUTO_RESOLVED";
          resolvedAt = now;
          autoResolvedCount++;
        } else if (safeCorrection.isAutoReconcilable && policy.allowAutoReconcileMinor) {
          // Perform safe auto-reconciliation
          if (safeCorrection.correctionDirection === "ADJUST_INTERNAL_LEDGER") {
            const quantityDelta = difference;
            if (quantityDelta !== 0) {
              await this.ledgerService.recordReconciliationCorrection({
                organizationId,
                skuId,
                warehouseId: itemWarehouseId,
                quantityDelta,
                reason: `Reconciliation auto-correction: ${causeEval.cause} - ${causeEval.explanation}`,
                channelAccountId,
                actorId,
                actorType,
                correlationId,
              });
            }
          } else if (safeCorrection.correctionDirection === "PUSH_TO_CHANNEL") {
            if (typeof adapter.pushInventoryLevel === "function") {
              await adapter.pushInventoryLevel(externalSkuId, safeCorrection.targetQuantity);
            }
            if (typeof adapter.verifyInventoryLevel === "function") {
              await adapter.verifyInventoryLevel(externalSkuId, safeCorrection.targetQuantity);
            }
          }

          status = "AUTO_RESOLVED";
          resolvedAt = now;
          autoResolvedCount++;

          await this.recordAudit({
            organizationId,
            action: "AUTO_RESOLVED",
            entityType: "reconciliation_result",
            entityId: resultId,
            actorId,
            actorType,
            details: {
              skuId,
              externalSkuId,
              classification,
              difference,
              correctionDirection: safeCorrection.correctionDirection,
              cause: causeEval.cause,
            },
          });
        } else {
          // Requires manual review & approval
          status = "PENDING";
          pendingApprovalCount++;
        }

        const resultRow: ReconciliationResultRow = {
          id: resultId,
          reconciliation_run_id: run.id,
          sku_id: skuId,
          internal_quantity: internalQuantity ?? 0,
          external_quantity: externalQuantity ?? 0,
          difference,
          classification,
          discrepancy_cause: causeEval.cause,
          source_of_truth: safeCorrection.sourceOfTruth,
          correction_direction: safeCorrection.correctionDirection,
          recommended_action: `${recommendedAction} [Cause: ${causeEval.cause}] [Action: ${safeCorrection.correctionDirection}]`,
          status,
          created_at: now,
          resolved_at: resolvedAt,
          evidence: { ...evidence },
        };

        results.push(resultRow);
      }

      // 7. Check for unmapped external items reported by channel (MISSING_INTERNAL)
      for (const [extSkuId, snap] of externalSnapshotMap.entries()) {
        if (!mappedExtIds.has(extSkuId)) {
          const evidence = getEvidenceForSku(extSkuId);
          evidence.unmappedSku = true;

          const { classification, difference, recommendedAction } = classifyDiscrepancy(
            null,
            snap.quantity,
            policy,
            { externalObservedAt: snap.observedAt }
          );

          const causeEval = evaluateDiscrepancyCause(classification, difference, evidence);
          const safeCorrection = evaluateSafeCorrection({
            classification,
            difference,
            internalQuantity: 0,
            externalQuantity: snap.quantity,
            policy,
            evidence,
            sourceOfTruth: params.sourceOfTruth,
          });

          const resultId = `rec_res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const now = new Date().toISOString();
          pendingApprovalCount++;

          const resultRow: ReconciliationResultRow = {
            id: resultId,
            reconciliation_run_id: run.id,
            sku_id: `unmapped_${extSkuId}`,
            internal_quantity: 0,
            external_quantity: snap.quantity,
            difference,
            classification: "MISSING_INTERNAL",
            discrepancy_cause: causeEval.cause,
            source_of_truth: safeCorrection.sourceOfTruth,
            correction_direction: "REQUIRES_APPROVAL",
            recommended_action: `${recommendedAction} [Cause: ${causeEval.cause}]`,
            status: "PENDING",
            created_at: now,
            resolved_at: null,
            evidence: { ...evidence },
          };

          results.push(resultRow);
        }
      }

      // 8. Persist all reconciliation results
      await this.dbService.saveResults(organizationId, run.id, results);

      // 9. Complete the reconciliation run
      const totalEvaluated = results.length;
      const matchedCount = results.filter((r) => r.classification === "MATCH").length;
      const discrepancyCount = totalEvaluated - matchedCount;

      const completedRun = await this.dbService.completeRun({
        organizationId,
        runId: run.id,
        totalEvaluated,
        matchedCount,
        discrepancyCount,
      });

      await this.recordAudit({
        organizationId,
        action: "RUN_COMPLETED",
        entityType: "reconciliation_run",
        entityId: run.id,
        actorId,
        actorType,
        details: {
          totalEvaluated,
          matchedCount,
          discrepancyCount,
          autoResolvedCount,
          pendingApprovalCount,
        },
      });

      return {
        run: completedRun,
        results,
        totalEvaluated,
        matchedCount,
        discrepancyCount,
        autoResolvedCount,
        pendingApprovalCount,
      };
    } catch (err) {
      await this.dbService.failRun(organizationId, run.id);
      throw err;
    }
  }

  /**
   * Approves a reconciliation result that required manual review.
   * Performs the approved transactional ledger mutation or outbound channel push.
   */
  async approveResult(params: ApproveResultParams): Promise<ReconciliationResultRow> {
    const {
      organizationId,
      resultId,
      actorId,
      actorType = "USER",
      correlationId = `approve_${Date.now()}`,
    } = params;

    // 1. Fetch result and verify tenant isolation
    const fetched = await this.dbService.getResult(organizationId, resultId);
    if (!fetched) {
      throw new Error(`Reconciliation result '${resultId}' not found.`);
    }

    const { result, run } = fetched;
    if (result.status !== "PENDING") {
      throw new ReconciliationInvariantError(
        `Reconciliation result '${resultId}' is already resolved with status '${result.status}'.`
      );
    }

    const direction =
      params.correctionDirection || result.correction_direction || "PUSH_TO_CHANNEL";
    const warehouseId = params.warehouseId || run.warehouse_id || "default";

    // 2. Execute transactional mutation based on direction
    if (direction === "ADJUST_INTERNAL_LEDGER") {
      const quantityDelta =
        params.targetQuantity !== undefined
          ? params.targetQuantity - result.internal_quantity
          : result.difference;

      if (quantityDelta !== 0) {
        await this.ledgerService.recordReconciliationCorrection({
          organizationId,
          skuId: result.sku_id,
          warehouseId,
          quantityDelta,
          reason: params.reason || "Manual reconciliation approval",
          channelAccountId: run.channel_account_id,
          actorId,
          actorType,
          correlationId,
        });
      }
    } else if (direction === "PUSH_TO_CHANNEL") {
      const adapter =
        params.adapter ||
        (this.adapterResolver ? await this.adapterResolver(run.channel_account_id) : null);

      const targetQuantity =
        params.targetQuantity !== undefined
          ? params.targetQuantity
          : result.internal_quantity;

      if (adapter && typeof adapter.pushInventoryLevel === "function") {
        await adapter.pushInventoryLevel(result.sku_id, targetQuantity);
        if (typeof adapter.verifyInventoryLevel === "function") {
          await adapter.verifyInventoryLevel(result.sku_id, targetQuantity);
        }
      }
    }

    // 3. Update status in database
    const updated = await this.dbService.updateResultStatus(
      organizationId,
      resultId,
      "MANUALLY_RESOLVED",
      actorId
    );

    await this.recordAudit({
      organizationId,
      action: "MANUALLY_APPROVED",
      entityType: "reconciliation_result",
      entityId: resultId,
      actorId,
      actorType,
      details: {
        direction,
        skuId: result.sku_id,
        reason: params.reason,
        targetQuantity: params.targetQuantity,
      },
    });

    return updated;
  }

  /**
   * Rejects / ignores a reconciliation discrepancy.
   */
  async rejectResult(params: RejectResultParams): Promise<ReconciliationResultRow> {
    const {
      organizationId,
      resultId,
      actorId,
      actorType = "USER",
    } = params;

    const fetched = await this.dbService.getResult(organizationId, resultId);
    if (!fetched) {
      throw new Error(`Reconciliation result '${resultId}' not found.`);
    }

    const { result } = fetched;
    if (result.status !== "PENDING") {
      throw new ReconciliationInvariantError(
        `Reconciliation result '${resultId}' is already resolved with status '${result.status}'.`
      );
    }

    const updated = await this.dbService.updateResultStatus(
      organizationId,
      resultId,
      "IGNORED",
      actorId
    );

    await this.recordAudit({
      organizationId,
      action: "MANUALLY_REJECTED",
      entityType: "reconciliation_result",
      entityId: resultId,
      actorId,
      actorType,
      details: { reason: params.reason },
    });

    return updated;
  }
}
