/**
 * Provider Error Normalizer Interface & Base Parser
 * Canonical Specifications: Section 25 of 01_ENGINEERING_SPEC.md & Prompt 13
 */

import { ChannelProvider } from "@platform/contracts";
import { ProviderError } from "./provider-error.js";

export interface ProviderErrorNormalizer {
  readonly provider: ChannelProvider;
  normalize(error: unknown, context?: Record<string, unknown>): ProviderError;
}

/**
 * Extracts numeric retry-after from header or seconds.
 */
export function extractRetryAfterMs(headerVal?: unknown): number | undefined {
  if (headerVal === undefined || headerVal === null) return undefined;
  if (typeof headerVal === "number") return Math.max(0, headerVal * 1000);
  if (typeof headerVal === "string") {
    const sec = parseInt(headerVal, 10);
    if (!isNaN(sec)) return Math.max(0, sec * 1000);
    const dateParsed = Date.parse(headerVal);
    if (!isNaN(dateParsed)) return Math.max(0, dateParsed - Date.now());
  }
  return undefined;
}
