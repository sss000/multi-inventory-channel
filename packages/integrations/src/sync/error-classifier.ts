/**
 * Synchronization Error Classifier
 * Canonical Specification: Section 25 of 01_ENGINEERING_SPEC.md & Prompt 12
 * 
 * Classifies raw channel errors, HTTP response codes, and network exceptions into the
 * 7 canonical categories:
 * - TRANSIENT
 * - RATE_LIMIT
 * - AUTHENTICATION
 * - VALIDATION
 * - NOT_FOUND
 * - CONFLICT
 * - UNKNOWN
 */

import { SyncErrorClassification } from "@platform/domain";

export interface ClassifiedSyncError {
  classification: SyncErrorClassification;
  isRetryable: boolean;
  suggestedDelayMs?: number;
  message: string;
  code: string;
  httpStatus?: number;
}

export interface ErrorClassificationContext {
  httpStatus?: number;
  errorCode?: string;
  retryAfterMs?: number;
  retryAfterHeader?: string | number;
}

/**
 * Parses a retry-after header value (seconds or HTTP date string) into milliseconds.
 */
export function parseRetryAfterHeader(header?: string | number): number | undefined {
  if (header === undefined || header === null) return undefined;
  if (typeof header === "number") {
    return Math.max(0, header * 1000);
  }
  const numeric = parseInt(header, 10);
  if (!isNaN(numeric)) {
    return Math.max(0, numeric * 1000);
  }
  const dateParsed = Date.parse(header);
  if (!isNaN(dateParsed)) {
    const diff = dateParsed - Date.now();
    return Math.max(0, diff);
  }
  return undefined;
}

/**
 * Classifies an arbitrary caught error or error payload into canonical sync classifications.
 */
export function classifySyncError(
  error: unknown,
  context: ErrorClassificationContext = {}
): ClassifiedSyncError {
  let message = "Unknown synchronization error";
  let extractedCode = context.errorCode;
  let status = context.httpStatus;
  let explicitClassification: SyncErrorClassification | undefined;

  if (error instanceof Error) {
    message = error.message;
    // Check common error properties
    const errAny = error as unknown as Record<string, unknown>;
    if (typeof errAny.code === "string") extractedCode = errAny.code;
    if (typeof errAny.originalCode === "string") extractedCode = errAny.originalCode;
    if (typeof errAny.status === "number") status = errAny.status;
    if (typeof errAny.statusCode === "number") status = errAny.statusCode;
    if (typeof errAny.httpStatus === "number") status = errAny.httpStatus;
    if (typeof errAny.retryAfterMs === "number" && context.retryAfterMs === undefined) {
      context.retryAfterMs = errAny.retryAfterMs;
    }
    if (typeof errAny.classification === "string") {
      explicitClassification = errAny.classification as SyncErrorClassification;
    }
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object") {
    const errAny = error as Record<string, unknown>;
    if (typeof errAny.message === "string") message = errAny.message;
    if (typeof errAny.error === "string") message = errAny.error;
    if (typeof errAny.code === "string") extractedCode = errAny.code;
    if (typeof errAny.originalCode === "string") extractedCode = errAny.originalCode;
    if (typeof errAny.status === "number") status = errAny.status;
    if (typeof errAny.statusCode === "number") status = errAny.statusCode;
    if (typeof errAny.httpStatus === "number") status = errAny.httpStatus;
    if (typeof errAny.retryAfterMs === "number" && context.retryAfterMs === undefined) {
      context.retryAfterMs = errAny.retryAfterMs;
    }
    if (typeof errAny.classification === "string") {
      explicitClassification = errAny.classification as SyncErrorClassification;
    }
  }

  // If error has an explicit canonical classification from provider taxonomy, honor it directly
  if (explicitClassification === "RATE_LIMIT") {
    const delay =
      context.retryAfterMs ??
      parseRetryAfterHeader(context.retryAfterHeader) ??
      5000;
    return {
      classification: "RATE_LIMIT",
      isRetryable: true,
      suggestedDelayMs: delay,
      message,
      code: extractedCode || "RATE_LIMIT_EXCEEDED",
      httpStatus: status || 429,
    };
  }

  if (explicitClassification === "AUTHENTICATION") {
    return {
      classification: "AUTHENTICATION",
      isRetryable: false,
      message,
      code: extractedCode || "AUTHENTICATION_FAILED",
      httpStatus: status || 401,
    };
  }

  if (explicitClassification === "VALIDATION") {
    return {
      classification: "VALIDATION",
      isRetryable: false,
      message,
      code: extractedCode || "VALIDATION_FAILED",
      httpStatus: status || 422,
    };
  }

  if (explicitClassification === "NOT_FOUND") {
    return {
      classification: "NOT_FOUND",
      isRetryable: false,
      message,
      code: extractedCode || "RESOURCE_NOT_FOUND",
      httpStatus: status || 404,
    };
  }

  if (explicitClassification === "CONFLICT") {
    return {
      classification: "CONFLICT",
      isRetryable: false,
      message,
      code: extractedCode || "SYNC_CONFLICT",
      httpStatus: status || 409,
    };
  }

  if (explicitClassification === "TRANSIENT") {
    return {
      classification: "TRANSIENT",
      isRetryable: true,
      message,
      code: extractedCode || "TRANSIENT_NETWORK_ERROR",
      httpStatus: status || 503,
    };
  }

  const lowerMsg = message.toLowerCase();
  const lowerCode = (extractedCode || "").toLowerCase();

  // 1. RATE_LIMIT (HTTP 429 or throttling messages)
  if (
    status === 429 ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("throttled") ||
    lowerMsg.includes("too many requests") ||
    lowerMsg.includes("quota exceeded") ||
    lowerCode.includes("rate_limit") ||
    lowerCode.includes("throttling")
  ) {
    const delay =
      context.retryAfterMs ??
      parseRetryAfterHeader(context.retryAfterHeader) ??
      5000;

    return {
      classification: "RATE_LIMIT",
      isRetryable: true,
      suggestedDelayMs: delay,
      message,
      code: extractedCode || "RATE_LIMIT_EXCEEDED",
      httpStatus: status || 429,
    };
  }

  // 2. AUTHENTICATION (HTTP 401, 403 or invalid credentials)
  if (
    status === 401 ||
    status === 403 ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("forbidden") ||
    lowerMsg.includes("invalid token") ||
    lowerMsg.includes("token expired") ||
    lowerMsg.includes("bad credentials") ||
    lowerMsg.includes("authentication failed") ||
    lowerMsg.includes("invalid_grant") ||
    lowerMsg.includes("revoked") ||
    lowerCode.includes("auth") ||
    lowerCode.includes("unauthorized")
  ) {
    return {
      classification: "AUTHENTICATION",
      isRetryable: false, // Do not blindly retry auth errors without operator/credential action
      message,
      code: extractedCode || "AUTHENTICATION_FAILED",
      httpStatus: status || 401,
    };
  }

  // 3. VALIDATION (HTTP 400, 422 or payload constraint violations)
  if (
    status === 400 ||
    status === 422 ||
    lowerMsg.includes("validation") ||
    lowerMsg.includes("invalid parameter") ||
    lowerMsg.includes("malformed") ||
    lowerMsg.includes("out of range") ||
    lowerMsg.includes("schema violation") ||
    lowerCode.includes("validation")
  ) {
    return {
      classification: "VALIDATION",
      isRetryable: false, // Payload invalid, retrying unchanged request will not fix it
      message,
      code: extractedCode || "VALIDATION_FAILED",
      httpStatus: status || 422,
    };
  }

  // 4. NOT_FOUND (HTTP 404 or listing/SKU absent from provider)
  if (
    status === 404 ||
    lowerMsg.includes("not found") ||
    lowerMsg.includes("does not exist") ||
    lowerMsg.includes("unknown sku") ||
    lowerMsg.includes("item not found") ||
    lowerCode.includes("not_found")
  ) {
    return {
      classification: "NOT_FOUND",
      isRetryable: false, // External listing/mapping missing, requires re-mapping or catalog setup
      message,
      code: extractedCode || "RESOURCE_NOT_FOUND",
      httpStatus: status || 404,
    };
  }

  // 5. CONFLICT (HTTP 409 or concurrency / version / quantity mismatch)
  if (
    status === 409 ||
    lowerMsg.includes("conflict") ||
    lowerMsg.includes("version mismatch") ||
    lowerMsg.includes("concurrency") ||
    lowerMsg.includes("quantity mismatch") ||
    lowerCode.includes("conflict")
  ) {
    return {
      classification: "CONFLICT",
      isRetryable: false, // Discrepancy detected, triggers reconciliation
      message,
      code: extractedCode || "SYNC_CONFLICT",
      httpStatus: status || 409,
    };
  }

  // 6. TRANSIENT (HTTP 408, 500, 502, 503, 504, or network/timeout errors)
  if (
    status === 408 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    lowerCode === "etimedout" ||
    lowerCode === "econnreset" ||
    lowerCode === "econnrefused" ||
    lowerCode === "timeout" ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("network error") ||
    lowerMsg.includes("connection reset") ||
    lowerMsg.includes("gateway timeout") ||
    lowerMsg.includes("service unavailable") ||
    lowerMsg.includes("temporarily unavailable")
  ) {
    return {
      classification: "TRANSIENT",
      isRetryable: true,
      message,
      code: extractedCode || "TRANSIENT_NETWORK_ERROR",
      httpStatus: status || 503,
    };
  }

  // 7. UNKNOWN (conservative retry, then escalate)
  return {
    classification: "UNKNOWN",
    isRetryable: true,
    message,
    code: extractedCode || "UNKNOWN_ERROR",
    httpStatus: status,
  };
}
