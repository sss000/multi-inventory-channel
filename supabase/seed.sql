-- ====================================================================
-- SEED DATA: supabase/seed.sql
-- DESCRIPTION: Development and testing baseline seeds (channels, system roles, demo organization)
-- NOTE: Never used as fake production data. Only applied in development/test environments.
-- ====================================================================

-- 1. CHANNELS (Global supported providers)
INSERT INTO channels (id, provider, name, capabilities)
VALUES
    (
        'c0000000-0000-0000-0000-000000000001',
        'SHOPIFY',
        'Shopify',
        '{"inventory_levels": true, "multi_location": true, "webhooks": true, "orders": true, "rate_limit_rpm": 120}'::jsonb
    ),
    (
        'c0000000-0000-0000-0000-000000000002',
        'AMAZON',
        'Amazon SP-API',
        '{"inventory_feeds": true, "fba": true, "fbm": true, "orders": true, "rate_limit_rpm": 60}'::jsonb
    ),
    (
        'c0000000-0000-0000-0000-000000000003',
        'EBAY',
        'eBay',
        '{"inventory_api": true, "orders": true, "webhooks": false, "rate_limit_rpm": 100}'::jsonb
    ),
    (
        'c0000000-0000-0000-0000-000000000004',
        'WALMART',
        'Walmart Marketplace',
        '{"inventory_feeds": true, "orders": true, "rate_limit_rpm": 60}'::jsonb
    )
ON CONFLICT (provider) DO UPDATE 
SET capabilities = EXCLUDED.capabilities, name = EXCLUDED.name;

-- 2. SYSTEM ROLES (Global system role templates where organization_id IS NULL)
INSERT INTO roles (id, organization_id, name, permissions)
VALUES
    (
        'r0000000-0000-0000-0000-000000000001',
        NULL,
        'OWNER',
        '["*"]'::jsonb
    ),
    (
        'r0000000-0000-0000-0000-000000000002',
        NULL,
        'ADMIN',
        '["org:manage", "inventory:*", "orders:*", "channels:*", "reconciliation:*", "exceptions:*", "audit:read"]'::jsonb
    ),
    (
        'r0000000-0000-0000-0000-000000000003',
        NULL,
        'MANAGER',
        '["inventory:*", "orders:*", "channels:read", "channels:sync", "reconciliation:*", "exceptions:*"]'::jsonb
    ),
    (
        'r0000000-0000-0000-0000-000000000004',
        NULL,
        'OPERATOR',
        '["inventory:read", "inventory:adjust", "orders:read", "orders:fulfill", "exceptions:read", "exceptions:resolve"]'::jsonb
    ),
    (
        'r0000000-0000-0000-0000-000000000005',
        NULL,
        'VIEWER',
        '["inventory:read", "orders:read", "channels:read", "reconciliation:read", "exceptions:read"]'::jsonb
    )
ON CONFLICT (organization_id, name) DO UPDATE
SET permissions = EXCLUDED.permissions;

-- 3. DEVELOPMENT DEMO TENANT
INSERT INTO organizations (id, name, slug, status)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        'Acme Ecommerce Corp',
        'acme-ecommerce',
        'ACTIVE'
    )
ON CONFLICT (slug) DO NOTHING;

-- 4. DEVELOPMENT DEMO USER
INSERT INTO users (id, email, name, status)
VALUES
    (
        'u0000000-0000-0000-0000-000000000001',
        'demo-merchant@example.com',
        'Demo Merchant',
        'ACTIVE'
    )
ON CONFLICT (email) DO NOTHING;

-- 5. MEMBERSHIP (Demo merchant as OWNER of Acme)
INSERT INTO memberships (id, organization_id, user_id, role_id)
VALUES
    (
        'm0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'u0000000-0000-0000-0000-000000000001',
        'r0000000-0000-0000-0000-000000000001'
    )
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- 6. PRIMARY WAREHOUSE FOR DEMO TENANT
INSERT INTO warehouses (id, organization_id, name, type, address, status)
VALUES
    (
        'w0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'Main Logistics Center',
        'WAREHOUSE',
        '{"city": "Austin", "state": "TX", "country": "USA", "postal_code": "78701"}'::jsonb,
        'ACTIVE'
    )
ON CONFLICT DO NOTHING;
