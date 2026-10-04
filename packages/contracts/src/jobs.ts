import { z } from "zod";

export const JobStateSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "PARTIAL",
  "RETRYING",
  "FAILED",
  "CANCELLED",
]);
export type JobState = z.infer<typeof JobStateSchema>;

export const JobErrorRecordSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
  attempt: z.number().int().min(1),
  stack: z.string().optional(),
});
export type JobErrorRecord = z.infer<typeof JobErrorRecordSchema>;

export const JobTelemetryDtoSchema = z.object({
  jobId: z.string(),
  type: z.string(),
  organizationId: z.string(),
  started: z.string().nullable(),
  duration: z.number().min(0),
  progress: z.number().min(0).max(100),
  attempts: z.number().int().min(0),
  currentState: JobStateSchema,
  errors: z.array(JobErrorRecordSchema),
});
export type JobTelemetryDto = z.infer<typeof JobTelemetryDtoSchema>;

export const EnqueueJobRequestSchema = z.object({
  type: z.string().min(1),
  organizationId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().min(1).max(10).default(5),
  maxAttempts: z.number().int().min(1).max(20).default(3),
  backoffInitialMs: z.number().min(0).default(1000),
  backoffMultiplier: z.number().min(1).default(2),
  idempotencyKey: z.string().optional(),
});
export type EnqueueJobRequest = z.infer<typeof EnqueueJobRequestSchema>;
