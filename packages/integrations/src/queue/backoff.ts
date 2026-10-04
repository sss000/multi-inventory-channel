/**
 * Exponential Backoff & Jitter Calculation
 * Canonical Specification: Prompt 11 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Prevents thundering herd problems across distributed workers and provider rate limits.
 */

export interface BackoffOptions {
  initialDelayMs?: number; // Default 1000 ms
  multiplier?: number; // Default 2
  jitterFactor?: number; // Default 0.2 (+/- 20% random spread)
  maxDelayMs?: number; // Default 60,000 ms (1 minute)
}

/**
 * Calculates exponential backoff with full jitter for a given retry attempt.
 *
 * Formula:
 *   baseDelay = min(initialDelayMs * multiplier^(attempt - 1), maxDelayMs)
 *   jitter = (random * 2 - 1) * jitterFactor * baseDelay
 *   totalDelay = max(0, round(baseDelay + jitter))
 */
export function calculateBackoffWithJitter(
  attempt: number,
  options: BackoffOptions = {}
): number {
  if (attempt <= 0) return 0;

  const initialDelay = options.initialDelayMs ?? 1000;
  const multiplier = options.multiplier ?? 2;
  const jitterFactor = options.jitterFactor ?? 0.2;
  const maxDelay = options.maxDelayMs ?? 60000;

  // 1. Calculate raw exponential delay
  const rawExponential = initialDelay * Math.pow(multiplier, attempt - 1);

  // 2. Cap at max delay
  const cappedDelay = Math.min(rawExponential, maxDelay);

  // 3. Apply uniform jitter (+/- jitterFactor)
  const randomFactor = (Math.random() * 2 - 1) * jitterFactor; // range: [-jitterFactor, +jitterFactor]
  const jitterAmount = cappedDelay * randomFactor;

  // 4. Return non-negative bounded integer delay
  const finalDelay = Math.round(cappedDelay + jitterAmount);
  return Math.max(0, finalDelay);
}

/**
 * Determines whether a job is eligible for retry based on attempt count and limits.
 */
export function isRetryEligible(currentAttempts: number, maxAttempts: number): boolean {
  return currentAttempts < maxAttempts;
}
