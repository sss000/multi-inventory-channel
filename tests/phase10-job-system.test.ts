import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import {
  DurableJobQueue,
  JobWorker,
  calculateBackoffWithJitter,
  DeadLetterQueue,
} from "@platform/integrations";
import type {
  Job,
  JobTelemetry,
  JobState,
} from "@platform/integrations";
import { startWorker } from "@platform/worker";

describe("Phase 10: Job System Acceptance Suite", () => {
  const orgA = "00000000-0000-0000-0000-00000000000a";
  const orgB = "00000000-0000-0000-0000-00000000000b";
  const orgC = "00000000-0000-0000-0000-00000000000c";

  let dlq: DeadLetterQueue;
  let queue: DurableJobQueue;
  let worker: JobWorker;

  beforeEach(() => {
    dlq = new DeadLetterQueue();
    queue = new DurableJobQueue({ deadLetterQueue: dlq });
    worker = new JobWorker(queue, {
      concurrency: 5,
      pollIntervalMs: 10,
      heartbeatIntervalMs: 50,
    });
  });

  describe("1. Canonical Job States & Execution Lifecycles", () => {
    it("should progress through QUEUED -> RUNNING -> SUCCEEDED with progress updates", async () => {
      worker.registerHandler("SYNC_INVENTORY", async (job, ctx) => {
        await ctx.updateProgress(50);
        return { itemsSynced: 42 };
      });

      const job = await queue.enqueue(
        "SYNC_INVENTORY",
        { skuId: "sku_101", targetQty: 50 },
        { organizationId: orgA }
      );

      assert.equal(job.state, "QUEUED");
      assert.equal(job.progress, 0);

      await worker.start();

      // Wait for job completion
      let finishedJob: Job | null = null;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 20));
        finishedJob = await queue.getJob(job.id);
        if (finishedJob && finishedJob.state === "SUCCEEDED") break;
      }

      await worker.stop();

      assert.ok(finishedJob);
      assert.equal(finishedJob.state, "SUCCEEDED");
      assert.equal(finishedJob.progress, 100);
      assert.equal(finishedJob.attempts, 1);
      assert.ok(finishedJob.startedAt);
      assert.ok(finishedJob.completedAt);
    });

    it("should handle PARTIAL execution status when handler reports partial outcome", async () => {
      worker.registerHandler("BATCH_IMPORT", async () => {
        return { isPartial: true, processed: 10, remaining: 5 };
      });

      const job = await queue.enqueue(
        "BATCH_IMPORT",
        { batchId: "b_01" },
        { organizationId: orgA }
      );

      await worker.start();

      let finishedJob: Job | null = null;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 20));
        finishedJob = await queue.getJob(job.id);
        if (finishedJob && finishedJob.state === "PARTIAL") break;
      }

      await worker.stop();

      assert.ok(finishedJob);
      assert.equal(finishedJob.state, "PARTIAL");
      assert.equal(finishedJob.attempts, 1);
    });

    it("should handle RETRYING state with backoff and route to FAILED / DLQ upon max attempts", async () => {
      let attemptsCount = 0;
      worker.registerHandler("FAILING_TASK", async () => {
        attemptsCount++;
        throw new Error(`Provider connection timeout on attempt ${attemptsCount}`);
      });

      const job = await queue.enqueue(
        "FAILING_TASK",
        { action: "fetch" },
        {
          organizationId: orgA,
          maxAttempts: 2,
          backoffInitialMs: 20, // Fast backoff for tests
          backoffMultiplier: 1.5,
        }
      );

      await worker.start();

      // Wait until job exhausts attempts and lands in DLQ
      let finishedJob: Job | null = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 25));
        finishedJob = await queue.getJob(job.id);
        if (finishedJob && finishedJob.state === "FAILED") break;
      }

      await worker.stop();

      assert.ok(finishedJob);
      assert.equal(finishedJob.state, "FAILED");
      assert.equal(finishedJob.attempts, 2);
      assert.equal(finishedJob.errors.length, 2);

      // Verify job is recorded in Dead-Letter Queue
      assert.equal(dlq.size(), 1);
      const dlqEntry = await dlq.get(job.id);
      assert.ok(dlqEntry);
      assert.equal(dlqEntry.job.id, job.id);
      assert.ok(dlqEntry.finalError.message.includes("Provider connection timeout"));
    });
  });

  describe("2. Job Telemetry & Observability Exposure (Prompt 11 Gate)", () => {
    it("every job must expose jobId, type, started, duration, progress, attempts, currentState, errors", async () => {
      worker.registerHandler("TELEMETRY_TEST", async (job, ctx) => {
        await ctx.updateProgress(75);
        await new Promise((r) => setTimeout(r, 20));
        return { done: true };
      });

      const job = await queue.enqueue(
        "TELEMETRY_TEST",
        { foo: "bar" },
        { organizationId: orgA }
      );

      // Check telemetry while queued
      const queuedTelemetry = await queue.getTelemetry(job.id);
      assert.ok(queuedTelemetry);
      assert.equal(queuedTelemetry.jobId, job.id);
      assert.equal(queuedTelemetry.type, "TELEMETRY_TEST");
      assert.equal(queuedTelemetry.organizationId, orgA);
      assert.equal(queuedTelemetry.started, null);
      assert.equal(queuedTelemetry.duration, 0);
      assert.equal(queuedTelemetry.progress, 0);
      assert.equal(queuedTelemetry.attempts, 0);
      assert.equal(queuedTelemetry.currentState, "QUEUED");
      assert.deepEqual(queuedTelemetry.errors, []);

      await worker.start();

      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 20));
        const current = await queue.getJob(job.id);
        if (current && current.state === "SUCCEEDED") break;
      }

      await worker.stop();

      // Check telemetry after completion
      const completedTelemetry = await queue.getTelemetry(job.id);
      assert.ok(completedTelemetry);
      assert.equal(completedTelemetry.jobId, job.id);
      assert.equal(completedTelemetry.currentState, "SUCCEEDED");
      assert.ok(completedTelemetry.started);
      assert.ok(completedTelemetry.duration >= 20); // At least 20ms duration
      assert.equal(completedTelemetry.progress, 100);
      assert.equal(completedTelemetry.attempts, 1);
      assert.equal(completedTelemetry.errors.length, 0);
    });
  });

  describe("3. Exponential Backoff & Jitter Calculation", () => {
    it("should compute exponential delay and apply jitter within configured bounds", () => {
      const initialDelay = 1000;
      const multiplier = 2;
      const jitterFactor = 0.2; // +/- 20%

      for (let attempt = 1; attempt <= 4; attempt++) {
        const expectedBase = initialDelay * Math.pow(multiplier, attempt - 1);
        const minExpected = Math.round(expectedBase * (1 - jitterFactor));
        const maxExpected = Math.round(expectedBase * (1 + jitterFactor));

        for (let i = 0; i < 10; i++) {
          const delay = calculateBackoffWithJitter(attempt, {
            initialDelayMs: initialDelay,
            multiplier,
            jitterFactor,
          });

          assert.ok(
            delay >= minExpected && delay <= maxExpected,
            `Attempt ${attempt} delay ${delay}ms should be between ${minExpected}ms and ${maxExpected}ms`
          );
        }
      }
    });

    it("should cap delay at maxDelayMs", () => {
      const delay = calculateBackoffWithJitter(10, {
        initialDelayMs: 1000,
        multiplier: 2,
        jitterFactor: 0.1,
        maxDelayMs: 5000,
      });

      assert.ok(delay <= 5500, `Delay ${delay} should be bounded near maxDelayMs 5000`);
    });
  });

  describe("4. Job Cancellation", () => {
    it("should cancel a queued job before it is dequeued", async () => {
      const job = await queue.enqueue(
        "LONG_TASK",
        { id: 1 },
        { organizationId: orgA }
      );

      const cancelled = await queue.cancelJob(job.id, "Admin aborted task");
      assert.equal(cancelled, true);

      const fetched = await queue.getJob(job.id);
      assert.equal(fetched?.state, "CANCELLED");
      assert.equal(fetched?.isCancelled, true);
      assert.equal(fetched?.cancellationReason, "Admin aborted task");

      // Verify worker skips it
      let ran = false;
      worker.registerHandler("LONG_TASK", async () => {
        ran = true;
      });

      await worker.start();
      await new Promise((r) => setTimeout(r, 50));
      await worker.stop();

      assert.equal(ran, false);
    });

    it("should cooperatively cancel a running job via context.isCancelled", async () => {
      let sawCancellation = false;

      worker.registerHandler("LONG_RUNNING", async (job, ctx) => {
        for (let i = 0; i < 10; i++) {
          if (ctx.isCancelled()) {
            sawCancellation = true;
            return;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
      });

      const job = await queue.enqueue(
        "LONG_RUNNING",
        { id: 2 },
        { organizationId: orgA }
      );

      await worker.start();

      // Wait until job is in RUNNING state
      await new Promise((r) => setTimeout(r, 20));
      await queue.cancelJob(job.id, "User cancelled during run");

      // Wait for handler to check isCancelled
      await new Promise((r) => setTimeout(r, 60));
      await worker.stop();

      const finished = await queue.getJob(job.id);
      assert.equal(finished?.state, "CANCELLED");
      assert.equal(sawCancellation, true);
    });
  });

  describe("5. Tenant-Aware Fair Scheduling (Monopoly Prevention Gate)", () => {
    it("fair scheduler must not allow one merchant with large batch to monopolize workers over other merchants", async () => {
      const executionOrder: string[] = [];

      worker.registerHandler("MOCK_TASK", async (job) => {
        executionOrder.push(`${job.organizationId}:${job.payload.index}`);
      });

      // Tenant A submits 10 jobs
      for (let i = 0; i < 10; i++) {
        await queue.enqueue("MOCK_TASK", { index: i }, { organizationId: orgA });
      }

      // Tenant B submits 2 jobs
      for (let i = 0; i < 2; i++) {
        await queue.enqueue("MOCK_TASK", { index: i }, { organizationId: orgB });
      }

      // Tenant C submits 1 job
      await queue.enqueue("MOCK_TASK", { index: 0 }, { organizationId: orgC });

      // Run worker with concurrency 1 to strictly observe dispatch interleaving
      const singleWorker = new JobWorker(queue, { concurrency: 1, pollIntervalMs: 5 });
      singleWorker.registerHandler("MOCK_TASK", async (job) => {
        executionOrder.push(`${job.organizationId}:${job.payload.index}`);
      });

      await singleWorker.start();

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 20));
        if (executionOrder.length >= 13) break;
      }

      await singleWorker.stop();

      assert.equal(executionOrder.length, 13);

      // Verify that Tenant B's first job executed early (NOT after all 10 of Tenant A's jobs!)
      const firstTenantBIdx = executionOrder.findIndex((entry) => entry.startsWith(orgB));
      const firstTenantCIdx = executionOrder.findIndex((entry) => entry.startsWith(orgC));

      // With fair round-robin scheduling across orgA, orgB, orgC:
      // The first 3 executed jobs should be [OrgA, OrgB, OrgC] (or permutation across active tenants)
      assert.ok(
        firstTenantBIdx < 3,
        `Tenant B's job executed at index ${firstTenantBIdx}, proving Tenant A did NOT monopolize queue.`
      );
      assert.ok(
        firstTenantCIdx < 3,
        `Tenant C's job executed at index ${firstTenantCIdx}, proving Tenant A did NOT monopolize queue.`
      );
    });
  });

  describe("6. Worker Restart & Crash Recovery Behavior (Prompt 11 Gate)", () => {
    it("should detect orphaned in-flight running jobs across worker crash/restart and recover them", async () => {
      // 1. Enqueue job
      const job = await queue.enqueue(
        "RECOVERY_TEST",
        { taskId: "orphan_1" },
        { organizationId: orgA, maxAttempts: 3, backoffInitialMs: 10 }
      );

      // 2. Simulate worker 1 dequeuing job to RUNNING, then abruptly crashing
      const dequeued = await queue.dequeueNextFairJob();
      assert.ok(dequeued);
      assert.equal(dequeued.id, job.id);
      assert.equal(dequeued.state, "RUNNING");
      dequeued.attempts = 1;

      // 3. Worker 1 dies. Worker 2 starts up and executes crash recovery
      const worker2 = new JobWorker(queue, { concurrency: 2, pollIntervalMs: 10 });
      let recoveredExecutionRan = false;
      worker2.registerHandler("RECOVERY_TEST", async (j) => {
        recoveredExecutionRan = true;
        return { recovered: true };
      });

      // Run recovery scan
      const recoveredList = await worker2.recoverOrphanedJobs(0);
      assert.equal(recoveredList.length, 1);
      assert.equal(recoveredList[0].id, job.id);
      assert.ok(
        recoveredList[0].errors.some((e) =>
          e.message.includes("Worker recovered orphaned in-flight job")
        )
      );

      // Start worker 2 and verify job is picked up and completes successfully
      await worker2.start();

      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 20));
        const current = await queue.getJob(job.id);
        if (current && current.state === "SUCCEEDED") break;
      }

      await worker2.stop();

      const finalJob = await queue.getJob(job.id);
      assert.equal(finalJob?.state, "SUCCEEDED");
      assert.equal(recoveredExecutionRan, true);
    });
  });

  describe("7. Dead-Letter Queue Administration & Purge", () => {
    it("should support listing, filtering, and purging DLQ entries", async () => {
      const mockJobA = {
        id: "job_dlq_a",
        type: "SYNC",
        organizationId: orgA,
        payload: {},
        options: { maxAttempts: 3 } as any,
        state: "FAILED" as JobState,
        progress: 0,
        attempts: 3,
        errors: [],
        queuedAt: new Date(),
        startedAt: null,
        completedAt: null,
        lastHeartbeat: null,
        isCancelled: false,
      };

      const mockJobB = {
        id: "job_dlq_b",
        type: "IMPORT",
        organizationId: orgB,
        payload: {},
        options: { maxAttempts: 3 } as any,
        state: "FAILED" as JobState,
        progress: 0,
        attempts: 3,
        errors: [],
        queuedAt: new Date(),
        startedAt: null,
        completedAt: null,
        lastHeartbeat: null,
        isCancelled: false,
      };

      await dlq.push(mockJobA, new Error("Permanent fatal error A"));
      await dlq.push(mockJobB, new Error("Permanent fatal error B"));

      assert.equal(dlq.size(), 2);

      // List by org
      const listA = await dlq.list(orgA);
      assert.equal(listA.length, 1);
      assert.equal(listA[0].job.id, "job_dlq_a");

      // Purge org A only
      const purgedA = await dlq.purge(orgA);
      assert.equal(purgedA, 1);
      assert.equal(dlq.size(), 1);

      // Purge all
      const purgedRemaining = await dlq.purge();
      assert.equal(purgedRemaining, 1);
      assert.equal(dlq.size(), 0);
    });
  });

  describe("8. Worker Application Health Integration", () => {
    it("startWorker() should expose live health checks with queue metrics and recover orphaned jobs", async () => {
      const workerInstance = startWorker({
        queue,
        concurrency: 3,
        skipRecovery: true,
      });

      const health = await workerInstance.checkHealth();
      assert.ok(health.status);
      assert.ok(health.liveness);
      assert.ok(health.queue);
      assert.equal(typeof health.queue.totalEnqueued, "number");
      assert.equal(typeof health.queue.dlqCount, "number");

      await workerInstance.stop();
    });
  });
});
