"use strict";
/**
 * Exception Domain Service & Lifecycle Management
 * Canonical Specification: Sections 32, 33, 34 of 01_ENGINEERING_SPEC.md & Prompt 20
 *
 * Rules:
 * 1. Never silently drop or ignore errors; convert failures to structured DomainExceptions.
 * 2. Enforce deterministic severity scoring based on exception type.
 * 3. Enforce strict lifecycle transitions: OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVING → RESOLVED, or OPEN → IGNORED.
 * 4. Every exception must answer the 6 diagnostic questions:
 *    - WHAT HAPPENED?
 *    - WHY?
 *    - WHAT IS AFFECTED?
 *    - WHAT DID THE SYSTEM TRY?
 *    - WHAT HAPPENS NEXT?
 *    - WHAT CAN I DO?
 * 5. Do not mark an exception RESOLVED merely because a retry was submitted;
 *    retry transitions to RESOLVING.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_EXCEPTION_TRANSITIONS = exports.DEFAULT_EXCEPTION_SEVERITY = void 0;
exports.generateDiagnosticExplanation = generateDiagnosticExplanation;
exports.calculateExceptionSeverity = calculateExceptionSeverity;
exports.canTransitionException = canTransitionException;
exports.createDomainException = createDomainException;
exports.transitionException = transitionException;
exports.retryExceptionDomain = retryExceptionDomain;
const errors_js_1 = require("./errors.js");
/**
 * Standard severity classification mapping by exception type.
 */
exports.DEFAULT_EXCEPTION_SEVERITY = {
    NEGATIVE_INVENTORY: "CRITICAL",
    PROVIDER_OUTAGE: "CRITICAL",
    AUTHENTICATION_FAILURE: "HIGH",
    SYNC_FAILURE: "HIGH",
    INVENTORY_MISMATCH: "HIGH",
    DUPLICATE_MAPPING: "HIGH",
    ORDER_IMPORT_FAILURE: "HIGH",
    MISSING_MAPPING: "MEDIUM",
    ORDER_UNMAPPED_SKU: "MEDIUM",
    RATE_LIMIT: "LOW",
    STALE_DATA: "LOW",
};
/**
 * Valid exception lifecycle transitions.
 * Canonical Specification: Section 33 of 01_ENGINEERING_SPEC.md
 * OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVING → RESOLVED
 * Also supports: OPEN → IGNORED
 */
exports.VALID_EXCEPTION_TRANSITIONS = {
    OPEN: ["INVESTIGATING", "ACTION_REQUIRED", "RESOLVING", "RESOLVED", "IGNORED"],
    INVESTIGATING: ["ACTION_REQUIRED", "RESOLVING", "RESOLVED", "IGNORED", "OPEN"],
    ACTION_REQUIRED: ["RESOLVING", "RESOLVED", "IGNORED", "INVESTIGATING"],
    RESOLVING: ["RESOLVED", "ACTION_REQUIRED", "OPEN"],
    RESOLVED: ["OPEN"], // Can only be reopened
    IGNORED: ["OPEN"], // Can be un-ignored
};
/**
 * Generates structured DiagnosticExplanation answering the 6 mandatory questions:
 * 1. WHAT HAPPENED?
 * 2. WHY?
 * 3. WHAT IS AFFECTED?
 * 4. WHAT DID THE SYSTEM TRY?
 * 5. WHAT HAPPENS NEXT?
 * 6. WHAT CAN I DO?
 */
function generateDiagnosticExplanation(type, context) {
    const entityDesc = context.entityType && context.entityId
        ? `${context.entityType} '${context.entityId}'`
        : "The specified entity";
    switch (type) {
        case "NEGATIVE_INVENTORY":
            return {
                whatHappened: context.title || "Inventory balance decreased below zero, indicating overselling or unrecorded stock movement.",
                why: String(context.rootCause?.reason || "Physical count or unmapped order consumption exceeded recorded on-hand quantity."),
                whatIsAffected: `${entityDesc} and associated channel listings. Sellable inventory is halted.`,
                whatDidSystemTry: "System evaluated safety buffers, flagged the negative balance, and locked outbound synchronizations for this SKU.",
                whatHappensNext: "Outbound inventory pushes for this SKU are blocked to prevent worsening downstream overselling.",
                whatCanIDo: "Execute a warehouse physical recount or record a manual inventory adjustment to restore balance.",
            };
        case "SYNC_FAILURE":
            return {
                whatHappened: context.title || "Outbound inventory synchronization job failed.",
                why: String(context.rootCause?.reason || "Channel API rejected inventory update payload or encountered a network error."),
                whatIsAffected: `${entityDesc} and channel availability synchronization.`,
                whatDidSystemTry: "System attempted exponential backoff retries within the sync worker.",
                whatHappensNext: "Job marked as failed. System awaits automated retry window or operator intervention.",
                whatCanIDo: "Review channel error logs, verify SKU mapping, or trigger a manual sync retry.",
            };
        case "AUTHENTICATION_FAILURE":
            return {
                whatHappened: context.title || "Channel API credentials rejected or access token expired.",
                why: String(context.rootCause?.reason || "OAuth token expired, was revoked, or API keys are invalid."),
                whatIsAffected: `${entityDesc} and all dependent synchronization and order import workflows.`,
                whatDidSystemTry: "System attempted automated token refresh if supported by provider adapter.",
                whatHappensNext: "Channel account status set to ERROR; all outbound operations for this account paused.",
                whatCanIDo: "Navigate to Channel Settings and re-authenticate or update the API credentials.",
            };
        case "MISSING_MAPPING":
            return {
                whatHappened: context.title || "External listing or channel item cannot be resolved to an internal SKU.",
                why: String(context.rootCause?.reason || "Channel product ID or external SKU has no active mapping in catalog."),
                whatIsAffected: `${entityDesc} and downstream order processing or inventory sync for this channel item.`,
                whatDidSystemTry: "System searched active channel mappings and alias tables for matching barcode or SKU code.",
                whatHappensNext: "Item is held in exception state; order line item processing paused to prevent wrong stock deductions.",
                whatCanIDo: "Link the external listing to an internal SKU in Catalog Mappings.",
            };
        case "DUPLICATE_MAPPING":
            return {
                whatHappened: context.title || "Multiple internal SKUs or external listings mapped to the same identifier.",
                why: String(context.rootCause?.reason || "Conflicting mapping records detected in database."),
                whatIsAffected: `${entityDesc} and inventory integrity across involved channels.`,
                whatDidSystemTry: "System detected uniqueness collision and paused automated sync for both mappings.",
                whatHappensNext: "Sync disabled for the conflicting items until mapping conflict is resolved.",
                whatCanIDo: "Review channel mappings, remove the duplicate entry, and re-link the proper SKU.",
            };
        case "ORDER_UNMAPPED_SKU":
            return {
                whatHappened: context.title || "Incoming order contains line item with unmapped SKU.",
                why: String(context.rootCause?.reason || "Channel order item identifier has no corresponding internal SKU mapping."),
                whatIsAffected: `Order ${context.entityId} line item and inventory deduction pipeline.`,
                whatDidSystemTry: "System held the line item in EXCEPTION status instead of silently deducting unrelated inventory.",
                whatHappensNext: "Order is held in EXCEPTION state until SKU is mapped or substituted.",
                whatCanIDo: "Map the external channel SKU to an internal SKU and release the order from hold.",
            };
        case "ORDER_IMPORT_FAILURE":
            return {
                whatHappened: context.title || "Inbound order ingestion failed validation or database storage.",
                why: String(context.rootCause?.reason || "Order payload contained invalid schema, missing required fields, or DB constraint violation."),
                whatIsAffected: `${entityDesc} and customer order fulfillment timeline.`,
                whatDidSystemTry: "System logged raw webhook/payload and recorded import failure exception.",
                whatHappensNext: "Order remains unimported; webhook will retry or await manual replay.",
                whatCanIDo: "Inspect order payload, fix mapping or customer data, and replay order import.",
            };
        case "RATE_LIMIT":
            return {
                whatHappened: context.title || "Channel API request rate limit exceeded (HTTP 429).",
                why: String(context.rootCause?.reason || "Burst synchronization activity exceeded provider throttling quotas."),
                whatIsAffected: `${entityDesc} and batch sync queue throughput.`,
                whatDidSystemTry: "System extracted Retry-After header and scheduled job backoff delay.",
                whatHappensNext: "Job will automatically retry after cooldown window expires.",
                whatCanIDo: "No immediate action required unless rate limit persists across multiple hours.",
            };
        case "PROVIDER_OUTAGE":
            return {
                whatHappened: context.title || "External marketplace API is unreachable or reporting major service outage.",
                why: String(context.rootCause?.reason || "HTTP 502/503/504 errors or network connection timeout from provider."),
                whatIsAffected: `${entityDesc} and all real-time sync operations to this channel.`,
                whatDidSystemTry: "System activated circuit breaker and delayed background sync jobs.",
                whatHappensNext: "Background jobs delayed with exponential backoff until provider recovery probe succeeds.",
                whatCanIDo: "Check provider status page (e.g. AWS / Shopify status) and resume jobs once service is restored.",
            };
        case "STALE_DATA":
            return {
                whatHappened: context.title || "External channel snapshot timestamp exceeds freshness SLA.",
                why: String(context.rootCause?.reason || "Channel has not emitted updates within expected sync interval."),
                whatIsAffected: `${entityDesc} and trust state calculation. Marked as STALE.`,
                whatDidSystemTry: "System transitioned trust state to STALE and scheduled fresh read-back.",
                whatHappensNext: "Inventory read-back job queued to refresh channel truth snapshot.",
                whatCanIDo: "Trigger a manual channel inventory sync or verify webhook subscriptions.",
            };
        case "INVENTORY_MISMATCH":
        default:
            return {
                whatHappened: context.title || "Discrepancy detected between internal inventory ledger and external channel count.",
                why: String(context.rootCause?.reason || "Channel inventory does not match expected calculated available quantity."),
                whatIsAffected: `${entityDesc} and marketplace sellable availability.`,
                whatDidSystemTry: "System classified discrepancy, checked recent sync events, and verified against pending orders.",
                whatHappensNext: "Flagged for reconciliation review or auto-correction depending on policy.",
                whatCanIDo: "Run reconciliation tool, inspect discrepancy evidence, and approve correction.",
            };
    }
}
/**
 * Computes deterministic severity scoring, taking into account dynamic risk context.
 */
function calculateExceptionSeverity(type, context) {
    // Negative inventory is always CRITICAL
    if (type === "NEGATIVE_INVENTORY") {
        return "CRITICAL";
    }
    // Provider outage is always CRITICAL
    if (type === "PROVIDER_OUTAGE") {
        return "CRITICAL";
    }
    // Large financial impact elevates severity
    if (context?.financialImpact && context.financialImpact >= 5000) {
        return "CRITICAL";
    }
    // Large negative quantity delta
    if (context?.negativeQuantity && Math.abs(context.negativeQuantity) >= 50) {
        return "CRITICAL";
    }
    // Repeated failures elevate by one tier
    const base = exports.DEFAULT_EXCEPTION_SEVERITY[type] || "MEDIUM";
    if (context?.isRepeatedFailure) {
        if (base === "LOW")
            return "MEDIUM";
        if (base === "MEDIUM")
            return "HIGH";
        if (base === "HIGH")
            return "CRITICAL";
    }
    return base;
}
/**
 * Checks whether a transition between two exception statuses is allowed.
 */
function canTransitionException(from, to) {
    if (from === to)
        return true;
    const allowed = exports.VALID_EXCEPTION_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
}
/**
 * Creates a structured DomainException with automatic severity derivation and diagnostic explanation.
 */
function createDomainException(params) {
    if (!params.title || !params.description) {
        throw new errors_js_1.ExceptionInvariantError("Exception title and description are required.");
    }
    if (!params.entityType || !params.entityId) {
        throw new errors_js_1.ExceptionInvariantError("entityType and entityId are required for exception tracking.");
    }
    const now = new Date();
    const id = params.id || `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const severity = params.severity ?? calculateExceptionSeverity(params.type, params.severityContext);
    const rootCause = params.rootCause ?? {};
    const recommendedAction = params.recommendedAction ?? {};
    const automatable = params.automatable ?? false;
    const diagnostic = params.diagnostic ?? generateDiagnosticExplanation(params.type, {
        title: params.title,
        description: params.description,
        entityType: params.entityType,
        entityId: params.entityId,
        rootCause,
        recommendedAction,
        automatable,
    });
    return {
        id,
        organizationId: params.organizationId,
        type: params.type,
        severity,
        status: "OPEN",
        entityType: params.entityType,
        entityId: params.entityId,
        title: params.title,
        description: params.description,
        rootCause,
        recommendedAction,
        diagnostic,
        automatable,
        createdAt: now,
        updatedAt: now,
    };
}
/**
 * Transitions an exception to a new lifecycle status.
 * Enforces valid transition paths and captures resolution metadata.
 */
function transitionException(exception, params) {
    const currentStatus = exception.status;
    const nextStatus = params.nextStatus;
    if (!canTransitionException(currentStatus, nextStatus)) {
        throw new errors_js_1.InvalidStateTransitionError("DomainException", currentStatus, nextStatus, {
            exceptionId: exception.id,
            allowedTransitions: exports.VALID_EXCEPTION_TRANSITIONS[currentStatus],
        });
    }
    const now = new Date();
    const isResolving = nextStatus === "RESOLVED";
    return {
        ...exception,
        status: nextStatus,
        updatedAt: now,
        resolvedAt: isResolving ? now : exception.resolvedAt,
        resolvedBy: isResolving ? params.actorId : exception.resolvedBy,
    };
}
/**
 * Submits a retry on an exception.
 * Critical Invariant: Prompt 20 explicitly forbids marking an exception RESOLVED merely because
 * a retry was submitted. It transitions to RESOLVING.
 */
function retryExceptionDomain(exception, params) {
    if (exception.status === "RESOLVED") {
        throw new errors_js_1.ExceptionInvariantError("Cannot retry an already RESOLVED exception.");
    }
    if (exception.status === "IGNORED") {
        throw new errors_js_1.ExceptionInvariantError("Cannot retry an IGNORED exception. Reopen it first.");
    }
    return transitionException(exception, {
        nextStatus: "RESOLVING",
        actorId: params.actorId,
        reason: params.reason || "Manual retry submitted",
    });
}
//# sourceMappingURL=exception-service.js.map