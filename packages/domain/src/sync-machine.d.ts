/**
 * Synchronization State Machine & Transition Rules
 * Canonical Specification: Section 24 of 01_ENGINEERING_SPEC.md & Prompt 07
 *
 * Rules:
 * 1. Never mark external synchronization as VERIFIED merely because an API request succeeded.
 * 2. Never treat an acknowledged external write as verified until read-back verification succeeds.
 * 3. Transitions must strictly follow the defined asynchronous lifecycle.
 */
import { SyncJob, SyncState, SyncOperation, SyncJobId, OrganizationId, ChannelAccountId, SkuId, WarehouseId, UUID, VerificationStage } from "./types.js";
/**
 * Maps an internal SyncState to an explicit operational VerificationStage.
 * Canonically distinguishes the 6 verification lifecycle stages:
 * 1. request submitted
 * 2. request acknowledged
 * 3. verification pending
 * 4. verified
 * 5. conflict
 * 6. failed
 */
export declare function syncStateToVerificationStage(state: SyncState): VerificationStage;
/**
 * Valid state transitions matrix according to Section 24.
 */
export declare const VALID_SYNC_TRANSITIONS: Record<SyncState, readonly SyncState[]>;
export interface SyncTransitionOptions {
    errorCode?: string;
    errorMessage?: string;
    maxAttempts?: number;
    readBackQuantity?: number;
    skipVerificationCheck?: boolean;
}
export interface CreateSyncJobParams {
    id?: SyncJobId;
    organizationId: OrganizationId;
    channelAccountId: ChannelAccountId;
    skuId: SkuId;
    warehouseId?: WarehouseId;
    operation: SyncOperation;
    targetQuantity: number;
    correlationId: UUID;
    idempotencyKey?: string;
}
/**
 * Checks whether a transition between two sync states is allowed.
 */
export declare function canTransitionSync(from: SyncState, to: SyncState): boolean;
/**
 * Creates a new SyncJob in the initial QUEUED state.
 */
export declare function createSyncJob(params: CreateSyncJobParams): SyncJob;
/**
 * Transitions a SyncJob to the next state, enforcing domain invariants and timestamps.
 * Throws InvalidStateTransitionError if transition is illegal.
 */
export declare function transitionSyncJob(job: SyncJob, nextState: SyncState, options?: SyncTransitionOptions): SyncJob;
//# sourceMappingURL=sync-machine.d.ts.map