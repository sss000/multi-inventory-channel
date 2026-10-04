/**
 * Brute-Force Protection and Rate Limiting
 * Canonical Specification: Prompt 05 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Enforces attempt tracking, progressive delays, and temporary lockout on authentication endpoints.
 */

export interface BruteForceOptions {
  maxAttempts: number;
  lockoutDurationMs: number;
  windowMs: number;
}

export interface BruteForceStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterMs: number;
}

interface AttemptRecord {
  failures: number;
  firstFailureTime: number;
  lastFailureTime: number;
  lockedUntil: number | null;
}

export class BruteForceLimiter {
  private readonly records = new Map<string, AttemptRecord>();
  private readonly maxAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly windowMs: number;

  constructor(options: Partial<BruteForceOptions> = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.lockoutDurationMs = options.lockoutDurationMs ?? 15 * 60 * 1000; // 15 minutes
    this.windowMs = options.windowMs ?? 15 * 60 * 1000; // 15 minutes window
  }

  /**
   * Checks whether the given identifier (e.g. IP, IP+email) is currently allowed.
   */
  checkStatus(identifier: string, now: number = Date.now()): BruteForceStatus {
    const record = this.records.get(identifier);
    if (!record) {
      return { allowed: true, remainingAttempts: this.maxAttempts, retryAfterMs: 0 };
    }

    // Check if lockout is currently active
    if (record.lockedUntil !== null) {
      if (now < record.lockedUntil) {
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfterMs: record.lockedUntil - now,
        };
      }
      // Lockout expired, reset record
      this.records.delete(identifier);
      return { allowed: true, remainingAttempts: this.maxAttempts, retryAfterMs: 0 };
    }

    // Check if window has expired
    if (now - record.firstFailureTime > this.windowMs) {
      this.records.delete(identifier);
      return { allowed: true, remainingAttempts: this.maxAttempts, retryAfterMs: 0 };
    }

    const remainingAttempts = Math.max(0, this.maxAttempts - record.failures);
    return {
      allowed: remainingAttempts > 0,
      remainingAttempts,
      retryAfterMs: 0,
    };
  }

  /**
   * Records a failed authentication attempt.
   */
  recordFailure(identifier: string, now: number = Date.now()): BruteForceStatus {
    let record = this.records.get(identifier);

    if (!record || now - record.firstFailureTime > this.windowMs) {
      record = {
        failures: 1,
        firstFailureTime: now,
        lastFailureTime: now,
        lockedUntil: null,
      };
      this.records.set(identifier, record);
    } else {
      record.failures += 1;
      record.lastFailureTime = now;
    }

    if (record.failures >= this.maxAttempts) {
      record.lockedUntil = now + this.lockoutDurationMs;
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterMs: this.lockoutDurationMs,
      };
    }

    return {
      allowed: true,
      remainingAttempts: this.maxAttempts - record.failures,
      retryAfterMs: 0,
    };
  }

  /**
   * Resets failed attempts after a successful authentication.
   */
  recordSuccess(identifier: string): void {
    this.records.delete(identifier);
  }

  /**
   * Clears all tracking records (useful in tests).
   */
  clear(): void {
    this.records.clear();
  }
}

/**
 * Global default brute force limiter instance for auth endpoints.
 */
export const defaultBruteForceLimiter = new BruteForceLimiter();
