"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDomainAuditRecord = createDomainAuditRecord;
exports.assertAuditLogImmutable = assertAuditLogImmutable;
exports.reconstructDiscrepancyTrail = reconstructDiscrepancyTrail;
const errors_js_1 = require("./errors.js");
/**
 * Validates and constructs an immutable audit record in pure domain space.
 */
function createDomainAuditRecord(params) {
    if (!params.organizationId) {
        throw new errors_js_1.AuditInvariantError("Audit record must have an organizationId.");
    }
    if (!params.actorType) {
        throw new errors_js_1.AuditInvariantError("Audit record must have an actorType.");
    }
    if (!params.action || params.action.trim() === "") {
        throw new errors_js_1.AuditInvariantError("Audit record must have a non-empty action.");
    }
    if (!params.entityType || params.entityType.trim() === "") {
        throw new errors_js_1.AuditInvariantError("Audit record must have a non-empty entityType.");
    }
    if (!params.entityId || params.entityId.trim() === "") {
        throw new errors_js_1.AuditInvariantError("Audit record must have a non-empty entityId.");
    }
    if (!params.correlationId) {
        throw new errors_js_1.AuditInvariantError("Audit record must have a correlationId.");
    }
    return {
        id: params.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        organizationId: params.organizationId,
        actorType: params.actorType,
        actorId: params.actorId || undefined,
        action: params.action.trim(),
        entityType: params.entityType.trim(),
        entityId: params.entityId.trim(),
        beforeState: params.beforeState ?? undefined,
        afterState: params.afterState ?? undefined,
        reason: params.reason ?? undefined,
        requestId: params.requestId ?? undefined,
        correlationId: params.correlationId,
        createdAt: params.createdAt || new Date(),
    };
}
/**
 * Enforces the append-only invariant: modifying or deleting historical audit records is forbidden.
 */
function assertAuditLogImmutable(action) {
    throw new errors_js_1.ImmutableAuditLogError(`Audit logs are strictly append-only. Historical audit records cannot be ${action === "UPDATE" ? "modified" : "deleted"}.`);
}
function reconstructDiscrepancyTrail(records) {
    if (!records || records.length === 0) {
        throw new errors_js_1.AuditInvariantError("Cannot reconstruct audit trail from empty records.");
    }
    // Normalize each record
    const normalized = records.map((r) => ({
        id: r.id,
        organizationId: (r.organizationId || r.organization_id || ""),
        actorType: (r.actorType || r.actor_type || "SYSTEM"),
        actorId: r.actorId !== undefined ? r.actorId : (r.actor_id !== undefined ? r.actor_id : null),
        action: r.action,
        entityType: r.entityType || r.entity_type || "",
        entityId: r.entityId || r.entity_id || "",
        beforeState: r.beforeState !== undefined ? r.beforeState : (r.before_state !== undefined ? r.before_state : null),
        afterState: r.afterState !== undefined ? r.afterState : (r.after_state !== undefined ? r.after_state : null),
        reason: r.reason !== undefined ? r.reason : null,
        requestId: r.requestId !== undefined ? r.requestId : (r.request_id !== undefined ? r.request_id : null),
        correlationId: r.correlationId || r.correlation_id || "",
        createdAt: r.createdAt || r.created_at || new Date().toISOString(),
    }));
    // Sort chronologically ascending
    const sorted = [...normalized].sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeA - timeB;
    });
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    // 1. Before state: initial record's before_state, or first available beforeState
    const beforeState = first.beforeState || null;
    // 2. Event: the triggering or primary mutation action
    const eventAction = first.action;
    // 3. Actor: who initiated the event
    const actor = {
        type: first.actorType,
        id: first.actorId || null,
    };
    // 4. Reason: explanation recorded in the audit event
    const reason = first.reason || last.reason || null;
    // 5. After state: state after the initial event (or latest afterState in chain)
    let afterState = first.afterState || null;
    for (const r of sorted) {
        if (r.afterState) {
            afterState = r.afterState;
        }
    }
    // 6. Channel impact: check for channel account or marketplace events
    let channelImpact = null;
    const channelEvent = sorted.find((r) => r.entityType.toLowerCase().includes("channel") ||
        Boolean(r.afterState?.["channelAccountId"]) ||
        Boolean(r.beforeState?.["channelAccountId"]));
    if (channelEvent) {
        const state = channelEvent.afterState || channelEvent.beforeState || {};
        channelImpact = {
            channelAccountId: state["channelAccountId"] || (channelEvent.entityId ?? undefined),
            channelName: state["channelName"] || undefined,
            previousChannelQuantity: typeof state["previousChannelQuantity"] === "number" ? state["previousChannelQuantity"] : undefined,
            targetChannelQuantity: typeof state["targetChannelQuantity"] === "number" ? state["targetChannelQuantity"] : undefined,
            status: state["channelStatus"] || (channelEvent.action.includes("CONFLICT") ? "CONFLICT" : "AFFECTED"),
        };
    }
    // 7. Synchronization result: check for synchronization job execution and verification outcome
    let synchronizationResult = null;
    const syncRecord = [...sorted].reverse().find((r) => r.entityType === "sync_job" ||
        Boolean(r.afterState?.["syncJobId"]) ||
        r.action.includes("VERIF") ||
        r.action.includes("READ_BACK")) || sorted.find((r) => r.action.startsWith("SYNC_"));
    if (syncRecord) {
        const sState = syncRecord.afterState || {};
        synchronizationResult = {
            syncJobId: sState["syncJobId"] || syncRecord.entityId,
            status: sState["syncStatus"] || (syncRecord.action.includes("FAILED") ? "FAILED" : "VERIFIED"),
            verifiedAt: sState["verifiedAt"] || (syncRecord.createdAt instanceof Date ? syncRecord.createdAt.toISOString() : String(syncRecord.createdAt)),
            stage: sState["stage"] || (syncRecord.action.includes("CONFLICT") ? "CONFLICT" : "VERIFIED"),
        };
    }
    // 8. Resolution: check for exception resolution, reconciliation approval, or manual fix
    let resolution = null;
    const resolutionRecord = sorted.find((r) => r.action.includes("RESOLVED") ||
        r.action.includes("APPROVED") ||
        r.action.includes("RECONCILED") ||
        r.action.includes("CORRECTION"));
    if (resolutionRecord) {
        const rState = resolutionRecord.afterState || {};
        resolution = {
            status: rState["status"] || "RESOLVED",
            resolvedBy: resolutionRecord.actorId || null,
            resolvedAt: resolutionRecord.createdAt instanceof Date
                ? resolutionRecord.createdAt.toISOString()
                : String(resolutionRecord.createdAt),
            notes: resolutionRecord.reason || rState["notes"] || null,
        };
    }
    return {
        entityType: first.entityType,
        entityId: first.entityId,
        correlationId: first.correlationId,
        timestamp: first.createdAt instanceof Date ? first.createdAt.toISOString() : String(first.createdAt),
        before: beforeState,
        event: eventAction,
        actor,
        reason,
        after: afterState,
        channelImpact,
        synchronizationResult,
        resolution,
        timeline: sorted.map((r) => ({
            id: r.id,
            organizationId: r.organizationId,
            actorType: r.actorType,
            actorId: r.actorId || null,
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            beforeState: r.beforeState || null,
            afterState: r.afterState || null,
            reason: r.reason || null,
            requestId: r.requestId || null,
            correlationId: r.correlationId,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        })),
    };
}
//# sourceMappingURL=audit-service.js.map