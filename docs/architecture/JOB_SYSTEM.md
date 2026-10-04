# Asynchronous Job System Architecture & Resilience Design

## 1. Overview & Authority
The Asynchronous Job System is the platform's durable execution engine for long-running, asynchronous, and scheduled workloads (inventory synchronizations, reconciliation sweeps, order ingestions, webhook dispatches, and channel feed exports).

**Governing Specifications:**
- `specifications/01_ENGINEERING_SPEC.md` (Sections 20, 21, 22, 23)
- `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md` (Prompt 11: Phase 10 — Job System)
- Current Canonical Lifecycle State: `VERIFIED`

---

## 2. Canonical Job States & Lifecycle
Jobs transition through seven canonical states defined in contracts (`JobStateSchema`):

```
       [QUEUED]
          │
          ▼
      [RUNNING] ─────────────► [CANCELLED] (cooperative or immediate)
       │  │  │
       │  │  └───────────────► [PARTIAL]   (some items synced, non-fatal)
       │  ▼
       │ [SUCCEEDED]
       ▼
 [RETRYING] (backoff + jitter)
       │
       ▼ (attempts >= maxAttempts)
    [FAILED] ────────► [DEAD-LETTER QUEUE (DLQ)]
```

1. **QUEUED**: Awaiting dispatch in tenant queue lanes.
2. **RUNNING**: Actively being processed by a worker thread/process. Worker updates heartbeat periodically.
3. **SUCCEEDED**: Completed without error; duration and execution telemetry recorded.
4. **PARTIAL**: Non-fatal partial completion (e.g. batch item synchronization where some items had recoverable channel warnings).
5. **RETRYING**: Failed a transient attempt; scheduled for execution after exponential backoff + uniform jitter delay.
6. **FAILED**: Exhausted maximum retry attempts or suffered an unrecoverable non-retryable error; moved to DLQ.
7. **CANCELLED**: Terminated before or during execution via explicit cancellation request.

---

## 3. Tenant-Aware Fair Scheduling (Monopoly Prevention Gate)

### Problem Definition
In high-volume multichannel platforms, enterprise merchants may submit bulk operations (e.g. 50,000 product feed syncs) that saturate worker capacity. Standard FIFO queues cause severe starvation for lower-volume tenants whose webhook orders or urgent updates become blocked.

### Solution: Deficit Round-Robin Multi-Tenant Queue
The `DurableJobQueue` partitions pending workloads into isolated per-tenant queues (`Map<string, Job[]>`) and rotates through active tenants:

1. **Fair Rotation**: When a worker requests the next job, the queue dispatches from the next active tenant in circular order.
2. **Priority Ordering Within Lanes**: Within each tenant lane, jobs are ordered by priority (1 to 10, highest first) and FIFO arrival time.
3. **Guaranteed Progress**: A merchant enqueuing 10,000 tasks receives exactly proportional worker concurrency, preventing any single tenant from starving others.

---

## 4. Exponential Backoff with Uniform Random Jitter

To prevent thundering herd spikes against external channel APIs (Shopify REST/GraphQL, Amazon SP-API, eBay REST, Walmart Marketplace API), retry backoffs are computed using truncated exponential backoff with full jitter:

$$\text{delay} = \min(\text{maxDelay}, \text{initialDelay} \times \text{multiplier}^{\text{attempt}-1}) + \text{jitter}$$

where $\text{jitter} \sim \text{Uniform}(0, \text{jitterMax})$.

- Default configuration:
  - `initialDelayMs`: 1,000ms
  - `maxDelayMs`: 300,000ms (5 minutes)
  - `backoffMultiplier`: 2.0
  - `jitter`: True

---

## 5. Worker Crash & Restart Recovery Gate

If a worker process crashes, is killed by an OOM killer, or terminates during an unexpected VM reboot:

1. **Orphan Detection**: On worker startup, `JobWorker.recoverOrphanedJobs()` scans the queue for jobs trapped in the `RUNNING` state.
2. **Heartbeat Evaluation**: Any running job whose heartbeat timestamp exceeds the stale threshold (`staleThresholdMs`, default 60s) is considered orphaned.
3. **Safe Recovery**:
   - The job's attempt counter is incremented.
   - Structured audit warning is emitted with error: `"Worker crashed or restarted while job was in RUNNING state"`.
   - If `attempts < maxAttempts`, the job is scheduled for retry with exponential backoff.
   - If `attempts >= maxAttempts`, the job is immediately routed to the Dead-Letter Queue (DLQ).

---

## 6. Dead-Letter Queue (DLQ) & Operator Remediation

When a job reaches terminal failure:
- The job payload, full error history, stack trace, and final context are preserved indefinitely in the `DeadLetterQueue`.
- Operators can inspect DLQ items filtered by `organizationId`, date range, or job type.
- Purge and replay controls allow reprocessing after external provider outages are resolved.

---

## 7. Metrics & Observability
The Job Worker integrates with the platform's OpenTelemetry and structured logging:
- `jobs_enqueued_total`, `jobs_completed_total`, `jobs_failed_total`, `jobs_retried_total`, `jobs_cancelled_total`.
- `job_duration_ms` histograms tagged by `job_type` and `tenant_id`.
- Worker health endpoints expose real-time queue depth, active concurrent executions, and registered handlers.
