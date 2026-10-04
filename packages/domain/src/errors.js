"use strict";
/**
 * Domain Error Taxonomy
 * Canonical Specification: Prompt 07 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Enforces explicit error classification without leaking implementation details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimisticLockConflictError = exports.IntegrationNotFoundError = exports.VariantNotFoundError = exports.ProductNotFoundError = exports.InvalidNotificationStateError = exports.NotificationNotFoundError = exports.BillingWebhookSignatureError = exports.SubscriptionNotFoundError = exports.InvalidBillingTransitionError = exports.PlanLimitExceededError = exports.AuditInvariantError = exports.AuditNotFoundError = exports.ImmutableAuditLogError = exports.SyncVerificationError = exports.SyncConflictError = exports.SyncExecutionError = exports.OrderNotFoundError = exports.OrderInvariantError = exports.TenantAccessDeniedError = exports.ExceptionInvariantError = exports.ReconciliationInvariantError = exports.AllocationInvariantError = exports.DuplicateIdempotencyKeyError = exports.InvalidStateTransitionError = exports.ReservationInvariantError = exports.InsufficientInventoryError = exports.InventoryInvariantError = exports.DomainError = void 0;
class DomainError extends Error {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
        this.name = this.constructor.name;
    }
}
exports.DomainError = DomainError;
class InventoryInvariantError extends DomainError {
    code = "INVENTORY_INVARIANT_VIOLATION";
    constructor(message, details) {
        super(message, details);
    }
}
exports.InventoryInvariantError = InventoryInvariantError;
class InsufficientInventoryError extends DomainError {
    requestedQuantity;
    availableQuantity;
    code = "INSUFFICIENT_INVENTORY";
    constructor(requestedQuantity, availableQuantity, details) {
        super(`Insufficient inventory: requested ${requestedQuantity}, but only ${availableQuantity} is available.`, { requestedQuantity, availableQuantity, ...details });
        this.requestedQuantity = requestedQuantity;
        this.availableQuantity = availableQuantity;
    }
}
exports.InsufficientInventoryError = InsufficientInventoryError;
class ReservationInvariantError extends DomainError {
    code = "RESERVATION_INVARIANT_VIOLATION";
    constructor(message, details) {
        super(message, details);
    }
}
exports.ReservationInvariantError = ReservationInvariantError;
class InvalidStateTransitionError extends DomainError {
    entityName;
    fromState;
    toState;
    code = "INVALID_STATE_TRANSITION";
    constructor(entityName, fromState, toState, details) {
        super(`Invalid state transition for ${entityName}: cannot transition from '${fromState}' to '${toState}'.`, { entityName, fromState, toState, ...details });
        this.entityName = entityName;
        this.fromState = fromState;
        this.toState = toState;
    }
}
exports.InvalidStateTransitionError = InvalidStateTransitionError;
class DuplicateIdempotencyKeyError extends DomainError {
    idempotencyKey;
    code = "DUPLICATE_IDEMPOTENCY_KEY";
    constructor(idempotencyKey) {
        super(`Duplicate idempotency key detected: '${idempotencyKey}'. Operation already recorded.`, {
            idempotencyKey,
        });
        this.idempotencyKey = idempotencyKey;
    }
}
exports.DuplicateIdempotencyKeyError = DuplicateIdempotencyKeyError;
class AllocationInvariantError extends DomainError {
    code = "ALLOCATION_INVARIANT_VIOLATION";
    constructor(message, details) {
        super(message, details);
    }
}
exports.AllocationInvariantError = AllocationInvariantError;
class ReconciliationInvariantError extends DomainError {
    code = "RECONCILIATION_INVARIANT_VIOLATION";
    constructor(message, details) {
        super(message, details);
    }
}
exports.ReconciliationInvariantError = ReconciliationInvariantError;
class ExceptionInvariantError extends DomainError {
    code = "EXCEPTION_INVARIANT_VIOLATION";
    constructor(message, details) {
        super(message, details);
    }
}
exports.ExceptionInvariantError = ExceptionInvariantError;
class TenantAccessDeniedError extends DomainError {
    requestedOrgId;
    authenticatedOrgId;
    code = "TENANT_ACCESS_DENIED";
    constructor(requestedOrgId, authenticatedOrgId, message) {
        super(message ||
            `Tenant isolation violation. Authenticated organization '${authenticatedOrgId}' is not authorized to access resource in organization '${requestedOrgId}'.`, { requestedOrgId, authenticatedOrgId });
        this.requestedOrgId = requestedOrgId;
        this.authenticatedOrgId = authenticatedOrgId;
    }
}
exports.TenantAccessDeniedError = TenantAccessDeniedError;
class OrderInvariantError extends DomainError {
    code = "ORDER_INVARIANT_VIOLATION";
    constructor(message, details) {
        super(message, details);
    }
}
exports.OrderInvariantError = OrderInvariantError;
class OrderNotFoundError extends DomainError {
    orderId;
    code = "ORDER_NOT_FOUND";
    constructor(orderId, details) {
        super(`Order with ID '${orderId}' was not found.`, { orderId, ...details });
        this.orderId = orderId;
    }
}
exports.OrderNotFoundError = OrderNotFoundError;
class SyncExecutionError extends DomainError {
    classification;
    retryable;
    code = "SYNC_EXECUTION_ERROR";
    constructor(message, classification, retryable, details) {
        super(message, { classification, retryable, ...details });
        this.classification = classification;
        this.retryable = retryable;
    }
}
exports.SyncExecutionError = SyncExecutionError;
class SyncConflictError extends DomainError {
    code = "SYNC_CONFLICT";
    constructor(message, details) {
        super(message, details);
    }
}
exports.SyncConflictError = SyncConflictError;
class SyncVerificationError extends DomainError {
    code = "SYNC_VERIFICATION_ERROR";
    constructor(message, details) {
        super(message, details);
    }
}
exports.SyncVerificationError = SyncVerificationError;
class ImmutableAuditLogError extends DomainError {
    code = "IMMUTABLE_AUDIT_LOG";
    constructor(message = "Audit logs are strictly append-only. Historical audit records cannot be modified or deleted.", details) {
        super(message, details);
    }
}
exports.ImmutableAuditLogError = ImmutableAuditLogError;
class AuditNotFoundError extends DomainError {
    auditId;
    code = "AUDIT_LOG_NOT_FOUND";
    constructor(auditId, details) {
        super(`Audit log record with ID '${auditId}' was not found.`, { auditId, ...details });
        this.auditId = auditId;
    }
}
exports.AuditNotFoundError = AuditNotFoundError;
class AuditInvariantError extends DomainError {
    code = "AUDIT_INVARIANT_VIOLATION";
    constructor(message, details) {
        super(message, details);
    }
}
exports.AuditInvariantError = AuditInvariantError;
class PlanLimitExceededError extends DomainError {
    metric;
    current;
    limit;
    code = "PLAN_LIMIT_EXCEEDED";
    constructor(metric, current, limit, details) {
        super(`Plan limit exceeded for '${metric}': current usage ${current} has reached or exceeded plan limit ${limit}. Upgrade plan to increase capacity.`, { metric, current, limit, ...details });
        this.metric = metric;
        this.current = current;
        this.limit = limit;
    }
}
exports.PlanLimitExceededError = PlanLimitExceededError;
class InvalidBillingTransitionError extends DomainError {
    fromStatus;
    toStatus;
    code = "INVALID_BILLING_TRANSITION";
    constructor(fromStatus, toStatus, details) {
        super(`Invalid billing state transition: cannot transition subscription from '${fromStatus}' to '${toStatus}'.`, { fromStatus, toStatus, ...details });
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
    }
}
exports.InvalidBillingTransitionError = InvalidBillingTransitionError;
class SubscriptionNotFoundError extends DomainError {
    organizationId;
    code = "SUBSCRIPTION_NOT_FOUND";
    constructor(organizationId, details) {
        super(`Active subscription for organization '${organizationId}' was not found.`, {
            organizationId,
            ...details,
        });
        this.organizationId = organizationId;
    }
}
exports.SubscriptionNotFoundError = SubscriptionNotFoundError;
class BillingWebhookSignatureError extends DomainError {
    code = "BILLING_WEBHOOK_SIGNATURE_INVALID";
    constructor(message = "Stripe webhook signature verification failed.") {
        super(message);
    }
}
exports.BillingWebhookSignatureError = BillingWebhookSignatureError;
class NotificationNotFoundError extends DomainError {
    notificationId;
    code = "NOTIFICATION_NOT_FOUND";
    constructor(notificationId, details) {
        super(`Notification '${notificationId}' was not found.`, {
            notificationId,
            ...details,
        });
        this.notificationId = notificationId;
    }
}
exports.NotificationNotFoundError = NotificationNotFoundError;
class InvalidNotificationStateError extends DomainError {
    notificationId;
    currentStatus;
    attemptedAction;
    code = "INVALID_NOTIFICATION_STATE";
    constructor(notificationId, currentStatus, attemptedAction, details) {
        super(`Cannot perform '${attemptedAction}' on notification '${notificationId}' with status '${currentStatus}'.`, { notificationId, currentStatus, attemptedAction, ...details });
        this.notificationId = notificationId;
        this.currentStatus = currentStatus;
        this.attemptedAction = attemptedAction;
    }
}
exports.InvalidNotificationStateError = InvalidNotificationStateError;
class ProductNotFoundError extends DomainError {
    productId;
    code = "PRODUCT_NOT_FOUND";
    constructor(productId, details) {
        super(`Product with ID '${productId}' was not found.`, { productId, ...details });
        this.productId = productId;
    }
}
exports.ProductNotFoundError = ProductNotFoundError;
class VariantNotFoundError extends DomainError {
    variantId;
    code = "VARIANT_NOT_FOUND";
    constructor(variantId, details) {
        super(`Product variant with ID '${variantId}' was not found.`, { variantId, ...details });
        this.variantId = variantId;
    }
}
exports.VariantNotFoundError = VariantNotFoundError;
class IntegrationNotFoundError extends DomainError {
    integrationId;
    code = "INTEGRATION_NOT_FOUND";
    constructor(integrationId, details) {
        super(`Integration with ID '${integrationId}' was not found.`, { integrationId, ...details });
        this.integrationId = integrationId;
    }
}
exports.IntegrationNotFoundError = IntegrationNotFoundError;
class OptimisticLockConflictError extends DomainError {
    entityName;
    entityId;
    expectedVersion;
    actualVersion;
    code = "OPTIMISTIC_LOCK_CONFLICT";
    constructor(entityName, entityId, expectedVersion, actualVersion, details) {
        super(`Optimistic lock conflict on ${entityName} '${entityId}'. Expected version ${expectedVersion ?? "unknown"}, but was ${actualVersion ?? "unknown"}.`, { entityName, entityId, expectedVersion, actualVersion, ...details });
        this.entityName = entityName;
        this.entityId = entityId;
        this.expectedVersion = expectedVersion;
        this.actualVersion = actualVersion;
    }
}
exports.OptimisticLockConflictError = OptimisticLockConflictError;
//# sourceMappingURL=errors.js.map