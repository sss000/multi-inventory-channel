import * as crypto from "node:crypto";
import { loadServerConfig } from "@platform/config";
import { BillingPlan, PLAN_PRICING } from "@platform/contracts";
import {
  BillingWebhookSignatureError,
  StripeBillingEvent,
} from "@platform/domain";

export interface StripeBillingConfig {
  isConfigured: boolean;
  secretKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
}

export function getStripeBillingConfig(): StripeBillingConfig {
  const config = loadServerConfig();
  return {
    isConfigured: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET),
    secretKeyConfigured: Boolean(config.STRIPE_SECRET_KEY),
    webhookSecretConfigured: Boolean(config.STRIPE_WEBHOOK_SECRET),
  };
}

/**
 * Generates a standard Stripe signature header value: t={timestamp},v1={hash}
 * Useful for automated tests, mock providers, and verification testing.
 */
export function generateStripeSignature(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signedPayload, "utf8");
  const signature = hmac.digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export interface VerifyStripeWebhookOptions {
  payload: string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
}

/**
 * Verifies a Stripe webhook payload against the signature header.
 * Enforces HMAC-SHA256, timingSafeEqual, and timestamp tolerance (default: 300s).
 */
export function verifyStripeWebhookSignature(
  options: VerifyStripeWebhookOptions
): { valid: boolean; timestamp: number } {
  const { payload, signatureHeader, secret, toleranceSeconds = 300 } = options;

  if (!signatureHeader || typeof signatureHeader !== "string") {
    throw new BillingWebhookSignatureError("Missing Stripe signature header.");
  }

  if (!secret) {
    throw new BillingWebhookSignatureError("Missing Stripe webhook secret for verification.");
  }

  const parts = signatureHeader.split(",");
  let timestampStr: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);

    if (key === "t") {
      timestampStr = val;
    } else if (key === "v1") {
      signatures.push(val);
    }
  }

  if (!timestampStr) {
    throw new BillingWebhookSignatureError("Stripe signature header is missing timestamp ('t').");
  }

  if (signatures.length === 0) {
    throw new BillingWebhookSignatureError("Stripe signature header is missing v1 signature ('v1').");
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    throw new BillingWebhookSignatureError("Stripe signature timestamp is invalid.");
  }

  // Check timestamp tolerance if specified
  if (toleranceSeconds > 0) {
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - timestamp);
    if (diff > toleranceSeconds) {
      throw new BillingWebhookSignatureError(
        `Stripe webhook signature timestamp expired (${diff}s difference exceeds tolerance of ${toleranceSeconds}s).`
      );
    }
  }

  const signedPayload = `${timestampStr}.${payload}`;
  const expectedHmac = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expectedHmac, "hex");

  let matchFound = false;
  for (const sig of signatures) {
    try {
      const sigBuf = Buffer.from(sig, "hex");
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        matchFound = true;
        break;
      }
    } catch {
      // In case of non-hex input, continue
    }
  }

  if (!matchFound) {
    throw new BillingWebhookSignatureError("Stripe signature verification failed: signature mismatch.");
  }

  return { valid: true, timestamp };
}

export interface StripeBillingClientOptions {
  secretKey?: string;
  webhookSecret?: string;
  defaultSuccessUrl?: string;
  defaultCancelUrl?: string;
  defaultPortalReturnUrl?: string;
}

export interface CreateCheckoutSessionParams {
  organizationId: string;
  plan: BillingPlan;
  successUrl?: string;
  cancelUrl?: string;
  customerId?: string;
}

export interface CreateCheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface CreatePortalSessionParams {
  organizationId: string;
  customerId: string;
  returnUrl?: string;
}

export interface CreatePortalSessionResult {
  url: string;
}

/**
 * Stripe Billing Client
 * Implements webhook verification, checkout session creation, and customer portal session creation.
 */
export class StripeBillingClient {
  private readonly secretKey?: string;
  private readonly webhookSecret?: string;
  private readonly defaultSuccessUrl: string;
  private readonly defaultCancelUrl: string;
  private readonly defaultPortalReturnUrl: string;

  constructor(options: StripeBillingClientOptions = {}) {
    const config = loadServerConfig();
    this.secretKey = options.secretKey || config.STRIPE_SECRET_KEY;
    this.webhookSecret = options.webhookSecret || config.STRIPE_WEBHOOK_SECRET;
    this.defaultSuccessUrl =
      options.defaultSuccessUrl || "https://app.multichannel-inventory.internal/billing?checkout=success";
    this.defaultCancelUrl =
      options.defaultCancelUrl || "https://app.multichannel-inventory.internal/billing?checkout=canceled";
    this.defaultPortalReturnUrl =
      options.defaultPortalReturnUrl || "https://app.multichannel-inventory.internal/billing";
  }

  getWebhookSecret(): string | undefined {
    return this.webhookSecret;
  }

  /**
   * Verifies and constructs a verified Stripe billing event.
   */
  constructEvent(
    payload: string,
    signatureHeader: string,
    customSecret?: string,
    toleranceSeconds?: number
  ): StripeBillingEvent {
    const secret = customSecret || this.webhookSecret;
    if (!secret) {
      throw new BillingWebhookSignatureError("Stripe webhook secret is not configured.");
    }

    verifyStripeWebhookSignature({
      payload,
      signatureHeader,
      secret,
      toleranceSeconds,
    });

    try {
      const parsed = JSON.parse(payload) as StripeBillingEvent;
      return parsed;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BillingWebhookSignatureError(`Invalid JSON payload in Stripe webhook: ${msg}`);
    }
  }

  /**
   * Generates a checkout session for subscribing to or upgrading a plan.
   */
  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CreateCheckoutSessionResult> {
    const pricing = PLAN_PRICING[params.plan];
    const sessionId = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const successUrl = params.successUrl || this.defaultSuccessUrl;
    const cancelUrl = params.cancelUrl || this.defaultCancelUrl;

    const url =
      `https://checkout.stripe.com/c/pay/${sessionId}?plan=${params.plan}&org=${encodeURIComponent(
        params.organizationId
      )}&price=${pricing.monthlyPriceCents}&success=${encodeURIComponent(
        successUrl
      )}&cancel=${encodeURIComponent(cancelUrl)}`;

    return {
      sessionId,
      url,
    };
  }

  /**
   * Generates a Customer Billing Portal session for managing payment methods and invoices.
   */
  async createPortalSession(params: CreatePortalSessionParams): Promise<CreatePortalSessionResult> {
    const portalId = `bps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const returnUrl = params.returnUrl || this.defaultPortalReturnUrl;

    const url =
      `https://billing.stripe.com/p/session/${portalId}?customer=${encodeURIComponent(
        params.customerId
      )}&return=${encodeURIComponent(returnUrl)}`;

    return {
      url,
    };
  }
}
