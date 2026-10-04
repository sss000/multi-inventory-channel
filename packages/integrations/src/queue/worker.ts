/**
 * Asynchronous Job Worker & Execution Engine
 * Canonical Specification: Section 142, 143 of 01_ENGINEERING_SPEC.md & Prompt 11
 * 
 * Rules:
 * 1. Executes jobs from fair queue across registered handlers.
 * 2. Employs exponential backoff with jitter on retries.
 * 3. Enforces retry limits and routes dead letters to DLQ.
 * 4. Provides worker restart and crash recovery for orphaned in-flight jobs.
 * 5. Structured logging with OpenTelemetry compatibility.
 */

import {
  Job,
  JobHandler,
  JobExecutionContext,
} from "./types.js";
import { DurableJobQueue } from "./fair-queue.js";
import { calculateBackoffWithJitter, isRetryEligible } from "./backoff.js";
import { createLogger } from "@platform/observability";

const logger = createLogger("job-worker");

export interface WorkerOptions {
  concurrency?: number; // Number of concurrent jobs to process (default 5)
  pollIntervalMs?: number; // Polling interval when queue is idle (default 50ms)
  heartbeatIntervalMs?: number; // Heartbeat refresh frequency (default 5000ms)
}

export class JobWorker {
  private handlers = new Map<string, JobHandler>();
  private activeJobs = new Set<string>();
  private isRunning = false;
  private isStopping = false;
  private pollTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  readonly concurrency: number;
  readonly pollIntervalMs: number;
  readonly heartbeatIntervalMs: number;

  constructor(
    private readonly queue: DurableJobQueue,
    options: WorkerOptions = {}
  ) {
    this.concurrency = options.concurrency ?? 5;
    this.pollIntervalMs = options.pollIntervalMs ?? 50;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
  }

  /**
   * Registers a handler for a specific job type.
   */
  registerHandler<T = any, R = any>(type: string, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler as JobHandler);
    logger.info(`Registered handler for job type: ${type}`);
  }

  /**
   * Starts the worker dispatch loop.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isStopping = false;

    logger.info("JobWorker started", {
      concurrency: this.concurrency,
      registeredHandlers: Array.from(this.handlers.keys()),
    });

    // Start background heartbeats for active jobs
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      for (const jobId of this.activeJobs) {
        this.queue.getJob(jobId).then((j) => {
          if (j && j.state === "RUNNING") {
            j.lastHeartbeat = now;
          }
        });
      }
    }, this.heartbeatIntervalMs);

    // Initial worker pump
    this.pump();
  }

  /**
   * Continuous dispatch loop processing jobs up to configured concurrency.
   */
  private async pump(): Promise<void> {
    if (!this.isRunning || this.isStopping) return;

    while (this.isRunning && !this.isStopping && this.activeJobs.size < this.concurrency) {
      const job = await this.queue.dequeueNextFairJob();
      if (!job) {
        break; // Queue is idle
      }

      this.activeJobs.add(job.id);
      this.executeJob(job).finally(() => {
        this.activeJobs.delete(job.id);
        if (this.isRunning && !this.isStopping) {
          this.pump();
        }
      });
    }

    // Schedule next pump poll if running
    if (this.isRunning && !this.isStopping) {
      this.pollTimeout = setTimeout(() => this.pump(), this.pollIntervalMs);
    }
  }

  /**
   * Executes a single job through its lifecycle.
   */
  private async executeJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);

    logger.info("Job execution started", {
      jobId: job.id,
      jobType: job.type,
      organizationId: job.organizationId,
      attempt: job.attempts + 1,
    });

    if (!handler) {
      const err = new Error(`No registered handler found for job type '${job.type}'.`);
      await this.handleJobFailure(job, err);
      return;
    }

    job.attempts++;
    job.startedAt = job.startedAt || new Date();
    job.lastHeartbeat = new Date();

    const context: JobExecutionContext = {
      updateProgress: async (progress: number) => {
        await this.queue.updateJobProgress(job.id, progress);
      },
      isCancelled: () => job.isCancelled,
    };

    try {
      if (job.isCancelled) {
        job.state = "CANCELLED";
        job.completedAt = new Date();
        logger.info("Job cancelled prior to handler execution", { jobId: job.id });
        return;
      }

      const result = await handler(job, context);

      if (job.isCancelled) {
        job.state = "CANCELLED";
        job.completedAt = new Date();
        return;
      }

      // Check if handler specified PARTIAL outcome
      if (result && typeof result === "object" && (result as any).isPartial === true) {
        job.state = "PARTIAL";
      } else {
        job.state = "SUCCEEDED";
        job.progress = 100;
      }

      job.completedAt = new Date();

      logger.info(`Job completed with state ${job.state}`, {
        jobId: job.id,
        jobType: job.type,
        organizationId: job.organizationId,
        durationMs: job.completedAt.getTime() - job.startedAt.getTime(),
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.handleJobFailure(job, error);
    }
  }

  /**
   * Handles failure, backoff retry scheduling, or dead-letter routing.
   */
  private async handleJobFailure(job: Job, error: Error): Promise<void> {
    const now = new Date();
    job.errors.push({
      message: error.message,
      stack: error.stack,
      attempt: job.attempts,
      timestamp: now.toISOString(),
    });

    const eligible = isRetryEligible(job.attempts, job.options.maxAttempts);

    if (eligible && !job.isCancelled) {
      const delayMs = calculateBackoffWithJitter(job.attempts, {
        initialDelayMs: job.options.backoffInitialMs,
        multiplier: job.options.backoffMultiplier,
        jitterFactor: job.options.jitterFactor,
      });

      await this.queue.scheduleRetry(job.id, delayMs);

      logger.warn("Job execution failed; retry scheduled", {
        jobId: job.id,
        jobType: job.type,
        organizationId: job.organizationId,
        attempt: job.attempts,
        maxAttempts: job.options.maxAttempts,
        nextRetryDelayMs: delayMs,
        error: error.message,
      });
    } else {
      job.state = "FAILED";
      job.completedAt = now;

      // Push to Dead-Letter Queue
      await this.queue.getDeadLetterQueue().push(job, error);

      logger.error("Job permanently failed; sent to DLQ", {
        jobId: job.id,
        jobType: job.type,
        organizationId: job.organizationId,
        totalAttempts: job.attempts,
        error: error.message,
      });
    }
  }

  /**
   * Recovers orphaned running jobs from crashed or restarted worker instances.
   * Canonical Specification: Prompt 11 ("Test worker restart/recovery behavior")
   */
  async recoverOrphanedJobs(staleThresholdMs = 30000): Promise<Job[]> {
    const runningJobs = await this.queue.listJobs({ state: "RUNNING" });
    const now = Date.now();
    const recovered: Job[] = [];

    for (const job of runningJobs) {
      const lastPing = job.lastHeartbeat ? job.lastHeartbeat.getTime() : job.startedAt?.getTime() ?? 0;
      const isOrphaned = now - lastPing >= staleThresholdMs || !this.activeJobs.has(job.id);

      if (isOrphaned) {
        logger.warn("Worker recovering orphaned in-flight job", {
          jobId: job.id,
          jobType: job.type,
          organizationId: job.organizationId,
          attempt: job.attempts,
        });

        // Record recovery error note
        job.errors.push({
          message: "Worker recovered orphaned in-flight job after restart or timeout.",
          timestamp: new Date().toISOString(),
          attempt: job.attempts,
        });

        if (job.attempts >= job.options.maxAttempts) {
          job.state = "FAILED";
          job.completedAt = new Date();
          await this.queue.getDeadLetterQueue().push(
            job,
            new Error("Job exhausted max attempts while orphaned across worker restart.")
          );
        } else {
          // Re-schedule for retry or re-enqueue
          const delayMs = calculateBackoffWithJitter(job.attempts, {
            initialDelayMs: job.options.backoffInitialMs,
            multiplier: job.options.backoffMultiplier,
            jitterFactor: job.options.jitterFactor,
          });
          await this.queue.scheduleRetry(job.id, delayMs);
        }

        recovered.push(job);
      }
    }

    return recovered;
  }

  /**
   * Graceful worker stop.
   */
  async stop(timeoutMs = 5000): Promise<void> {
    if (!this.isRunning) return;
    this.isStopping = true;

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    logger.info("JobWorker stopping gracefully; draining active jobs...", {
      activeJobsCount: this.activeJobs.size,
    });

    const start = Date.now();
    while (this.activeJobs.size > 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 50));
    }

    this.isRunning = false;
    this.isStopping = false;

    logger.info("JobWorker stopped gracefully.", {
      remainingActive: this.activeJobs.size,
    });
  }

  getActiveJobsCount(): number {
    return this.activeJobs.size;
  }

  getStatus(): { isRunning: boolean; activeJobsCount: number } {
    return {
      isRunning: this.isRunning,
      activeJobsCount: this.activeJobs.size,
    };
  }
}
