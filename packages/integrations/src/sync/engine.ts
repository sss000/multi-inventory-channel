/**
 * Provider-Independent Synchronization Engine
 * Canonical Specifications: Sections 23, 24, 25, 26 of 01_ENGINEERING_SPEC.md & Prompt 12
 * 
 * Rules:
 * 1. State machine: QUEUED -> PROCESSING -> SENT -> ACKNOWLEDGED -> VERIFYING -> VERIFIED.
 * 2. Failure states: RETRYING, FAILED, REQUIRES_ACTION, CONFLICT.
 * 3. Classify all errors: TRANSIENT, RATE_LIMIT, AUTHENTICATION, VALIDATION, NOT_FOUND, CONFLICT, UNKNOWN.
 * 4. A synchronization job must NEVER be marked VERIFIED solely because an outbound HTTP/API operation succeeded.
 * 5. Provider accepted request followed by client timeout must NOT mark VERIFIED; it transitions to RETRYING.
 * 6. Conforms to tenant isolation and idempotency deduplication.
 */

import {
  SyncJobRow,
  SyncJobService,
  CreateSyncJobParams,
  CreateSyncJobResult,
} from "@platform/database";
import {
  DomainException,
  createDomainException,
} from "@platform/domain";
import {
  VerificationStage,
  getVerificationStageInfo,
} from "@platform/contracts";
import { ChannelAdapter } from "../adapter.js";
import { classifySyncError, ClassifiedSyncError } from "./error-classifier.js";
import { ExecuteSyncJobParams, SyncExecutionOutcome } from "./types.js";

export class SyncEngine {
  constructor(private readonly syncJobService: SyncJobService) {}

  /**
   * Returns the underlying SyncJobService.
   */
  getSyncJobService(): SyncJobService {
    return this.syncJobService;
  }

  /**
   * Enqueues a synchronization job with idempotency deduplication.
   */
  async enqueue(params: CreateSyncJobParams): Promise<CreateSyncJobResult> {
    return this.syncJobService.enqueue(params);
  }

  /**
   * Executes a synchronization job through the canonical state machine.
   * Explicitly distinguishes the 6 verification stages:
   * 1. request submitted
   * 2. request acknowledged
   * 3. verification pending
   * 4. verified
   * 5. conflict
   * 6. failed
   */
  async execute(params: ExecuteSyncJobParams): Promise<SyncExecutionOutcome> {
    const startTime = Date.now();
    const { organizationId, jobId, adapter, externalSkuId, onStageChange } = params;
    const maxAttempts = params.maxAttempts ?? 3;

    // 1. Fetch current job and enforce tenant access
    let job = await this.syncJobService.getSyncJob(organizationId, jobId);
    if (!job) {
      throw new Error(`Sync job '${jobId}' not found for tenant '${organizationId}'.`);
    }

    // 2. Transition QUEUED -> PROCESSING
    job = await this.syncJobService.transition({
      organizationId,
      jobId,
      nextState: "PROCESSING",
    });

    // 3. Outbound Write Execution Phase
    let pushResult;
    try {
      pushResult = await adapter.pushInventoryLevel(externalSkuId, job.target_quantity);
    } catch (err: unknown) {
      const classified = classifySyncError(err);
      return this.handleExecutionFailure(
        organizationId,
        jobId,
        classified,
        maxAttempts,
        startTime,
        onStageChange
      );
    }

    // If adapter returned an explicit failure status
    if (pushResult.status === "FAILED" || !pushResult.acknowledged) {
      const classified = classifySyncError(pushResult.error || "Adapter push rejected", {
        httpStatus: pushResult.httpStatus,
        errorCode: pushResult.errorCode,
        retryAfterMs: pushResult.retryAfterMs,
      });

      return this.handleExecutionFailure(
        organizationId,
        jobId,
        classified,
        maxAttempts,
        startTime,
        onStageChange
      );
    }

    // 4. Outbound Succeeded: Transition PROCESSING -> SENT -> ACKNOWLEDGED
    job = await this.syncJobService.transition({
      organizationId,
      jobId,
      nextState: "SENT",
    });
    onStageChange?.("REQUEST_SUBMITTED", getVerificationStageInfo("REQUEST_SUBMITTED"));

    job = await this.syncJobService.transition({
      organizationId,
      jobId,
      nextState: "ACKNOWLEDGED",
    });
    onStageChange?.("REQUEST_ACKNOWLEDGED", getVerificationStageInfo("REQUEST_ACKNOWLEDGED"));

    // CRITICAL SPECIFICATION GATE:
    // "A synchronization job must never be marked VERIFIED solely because an outbound HTTP/API operation succeeded."
    // Provider accepted write != Verified. Explicit verification must be performed.

    // 5. Explicit Verification Phase: Transition ACKNOWLEDGED -> VERIFYING
    job = await this.syncJobService.transition({
      organizationId,
      jobId,
      nextState: "VERIFYING",
    });
    onStageChange?.("VERIFICATION_PENDING", getVerificationStageInfo("VERIFICATION_PENDING"));

    let verificationResult;
    try {
      verificationResult = await adapter.verifyInventoryLevel(
        externalSkuId,
        job.target_quantity
      );
    } catch (err: unknown) {
      // Scenario: Provider accepted request followed by client timeout during verification.
      // Must NOT be marked VERIFIED. Classify error and retry or escalate.
      const classified = classifySyncError(err);
      return this.handleVerificationFailure(
        organizationId,
        jobId,
        classified,
        maxAttempts,
        startTime,
        onStageChange
      );
    }

    // If verification encountered an adapter error or unreachable provider
    if (verificationResult.status === "UNREACHABLE" || verificationResult.error) {
      const classified = classifySyncError(
        verificationResult.error || "Verification unreachable",
        {
          httpStatus: verificationResult.httpStatus,
          errorCode: verificationResult.errorCode,
        }
      );
      return this.handleVerificationFailure(
        organizationId,
        jobId,
        classified,
        maxAttempts,
        startTime,
        onStageChange
      );
    }

    // Check for quantity discrepancy (CONFLICT)
    if (
      verificationResult.status === "MISMATCH" ||
      !verificationResult.isVerified ||
      (verificationResult.actualQuantity !== undefined &&
        verificationResult.actualQuantity !== job.target_quantity)
    ) {
      const mismatchMsg = `Verification detected discrepancy: expected target quantity ${job.target_quantity}, but provider reported actual ${verificationResult.actualQuantity ?? "unknown"}.`;
      
      const classified: ClassifiedSyncError = {
        classification: "CONFLICT",
        isRetryable: false,
        message: mismatchMsg,
        code: "QUANTITY_MISMATCH_CONFLICT",
        httpStatus: 409,
      };

      job = await this.syncJobService.transition({
        organizationId,
        jobId,
        nextState: "CONFLICT",
        errorCode: classified.code,
        errorMessage: classified.message,
      });

      // Record exception for operator & reconciliation resolution
      await this.recordSyncException(organizationId, job, classified, {
        expectedQuantity: job.target_quantity,
        actualQuantity: verificationResult.actualQuantity,
      });

      const stageInfo = getVerificationStageInfo("CONFLICT", {
        expectedQuantity: job.target_quantity,
        actualQuantity: verificationResult.actualQuantity,
      });
      onStageChange?.("CONFLICT", stageInfo);

      return {
        job,
        finalState: "CONFLICT",
        stage: "CONFLICT",
        stageInfo,
        isSuccess: false,
        error: classified,
        verifiedQuantity: verificationResult.actualQuantity,
        observedAt: verificationResult.observedAt,
        receivedAt: verificationResult.receivedAt,
        verifiedAt: verificationResult.verifiedAt,
        isStale: false,
        durationMs: Date.now() - startTime,
      };
    }

    // 6. Read-back verification succeeded: Transition VERIFYING -> VERIFIED
    job = await this.syncJobService.transition({
      organizationId,
      jobId,
      nextState: "VERIFIED",
    });

    const stageInfo = getVerificationStageInfo("VERIFIED", {
      actualQuantity: verificationResult.actualQuantity ?? job.target_quantity,
    });
    onStageChange?.("VERIFIED", stageInfo);

    return {
      job,
      finalState: "VERIFIED",
      stage: "VERIFIED",
      stageInfo,
      isSuccess: true,
      verifiedQuantity: verificationResult.actualQuantity ?? job.target_quantity,
      observedAt: verificationResult.observedAt,
      receivedAt: verificationResult.receivedAt,
      verifiedAt: verificationResult.verifiedAt,
      isStale: false,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Handles failure during the outbound push phase.
   */
  private async handleExecutionFailure(
    organizationId: string,
    jobId: string,
    classified: ClassifiedSyncError,
    maxAttempts: number,
    startTime: number,
    onStageChange?: (stage: VerificationStage, stageInfo: any) => void
  ): Promise<SyncExecutionOutcome> {
    let nextState: "RETRYING" | "REQUIRES_ACTION" | "CONFLICT" = "RETRYING";

    switch (classified.classification) {
      case "AUTHENTICATION":
      case "VALIDATION":
      case "NOT_FOUND":
        // Non-retryable without intervention
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
      organizationId,
      jobId,
      nextState,
      errorCode: classified.code,
      errorMessage: classified.message,
      maxAttempts,
    });

    if (nextState === "REQUIRES_ACTION" || nextState === "CONFLICT" || updatedJob.status === "FAILED") {
      await this.recordSyncException(organizationId, updatedJob, classified);
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
    onStageChange?.(stage, stageInfo);

    return {
      job: updatedJob,
      finalState: updatedJob.status,
      stage,
      stageInfo,
      isSuccess: false,
      error: classified,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Handles failure during the verification phase.
   */
  private async handleVerificationFailure(
    organizationId: string,
    jobId: string,
    classified: ClassifiedSyncError,
    maxAttempts: number,
    startTime: number,
    onStageChange?: (stage: VerificationStage, stageInfo: any) => void
  ): Promise<SyncExecutionOutcome> {
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
      organizationId,
      jobId,
      nextState,
      errorCode: classified.code,
      errorMessage: classified.message,
      maxAttempts,
    });

    if (nextState === "REQUIRES_ACTION" || nextState === "CONFLICT" || updatedJob.status === "FAILED") {
      await this.recordSyncException(organizationId, updatedJob, classified);
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
    onStageChange?.(stage, stageInfo);

    return {
      job: updatedJob,
      finalState: updatedJob.status,
      stage,
      stageInfo,
      isSuccess: false,
      error: classified,
      durationMs: Date.now() - startTime,
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
      title: `Synchronization Failure [${classified.classification}]`,
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
            ? "Review catalog SKU mapping to verify external listing ID exists on channel."
            : classified.classification === "CONFLICT"
            ? "Run inventory reconciliation to inspect discrepancy between ledger and channel."
            : "Inspect external provider status and retry the synchronization.",
      },
    });

    // Record in database repository if supported
    if ("recordException" in this.syncJobService["repository"]) {
      await (this.syncJobService["repository"] as any).recordException(exception);
    }
  }
}
