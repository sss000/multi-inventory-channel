/**
 * Domain Error Taxonomy
 * Canonical Specification: Prompt 07 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Enforces explicit error classification without leaking implementation details.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InventoryInvariantError extends DomainError {
  readonly code = "INVENTORY_INVARIANT_VIOLATION";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class InsufficientInventoryError extends DomainError {
  readonly code = "INSUFFICIENT_INVENTORY";

  constructor(
    public readonly requestedQuantity: number,
    public readonly availableQuantity: number,
    details?: Record<string, unknown>
  ) {
    super(
      `Insufficient inventory: requested ${requestedQuantity}, but only ${availableQuantity} is available.`,
      { requestedQuantity, availableQuantity, ...details }
    );
  }
}

export class ReservationInvariantError extends DomainError {
  readonly code = "RESERVATION_INVARIANT_VIOLATION";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class InvalidStateTransitionError extends DomainError {
  readonly code = "INVALID_STATE_TRANSITION";

  constructor(
    public readonly entityName: string,
    public readonly fromState: string,
    public readonly toState: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Invalid state transition for ${entityName}: cannot transition from '${fromState}' to '${toState}'.`,
      { entityName, fromState, toState, ...details }
    );
  }
}

export class DuplicateIdempotencyKeyError extends DomainError {
  readonly code = "DUPLICATE_IDEMPOTENCY_KEY";

  constructor(public readonly idempotencyKey: string) {
    super(`Duplicate idempotency key detected: '${idempotencyKey}'. Operation already recorded.`, {
      idempotencyKey,
    });
  }
}

export class AllocationInvariantError extends DomainError {
  readonly code = "ALLOCATION_INVARIANT_VIOLATION";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class ReconciliationInvariantError extends DomainError {
  readonly code = "RECONCILIATION_INVARIANT_VIOLATION";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class ExceptionInvariantError extends DomainError {
  readonly code = "EXCEPTION_INVARIANT_VIOLATION";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class TenantAccessDeniedError extends DomainError {
  readonly code = "TENANT_ACCESS_DENIED";

  constructor(
    public readonly requestedOrgId: string,
    public readonly authenticatedOrgId: string,
    message?: string
  ) {
    super(
      message ||
        `Tenant isolation violation. Authenticated organization '${authenticatedOrgId}' is not authorized to access resource in organization '${requestedOrgId}'.`,
      { requestedOrgId, authenticatedOrgId }
    );
  }
}

export class OrderInvariantError extends DomainError {
  readonly code = "ORDER_INVARIANT_VIOLATION";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class OrderNotFoundError extends DomainError {
  readonly code = "ORDER_NOT_FOUND";

  constructor(public readonly orderId: string, details?: Record<string, unknown>) {
    super(`Order with ID '${orderId}' was not found.`, { orderId, ...details });
  }
}

export class SyncExecutionError extends DomainError {
  readonly code = "SYNC_EXECUTION_ERROR";

  constructor(
    message: string,
    public readonly classification: string,
    public readonly retryable: boolean,
    details?: Record<string, unknown>
  ) {
    super(message, { classification, retryable, ...details });
  }
}

export class SyncConflictError extends DomainError {
  readonly code = "SYNC_CONFLICT";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class SyncVerificationError extends DomainError {
  readonly code = "SYNC_VERIFICATION_ERROR";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class ImmutableAuditLogError extends DomainError {
  readonly code = "IMMUTABLE_AUDIT_LOG";

  constructor(
    message = "Audit logs are strictly append-only. Historical audit records cannot be modified or deleted.",
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

export class AuditNotFoundError extends DomainError {
  readonly code = "AUDIT_LOG_NOT_FOUND";

  constructor(public readonly auditId: string, details?: Record<string, unknown>) {
    super(`Audit log record with ID '${auditId}' was not found.`, { auditId, ...details });
  }
}

export class AuditInvariantError extends DomainError {
  readonly code = "AUDIT_INVARIANT_VIOLATION";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class PlanLimitExceededError extends DomainError {
  readonly code = "PLAN_LIMIT_EXCEEDED";

  constructor(
    public readonly metric: string,
    public readonly current: number,
    public readonly limit: number,
    details?: Record<string, unknown>
  ) {
    super(
      `Plan limit exceeded for '${metric}': current usage ${current} has reached or exceeded plan limit ${limit}. Upgrade plan to increase capacity.`,
      { metric, current, limit, ...details }
    );
  }
}

export class InvalidBillingTransitionError extends DomainError {
  readonly code = "INVALID_BILLING_TRANSITION";

  constructor(
    public readonly fromStatus: string,
    public readonly toStatus: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Invalid billing state transition: cannot transition subscription from '${fromStatus}' to '${toStatus}'.`,
      { fromStatus, toStatus, ...details }
    );
  }
}

export class SubscriptionNotFoundError extends DomainError {
  readonly code = "SUBSCRIPTION_NOT_FOUND";

  constructor(public readonly organizationId: string, details?: Record<string, unknown>) {
    super(`Active subscription for organization '${organizationId}' was not found.`, {
      organizationId,
      ...details,
    });
  }
}

export class BillingWebhookSignatureError extends DomainError {
  readonly code = "BILLING_WEBHOOK_SIGNATURE_INVALID";

  constructor(message = "Stripe webhook signature verification failed.") {
    super(message);
  }
}

export class NotificationNotFoundError extends DomainError {
  readonly code = "NOTIFICATION_NOT_FOUND";

  constructor(public readonly notificationId: string, details?: Record<string, unknown>) {
    super(`Notification '${notificationId}' was not found.`, {
      notificationId,
      ...details,
    });
  }
}

export class InvalidNotificationStateError extends DomainError {
  readonly code = "INVALID_NOTIFICATION_STATE";

  constructor(
    public readonly notificationId: string,
    public readonly currentStatus: string,
    public readonly attemptedAction: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Cannot perform '${attemptedAction}' on notification '${notificationId}' with status '${currentStatus}'.`,
      { notificationId, currentStatus, attemptedAction, ...details }
    );
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code = "PRODUCT_NOT_FOUND";

  constructor(public readonly productId: string, details?: Record<string, unknown>) {
    super(`Product with ID '${productId}' was not found.`, { productId, ...details });
  }
}

export class VariantNotFoundError extends DomainError {
  readonly code = "VARIANT_NOT_FOUND";

  constructor(public readonly variantId: string, details?: Record<string, unknown>) {
    super(`Product variant with ID '${variantId}' was not found.`, { variantId, ...details });
  }
}

export class IntegrationNotFoundError extends DomainError {
  readonly code = "INTEGRATION_NOT_FOUND";

  constructor(public readonly integrationId: string, details?: Record<string, unknown>) {
    super(`Integration with ID '${integrationId}' was not found.`, { integrationId, ...details });
  }
}

export class OptimisticLockConflictError extends DomainError {
  readonly code = "OPTIMISTIC_LOCK_CONFLICT";

  constructor(
    public readonly entityName: string,
    public readonly entityId: string,
    public readonly expectedVersion?: number,
    public readonly actualVersion?: number,
    details?: Record<string, unknown>
  ) {
    super(
      `Optimistic lock conflict on ${entityName} '${entityId}'. Expected version ${expectedVersion ?? "unknown"}, but was ${actualVersion ?? "unknown"}.`,
      { entityName, entityId, expectedVersion, actualVersion, ...details }
    );
  }
}

export class OnboardingInvariantError extends DomainError {
  readonly code = "ONBOARDING_INVARIANT_VIOLATION";

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class InitialSyncSafetyViolationError extends DomainError {
  readonly code = "INITIAL_SYNC_SAFETY_VIOLATION";

  constructor(
    message: string = "Cannot enable outbound synchronization before completing initial inventory validation and confirming source-of-truth resolutions.",
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

export class OnboardingSessionNotFoundError extends DomainError {
  readonly code = "ONBOARDING_SESSION_NOT_FOUND";

  constructor(public readonly organizationId: string, details?: Record<string, unknown>) {
    super(`Onboarding session for organization '${organizationId}' was not found.`, {
      organizationId,
      ...details,
    });
  }
}

export class InvalidOnboardingStepError extends DomainError {
  readonly code = "INVALID_ONBOARDING_STEP";

  constructor(
    public readonly currentStep: string,
    public readonly attemptedStep: string,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(
      message || `Cannot transition from step '${currentStep}' to step '${attemptedStep}'. Prior prerequisites must be completed.`,
      { currentStep, attemptedStep, ...details }
    );
  }
}
