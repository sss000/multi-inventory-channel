/**
 * Shopify Outbound Synchronization and Read-Back Verification Pipeline
 * Canonical Specifications: Sections 24, 25, 36, 121, 122, 140 of 01_ENGINEERING_SPEC.md & Prompt 15
 * 
 * Rules:
 * 1. Outbound Inventory Update Flow:
 *    internal quantity -> queued -> provider update -> acknowledgement -> read-back verification -> VERIFIED or CONFLICT
 * 2. If Shopify reports a different quantity after the update:
 *    CONFLICT must be produced. Do NOT produce a green success state.
 * 3. Freshness timestamps:
 *    observed_at, received_at, verified_at
 * 4. Explicitly distinguish:
 *    - request submitted
 *    - request acknowledged
 *    - verification pending
 *    - verified
 *    - conflict
 *    - failed
 * 5. Handles stale data detection and verification mismatch scenarios.
 */

import { randomUUID } from "node:crypto";
import {
  VerificationStage,
  VerificationStageInfo,
  TrustState,
  FreshnessMetadata,
  getVerificationStageInfo,
  evaluateFreshness,
  formatFreshnessDisplay,
  ExternalInventory,
} from "@platform/contracts";
import { SyncStatus } from "@platform/database";
import { SyncEngine } from "../../sync/engine.js";
import { ClassifiedSyncError } from "../../sync/error-classifier.js";
import { VerificationResult } from "../../adapter.js";
import { ShopifyAdapter } from "./shopify-adapter.js";

export interface ShopifySyncAndVerifyParams {
  organizationId: string;
  channelAccountId: string;
  skuId: string;
  externalSkuId: string;
  targetQuantity: number;
  locationId?: string;
  warehouseId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
  maxStalenessMs?: number;
  onStageChange?: (stage: VerificationStage, stageInfo: VerificationStageInfo) => void;
}

export interface ShopifyVerificationResult {
  jobId: string;
  organizationId: string;
  skuId: string;
  externalSkuId: string;
  targetQuantity: number;
  verifiedQuantity?: number;
  finalState: SyncStatus;
  stage: VerificationStage;
  stageInfo: VerificationStageInfo;
  isSuccess: boolean;
  isConflict: boolean;
  isStale: boolean;
  freshness: FreshnessMetadata;
  observedAt?: Date;
  receivedAt?: Date;
  verifiedAt?: Date;
  error?: ClassifiedSyncError;
  durationMs: number;
}

export class ShopifyVerificationPipeline {
  constructor(
    private readonly syncEngine: SyncEngine,
    private readonly adapter: ShopifyAdapter
  ) {}

  /**
   * Executes the full outbound inventory synchronization and read-back verification pipeline.
   * Progression:
   * internal quantity -> queued -> provider update -> acknowledgement -> read-back verification -> VERIFIED or CONFLICT
   */
  async syncAndVerify(params: ShopifySyncAndVerifyParams): Promise<ShopifyVerificationResult> {
    const startTime = Date.now();
    const correlationId = params.correlationId || randomUUID();
    const maxStalenessMs = params.maxStalenessMs ?? 5 * 60 * 1000;

    // 1. Queued Stage: Enqueue sync job in generic synchronization framework
    const enqueueResult = await this.syncEngine.enqueue({
      organizationId: params.organizationId,
      channelAccountId: params.channelAccountId,
      skuId: params.skuId,
      warehouseId: params.warehouseId,
      operation: "UPDATE_INVENTORY",
      targetQuantity: params.targetQuantity,
      correlationId,
      idempotencyKey: params.idempotencyKey,
    });

    const jobId = enqueueResult.job.id;

    // 2. Execute through generic sync engine (Handles: PROCESSING -> SENT -> ACKNOWLEDGED -> VERIFYING -> VERIFIED / CONFLICT)
    const outcome = await this.syncEngine.execute({
      organizationId: params.organizationId,
      jobId,
      adapter: this.adapter,
      externalSkuId: params.externalSkuId,
      maxAttempts: params.maxAttempts,
      onStageChange: params.onStageChange,
    });

    // 3. Process Freshness Timestamps
    const now = new Date();
    const observedAt = outcome.observedAt || now;
    const receivedAt = outcome.receivedAt || now;
    const verifiedAt = outcome.finalState === "VERIFIED" ? (outcome.verifiedAt || now) : null;

    const freshness = evaluateFreshness(observedAt, {
      receivedAt,
      verifiedAt,
      thresholdMs: maxStalenessMs,
      now,
    });

    const isConflict = outcome.finalState === "CONFLICT" || outcome.stage === "CONFLICT";

    return {
      jobId,
      organizationId: params.organizationId,
      skuId: params.skuId,
      externalSkuId: params.externalSkuId,
      targetQuantity: params.targetQuantity,
      verifiedQuantity: outcome.verifiedQuantity,
      finalState: outcome.finalState,
      stage: outcome.stage,
      stageInfo: outcome.stageInfo,
      // CRITICAL GATE: If conflict, isSuccess MUST be false! Never produce a green success state!
      isSuccess: outcome.isSuccess && !isConflict,
      isConflict,
      isStale: freshness.isStale,
      freshness,
      observedAt,
      receivedAt,
      verifiedAt: outcome.verifiedAt,
      error: outcome.error,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Direct read-back verification against Shopify GraphQL for an inventory level.
   */
  async verifyCurrentInventory(
    externalSkuId: string,
    expectedQuantity: number,
    locationId?: string
  ): Promise<VerificationResult> {
    const callStart = new Date();
    try {
      const inv = await this.adapter.getInventory({
        sku: externalSkuId,
        locationId,
      });

      const receivedAt = new Date();
      const observedAt = inv.observedAt || inv.updatedAt || callStart;
      const isVerified = inv.quantity === expectedQuantity;
      const verifiedAt = new Date();

      return {
        externalSkuId,
        isVerified,
        expectedQuantity,
        actualQuantity: inv.quantity,
        observedAt,
        receivedAt,
        verifiedAt,
        status: isVerified ? "VERIFIED" : "MISMATCH",
      };
    } catch (err: unknown) {
      const normalized = this.adapter.normalizer.normalize(err);
      const now = new Date();
      return {
        externalSkuId,
        isVerified: false,
        expectedQuantity,
        observedAt: now,
        receivedAt: now,
        verifiedAt: now,
        status: "UNREACHABLE",
        error: normalized.message,
        errorCode: normalized.originalCode,
        httpStatus: normalized.httpStatus,
      };
    }
  }

  /**
   * Inspects external Shopify inventory and evaluates explicit freshness metadata and trust state.
   */
  async inspectFreshness(
    externalSkuId: string,
    maxStalenessMs: number = 5 * 60 * 1000,
    locationId?: string
  ): Promise<{
    inventory: ExternalInventory;
    freshness: FreshnessMetadata;
    trustState: TrustState;
  }> {
    const inv = await this.adapter.getInventory({
      sku: externalSkuId,
      locationId,
    });

    const now = new Date();
    const observedAt = inv.observedAt || inv.updatedAt || now;
    const receivedAt = inv.receivedAt || now;

    const freshness = evaluateFreshness(observedAt, {
      receivedAt,
      thresholdMs: maxStalenessMs,
      now,
    });

    let trustState: TrustState = "LIVE";
    if (freshness.isStale) {
      trustState = "STALE";
    }

    return {
      inventory: inv,
      freshness,
      trustState,
    };
  }

  /**
   * Helper to format human-readable freshness strings conforming to Section 121.
   */
  formatFreshness(
    timestamp: Date | string,
    now: Date = new Date(),
    label: "verified" | "observed" = "observed"
  ): string {
    return formatFreshnessDisplay(timestamp, now, label);
  }
}
