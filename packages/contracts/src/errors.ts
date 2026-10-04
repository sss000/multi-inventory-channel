import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "TENANT_NOT_FOUND",
  "INSUFFICIENT_INVENTORY",
  "RESERVATION_EXPIRED",
  "PROVIDER_ERROR",
  "RATE_LIMITED",
  "INTERNAL_ERROR"
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export { ApiErrorEnvelopeSchema } from "./api.js";
export type { ApiErrorEnvelope } from "./api.js";
