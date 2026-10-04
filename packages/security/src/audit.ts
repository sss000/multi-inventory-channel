/**
 * Authentication Audit Event System
 * Canonical Specification: Section 68 of 01_ENGINEERING_SPEC.md & Prompt 05
 */

export type AuthAuditEventType =
  | "AUTH_REGISTER"
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILURE"
  | "AUTH_LOGOUT"
  | "AUTH_TOKEN_REFRESH"
  | "AUTH_PASSWORD_RESET_REQUEST"
  | "AUTH_PASSWORD_RESET_SUCCESS"
  | "AUTH_BRUTE_FORCE_LOCKOUT";

export interface AuthAuditEvent {
  id: string;
  eventType: AuthAuditEventType;
  timestamp: string;
  email: string;
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

type AuthAuditEventListener = (event: AuthAuditEvent) => void;

class AuthAuditEmitter {
  private readonly listeners: AuthAuditEventListener[] = [];
  private readonly events: AuthAuditEvent[] = [];

  emit(eventData: Omit<AuthAuditEvent, "id" | "timestamp">): AuthAuditEvent {
    const event: AuthAuditEvent = {
      id: `audit_auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...eventData,
    };

    this.events.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in auth audit listener:", err);
      }
    }

    return event;
  }

  subscribe(listener: AuthAuditEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  getRecentEvents(limit: number = 50): readonly AuthAuditEvent[] {
    return this.events.slice(-limit);
  }

  clear(): void {
    this.events.length = 0;
  }
}

export const authAuditEmitter = new AuthAuditEmitter();
