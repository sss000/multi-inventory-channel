/**
 * Shopify Error Normalizer
 * Canonical Specifications: Section 25, 36 of 01_ENGINEERING_SPEC.md & Prompt 13
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
import { ShopifyGraphQLError, ShopifyUserError } from "./shopify-types.js";

export class ShopifyErrorNormalizer implements ProviderErrorNormalizer {
  readonly provider = "SHOPIFY" as const;

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

    const message = typeof err?.message === "string" ? err.message : String(error ?? "Unknown Shopify error");

    // 1. Check for GraphQL Errors payload
    if (Array.isArray(err?.errors)) {
      const gqlErrors = err.errors as ShopifyGraphQLError[];
      const throttled = gqlErrors.some(
        (e) => e.extensions?.code === "THROTTLED" || e.message?.toLowerCase().includes("throttled")
      );
      if (throttled) {
        return new ProviderRateLimitError(this.provider, "Shopify API call limit exceeded (GraphQL Throttled)", {
          originalCode: "THROTTLED",
          httpStatus: 429,
          retryAfterMs: retryAfterMs ?? 1000,
          details: { gqlErrors },
        });
      }

      const authError = gqlErrors.some(
        (e) =>
          e.extensions?.code === "UNAUTHORIZED" ||
          e.extensions?.code === "ACCESS_DENIED" ||
          e.message?.toLowerCase().includes("access denied") ||
          e.message?.toLowerCase().includes("unauthorized")
      );
      if (authError) {
        return new ProviderAuthenticationError(this.provider, "Shopify authorization or scope check failed", {
          originalCode: "ACCESS_DENIED",
          httpStatus: 401,
          details: { gqlErrors },
        });
      }

      const notFound = gqlErrors.some((e) => e.message?.toLowerCase().includes("not found"));
      if (notFound) {
        return new ProviderNotFoundError(this.provider, "Shopify resource not found", {
          originalCode: "NOT_FOUND",
          httpStatus: 404,
          details: { gqlErrors },
        });
      }
    }

    // 2. Check for Shopify UserErrors (e.g. inventorySetQuantities userErrors)
    if (Array.isArray(err?.userErrors) && err.userErrors.length > 0) {
      const uErrors = err.userErrors as ShopifyUserError[];
      const isConflict = uErrors.some((u) => u.code?.includes("STALE") || u.message.toLowerCase().includes("conflict"));
      if (isConflict) {
        return new ProviderConflictError(this.provider, uErrors.map((u) => u.message).join("; "), {
          originalCode: uErrors[0]?.code,
          details: { userErrors: uErrors },
        });
      }
      return new ProviderValidationError(this.provider, uErrors.map((u) => u.message).join("; "), {
        originalCode: uErrors[0]?.code,
        details: { userErrors: uErrors },
      });
    }

    // 3. HTTP status mapping
    if (httpStatus === 429 || message.toLowerCase().includes("throttled") || message.toLowerCase().includes("exceeded")) {
      return new ProviderRateLimitError(this.provider, message, {
        originalCode: "RATE_LIMIT_EXCEEDED",
        httpStatus: 429,
        retryAfterMs: retryAfterMs ?? 2000,
      });
    }

    if (httpStatus === 401 || httpStatus === 403 || message.toLowerCase().includes("invalid access token")) {
      return new ProviderAuthenticationError(this.provider, message, {
        originalCode: "AUTHENTICATION_FAILED",
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
        originalCode: "VALIDATION_FAILED",
        httpStatus,
      });
    }

    if (
      (httpStatus && httpStatus >= 500) ||
      message.toLowerCase().includes("timeout") ||
      message.toLowerCase().includes("econnreset") ||
      message.toLowerCase().includes("network error")
    ) {
      return new ProviderTransientError(this.provider, message, {
        originalCode: "TRANSIENT_SERVER_ERROR",
        httpStatus: httpStatus ?? 503,
      });
    }

    // 4. Fallback unknown error
    return new ProviderError(message, {
      classification: "UNKNOWN",
      provider: this.provider,
      httpStatus,
      isRetryable: false,
    });
  }
}
