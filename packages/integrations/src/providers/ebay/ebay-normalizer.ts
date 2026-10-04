/**
 * eBay Error Normalizer
 * Canonical Specifications: Section 25, 40 of 01_ENGINEERING_SPEC.md & Prompt 13
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
import { EbayApiError } from "./ebay-types.js";

export class EbayErrorNormalizer implements ProviderErrorNormalizer {
  readonly provider = "EBAY" as const;

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

    const message = typeof err?.message === "string" ? err.message : String(error ?? "Unknown eBay error");

    // Check eBay errors array envelope
    if (Array.isArray(err?.errors)) {
      const ebayErrors = err.errors as EbayApiError[];
      const first = ebayErrors[0];
      const errorId = first?.errorId;
      const errorMsg = first?.longMessage || first?.message || message;

      if (errorId === 10007 || errorMsg.toLowerCase().includes("call limit exceeded") || errorMsg.toLowerCase().includes("rate limit")) {
        return new ProviderRateLimitError(this.provider, errorMsg, {
          originalCode: String(errorId),
          httpStatus: 429,
          retryAfterMs: retryAfterMs ?? 1000,
          details: { ebayErrors },
        });
      }

      if (errorId === 1001 || errorId === 1002 || first?.category === "APPLICATION" && errorMsg.toLowerCase().includes("token")) {
        return new ProviderAuthenticationError(this.provider, errorMsg, {
          originalCode: String(errorId),
          httpStatus: 401,
          details: { ebayErrors },
        });
      }

      if (errorId === 25002 || errorMsg.toLowerCase().includes("not found")) {
        return new ProviderNotFoundError(this.provider, errorMsg, {
          originalCode: String(errorId),
          httpStatus: 404,
          details: { ebayErrors },
        });
      }

      if (first?.category === "REQUEST" || errorId === 25001) {
        return new ProviderValidationError(this.provider, errorMsg, {
          originalCode: String(errorId),
          httpStatus: 400,
          details: { ebayErrors },
        });
      }

      if (first?.category === "SYSTEM" || errorId === 1000) {
        return new ProviderTransientError(this.provider, errorMsg, {
          originalCode: String(errorId),
          httpStatus: 503,
          details: { ebayErrors },
        });
      }
    }

    if (httpStatus === 429 || message.toLowerCase().includes("limit exceeded")) {
      return new ProviderRateLimitError(this.provider, message, {
        originalCode: "RATE_LIMIT_EXCEEDED",
        httpStatus: 429,
        retryAfterMs: retryAfterMs ?? 1000,
      });
    }

    if (httpStatus === 401 || httpStatus === 403 || message.toLowerCase().includes("token expired") || message.toLowerCase().includes("invalid token")) {
      return new ProviderAuthenticationError(this.provider, message, {
        originalCode: "AUTH_EXPIRED",
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
        originalCode: "VALIDATION_ERROR",
        httpStatus,
      });
    }

    if ((httpStatus && httpStatus >= 500) || message.toLowerCase().includes("timeout")) {
      return new ProviderTransientError(this.provider, message, {
        originalCode: "SYSTEM_ERROR",
        httpStatus: httpStatus ?? 503,
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
