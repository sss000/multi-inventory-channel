/**
 * Synchronization State Machine & Transition Rules
 * Canonical Specification: Section 24 of 01_ENGINEERING_SPEC.md & Prompt 07
 * 
 * Rules:
 * 1. Never mark external synchronization as VERIFIED merely because an API request succeeded.
 * 2. Never treat an acknowledged external write as verified until read-back verification succeeds.
 * 3. Transitions must strictly follow the defined asynchronous lifecycle.
 */

import {
  SyncJob,
  SyncState,
  SyncOperation,
  SyncJobId,
  OrganizationId,
  ChannelAccountId,
  SkuId,
  WarehouseId,
  UUID,
  VerificationStage,
} from "./types.js";
import { InvalidStateTransitionError } from "./errors.js";

/**
 * Maps an internal SyncState to an explicit operational VerificationStage.
 * Canonically distinguishes the 6 verification lifecycle stages:
 * 1. request submitted
 * 2. request acknowledged
 * 3. verification pending
 * 4. verified
 * 5. conflict
 * 6. failed
 */
export function syncStateToVerificationStage(state: SyncState): VerificationStage {
  switch (state) {
    case "SENT":
      return "REQUEST_SUBMITTED";
    case "ACKNOWLEDGED":
      return "REQUEST_ACKNOWLEDGED";
    case "VERIFYING":
    case "QUEUED":
    case "PROCESSING":
    case "RETRYING":
      return "VERIFICATION_PENDING";
    case "VERIFIED":
      return "VERIFIED";
    case "CONFLICT":
      return "CONFLICT";
    case "FAILED":
    case "REQUIRES_ACTION":
    default:
      return "FAILED";
  }
}

/**
 * Valid state transitions matrix according to Section 24.
 */
export const VALID_SYNC_TRANSITIONS: Record<SyncState, readonly SyncState[]> = {
  QUEUED: ["PROCESSING", "FAILED", "REQUIRES_ACTION"],
  PROCESSING: ["SENT", "RETRYING", "FAILED", "REQUIRES_ACTION", "CONFLICT"],
  SENT: ["ACKNOWLEDGED", "RETRYING", "FAILED", "REQUIRES_ACTION"],
  ACKNOWLEDGED: ["VERIFYING", "VERIFIED", "RETRYING", "FAILED", "REQUIRES_ACTION", "CONFLICT"],
  VERIFYING: ["VERIFIED", "CONFLICT", "RETRYING", "FAILED", "REQUIRES_ACTION"],
  VERIFIED: ["QUEUED"], // Can restart cycle with new target
  RETRYING: ["QUEUED", "PROCESSING", "FAILED", "REQUIRES_ACTION"],
  FAILED: ["QUEUED", "REQUIRES_ACTION"],
  REQUIRES_ACTION: ["QUEUED", "FAILED", "PROCESSING"],
  CONFLICT: ["REQUIRES_ACTION", "QUEUED"],
};

export interface SyncTransitionOptions {
  errorCode?: string;
  errorMessage?: string;
  maxAttempts?: number;
  readBackQuantity?: number;
  skipVerificationCheck?: boolean;
}

export interface CreateSyncJobParams {
  id?: SyncJobId;
  organizationId: OrganizationId;
  channelAccountId: ChannelAccountId;
  skuId: SkuId;
  warehouseId?: WarehouseId;
  operation: SyncOperation;
  targetQuantity: number;
  correlationId: UUID;
  idempotencyKey?: string;
}

/**
 * Checks whether a transition between two sync states is allowed.
 */
export function canTransitionSync(from: SyncState, to: SyncState): boolean {
  if (from === to) return true;
  const allowed = VALID_SYNC_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Creates a new SyncJob in the initial QUEUED state.
 */
export function createSyncJob(params: CreateSyncJobParams): SyncJob {
  const now = new Date();
  const id: SyncJobId = params.id || `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    organizationId: params.organizationId,
    channelAccountId: params.channelAccountId,
    skuId: params.skuId,
    warehouseId: params.warehouseId,
    operation: params.operation,
    targetQuantity: params.targetQuantity,
    status: "QUEUED",
    attemptCount: 0,
    correlationId: params.correlationId,
    idempotencyKey: params.idempotencyKey,
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transitions a SyncJob to the next state, enforcing domain invariants and timestamps.
 * Throws InvalidStateTransitionError if transition is illegal.
 */
export function transitionSyncJob(
  job: SyncJob,
  nextState: SyncState,
  options: SyncTransitionOptions = {}
): SyncJob {
  const currentState = job.status;

  // 1. Guard against direct jump to VERIFIED without passing through SENT/ACKNOWLEDGED/VERIFYING
  if (nextState === "VERIFIED") {
    if (currentState === "QUEUED" || currentState === "PROCESSING" || currentState === "SENT") {
      throw new InvalidStateTransitionError(
        "SyncJob",
        currentState,
        nextState,
        {
          reason:
            "Mandatory Invariant: External synchronization cannot be marked VERIFIED without completing execution and read-back verification.",
          jobId: job.id,
        }
      );
    }
  }

  // 2. Validate transition in state matrix
  if (!canTransitionSync(currentState, nextState)) {
    throw new InvalidStateTransitionError("SyncJob", currentState, nextState, {
      jobId: job.id,
      allowedTransitions: VALID_SYNC_TRANSITIONS[currentState],
    });
  }

  const now = new Date();
  const maxAttempts = options.maxAttempts ?? 5;
  let finalState: SyncState = nextState;
  let newAttemptCount = job.attemptCount;

  // 3. Handle RETRYING logic: escalate to FAILED if max retries exceeded
  if (nextState === "RETRYING") {
    newAttemptCount += 1;
    if (newAttemptCount >= maxAttempts) {
      finalState = "FAILED";
    }
  }

  const updated: SyncJob = {
    ...job,
    status: finalState,
    attemptCount: newAttemptCount,
    updatedAt: now,
  };

  // 4. Update timestamps based on state
  switch (finalState) {
    case "PROCESSING":
      if (!updated.startedAt) updated.startedAt = now;
      break;
    case "SENT":
      updated.sentAt = now;
      break;
    case "ACKNOWLEDGED":
      updated.acknowledgedAt = now;
      break;
    case "VERIFIED":
      updated.verifiedAt = now;
      break;
    case "FAILED":
      updated.failedAt = now;
      if (options.errorCode) updated.lastErrorCode = options.errorCode;
      if (options.errorMessage) updated.lastErrorMessage = options.errorMessage;
      break;
    case "RETRYING":
    case "REQUIRES_ACTION":
    case "CONFLICT":
      if (options.errorCode) updated.lastErrorCode = options.errorCode;
      if (options.errorMessage) updated.lastErrorMessage = options.errorMessage;
      break;
  }

  return updated;
}
