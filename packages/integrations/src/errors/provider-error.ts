/**
 * Provider-Neutral Error Taxonomy
 * Canonical Specifications: Section 25 of 01_ENGINEERING_SPEC.md & Prompt 13
 */

import { ChannelProvider, SyncErrorClassification } from "@platform/contracts";

export interface ProviderErrorOptions {
  classification: SyncErrorClassification;
  provider: ChannelProvider;
  originalCode?: string;
  httpStatus?: number;
  retryAfterMs?: number;
  isRetryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Base canonical provider error.
 * All provider-specific errors are normalized into this structured class.
 */
export class ProviderError extends Error {
  readonly classification: SyncErrorClassification;
  readonly provider: ChannelProvider;
  readonly originalCode?: string;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  readonly isRetryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: ProviderErrorOptions) {
    super(message);
    this.name = "ProviderError";
    this.classification = options.classification;
    this.provider = options.provider;
    this.originalCode = options.originalCode;
    this.httpStatus = options.httpStatus;
    this.retryAfterMs = options.retryAfterMs;
    this.isRetryable =
      options.isRetryable ??
      (options.classification === "TRANSIENT" || options.classification === "RATE_LIMIT");
    this.details = options.details;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export class ProviderAuthenticationError extends ProviderError {
  constructor(
    provider: ChannelProvider,
    message = "Authentication or authorization failed for channel provider",
    options?: Partial<ProviderErrorOptions>
  ) {
    super(message, {
      ...options,
      classification: "AUTHENTICATION",
      provider,
      isRetryable: false,
      httpStatus: options?.httpStatus ?? 401,
    });
    this.name = "ProviderAuthenticationError";
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(
    provider: ChannelProvider,
    message = "Rate limit or throttling quota exceeded for channel provider",
    options?: Partial<ProviderErrorOptions>
  ) {
    super(message, {
      ...options,
      classification: "RATE_LIMIT",
      provider,
      isRetryable: true,
      httpStatus: options?.httpStatus ?? 429,
    });
    this.name = "ProviderRateLimitError";
  }
}

export class ProviderTransientError extends ProviderError {
  constructor(
    provider: ChannelProvider,
    message = "Transient network, timeout, or server error encountered",
    options?: Partial<ProviderErrorOptions>
  ) {
    super(message, {
      ...options,
      classification: "TRANSIENT",
      provider,
      isRetryable: true,
      httpStatus: options?.httpStatus ?? 503,
    });
    this.name = "ProviderTransientError";
  }
}

export class ProviderValidationError extends ProviderError {
  constructor(
    provider: ChannelProvider,
    message = "Request payload failed provider schema or business validation",
    options?: Partial<ProviderErrorOptions>
  ) {
    super(message, {
      ...options,
      classification: "VALIDATION",
      provider,
      isRetryable: false,
      httpStatus: options?.httpStatus ?? 400,
    });
    this.name = "ProviderValidationError";
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(
    provider: ChannelProvider,
    message = "Requested resource not found on channel provider",
    options?: Partial<ProviderErrorOptions>
  ) {
    super(message, {
      ...options,
      classification: "NOT_FOUND",
      provider,
      isRetryable: false,
      httpStatus: options?.httpStatus ?? 404,
    });
    this.name = "ProviderNotFoundError";
  }
}

export class ProviderConflictError extends ProviderError {
  constructor(
    provider: ChannelProvider,
    message = "Conflict or state mismatch detected on channel provider",
    options?: Partial<ProviderErrorOptions>
  ) {
    super(message, {
      ...options,
      classification: "CONFLICT",
      provider,
      isRetryable: false,
      httpStatus: options?.httpStatus ?? 409,
    });
    this.name = "ProviderConflictError";
  }
}

export class ProviderOperationUnsupportedError extends ProviderError {
  constructor(
    provider: ChannelProvider,
    operation: string,
    reason?: string
  ) {
    const msg = `Provider '${provider}' does not support operation '${operation}'${reason ? `: ${reason}` : "."}`;
    super(msg, {
      classification: "VALIDATION",
      provider,
      originalCode: "OPERATION_UNSUPPORTED",
      isRetryable: false,
      httpStatus: 400,
    });
    this.name = "ProviderOperationUnsupportedError";
  }
}

export class ProviderNotOperationalError extends ProviderError {
  constructor(
    provider: ChannelProvider,
    phase: string
  ) {
    const msg = `Provider adapter '${provider}' interface is established but live operation is scheduled for ${phase}. It is not operational in this phase.`;
    super(msg, {
      classification: "VALIDATION",
      provider,
      originalCode: "PROVIDER_NOT_OPERATIONAL",
      isRetryable: false,
      httpStatus: 501,
    });
    this.name = "ProviderNotOperationalError";
  }
}
