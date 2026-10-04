/**
 * Sync Jobs Database Subsystem & Repository
 * Canonical Specification: Sections 23, 24, 25, 26 of 01_ENGINEERING_SPEC.md & Prompt 12
 */

import {
  SyncJobRow,
  SyncOperation,
  SyncStatus,
} from "./schema/types.js";
import {
  TenantAccessDeniedError,
  InvalidStateTransitionError,
  DomainException,
} from "@platform/domain";

export interface SyncJobFilter {
  channelAccountId?: string;
  skuId?: string;
  status?: SyncStatus;
  limit?: number;
  offset?: number;
}

export interface CreateSyncJobParams {
  organizationId: string;
  channelAccountId: string;
  skuId: string;
  warehouseId?: string | null;
  operation?: SyncOperation;
  targetQuantity: number;
  idempotencyKey?: string | null;
  correlationId?: string;
}

export interface CreateSyncJobResult {
  job: SyncJobRow;
  isDuplicate: boolean;
}

export interface TransitionSyncJobParams {
  organizationId: string;
  jobId: string;
  nextState: SyncStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  maxAttempts?: number;
  skipVerificationCheck?: boolean;
}

export interface SyncJobRepository {
  create(job: SyncJobRow): Promise<SyncJobRow>;
  findById(organizationId: string, id: string): Promise<SyncJobRow | null>;
  findByIdGlobal?(id: string): Promise<SyncJobRow | null>;
  findByIdempotencyKey(organizationId: string, key: string): Promise<SyncJobRow | null>;
  update(organizationId: string, id: string, updates: Partial<SyncJobRow>): Promise<SyncJobRow>;
  list(organizationId: string, filter?: SyncJobFilter): Promise<{ jobs: SyncJobRow[]; total: number }>;
  recordException?(exception: DomainException): Promise<void>;
}

export class InMemorySyncJobRepository implements SyncJobRepository {
  private jobs = new Map<string, SyncJobRow>(); // `${orgId}:${id}` -> SyncJobRow
  private globalJobIndex = new Map<string, string>(); // jobId -> organizationId
  private idempotencyIndex = new Map<string, string>(); // `${orgId}:${idempotencyKey}` -> jobId
  private exceptions = new Map<string, DomainException[]>(); // orgId -> exceptions

  async create(job: SyncJobRow): Promise<SyncJobRow> {
    const key = `${job.organization_id}:${job.id}`;
    this.jobs.set(key, { ...job });
    this.globalJobIndex.set(job.id, job.organization_id);

    if (job.idempotency_key) {
      this.idempotencyIndex.set(
        `${job.organization_id}:${job.idempotency_key}`,
        job.id
      );
    }

    return { ...job };
  }

  async findById(organizationId: string, id: string): Promise<SyncJobRow | null> {
    const key = `${organizationId}:${id}`;
    const job = this.jobs.get(key);
    return job ? { ...job } : null;
  }

  async findByIdGlobal(id: string): Promise<SyncJobRow | null> {
    const orgId = this.globalJobIndex.get(id);
    if (!orgId) return null;
    return this.findById(orgId, id);
  }

  async findByIdempotencyKey(
    organizationId: string,
    key: string
  ): Promise<SyncJobRow | null> {
    const jobId = this.idempotencyIndex.get(`${organizationId}:${key}`);
    if (!jobId) return null;
    return this.findById(organizationId, jobId);
  }

  async update(
    organizationId: string,
    id: string,
    updates: Partial<SyncJobRow>
  ): Promise<SyncJobRow> {
    const key = `${organizationId}:${id}`;
    const existing = this.jobs.get(key);
    if (!existing) {
      throw new Error(`Sync job '${id}' not found for organization '${organizationId}'.`);
    }

    const updated: SyncJobRow = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.jobs.set(key, updated);
    return { ...updated };
  }

  async list(
    organizationId: string,
    filter?: SyncJobFilter
  ): Promise<{ jobs: SyncJobRow[]; total: number }> {
    let result: SyncJobRow[] = [];

    for (const [key, job] of this.jobs.entries()) {
      if (!key.startsWith(`${organizationId}:`)) continue;

      if (filter?.channelAccountId && job.channel_account_id !== filter.channelAccountId) {
        continue;
      }
      if (filter?.skuId && job.sku_id !== filter.skuId) {
        continue;
      }
      if (filter?.status && job.status !== filter.status) {
        continue;
      }

      result.push({ ...job });
    }

    // Sort newest first
    result.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const total = result.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;

    result = result.slice(offset, offset + limit);

    return { jobs: result, total };
  }

  async recordException(exception: DomainException): Promise<void> {
    const list = this.exceptions.get(exception.organizationId) || [];
    list.push(exception);
    this.exceptions.set(exception.organizationId, list);
  }

  async getExceptions(organizationId: string): Promise<DomainException[]> {
    return (this.exceptions.get(organizationId) || []).map((e) => ({ ...e }));
  }

  clear(): void {
    this.jobs.clear();
    this.globalJobIndex.clear();
    this.idempotencyIndex.clear();
    this.exceptions.clear();
  }
}

/**
 * Valid transitions matrix according to Section 24 of 01_ENGINEERING_SPEC.md
 */
const VALID_SYNC_TRANSITIONS: Record<SyncStatus, readonly SyncStatus[]> = {
  QUEUED: ["PROCESSING", "FAILED", "REQUIRES_ACTION"],
  PROCESSING: ["SENT", "RETRYING", "FAILED", "REQUIRES_ACTION", "CONFLICT"],
  SENT: ["ACKNOWLEDGED", "RETRYING", "FAILED", "REQUIRES_ACTION"],
  ACKNOWLEDGED: ["VERIFYING", "RETRYING", "FAILED", "REQUIRES_ACTION", "CONFLICT"],
  VERIFYING: ["VERIFIED", "CONFLICT", "RETRYING", "FAILED", "REQUIRES_ACTION"],
  VERIFIED: ["QUEUED"], // Can re-enter cycle with a new sync attempt
  RETRYING: ["QUEUED", "PROCESSING", "FAILED", "REQUIRES_ACTION"],
  FAILED: ["QUEUED", "REQUIRES_ACTION"],
  REQUIRES_ACTION: ["QUEUED", "FAILED", "PROCESSING"],
  CONFLICT: ["REQUIRES_ACTION", "QUEUED"],
};

export class SyncJobService {
  constructor(private readonly repository: SyncJobRepository) {}

  /**
   * Enqueues a new synchronization job or returns existing job if duplicate idempotency key is detected.
   */
  async enqueue(params: CreateSyncJobParams): Promise<CreateSyncJobResult> {
    // 1. Check idempotency deduplication if key provided
    if (params.idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(
        params.organizationId,
        params.idempotencyKey
      );

      if (existing) {
        return {
          job: existing,
          isDuplicate: true,
        };
      }
    }

    const now = new Date().toISOString();
    const jobId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const correlationId =
      params.correlationId ||
      `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const newJob: SyncJobRow = {
      id: jobId,
      organization_id: params.organizationId,
      channel_account_id: params.channelAccountId,
      sku_id: params.skuId,
      warehouse_id: params.warehouseId || null,
      operation: params.operation || "UPDATE_INVENTORY",
      target_quantity: params.targetQuantity,
      status: "QUEUED",
      attempt_count: 0,
      idempotency_key: params.idempotencyKey || null,
      correlation_id: correlationId,
      queued_at: now,
      started_at: null,
      sent_at: null,
      acknowledged_at: null,
      verified_at: null,
      failed_at: null,
      last_error_code: null,
      last_error_message: null,
      created_at: now,
      updated_at: now,
    };

    const saved = await this.repository.create(newJob);
    return {
      job: saved,
      isDuplicate: false,
    };
  }

  /**
   * Transitions a sync job to the next lifecycle state with strict invariant enforcement.
   */
  async transition(params: TransitionSyncJobParams): Promise<SyncJobRow> {
    const existing = await this.getSyncJob(params.organizationId, params.jobId);
    if (!existing) {
      throw new Error(`Sync job '${params.jobId}' not found.`);
    }

    const currentState = existing.status;
    const nextState = params.nextState;

    // Invariant Check 1: External synchronization cannot be marked VERIFIED without completing read-back in VERIFYING state
    if (nextState === "VERIFIED") {
      if (currentState !== "VERIFYING" && !params.skipVerificationCheck) {
        throw new InvalidStateTransitionError(
          "SyncJob",
          currentState,
          nextState,
          {
            reason:
              "Mandatory Invariant: External synchronization cannot be marked VERIFIED without completing read-back verification in VERIFYING state.",
            jobId: existing.id,
          }
        );
      }
    }

    // Invariant Check 2: Valid transitions matrix
    const allowed = VALID_SYNC_TRANSITIONS[currentState];
    if (currentState !== nextState && (!allowed || !allowed.includes(nextState))) {
      throw new InvalidStateTransitionError("SyncJob", currentState, nextState, {
        jobId: existing.id,
        allowedTransitions: allowed || [],
      });
    }

    const now = new Date().toISOString();
    const maxAttempts = params.maxAttempts ?? 3;
    let finalState: SyncStatus = nextState;
    let newAttemptCount = existing.attempt_count;

    // Retry escalation: escalate to FAILED if max retries exceeded
    if (nextState === "RETRYING") {
      newAttemptCount += 1;
      if (newAttemptCount >= maxAttempts) {
        finalState = "FAILED";
      }
    }

    const updates: Partial<SyncJobRow> = {
      status: finalState,
      attempt_count: newAttemptCount,
      updated_at: now,
    };

    // State-specific timestamp and error tracking
    switch (finalState) {
      case "QUEUED":
        updates.last_error_code = null;
        updates.last_error_message = null;
        break;
      case "PROCESSING":
        if (!existing.started_at) updates.started_at = now;
        break;
      case "SENT":
        updates.sent_at = now;
        break;
      case "ACKNOWLEDGED":
        updates.acknowledged_at = now;
        break;
      case "VERIFIED":
        updates.verified_at = now;
        break;
      case "FAILED":
        updates.failed_at = now;
        if (params.errorCode) updates.last_error_code = params.errorCode;
        if (params.errorMessage) updates.last_error_message = params.errorMessage;
        break;
      case "RETRYING":
      case "REQUIRES_ACTION":
      case "CONFLICT":
        if (params.errorCode) updates.last_error_code = params.errorCode;
        if (params.errorMessage) updates.last_error_message = params.errorMessage;
        break;
    }

    return this.repository.update(params.organizationId, params.jobId, updates);
  }

  /**
   * Retrieves a sync job by ID with strict tenant isolation.
   */
  async getSyncJob(organizationId: string, id: string): Promise<SyncJobRow | null> {
    const job = await this.repository.findById(organizationId, id);
    if (job) return job;

    // Global cross-tenant isolation boundary protection
    if (this.repository.findByIdGlobal) {
      const globalJob = await this.repository.findByIdGlobal(id);
      if (globalJob && globalJob.organization_id !== organizationId) {
        throw new TenantAccessDeniedError(
          globalJob.organization_id,
          organizationId,
          `Tenant isolation violation: Access denied to sync job '${id}'.`
        );
      }
    }

    return null;
  }

  /**
   * Lists sync jobs within the authenticated tenant scope.
   */
  async listSyncJobs(
    organizationId: string,
    filter?: SyncJobFilter
  ): Promise<{ jobs: SyncJobRow[]; total: number }> {
    return this.repository.list(organizationId, filter);
  }

  /**
   * Re-queues a failed, requires_action, or conflict job for retry.
   */
  async retrySyncJob(organizationId: string, id: string, force = false): Promise<SyncJobRow> {
    const job = await this.getSyncJob(organizationId, id);
    if (!job) {
      throw new Error(`Sync job '${id}' not found.`);
    }

    const eligibleStates: SyncStatus[] = ["FAILED", "REQUIRES_ACTION", "CONFLICT", "RETRYING"];
    if (!eligibleStates.includes(job.status) && !force) {
      throw new Error(
        `Sync job '${id}' in state '${job.status}' is not eligible for manual retry.`
      );
    }

    return this.transition({
      organizationId,
      jobId: id,
      nextState: "QUEUED",
      errorCode: null,
      errorMessage: null,
    });
  }
}
