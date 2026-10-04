import { AuditRecord, ActorType, OrganizationId, UUID } from "./types.js";
/**
 * Audit Domain Service & Causal Reconstruction Engine
 * Canonical Specification: Sections 35, 36, 68, 114 of 01_ENGINEERING_SPEC.md & Prompt 21
 */
export interface CreateAuditRecordParams {
    id?: string;
    organizationId: OrganizationId;
    actorType: ActorType;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: UUID;
    createdAt?: Date;
}
/**
 * Validates and constructs an immutable audit record in pure domain space.
 */
export declare function createDomainAuditRecord(params: CreateAuditRecordParams): AuditRecord;
/**
 * Enforces the append-only invariant: modifying or deleting historical audit records is forbidden.
 */
export declare function assertAuditLogImmutable(action: "UPDATE" | "DELETE"): never;
export interface ReconstructedAuditTrail {
    entityType: string;
    entityId: string;
    correlationId: string;
    timestamp: string;
    before: Record<string, unknown> | null;
    event: string;
    actor: {
        type: ActorType;
        id: string | null;
    };
    reason: string | null;
    after: Record<string, unknown> | null;
    channelImpact: {
        channelAccountId?: string;
        channelName?: string;
        previousChannelQuantity?: number;
        targetChannelQuantity?: number;
        status: string;
    } | null;
    synchronizationResult: {
        syncJobId?: string;
        status: string;
        verifiedAt?: string | null;
        stage: string;
    } | null;
    resolution: {
        status: string;
        resolvedBy?: string | null;
        resolvedAt?: string | null;
        notes?: string | null;
    } | null;
    timeline: Array<{
        id: string;
        organizationId: string;
        actorType: ActorType;
        actorId: string | null;
        action: string;
        entityType: string;
        entityId: string;
        beforeState: Record<string, unknown> | null;
        afterState: Record<string, unknown> | null;
        reason: string | null;
        requestId: string | null;
        correlationId: string;
        createdAt: string;
    }>;
}
/**
 * Canonical Acceptance Test Reconstruction (Section 114 & Prompt 21)
 *
 * For any inventory discrepancy or material event, reconstructs:
 * 1. before
 * 2. event
 * 3. actor
 * 4. reason
 * 5. after
 * 6. channel impact
 * 7. synchronization result
 * 8. resolution
 */
export interface AuditTrailInputRecord {
    id: string;
    organizationId?: string;
    organization_id?: string;
    actorType?: ActorType;
    actor_type?: ActorType;
    actorId?: string | null;
    actor_id?: string | null;
    action: string;
    entityType?: string;
    entity_type?: string;
    entityId?: string;
    entity_id?: string;
    beforeState?: Record<string, unknown> | null;
    before_state?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    after_state?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    request_id?: string | null;
    correlationId?: string;
    correlation_id?: string;
    createdAt?: string | Date;
    created_at?: string | Date;
}
export declare function reconstructDiscrepancyTrail(records: AuditTrailInputRecord[]): ReconstructedAuditTrail;
//# sourceMappingURL=audit-service.d.ts.map