/**
 * Job System Types & Telemetry Models
 * Canonical Specification: Section 142, 143, 145 of 01_ENGINEERING_SPEC.md & Prompt 11
 */

import type { JobState } from "@platform/contracts";

export type { JobState };


export interface JobErrorRecord {
  message: string;
  timestamp: string;
  attempt: number;
  stack?: string;
}

export interface JobTelemetry {
  jobId: string;
  type: string;
  organizationId: string;
  started: string | null;
  duration: number;
  progress: number;
  attempts: number;
  currentState: JobState;
  errors: JobErrorRecord[];
}

export interface JobOptions {
  organizationId: string;
  priority?: number; // 1 (lowest) to 10 (highest), default 5
  maxAttempts?: number; // default 3
  backoffInitialMs?: number; // default 1000ms
  backoffMultiplier?: number; // default 2
  jitterFactor?: number; // default 0.2 (20% jitter)
  idempotencyKey?: string;
  correlationId?: string;
}

export interface Job<T = Record<string, unknown>> {
  id: string;
  type: string;
  organizationId: string;
  payload: T;
  options: Required<JobOptions>;
  state: JobState;
  progress: number; // 0 to 100
  attempts: number;
  errors: JobErrorRecord[];
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lastHeartbeat: Date | null;
  isCancelled: boolean;
  cancellationReason?: string;
}

export interface JobExecutionContext {
  updateProgress: (progress: number) => Promise<void>;
  isCancelled: () => boolean;
  signal?: AbortSignal;
}

export type JobHandler<T = any, R = any> = (
  job: Job<T>,
  context: JobExecutionContext
) => Promise<R>;

export interface DeadLetterJob {
  job: Job;
  failedAt: Date;
  finalError: {
    message: string;
    stack?: string;
  };
}

export interface QueueMetrics {
  totalEnqueued: number;
  queued: number;
  running: number;
  succeeded: number;
  partial: number;
  retrying: number;
  failed: number;
  cancelled: number;
  dlqCount: number;
  activeTenantsCount: number;
}
