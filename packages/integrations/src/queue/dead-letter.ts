/**
 * Dead-Letter Queue (DLQ) Implementation
 * Canonical Specification: Prompt 11 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Captures exhausted failed jobs for operational inspection, analysis, and manual retry.
 */

import { Job, DeadLetterJob } from "./types.js";
import { createLogger } from "@platform/observability";

const logger = createLogger("dead-letter-queue");

export class DeadLetterQueue {
  private deadLetterJobs = new Map<string, DeadLetterJob>();

  /**
   * Pushes an exhausted failed job into the DLQ.
   */
  async push(job: Job, finalError: Error): Promise<void> {
    const entry: DeadLetterJob = {
      job: { ...job },
      failedAt: new Date(),
      finalError: {
        message: finalError.message,
        stack: finalError.stack,
      },
    };

    this.deadLetterJobs.set(job.id, entry);

    logger.error("Job moved to Dead-Letter Queue (DLQ)", {
      jobId: job.id,
      jobType: job.type,
      organizationId: job.organizationId,
      attempts: job.attempts,
      maxAttempts: job.options.maxAttempts,
      error: finalError.message,
    });
  }

  /**
   * Retrieves a single DLQ job by ID.
   */
  async get(jobId: string): Promise<DeadLetterJob | null> {
    const entry = this.deadLetterJobs.get(jobId);
    return entry ? { ...entry } : null;
  }

  /**
   * Lists jobs in the DLQ, optionally filtered by organization.
   */
  async list(organizationId?: string): Promise<DeadLetterJob[]> {
    const results: DeadLetterJob[] = [];
    for (const entry of this.deadLetterJobs.values()) {
      if (!organizationId || entry.job.organizationId === organizationId) {
        results.push({ ...entry });
      }
    }
    return results.sort((a, b) => b.failedAt.getTime() - a.failedAt.getTime());
  }

  /**
   * Removes a job from the DLQ.
   */
  async remove(jobId: string): Promise<boolean> {
    return this.deadLetterJobs.delete(jobId);
  }

  /**
   * Returns total count of dead-letter jobs.
   */
  size(): number {
    return this.deadLetterJobs.size;
  }

  /**
   * Purges DLQ entries, optionally scoped to an organization.
   */
  async purge(organizationId?: string): Promise<number> {
    if (!organizationId) {
      const count = this.deadLetterJobs.size;
      this.deadLetterJobs.clear();
      return count;
    }

    let purgedCount = 0;
    for (const [id, entry] of this.deadLetterJobs.entries()) {
      if (entry.job.organizationId === organizationId) {
        this.deadLetterJobs.delete(id);
        purgedCount++;
      }
    }
    return purgedCount;
  }
}
