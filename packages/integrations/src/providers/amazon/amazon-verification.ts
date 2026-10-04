/**
 * Amazon Outbound Synchronization and Read-Back Verification Pipeline
 * Canonical Specifications: Sections 23, 24, 25, 26, 35, 36, 39, 121, 122, 140 of 01_ENGINEERING_SPEC.md & Prompt 17
 * 
 * Rules:
 * 1. Outbound Inventory Update Flow:
 *    internal quantity -> queued -> provider update -> acknowledgement -> read-back verification -> VERIFIED or CONFLICT
 * 2. Never represent acknowledgement as verification.
 * 3. Section 39 Fulfillment Channel Isolation:
 *    Merchant push to FBA is prohibited and transitions to REQUIRES_ACTION / validation failure.
 * 4. Respect Amazon throttling behavior:
 *    HTTP 429 RequestThrottled / QuotaExceeded transitions to RETRYING with retryAfterMs backoff.
 * 5. If Amazon architecture prevents immediate read-back, explicitly represent the weaker verification state
 *    (VERIFICATION_PENDING) and its freshness semantics (verified_at: null).
 * 6. Use notifications where appropriate rather than relying exclusively on aggressive polling.
 * 7. If Amazon reports a conflicting quantity:
 *    CONFLICT must be produced. Do NOT produce a green success state.
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
import {
  SyncStatus,
  SyncJobRow,
  SyncJobService,
  SyncJobRepository,
} from "@platform/database";
import {
  DomainException,
  createDomainException,
} from "@platform/domain";
import { SyncEngine } from "../../sync/engine.js";
import {
  ClassifiedSyncError,
  classifySyncError,
} from "../../sync/error-classifier.js";
import { VerificationResult, NormalizedWebhookEvent } from "../../adapter.js";
import { AmazonAdapter } from "./amazon-adapter.js";
import { parseAmazonNotification } from "./amazon-notifications.js";
import { AmazonNotificationPayload } from "./amazon-types.js";


export interface AmazonSyncAndVerifyParams {
  organizationId: string;
  channelAccountId: string;
  skuId: string;
  externalSkuId: string;
  targetQuantity: number;
  fulfillmentChannel?: "SELLER" | "MFN" | "FBA";
  marketplaceId?: string;
  warehouseId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
  maxStalenessMs?: number;
  allowDelayedVerification?: boolean;
  onStageChange?: (stage: VerificationStage, stageInfo: VerificationStageInfo) => void;
}

export interface AmazonVerificationResult {
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
  isDelayedVerification: boolean;
  isStale: boolean;
  freshness: FreshnessMetadata;
  observedAt?: Date;
  receivedAt?: Date;
  verifiedAt?: Date | null;
  error?: ClassifiedSyncError;
  durationMs: number;
  submissionId?: string;
  fulfillmentChannel: "SELLER" | "MFN" | "FBA";
}

export interface AmazonNotificationVerificationResult {
  jobId: string;
  sku: string;
  isVerified: boolean;
  isConflict: boolean;
  stage: VerificationStage;
  finalState: SyncStatus;
  notifiedQuantity: number;
  targetQuantity: number;
  verifiedAt?: Date;
  observedAt?: Date;
  error?: ClassifiedSyncError;
}

export class AmazonVerificationPipeline {
  private readonly syncJobService: SyncJobService;

  constructor(
    private readonly syncEngine: SyncEngine,
    private readonly adapter: AmazonAdapter,
    syncJobService?: SyncJobService
  ) {
    this.syncJobService = syncJobService || syncEngine.getSyncJobService();
  }

  /**
   * Executes the full outbound inventory synchronization and read-back verification pipeline for Amazon.
   * Progression:
   * internal quantity -> queued -> provider update -> acknowledgement -> read-back verification -> VERIFIED or CONFLICT
   */
  async syncAndVerify(params: AmazonSyncAndVerifyParams): Promise<AmazonVerificationResult> {
    const startTime = Date.now();
    const correlationId = params.correlationId || randomUUID();
    const maxStalenessMs = params.maxStalenessMs ?? 5 * 60 * 1000;
    const maxAttempts = params.maxAttempts ?? 3;
    const fulfillmentChannel = params.fulfillmentChannel || "SELLER";

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

    // 2. Fetch current job and enforce tenant access
    let job = await this.syncJobService.getSyncJob(params.organizationId, jobId);
    if (!job) {
      throw new Error(`Sync job '${jobId}' not found for tenant '${params.organizationId}'.`);
    }

    // 3. Section 39 Fulfillment Channel Isolation Guard
    if (fulfillmentChannel === "FBA") {
      const classified: ClassifiedSyncError = {
        classification: "VALIDATION",
        isRetryable: false,
        message: "Cannot update FBA inventory directly via outbound sync (Section 39 Fulfillment Channel Isolation). FBA stock is managed exclusively via Amazon Inbound Shipments.",
        code: "FBA_DIRECT_PUSH_RESTRICTED",
        httpStatus: 400,
      };

      const updatedJob = await this.syncJobService.transition({
        organizationId: params.organizationId,
        jobId,
        nextState: "REQUIRES_ACTION",
        errorCode: classified.code,
        errorMessage: classified.message,
      });

      await this.recordSyncException(params.organizationId, updatedJob, classified);

      const stageInfo = getVerificationStageInfo("FAILED");
      params.onStageChange?.("FAILED", stageInfo);

      const now = new Date();
      return {
        jobId,
        organizationId: params.organizationId,
        skuId: params.skuId,
        externalSkuId: params.externalSkuId,
        targetQuantity: params.targetQuantity,
        finalState: "REQUIRES_ACTION",
        stage: "FAILED",
        stageInfo,
        isSuccess: false,
        isConflict: false,
        isDelayedVerification: false,
        isStale: false,
        freshness: evaluateFreshness(now, { receivedAt: now, now }),
        observedAt: now,
        receivedAt: now,
        verifiedAt: null,
        error: classified,
        durationMs: Date.now() - startTime,
        fulfillmentChannel,
      };
    }

    // 4. Transition QUEUED -> PROCESSING
    job = await this.syncJobService.transition({
      organizationId: params.organizationId,
      jobId,
      nextState: "PROCESSING",
    });

    // 5. Outbound Write Execution Phase (Listings Items PATCH)
    let updateResult;
    try {
      updateResult = await this.adapter.updateInventory({
        sku: params.externalSkuId,
        quantity: params.targetQuantity,
        fulfillmentChannel: "SELLER",
      });
    } catch (err: unknown) {
      const classified = classifySyncError(err);
      return this.handleExecutionFailure(
        params,
        job,
        classified,
        maxAttempts,
        startTime
      );
    }

    if (!updateResult.acknowledged || updateResult.status === "FAILED") {
      const classified = classifySyncError(updateResult.error || "Amazon listing update rejected", {
        httpStatus: updateResult.httpStatus,
        retryAfterMs: updateResult.retryAfterMs,
      });

      return this.handleExecutionFailure(
        params,
        job,
        classified,
        maxAttempts,
        startTime
      );
    }

    const submissionId = updateResult.transactionId;

    // 6. Outbound Succeeded: Transition PROCESSING -> SENT -> ACKNOWLEDGED
    job = await this.syncJobService.transition({
      organizationId: params.organizationId,
      jobId,
      nextState: "SENT",
    });
    params.onStageChange?.("REQUEST_SUBMITTED", getVerificationStageInfo("REQUEST_SUBMITTED"));

    job = await this.syncJobService.transition({
      organizationId: params.organizationId,
      jobId,
      nextState: "ACKNOWLEDGED",
    });
    params.onStageChange?.("REQUEST_ACKNOWLEDGED", getVerificationStageInfo("REQUEST_ACKNOWLEDGED"));

    // CRITICAL GATE: "Never represent acknowledgement as verification."
    // Amazon has accepted the write submission, but read-back verification must confirm truth.

    // 7. Explicit Verification Phase: Transition ACKNOWLEDGED -> VERIFYING
    job = await this.syncJobService.transition({
      organizationId: params.organizationId,
      jobId,
      nextState: "VERIFYING",
    });
    params.onStageChange?.("VERIFICATION_PENDING", getVerificationStageInfo("VERIFICATION_PENDING"));

    let verificationResult: VerificationResult;
    try {
      verificationResult = await this.adapter.verifyInventoryLevel(
        { sku: params.externalSkuId, fulfillmentChannel: "SELLER" },
        params.targetQuantity
      );
    } catch (err: unknown) {
      // Timeout or network failure during read-back must NEVER mark VERIFIED
      const classified = classifySyncError(err);
      return this.handleVerificationFailure(
        params,
        job,
        classified,
        maxAttempts,
        startTime,
        submissionId
      );
    }

    // Check for unreachable provider or verification error
    if (verificationResult.status === "UNREACHABLE" || verificationResult.error) {
      const classified = classifySyncError(
        verificationResult.error || "Amazon verification query failed",
        {
          httpStatus: verificationResult.httpStatus,
          errorCode: verificationResult.errorCode,
        }
      );
      return this.handleVerificationFailure(
        params,
        job,
        classified,
        maxAttempts,
        startTime,
        submissionId
      );
    }

    const now = new Date();
    const observedAt = verificationResult.observedAt || now;
    const receivedAt = verificationResult.receivedAt || now;

    // 8. Delayed Verification / Propagation Window Handling
    // If Amazon architecture prevents immediate read-back and allowDelayedVerification is enabled:
    const isQuantityMismatch =
      verificationResult.status === "MISMATCH" ||
      !verificationResult.isVerified ||
      (verificationResult.actualQuantity !== undefined &&
        verificationResult.actualQuantity !== params.targetQuantity);

    if (isQuantityMismatch && params.allowDelayedVerification) {
      // Explicitly represent the weaker verification state and freshness semantics
      const freshness = evaluateFreshness(observedAt, {
        receivedAt,
        verifiedAt: null, // Weaker verification state has null verifiedAt
        thresholdMs: maxStalenessMs,
        now,
      });

      freshness.displayStatus = `Update acknowledged by Amazon (submission ${submissionId || "pending"}); verification pending propagation.`;

      const stageInfo = getVerificationStageInfo("VERIFICATION_PENDING", {
        actualQuantity: verificationResult.actualQuantity,
        expectedQuantity: params.targetQuantity,
      });
      params.onStageChange?.("VERIFICATION_PENDING", stageInfo);

      return {
        jobId,
        organizationId: params.organizationId,
        skuId: params.skuId,
        externalSkuId: params.externalSkuId,
        targetQuantity: params.targetQuantity,
        verifiedQuantity: verificationResult.actualQuantity,
        finalState: "VERIFYING",
        stage: "VERIFICATION_PENDING",
        stageInfo,
        // CRITICAL INVARIANT: NEVER mark success while unverified
        isSuccess: false,
        isConflict: false,
        isDelayedVerification: true,
        isStale: freshness.isStale,
        freshness,
        observedAt,
        receivedAt,
        verifiedAt: null,
        durationMs: Date.now() - startTime,
        submissionId,
        fulfillmentChannel,
      };
    }

    // 9. Quantity Discrepancy Gate (CONFLICT Invariant)
    if (isQuantityMismatch) {
      const mismatchMsg = `Amazon verification detected discrepancy: expected target quantity ${params.targetQuantity}, but Amazon reported actual ${verificationResult.actualQuantity ?? "unknown"}.`;
      const classified: ClassifiedSyncError = {
        classification: "CONFLICT",
        isRetryable: false,
        message: mismatchMsg,
        code: "QUANTITY_MISMATCH_CONFLICT",
        httpStatus: 409,
      };

      job = await this.syncJobService.transition({
        organizationId: params.organizationId,
        jobId,
        nextState: "CONFLICT",
        errorCode: classified.code,
        errorMessage: classified.message,
      });

      await this.recordSyncException(params.organizationId, job, classified, {
        expectedQuantity: params.targetQuantity,
        actualQuantity: verificationResult.actualQuantity,
        submissionId,
      });

      const stageInfo = getVerificationStageInfo("CONFLICT", {
        expectedQuantity: params.targetQuantity,
        actualQuantity: verificationResult.actualQuantity,
      });
      params.onStageChange?.("CONFLICT", stageInfo);

      const freshness = evaluateFreshness(observedAt, {
        receivedAt,
        verifiedAt: null,
        thresholdMs: maxStalenessMs,
        now,
      });

      return {
        jobId,
        organizationId: params.organizationId,
        skuId: params.skuId,
        externalSkuId: params.externalSkuId,
        targetQuantity: params.targetQuantity,
        verifiedQuantity: verificationResult.actualQuantity,
        finalState: "CONFLICT",
        stage: "CONFLICT",
        stageInfo,
        // CRITICAL GATE: Never produce green success state on conflict!
        isSuccess: false,
        isConflict: true,
        isDelayedVerification: false,
        isStale: freshness.isStale,
        freshness,
        observedAt,
        receivedAt,
        verifiedAt: null,
        error: classified,
        durationMs: Date.now() - startTime,
        submissionId,
        fulfillmentChannel,
      };
    }

    // 10. Read-Back Verification Succeeded: Transition VERIFYING -> VERIFIED
    const verifiedAt = verificationResult.verifiedAt || now;
    job = await this.syncJobService.transition({
      organizationId: params.organizationId,
      jobId,
      nextState: "VERIFIED",
    });

    const stageInfo = getVerificationStageInfo("VERIFIED", {
      actualQuantity: verificationResult.actualQuantity ?? params.targetQuantity,
    });
    params.onStageChange?.("VERIFIED", stageInfo);

    const freshness = evaluateFreshness(observedAt, {
      receivedAt,
      verifiedAt,
      thresholdMs: maxStalenessMs,
      now,
    });

    return {
      jobId,
      organizationId: params.organizationId,
      skuId: params.skuId,
      externalSkuId: params.externalSkuId,
      targetQuantity: params.targetQuantity,
      verifiedQuantity: verificationResult.actualQuantity ?? params.targetQuantity,
      finalState: "VERIFIED",
      stage: "VERIFIED",
      stageInfo,
      isSuccess: true,
      isConflict: false,
      isDelayedVerification: false,
      isStale: freshness.isStale,
      freshness,
      observedAt,
      receivedAt,
      verifiedAt,
      durationMs: Date.now() - startTime,
      submissionId,
      fulfillmentChannel,
    };
  }

  /**
   * Completes verification via asynchronous Amazon SQS / EventBridge notifications without aggressive polling.
   * Conforms to: "Use notifications where appropriate rather than relying exclusively on aggressive polling."
   */
  async verifyViaNotification(params: {
    organizationId: string;
    jobId: string;
    notification: AmazonNotificationPayload | NormalizedWebhookEvent;
    targetQuantity: number;
  }): Promise<AmazonNotificationVerificationResult> {
    const job = await this.syncJobService.getSyncJob(params.organizationId, params.jobId);
    if (!job) {
      throw new Error(`Sync job '${params.jobId}' not found for tenant '${params.organizationId}'.`);
    }

    // Parse notification if raw payload provided
    let event: NormalizedWebhookEvent;
    if ("NotificationType" in params.notification || "notificationType" in params.notification) {
      event = parseAmazonNotification(params.notification as AmazonNotificationPayload);
    } else {
      event = params.notification as NormalizedWebhookEvent;
    }

    const payload = event.payload || {};
    const notifiedSku = String(payload.sellerSku || payload.sku || job.sku_id);
    const rawQty = payload.quantity ?? payload.fulfillableQuantity;
    const notifiedQuantity = typeof rawQty === "number" ? rawQty : Number(rawQty ?? 0);
    const now = new Date();
    const observedAt = event.receivedAt || now;

    // If current state is ACKNOWLEDGED, move to VERIFYING first to preserve valid state transitions
    if (job.status === "ACKNOWLEDGED") {
      await this.syncJobService.transition({
        organizationId: params.organizationId,
        jobId: params.jobId,
        nextState: "VERIFYING",
      });
    }

    if (notifiedQuantity === params.targetQuantity) {
      // Notification verified target inventory
      await this.syncJobService.transition({
        organizationId: params.organizationId,
        jobId: params.jobId,
        nextState: "VERIFIED",
      });

      return {
        jobId: params.jobId,
        sku: notifiedSku,
        isVerified: true,
        isConflict: false,
        stage: "VERIFIED",
        finalState: "VERIFIED",
        notifiedQuantity,
        targetQuantity: params.targetQuantity,
        verifiedAt: now,
        observedAt,
      };
    } else {
      // Notification reported a discrepancy -> CONFLICT
      const mismatchMsg = `Amazon notification reported quantity ${notifiedQuantity}, differing from expected target ${params.targetQuantity}.`;
      const classified: ClassifiedSyncError = {
        classification: "CONFLICT",
        isRetryable: false,
        message: mismatchMsg,
        code: "NOTIFICATION_QUANTITY_MISMATCH",
        httpStatus: 409,
      };

      const updatedJob = await this.syncJobService.transition({
        organizationId: params.organizationId,
        jobId: params.jobId,
        nextState: "CONFLICT",
        errorCode: classified.code,
        errorMessage: classified.message,
      });

      await this.recordSyncException(params.organizationId, updatedJob, classified, {
        notifiedQuantity,
        expectedQuantity: params.targetQuantity,
      });

      return {
        jobId: params.jobId,
        sku: notifiedSku,
        isVerified: false,
        isConflict: true,
        stage: "CONFLICT",
        finalState: "CONFLICT",
        notifiedQuantity,
        targetQuantity: params.targetQuantity,
        observedAt,
        error: classified,
      };
    }
  }

  /**
   * Asynchronously awaits an incoming notification or falls back to direct read-back verification.
   * Avoids aggressive polling of Amazon SP-API endpoints.
   */
  async awaitNotificationOrReadBack(
    params: AmazonSyncAndVerifyParams,
    options?: {
      notificationPromise?: Promise<NormalizedWebhookEvent>;
      timeoutMs?: number;
    }
  ): Promise<AmazonVerificationResult> {
    const timeoutMs = options?.timeoutMs ?? 500;

    if (options?.notificationPromise) {
      try {
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
        const notification = await Promise.race([options.notificationPromise, timeoutPromise]);

        if (notification) {
          // Notification arrived in time! First enqueue & push write to establish job record
          const enqueueResult = await this.syncEngine.enqueue({
            organizationId: params.organizationId,
            channelAccountId: params.channelAccountId,
            skuId: params.skuId,
            warehouseId: params.warehouseId,
            operation: "UPDATE_INVENTORY",
            targetQuantity: params.targetQuantity,
            correlationId: params.correlationId || randomUUID(),
          });

          await this.syncJobService.transition({
            organizationId: params.organizationId,
            jobId: enqueueResult.job.id,
            nextState: "PROCESSING",
          });

          const updateRes = await this.adapter.updateInventory({
            sku: params.externalSkuId,
            quantity: params.targetQuantity,
            fulfillmentChannel: "SELLER",
          });

          await this.syncJobService.transition({
            organizationId: params.organizationId,
            jobId: enqueueResult.job.id,
            nextState: "SENT",
          });

          await this.syncJobService.transition({
            organizationId: params.organizationId,
            jobId: enqueueResult.job.id,
            nextState: "ACKNOWLEDGED",
          });

          // Verify via received notification
          const notifRes = await this.verifyViaNotification({
            organizationId: params.organizationId,
            jobId: enqueueResult.job.id,
            notification,
            targetQuantity: params.targetQuantity,
          });

          const now = new Date();
          const stageInfo = getVerificationStageInfo(notifRes.stage);

          return {
            jobId: enqueueResult.job.id,
            organizationId: params.organizationId,
            skuId: params.skuId,
            externalSkuId: params.externalSkuId,
            targetQuantity: params.targetQuantity,
            verifiedQuantity: notifRes.notifiedQuantity,
            finalState: notifRes.finalState,
            stage: notifRes.stage,
            stageInfo,
            isSuccess: notifRes.isVerified,
            isConflict: notifRes.isConflict,
            isDelayedVerification: false,
            isStale: false,
            freshness: evaluateFreshness(notifRes.observedAt || now, { receivedAt: now, verifiedAt: notifRes.verifiedAt, now }),
            observedAt: notifRes.observedAt,
            receivedAt: now,
            verifiedAt: notifRes.verifiedAt,
            error: notifRes.error,
            durationMs: 50,
            submissionId: updateRes.transactionId,
            fulfillmentChannel: params.fulfillmentChannel || "SELLER",
          };
        }
      } catch {
        // Fall back to direct read-back on error
      }
    }

    // Default: Fallback to standard sync and verification
    return this.syncAndVerify(params);
  }

  /**
   * Direct read-back verification against Amazon for an inventory level.
   */
  async verifyCurrentInventory(
    externalSkuId: string,
    expectedQuantity: number,
    options?: { fulfillmentChannel?: "SELLER" | "MFN" | "FBA" }
  ): Promise<VerificationResult> {
    const fulfillmentChannel = options?.fulfillmentChannel === "FBA" ? "FBA" : "SELLER";
    return this.adapter.verifyInventoryLevel(
      { sku: externalSkuId, fulfillmentChannel },
      expectedQuantity
    );
  }

  /**
   * Inspects external Amazon inventory and evaluates explicit freshness metadata and trust state.
   */
  async inspectFreshness(
    externalSkuId: string,
    maxStalenessMs: number = 5 * 60 * 1000,
    options?: { fulfillmentChannel?: "SELLER" | "MFN" | "FBA" }
  ): Promise<{
    inventory: ExternalInventory;
    freshness: FreshnessMetadata;
    trustState: TrustState;
  }> {
    const fulfillmentChannel = options?.fulfillmentChannel === "FBA" ? "FBA" : "SELLER";
    const inv = await this.adapter.getInventory({
      sku: externalSkuId,
      fulfillmentChannel,
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

  /**
   * Handles failure during the outbound push phase.
   */
  private async handleExecutionFailure(
    params: AmazonSyncAndVerifyParams,
    job: SyncJobRow,
    classified: ClassifiedSyncError,
    maxAttempts: number,
    startTime: number
  ): Promise<AmazonVerificationResult> {
    let nextState: "RETRYING" | "REQUIRES_ACTION" | "CONFLICT" = "RETRYING";

    switch (classified.classification) {
      case "AUTHENTICATION":
      case "VALIDATION":
      case "NOT_FOUND":
        nextState = "REQUIRES_ACTION";
        break;
      case "CONFLICT":
        nextState = "CONFLICT";
        break;
      case "TRANSIENT":
      case "RATE_LIMIT":
      case "UNKNOWN":
      default:
        nextState = "RETRYING";
        break;
    }

    const updatedJob = await this.syncJobService.transition({
      organizationId: params.organizationId,
      jobId: job.id,
      nextState,
      errorCode: classified.code,
      errorMessage: classified.message,
      maxAttempts,
    });

    if (nextState === "REQUIRES_ACTION" || nextState === "CONFLICT" || updatedJob.status === "FAILED") {
      await this.recordSyncException(params.organizationId, updatedJob, classified);
    }

    let stage: VerificationStage = "FAILED";
    if (nextState === "CONFLICT") {
      stage = "CONFLICT";
    } else if (nextState === "RETRYING" && updatedJob.status !== "FAILED") {
      stage = "VERIFICATION_PENDING";
    } else {
      stage = "FAILED";
    }

    const stageInfo = getVerificationStageInfo(stage);
    params.onStageChange?.(stage, stageInfo);

    const now = new Date();
    return {
      jobId: job.id,
      organizationId: params.organizationId,
      skuId: params.skuId,
      externalSkuId: params.externalSkuId,
      targetQuantity: params.targetQuantity,
      finalState: updatedJob.status,
      stage,
      stageInfo,
      isSuccess: false,
      isConflict: nextState === "CONFLICT",
      isDelayedVerification: false,
      isStale: false,
      freshness: evaluateFreshness(now, { receivedAt: now, now }),
      observedAt: now,
      receivedAt: now,
      verifiedAt: null,
      error: classified,
      durationMs: Date.now() - startTime,
      fulfillmentChannel: params.fulfillmentChannel || "SELLER",
    };
  }

  /**
   * Handles failure during the read-back verification phase.
   */
  private async handleVerificationFailure(
    params: AmazonSyncAndVerifyParams,
    job: SyncJobRow,
    classified: ClassifiedSyncError,
    maxAttempts: number,
    startTime: number,
    submissionId?: string
  ): Promise<AmazonVerificationResult> {
    let nextState: "RETRYING" | "REQUIRES_ACTION" | "CONFLICT" = "RETRYING";

    if (classified.classification === "CONFLICT") {
      nextState = "CONFLICT";
    } else if (
      classified.classification === "AUTHENTICATION" ||
      classified.classification === "VALIDATION" ||
      classified.classification === "NOT_FOUND"
    ) {
      nextState = "REQUIRES_ACTION";
    } else {
      nextState = "RETRYING";
    }

    const updatedJob = await this.syncJobService.transition({
      organizationId: params.organizationId,
      jobId: job.id,
      nextState,
      errorCode: classified.code,
      errorMessage: classified.message,
      maxAttempts,
    });

    if (nextState === "REQUIRES_ACTION" || nextState === "CONFLICT" || updatedJob.status === "FAILED") {
      await this.recordSyncException(params.organizationId, updatedJob, classified, { submissionId });
    }

    let stage: VerificationStage = "FAILED";
    if (nextState === "CONFLICT") {
      stage = "CONFLICT";
    } else if (nextState === "RETRYING" && updatedJob.status !== "FAILED") {
      stage = "VERIFICATION_PENDING";
    } else {
      stage = "FAILED";
    }

    const stageInfo = getVerificationStageInfo(stage);
    params.onStageChange?.(stage, stageInfo);

    const now = new Date();
    return {
      jobId: job.id,
      organizationId: params.organizationId,
      skuId: params.skuId,
      externalSkuId: params.externalSkuId,
      targetQuantity: params.targetQuantity,
      finalState: updatedJob.status,
      stage,
      stageInfo,
      isSuccess: false,
      isConflict: nextState === "CONFLICT",
      isDelayedVerification: false,
      isStale: false,
      freshness: evaluateFreshness(now, { receivedAt: now, now }),
      observedAt: now,
      receivedAt: now,
      verifiedAt: null,
      error: classified,
      durationMs: Date.now() - startTime,
      submissionId,
      fulfillmentChannel: params.fulfillmentChannel || "SELLER",
    };
  }

  /**
   * Records a domain exception for operator review.
   */
  private async recordSyncException(
    organizationId: string,
    job: SyncJobRow,
    classified: ClassifiedSyncError,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const exception: DomainException = createDomainException({
      organizationId,
      type: "SYNC_FAILURE",
      entityType: "SYNC_JOB",
      entityId: job.id,
      title: `Amazon Sync Failure [${classified.classification}]`,
      description: classified.message,
      rootCause: {
        error: classified.message,
        code: classified.code,
        classification: classified.classification,
        attempts: job.attempt_count,
        metadata,
      },
      recommendedAction: {
        action:
          classified.classification === "AUTHENTICATION"
            ? "Check and refresh channel API credentials in Integration Settings."
            : classified.classification === "NOT_FOUND"
            ? "Review Amazon catalog SKU mapping to verify external listing ID exists on channel."
            : classified.classification === "CONFLICT"
            ? "Run inventory reconciliation to inspect discrepancy between ledger and Amazon."
            : classified.code === "FBA_DIRECT_PUSH_RESTRICTED"
            ? "FBA stock is managed exclusively via Amazon Inbound Shipments (Section 39). Use MFN for merchant sync."
            : "Inspect Amazon SP-API status and retry the synchronization.",
      },
    });

    if ("recordException" in this.syncJobService["repository"]) {
      await (this.syncJobService["repository"] as any).recordException(exception);
    }
  }
}
