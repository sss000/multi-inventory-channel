/**
 * Walmart Error Normalizer
 * Canonical Specifications: Section 25, 41 of 01_ENGINEERING_SPEC.md & Prompt 13
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
import { WalmartErrorItem } from "./walmart-types.js";

export class WalmartErrorNormalizer implements ProviderErrorNormalizer {
  readonly provider = "WALMART" as const;

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

    const message = typeof err?.message === "string" ? err.message : String(error ?? "Unknown Walmart error");

    // Check for Walmart errors array
    if (Array.isArray(err?.errors)) {
      const wmErrors = err.errors as WalmartErrorItem[];
      const first = wmErrors[0];
      const code = first?.code ?? "";
      const desc = first?.description || message;

      if (code.includes("429") || desc.toLowerCase().includes("rate limit") || desc.toLowerCase().includes("throttled")) {
        return new ProviderRateLimitError(this.provider, desc, {
          originalCode: code,
          httpStatus: 429,
          retryAfterMs: retryAfterMs ?? 1000,
          details: { wmErrors },
        });
      }

      if (code.includes("UNAUTHORIZED") || code.includes("401") || desc.toLowerCase().includes("unauthorized") || desc.toLowerCase().includes("signature")) {
        return new ProviderAuthenticationError(this.provider, desc, {
          originalCode: code,
          httpStatus: 401,
          details: { wmErrors },
        });
      }

      if (code.includes("NOT_FOUND") || code.includes("404") || desc.toLowerCase().includes("not found")) {
        return new ProviderNotFoundError(this.provider, desc, {
          originalCode: code,
          httpStatus: 404,
          details: { wmErrors },
        });
      }

      if (code.includes("DATA_ERROR") || code.includes("400") || desc.toLowerCase().includes("invalid")) {
        return new ProviderValidationError(this.provider, desc, {
          originalCode: code,
          httpStatus: 400,
          details: { wmErrors },
        });
      }

      if (code.includes("SYSTEM_ERROR") || code.includes("500") || code.includes("503")) {
        return new ProviderTransientError(this.provider, desc, {
          originalCode: code,
          httpStatus: 503,
          details: { wmErrors },
        });
      }
    }

    if (httpStatus === 429 || message.toLowerCase().includes("quota exceeded") || message.toLowerCase().includes("rate limit")) {
      return new ProviderRateLimitError(this.provider, message, {
        originalCode: "RATE_LIMIT",
        httpStatus: 429,
        retryAfterMs: retryAfterMs ?? 1000,
      });
    }

    if (httpStatus === 401 || httpStatus === 403 || message.toLowerCase().includes("unauthorized")) {
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
        originalCode: "INVALID_REQUEST",
        httpStatus,
      });
    }

    if ((httpStatus && httpStatus >= 500) || message.toLowerCase().includes("timeout")) {
      return new ProviderTransientError(this.provider, message, {
        originalCode: "GATEWAY_TIMEOUT",
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
