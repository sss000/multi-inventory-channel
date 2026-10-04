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
import { DomainException, ExceptionType, ExceptionSeverity, ExceptionStatus, ExceptionId, OrganizationId, UserId, DiagnosticExplanation } from "./types.js";
/**
 * Standard severity classification mapping by exception type.
 */
export declare const DEFAULT_EXCEPTION_SEVERITY: Record<ExceptionType, ExceptionSeverity>;
/**
 * Valid exception lifecycle transitions.
 * Canonical Specification: Section 33 of 01_ENGINEERING_SPEC.md
 * OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVING → RESOLVED
 * Also supports: OPEN → IGNORED
 */
export declare const VALID_EXCEPTION_TRANSITIONS: Record<ExceptionStatus, readonly ExceptionStatus[]>;
export interface DiagnosticContext {
    title?: string;
    description?: string;
    entityType?: string;
    entityId?: string;
    rootCause?: Record<string, unknown>;
    recommendedAction?: Record<string, unknown>;
    automatable?: boolean;
}
/**
 * Generates structured DiagnosticExplanation answering the 6 mandatory questions:
 * 1. WHAT HAPPENED?
 * 2. WHY?
 * 3. WHAT IS AFFECTED?
 * 4. WHAT DID THE SYSTEM TRY?
 * 5. WHAT HAPPENS NEXT?
 * 6. WHAT CAN I DO?
 */
export declare function generateDiagnosticExplanation(type: ExceptionType, context: DiagnosticContext): DiagnosticExplanation;
export interface SeverityScoringContext {
    negativeQuantity?: number;
    financialImpact?: number;
    isCriticalProvider?: boolean;
    isRepeatedFailure?: boolean;
}
/**
 * Computes deterministic severity scoring, taking into account dynamic risk context.
 */
export declare function calculateExceptionSeverity(type: ExceptionType, context?: SeverityScoringContext): ExceptionSeverity;
export interface CreateExceptionParams {
    id?: ExceptionId;
    organizationId: OrganizationId;
    type: ExceptionType;
    severity?: ExceptionSeverity;
    severityContext?: SeverityScoringContext;
    entityType: string;
    entityId: string;
    title: string;
    description: string;
    rootCause?: Record<string, unknown>;
    recommendedAction?: Record<string, unknown>;
    diagnostic?: DiagnosticExplanation;
    automatable?: boolean;
}
export interface TransitionExceptionParams {
    nextStatus: ExceptionStatus;
    actorId?: UserId;
    resolutionNotes?: string;
    reason?: string;
}
/**
 * Checks whether a transition between two exception statuses is allowed.
 */
export declare function canTransitionException(from: ExceptionStatus, to: ExceptionStatus): boolean;
/**
 * Creates a structured DomainException with automatic severity derivation and diagnostic explanation.
 */
export declare function createDomainException(params: CreateExceptionParams): DomainException;
/**
 * Transitions an exception to a new lifecycle status.
 * Enforces valid transition paths and captures resolution metadata.
 */
export declare function transitionException(exception: DomainException, params: TransitionExceptionParams): DomainException;
/**
 * Submits a retry on an exception.
 * Critical Invariant: Prompt 20 explicitly forbids marking an exception RESOLVED merely because
 * a retry was submitted. It transitions to RESOLVING.
 */
export declare function retryExceptionDomain(exception: DomainException, params: {
    actorId?: UserId;
    reason?: string;
}): DomainException;
//# sourceMappingURL=exception-service.d.ts.map