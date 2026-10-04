/**
 * Shopify API Version Validation & Lifecycle Guard
 * Canonical Specification: Prompt 14 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * 
 * Rules:
 * 1. Do not use unstable or release-candidate APIs in production.
 * 2. Validate configured version against known stable Shopify release windows (YYYY-MM format).
 * 3. Report clear startup diagnostics when an unsupported or obsolete version is configured.
 */

import {
  SHOPIFY_STABLE_API_VERSIONS,
  SHOPIFY_DEFAULT_API_VERSION,
  ShopifyApiVersion,
} from "./shopify-types.js";

export interface VersionValidationResult {
  valid: boolean;
  version: string;
  isStable: boolean;
  isReleaseCandidate: boolean;
  isUnstable: boolean;
  error?: string;
}

/**
 * Validates that a configured Shopify API version is a valid, officially supported stable version.
 */
export function validateShopifyApiVersion(versionInput?: string): VersionValidationResult {
  const version = versionInput?.trim() || SHOPIFY_DEFAULT_API_VERSION;

  const isUnstable = version.toLowerCase().includes("unstable");
  const isReleaseCandidate = /rc\d*$/i.test(version);
  const isValidFormat = /^\d{4}-\d{2}$/.test(version);

  if (isUnstable) {
    return {
      valid: false,
      version,
      isStable: false,
      isReleaseCandidate: false,
      isUnstable: true,
      error: `Shopify API version '${version}' is unstable and strictly prohibited in production.`,
    };
  }

  if (isReleaseCandidate) {
    return {
      valid: false,
      version,
      isStable: false,
      isReleaseCandidate: true,
      isUnstable: false,
      error: `Shopify API version '${version}' is a release-candidate and strictly prohibited in production.`,
    };
  }

  if (!isValidFormat) {
    return {
      valid: false,
      version,
      isStable: false,
      isReleaseCandidate: false,
      isUnstable: false,
      error: `Shopify API version '${version}' must follow the standard 'YYYY-MM' release format.`,
    };
  }

  const isSupported = (SHOPIFY_STABLE_API_VERSIONS as readonly string[]).includes(version);
  if (!isSupported) {
    return {
      valid: false,
      version,
      isStable: false,
      isReleaseCandidate: false,
      isUnstable: false,
      error: `Configured Shopify API version '${version}' is not in the supported stable set (${SHOPIFY_STABLE_API_VERSIONS.join(
        ", "
      )}). An upgrade or compatibility update is required.`,
    };
  }

  return {
    valid: true,
    version,
    isStable: true,
    isReleaseCandidate: false,
    isUnstable: false,
  };
}

/**
 * Assertive startup check that throws when an invalid or unstable version is supplied.
 */
export function assertValidShopifyApiVersion(versionInput?: string): ShopifyApiVersion {
  const res = validateShopifyApiVersion(versionInput);
  if (!res.valid) {
    throw new Error(`Shopify API Version Validation Failed: ${res.error}`);
  }
  return res.version as ShopifyApiVersion;
}
