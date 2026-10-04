/**
 * Tenant-Aware Fair Scheduling Durable Job Queue
 * Canonical Specification: Section 142, 143, 145 of 01_ENGINEERING_SPEC.md & Prompt 11
 * 
 * Rules:
 * 1. Supports 7 canonical states: QUEUED, RUNNING, SUCCEEDED, PARTIAL, RETRYING, FAILED, CANCELLED.
 * 2. Fair Scheduling: round-robin interleaving across tenant lanes ensures one merchant never monopolizes workers.
 * 3. Telemetry: exposes jobId, type, started, duration, progress, attempts, currentState, errors.
 * 4. Idempotency: duplicate submissions with idempotency key return existing job without re-queueing.
 */

import {
  Job,
  JobOptions,
  JobState,
  JobTelemetry,
  QueueMetrics,
} from "./types.js";
import { DeadLetterQueue } from "./dead-letter.js";
import { createLogger } from "@platform/observability";

const logger = createLogger("job-queue");

export interface QueueOptions {
  deadLetterQueue?: DeadLetterQueue;
}

export class DurableJobQueue {
  private jobs = new Map<string, Job>();
  private tenantLanes = new Map<string, string[]>(); // organizationId -> array of queued job IDs
  private tenantOrder: string[] = []; // Circular list of active organization IDs
  private tenantCursor = 0;

  private idempotencyIndex = new Map<string, string>(); // `${orgId}:${key}` -> jobId
  private scheduledRetries = new Map<string, { jobId: string; runAt: number }>();
  private deadLetterQueue: DeadLetterQueue;

  constructor(options: QueueOptions = {}) {
    this.deadLetterQueue = options.deadLetterQueue || new DeadLetterQueue();
  }

  getDeadLetterQueue(): DeadLetterQueue {
    return this.deadLetterQueue;
  }

  /**
   * Enqueues a job into the tenant's fair lane.
   */
  async enqueue<T = Record<string, unknown>>(
    type: string,
    payload: T,
    options: JobOptions
  ): Promise<Job<T>> {
    const orgId = options.organizationId;
    if (!orgId) {
      throw new Error("Job enqueue rejected: organizationId is required for fair queuing.");
    }

    // 1. Idempotency Check
    if (options.idempotencyKey) {
      const idxKey = `${orgId}:${options.idempotencyKey}`;
      const existingJobId = this.idempotencyIndex.get(idxKey);
      if (existingJobId) {
        const existing = this.jobs.get(existingJobId);
        if (existing) {
          logger.info("Deduplicated job enqueue via idempotency key", {
            jobId: existing.id,
            idempotencyKey: options.idempotencyKey,
            organizationId: orgId,
          });
          return existing as Job<T>;
        }
      }
    }

    // 2. Instantiate Job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullOptions: Required<JobOptions> = {
      organizationId: orgId,
      priority: options.priority ?? 5,
      maxAttempts: options.maxAttempts ?? 3,
      backoffInitialMs: options.backoffInitialMs ?? 1000,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      jitterFactor: options.jitterFactor ?? 0.2,
      idempotencyKey: options.idempotencyKey ?? "",
      correlationId: options.correlationId ?? `corr_${Date.now()}`,
    };

    const job: Job<T> = {
      id: jobId,
      type,
      organizationId: orgId,
      payload,
      options: fullOptions,
      state: "QUEUED",
      progress: 0,
      attempts: 0,
      errors: [],
      queuedAt: new Date(),
      startedAt: null,
      completedAt: null,
      lastHeartbeat: null,
      isCancelled: false,
    };

    this.jobs.set(jobId, job as Job);

    if (options.idempotencyKey) {
      this.idempotencyIndex.set(`${orgId}:${options.idempotencyKey}`, jobId);
    }

    // 3. Add to Tenant's Fair Lane
    this.addToTenantLane(orgId, jobId);

    logger.info("Job successfully enqueued", {
      jobId,
      jobType: type,
      organizationId: orgId,
      priority: fullOptions.priority,
    });

    return job;
  }

  private addToTenantLane(orgId: string, jobId: string): void {
    let lane = this.tenantLanes.get(orgId);
    if (!lane) {
      lane = [];
      this.tenantLanes.set(orgId, lane);
      this.tenantOrder.push(orgId);
    }

    lane.push(jobId);

    // Sort lane by job priority descending
    lane.sort((idA, idB) => {
      const jobA = this.jobs.get(idA);
      const jobB = this.jobs.get(idB);
      return (jobB?.options.priority ?? 5) - (jobA?.options.priority ?? 5);
    });
  }

  /**
   * Tenant-Aware Fair Dequeue (Deficit Round Robin)
   * Dispatches the next job across rotating tenant lanes.
   * Guarantees that high-volume merchants do not starve lower-volume merchants.
   */
  async dequeueNextFairJob(): Promise<Job | null> {
    // 1. Process any due scheduled retries first
    this.pollScheduledRetries();

    if (this.tenantOrder.length === 0) {
      return null;
    }

    const startCursor = this.tenantCursor;
    let cycles = 0;

    while (cycles < this.tenantOrder.length) {
      const orgId = this.tenantOrder[this.tenantCursor];
      if (!orgId) {
        this.tenantCursor = 0;
        break;
      }
      const lane = this.tenantLanes.get(orgId);


      // Advance cursor for next call
      this.tenantCursor = (this.tenantCursor + 1) % this.tenantOrder.length;
      cycles++;

      if (lane && lane.length > 0) {
        const jobId = lane.shift()!;

        // Cleanup empty lane
        if (lane.length === 0) {
          this.tenantLanes.delete(orgId);
          this.tenantOrder = this.tenantOrder.filter((id) => id !== orgId);
          if (this.tenantCursor >= this.tenantOrder.length) {
            this.tenantCursor = 0;
          }
        }

        const job = this.jobs.get(jobId);
        if (job) {
          // If job was cancelled while queued, skip it
          if (job.isCancelled || job.state === "CANCELLED") {
            continue;
          }

          job.state = "RUNNING";
          job.startedAt = job.startedAt || new Date();
          job.lastHeartbeat = new Date();
          return job;
        }
      }
    }

    return null;
  }

  /**
   * Schedule a job for retry after backoff delay.
   */
  async scheduleRetry(jobId: string, delayMs: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.isCancelled) {
      job.state = "CANCELLED";
      return;
    }

    job.state = "RETRYING";
    const runAt = Date.now() + delayMs;
    this.scheduledRetries.set(jobId, { jobId, runAt });

    logger.info("Job scheduled for retry with backoff", {
      jobId,
      jobType: job.type,
      organizationId: job.organizationId,
      attempt: job.attempts,
      delayMs,
      runAt: new Date(runAt).toISOString(),
    });
  }

  private pollScheduledRetries(): void {
    const now = Date.now();
    for (const [jobId, item] of this.scheduledRetries.entries()) {
      if (item.runAt <= now) {
        this.scheduledRetries.delete(jobId);
        const job = this.jobs.get(jobId);
        if (job && !job.isCancelled && job.state === "RETRYING") {
          job.state = "QUEUED";
          this.addToTenantLane(job.organizationId, jobId);
        }
      }
    }
  }

  /**
   * Cancels a job. If queued/retrying, cancels immediately. If running, flags cancellation.
   */
  async cancelJob(jobId: string, reason = "User requested cancellation"): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.state === "SUCCEEDED" || job.state === "FAILED" || job.state === "CANCELLED") {
      return false; // Terminal states cannot be cancelled
    }

    job.isCancelled = true;
    job.cancellationReason = reason;

    if (job.state === "QUEUED" || job.state === "RETRYING") {
      job.state = "CANCELLED";
      job.completedAt = new Date();

      // Remove from tenant lane if present
      const lane = this.tenantLanes.get(job.organizationId);
      if (lane) {
        const idx = lane.indexOf(jobId);
        if (idx !== -1) lane.splice(idx, 1);
        if (lane.length === 0) {
          this.tenantLanes.delete(job.organizationId);
          this.tenantOrder = this.tenantOrder.filter((id) => id !== job.organizationId);
        }
      }

      this.scheduledRetries.delete(jobId);
    }

    logger.info("Job cancelled", {
      jobId,
      state: job.state,
      reason,
      organizationId: job.organizationId,
    });

    return true;
  }

  /**
   * Updates progress percentage (0 - 100).
   */
  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.progress = Math.min(100, Math.max(0, Math.round(progress)));
    job.lastHeartbeat = new Date();
  }

  /**
   * Retrieves single job by ID.
   */
  async getJob(jobId: string): Promise<Job | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  /**
   * Exposes canonical telemetry record for a job.
   */
  async getTelemetry(jobId: string): Promise<JobTelemetry | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    let duration = 0;
    if (job.startedAt) {
      const end = job.completedAt || new Date();
      duration = Math.max(0, end.getTime() - job.startedAt.getTime());
    }

    return {
      jobId: job.id,
      type: job.type,
      organizationId: job.organizationId,
      started: job.startedAt ? job.startedAt.toISOString() : null,
      duration,
      progress: job.progress,
      attempts: job.attempts,
      currentState: job.state,
      errors: [...job.errors],
    };
  }

  /**
   * Lists jobs matching optional filters.
   */
  async listJobs(filter?: {
    organizationId?: string;
    state?: JobState;
    type?: string;
  }): Promise<Job[]> {
    this.pollScheduledRetries();
    const results: Job[] = [];

    for (const job of this.jobs.values()) {
      if (filter?.organizationId && job.organizationId !== filter.organizationId) continue;
      if (filter?.state && job.state !== filter.state) continue;
      if (filter?.type && job.type !== filter.type) continue;
      results.push({ ...job });
    }

    return results.sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime());
  }

  /**
   * Returns high-level queue metrics across all states.
   */
  async getQueueMetrics(): Promise<QueueMetrics> {
    this.pollScheduledRetries();
    let queued = 0;
    let running = 0;
    let succeeded = 0;
    let partial = 0;
    let retrying = 0;
    let failed = 0;
    let cancelled = 0;

    for (const job of this.jobs.values()) {
      switch (job.state) {
        case "QUEUED":
          queued++;
          break;
        case "RUNNING":
          running++;
          break;
        case "SUCCEEDED":
          succeeded++;
          break;
        case "PARTIAL":
          partial++;
          break;
        case "RETRYING":
          retrying++;
          break;
        case "FAILED":
          failed++;
          break;
        case "CANCELLED":
          cancelled++;
          break;
      }
    }

    return {
      totalEnqueued: this.jobs.size,
      queued,
      running,
      succeeded,
      partial,
      retrying,
      failed,
      cancelled,
      dlqCount: this.deadLetterQueue.size(),
      activeTenantsCount: this.tenantLanes.size,
    };
  }
}
