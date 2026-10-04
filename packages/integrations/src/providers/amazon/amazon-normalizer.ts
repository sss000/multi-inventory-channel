/**
 * Amazon SP-API Error Normalizer
 * Canonical Specifications: Section 25, 38 of 01_ENGINEERING_SPEC.md & Prompt 13
 */

import {
  ProviderError,
  ProviderAuthenticationError,
  ProviderRateLimitError,
  ProviderTransientError,
  ProviderValidationError,
  ProviderNotFoundError,
  ProviderConflictError,
} from "../../errors/provider-error.js";
import { ProviderErrorNormalizer, extractRetryAfterMs } from "../../errors/normalizer.js";
import { AmazonSpApiError } from "./amazon-types.js";

export class AmazonErrorNormalizer implements ProviderErrorNormalizer {
  readonly provider = "AMAZON" as const;

  normalize(error: unknown, context: Record<string, unknown> = {}): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    const err = error as Record<string, unknown> | null;
    const httpStatus = typeof err?.status === "number" ? err.status : (context.httpStatus as number | undefined);
    const retryAfterMs =
      extractRetryAfterMs(err?.retryAfter) ??
      extractRetryAfterMs(context.retryAfterHeader) ??
      (typeof context.retryAfterMs === "number" ? context.retryAfterMs : undefined);

    const message = typeof err?.message === "string" ? err.message : String(error ?? "Unknown Amazon SP-API error");

    // Check for Amazon SP-API errors envelope
    if (Array.isArray(err?.errors) && err.errors.length > 0) {
      const spErrors = err.errors as AmazonSpApiError[];
      const first = spErrors[0];
      const code = first?.code ?? "";
      const codeUpper = code.toUpperCase();
      const firstMsg = first?.message || message;

      if (codeUpper.includes("QUOTAEXCEEDED") || codeUpper.includes("REQUESTTHROTTLED")) {
        return new ProviderRateLimitError(this.provider, firstMsg || "Amazon SP-API request throttled", {
          originalCode: code,
          httpStatus: 429,
          retryAfterMs: retryAfterMs ?? 2000,
          details: { spErrors },
        });
      }

      if (codeUpper.includes("UNAUTHORIZED") || codeUpper.includes("ACCESSDENIED")) {
        return new ProviderAuthenticationError(this.provider, firstMsg || "Amazon SP-API authorization denied", {
          originalCode: code,
          httpStatus: 401,
          details: { spErrors },
        });
      }

      if (codeUpper.includes("NOTFOUND") || codeUpper.includes("INVALIDIDENTIFIER")) {
        return new ProviderNotFoundError(this.provider, firstMsg || "Amazon resource not found", {
          originalCode: code,
          httpStatus: 404,
          details: { spErrors },
        });
      }

      if (codeUpper.includes("INVALIDINPUT") || codeUpper.includes("INVALIDPARAMETER")) {
        return new ProviderValidationError(this.provider, firstMsg || "Amazon SP-API payload validation failed", {
          originalCode: code,
          httpStatus: 400,
          details: { spErrors },
        });
      }

      if (codeUpper.includes("INTERNALSERVERERROR") || codeUpper.includes("SERVICEUNAVAILABLE")) {
        return new ProviderTransientError(this.provider, firstMsg || "Amazon SP-API transient internal error", {
          originalCode: code,
          httpStatus: 503,
          details: { spErrors },
        });
      }
    }

    if (httpStatus === 429 || message.toLowerCase().includes("throttled") || message.toLowerCase().includes("quota exceeded")) {
      return new ProviderRateLimitError(this.provider, message, {
        originalCode: "REQUEST_THROTTLED",
        httpStatus: 429,
        retryAfterMs: retryAfterMs ?? 2000,
      });
    }

    if (httpStatus === 401 || httpStatus === 403 || message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("access denied")) {
      return new ProviderAuthenticationError(this.provider, message, {
        originalCode: "UNAUTHORIZED",
        httpStatus,
      });
    }

    if (httpStatus === 404) {
      return new ProviderNotFoundError(this.provider, message, {
        originalCode: "NOT_FOUND",
        httpStatus: 404,
      });
    }

    if (httpStatus === 409) {
      return new ProviderConflictError(this.provider, message, {
        originalCode: "CONFLICT",
        httpStatus: 409,
      });
    }

    if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
      return new ProviderValidationError(this.provider, message, {
        originalCode: "INVALID_INPUT",
        httpStatus,
      });
    }

    const isTimeout =
      (err as any)?.name === "AbortError" ||
      message.toLowerCase().includes("timeout") ||
      message.toLowerCase().includes("aborted") ||
      message.toLowerCase().includes("abort");

    if ((httpStatus && httpStatus >= 500) || isTimeout) {
      return new ProviderTransientError(this.provider, message, {
        originalCode: isTimeout ? "REQUEST_TIMEOUT" : "SERVER_ERROR",
        httpStatus: httpStatus ?? (isTimeout ? 408 : 503),
      });
    }

    return new ProviderError(message, {
      classification: "UNKNOWN",
      provider: this.provider,
      httpStatus,
      isRetryable: false,
    });
  }
}
