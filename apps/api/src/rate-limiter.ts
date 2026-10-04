/**
 * API Rate Limiter
 * Conforming to Prompt 24 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Sliding-window rate limiter preventing abuse and ensuring fair multi-tenant resource access.
 */

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  enabled?: boolean;
}

interface WindowRecord {
  timestamps: number[];
}

export class ApiRateLimiter {
  private readonly records = new Map<string, WindowRecord>();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly enabled: boolean;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 60_000; // 1 minute
    this.maxRequests = options.maxRequests ?? 1000;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Consumes one token from the client window.
   */
  consume(key: string, now: number = Date.now()): {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
    limit: number;
  } {
    if (!this.enabled) {
      return { allowed: true, remaining: this.maxRequests, retryAfterMs: 0, limit: this.maxRequests };
    }

    const windowStart = now - this.windowMs;
    let record = this.records.get(key);

    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out expired timestamps outside current sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxRequests) {
      const oldestInWindow = record.timestamps[0] || now;
      const retryAfterMs = Math.max(0, oldestInWindow + this.windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
        limit: this.maxRequests,
      };
    }

    record.timestamps.push(now);
    const remaining = this.maxRequests - record.timestamps.length;

    return {
      allowed: true,
      remaining,
      retryAfterMs: 0,
      limit: this.maxRequests,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.records.delete(key);
    } else {
      this.records.clear();
    }
  }
}
