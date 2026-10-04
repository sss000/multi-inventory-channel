/**
 * Domain Error Taxonomy
 * Canonical Specification: Prompt 07 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Enforces explicit error classification without leaking implementation details.
 */
export declare abstract class DomainError extends Error {
    readonly details?: Record<string, unknown> | undefined;
    abstract readonly code: string;
    constructor(message: string, details?: Record<string, unknown> | undefined);
}
export declare class InventoryInvariantError extends DomainError {
    readonly code = "INVENTORY_INVARIANT_VIOLATION";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class InsufficientInventoryError extends DomainError {
    readonly requestedQuantity: number;
    readonly availableQuantity: number;
    readonly code = "INSUFFICIENT_INVENTORY";
    constructor(requestedQuantity: number, availableQuantity: number, details?: Record<string, unknown>);
}
export declare class ReservationInvariantError extends DomainError {
    readonly code = "RESERVATION_INVARIANT_VIOLATION";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class InvalidStateTransitionError extends DomainError {
    readonly entityName: string;
    readonly fromState: string;
    readonly toState: string;
    readonly code = "INVALID_STATE_TRANSITION";
    constructor(entityName: string, fromState: string, toState: string, details?: Record<string, unknown>);
}
export declare class DuplicateIdempotencyKeyError extends DomainError {
    readonly idempotencyKey: string;
    readonly code = "DUPLICATE_IDEMPOTENCY_KEY";
    constructor(idempotencyKey: string);
}
export declare class AllocationInvariantError extends DomainError {
    readonly code = "ALLOCATION_INVARIANT_VIOLATION";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ReconciliationInvariantError extends DomainError {
    readonly code = "RECONCILIATION_INVARIANT_VIOLATION";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ExceptionInvariantError extends DomainError {
    readonly code = "EXCEPTION_INVARIANT_VIOLATION";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class TenantAccessDeniedError extends DomainError {
    readonly requestedOrgId: string;
    readonly authenticatedOrgId: string;
    readonly code = "TENANT_ACCESS_DENIED";
    constructor(requestedOrgId: string, authenticatedOrgId: string, message?: string);
}
export declare class OrderInvariantError extends DomainError {
    readonly code = "ORDER_INVARIANT_VIOLATION";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class OrderNotFoundError extends DomainError {
    readonly orderId: string;
    readonly code = "ORDER_NOT_FOUND";
    constructor(orderId: string, details?: Record<string, unknown>);
}
export declare class SyncExecutionError extends DomainError {
    readonly classification: string;
    readonly retryable: boolean;
    readonly code = "SYNC_EXECUTION_ERROR";
    constructor(message: string, classification: string, retryable: boolean, details?: Record<string, unknown>);
}
export declare class SyncConflictError extends DomainError {
    readonly code = "SYNC_CONFLICT";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class SyncVerificationError extends DomainError {
    readonly code = "SYNC_VERIFICATION_ERROR";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ImmutableAuditLogError extends DomainError {
    readonly code = "IMMUTABLE_AUDIT_LOG";
    constructor(message?: string, details?: Record<string, unknown>);
}
export declare class AuditNotFoundError extends DomainError {
    readonly auditId: string;
    readonly code = "AUDIT_LOG_NOT_FOUND";
    constructor(auditId: string, details?: Record<string, unknown>);
}
export declare class AuditInvariantError extends DomainError {
    readonly code = "AUDIT_INVARIANT_VIOLATION";
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class PlanLimitExceededError extends DomainError {
    readonly metric: string;
    readonly current: number;
    readonly limit: number;
    readonly code = "PLAN_LIMIT_EXCEEDED";
    constructor(metric: string, current: number, limit: number, details?: Record<string, unknown>);
}
export declare class InvalidBillingTransitionError extends DomainError {
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly code = "INVALID_BILLING_TRANSITION";
    constructor(fromStatus: string, toStatus: string, details?: Record<string, unknown>);
}
export declare class SubscriptionNotFoundError extends DomainError {
    readonly organizationId: string;
    readonly code = "SUBSCRIPTION_NOT_FOUND";
    constructor(organizationId: string, details?: Record<string, unknown>);
}
export declare class BillingWebhookSignatureError extends DomainError {
    readonly code = "BILLING_WEBHOOK_SIGNATURE_INVALID";
    constructor(message?: string);
}
export declare class NotificationNotFoundError extends DomainError {
    readonly notificationId: string;
    readonly code = "NOTIFICATION_NOT_FOUND";
    constructor(notificationId: string, details?: Record<string, unknown>);
}
export declare class InvalidNotificationStateError extends DomainError {
    readonly notificationId: string;
    readonly currentStatus: string;
    readonly attemptedAction: string;
    readonly code = "INVALID_NOTIFICATION_STATE";
    constructor(notificationId: string, currentStatus: string, attemptedAction: string, details?: Record<string, unknown>);
}
export declare class ProductNotFoundError extends DomainError {
    readonly productId: string;
    readonly code = "PRODUCT_NOT_FOUND";
    constructor(productId: string, details?: Record<string, unknown>);
}
export declare class VariantNotFoundError extends DomainError {
    readonly variantId: string;
    readonly code = "VARIANT_NOT_FOUND";
    constructor(variantId: string, details?: Record<string, unknown>);
}
export declare class IntegrationNotFoundError extends DomainError {
    readonly integrationId: string;
    readonly code = "INTEGRATION_NOT_FOUND";
    constructor(integrationId: string, details?: Record<string, unknown>);
}
export declare class OptimisticLockConflictError extends DomainError {
    readonly entityName: string;
    readonly entityId: string;
    readonly expectedVersion?: number | undefined;
    readonly actualVersion?: number | undefined;
    readonly code = "OPTIMISTIC_LOCK_CONFLICT";
    constructor(entityName: string, entityId: string, expectedVersion?: number | undefined, actualVersion?: number | undefined, details?: Record<string, unknown>);
}
//# sourceMappingURL=errors.d.ts.map