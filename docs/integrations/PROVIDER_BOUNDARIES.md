# External Provider Integration Boundaries

## Adapters

All external channel interactions flow through provider adapters defined in `packages/integrations`:
- `ShopifyAdapter` (Shopify GraphQL/REST Admin APIs)
- `AmazonAdapter` (Amazon Selling Partner API - SP-API)
- `StripeBillingAdapter` (Stripe Billing & Subscriptions)

## Boundary Invariants

1. **Acknowledgment != Verification**:
   - An external write response (HTTP 200 / feed submitted) only proves acknowledgment by the provider.
   - The platform status remains `QUEUED` or `ACKNOWLEDGED` until read-back verification queries the provider and confirms the new inventory level is live.
2. **No Fake / Silent Fallbacks**:
   - If a provider is unreachable, record provider downtime explicitly. Never fabricate fake successful responses.
3. **Rate Limiting & Token Refresh**:
   - Provider adapters must honor rate limits (leaky bucket for Shopify, token bucket for Amazon) and encapsulate OAuth token refreshes safely.
