-- ====================================================================
-- MIGRATION: 20260928000001_core_schema.sql
-- DESCRIPTION: Core Relational Database Foundation for Multichannel Inventory Control Platform
-- CANONICAL SPECIFICATION: Section 10-22, 29, 32, 68 of 01_ENGINEERING_SPEC.md & Prompt 04 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS & CONSTRAINED DOMAINS
DO $$ BEGIN
    CREATE TYPE organization_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE product_status AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sku_status AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE channel_provider AS ENUM ('SHOPIFY', 'AMAZON', 'EBAY', 'WALMART');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE channel_account_status AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR', 'PAUSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE mapping_status AS ENUM ('ACTIVE', 'INACTIVE', 'CONFLICT', 'PENDING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE warehouse_type AS ENUM ('WAREHOUSE', 'RETAIL', 'THIRD_PARTY_LOGISTICS', 'VIRTUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE warehouse_status AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE inventory_event_type AS ENUM (
        'INITIAL_IMPORT',
        'PURCHASE_RECEIPT',
        'ORDER_RESERVATION',
        'ORDER_RELEASE',
        'ORDER_FULFILLMENT',
        'ORDER_CANCELLATION',
        'RETURN_RECEIPT',
        'MANUAL_ADJUSTMENT',
        'WAREHOUSE_TRANSFER',
        'DAMAGE',
        'RECOUNT',
        'RECONCILIATION',
        'SYSTEM_CORRECTION'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE inventory_source_type AS ENUM (
        'ORDER',
        'PURCHASE_ORDER',
        'RETURN',
        'MANUAL',
        'SYNC',
        'RECONCILIATION',
        'SYSTEM'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE actor_type AS ENUM ('USER', 'SYSTEM', 'CHANNEL', 'WEBHOOK');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'RELEASED', 'FULFILLED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'EXCEPTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE fulfillment_status AS ENUM ('UNFULFILLED', 'PARTIALLY_FULFILLED', 'FULFILLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE return_status AS ENUM ('REQUESTED', 'APPROVED', 'RECEIVED', 'REJECTED', 'PROCESSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE purchase_order_status AS ENUM ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sync_operation AS ENUM ('UPDATE_INVENTORY', 'CREATE_MAPPING', 'UPDATE_LISTING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sync_status AS ENUM (
        'QUEUED',
        'PROCESSING',
        'SENT',
        'ACKNOWLEDGED',
        'VERIFYING',
        'VERIFIED',
        'RETRYING',
        'FAILED',
        'REQUIRES_ACTION',
        'CONFLICT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reconciliation_status AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reconciliation_classification AS ENUM (
        'MATCH',
        'MINOR_DIFFERENCE',
        'MATERIAL_DIFFERENCE',
        'MISSING_EXTERNAL',
        'MISSING_INTERNAL',
        'STALE_EXTERNAL',
        'UNKNOWN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reconciliation_result_status AS ENUM ('PENDING', 'AUTO_RESOLVED', 'MANUALLY_RESOLVED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE exception_type AS ENUM (
        'INVENTORY_MISMATCH',
        'SYNC_FAILURE',
        'AUTHENTICATION_FAILURE',
        'MISSING_MAPPING',
        'DUPLICATE_MAPPING',
        'NEGATIVE_INVENTORY',
        'ORDER_IMPORT_FAILURE',
        'ORDER_UNMAPPED_SKU',
        'RATE_LIMIT',
        'PROVIDER_OUTAGE',
        'STALE_DATA'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE exception_severity AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE exception_status AS ENUM ('OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'RESOLVING', 'RESOLVED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. HELPER TRIGGER FUNCTION FOR updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. CORE SCHEMA ENTITIES

-- 4.1 organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status organization_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2 users (Application domain users linked to auth.users if available)
-- Note: In Supabase environments auth.users exists; for compatibility we create domain table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status user_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3 roles
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_role_per_org UNIQUE NULLS NOT DISTINCT (organization_id, name)
);

-- 4.4 memberships
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- 4.5 products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    brand TEXT,
    category TEXT,
    status product_status NOT NULL DEFAULT 'DRAFT',
    external_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.6 skus (Stock Keeping Units - tenant scoped code)
CREATE TABLE IF NOT EXISTS skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    barcode TEXT,
    status sku_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

-- 4.7 product_variants
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    barcode TEXT,
    cost DECIMAL(12, 4),
    price DECIMAL(12, 4),
    weight DECIMAL(10, 4),
    dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    status product_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.8 channels
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider channel_provider NOT NULL UNIQUE,
    name TEXT NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.9 channel_accounts
CREATE TABLE IF NOT EXISTS channel_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
    display_name TEXT NOT NULL,
    status channel_account_status NOT NULL DEFAULT 'ACTIVE',
    external_account_id TEXT NOT NULL,
    credential_reference TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_successful_sync_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, channel_id, external_account_id)
);

-- 4.10 channel_product_mappings
CREATE TABLE IF NOT EXISTS channel_product_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    external_product_id TEXT NOT NULL,
    external_variant_id TEXT,
    external_sku TEXT,
    external_identifier JSONB NOT NULL DEFAULT '{}'::jsonb,
    status mapping_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE NULLS NOT DISTINCT (organization_id, channel_account_id, external_product_id, external_variant_id)
);

-- 4.11 warehouses
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type warehouse_type NOT NULL DEFAULT 'WAREHOUSE',
    address JSONB NOT NULL DEFAULT '{}'::jsonb,
    status warehouse_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.12 inventory_balances
-- Canonical invariant: available = on_hand - reserved - safety_stock - damaged - quarantined - allocated
CREATE TABLE IF NOT EXISTS inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    allocated INTEGER NOT NULL DEFAULT 0 CHECK (allocated >= 0),
    damaged INTEGER NOT NULL DEFAULT 0 CHECK (damaged >= 0),
    quarantined INTEGER NOT NULL DEFAULT 0 CHECK (quarantined >= 0),
    in_transit INTEGER NOT NULL DEFAULT 0 CHECK (in_transit >= 0),
    incoming INTEGER NOT NULL DEFAULT 0 CHECK (incoming >= 0),
    safety_stock INTEGER NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, sku_id, warehouse_id)
);

-- 4.13 inventory_reservations
CREATE TABLE IF NOT EXISTS inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    order_id UUID,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status reservation_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    fulfilled_at TIMESTAMPTZ
);

-- 4.14 orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE RESTRICT,
    external_order_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    status order_status NOT NULL DEFAULT 'PENDING',
    payment_status payment_status NOT NULL DEFAULT 'PENDING',
    fulfillment_status fulfillment_status NOT NULL DEFAULT 'UNFULFILLED',
    currency TEXT NOT NULL DEFAULT 'USD',
    subtotal DECIMAL(12, 4) NOT NULL DEFAULT 0,
    tax DECIMAL(12, 4) NOT NULL DEFAULT 0,
    shipping DECIMAL(12, 4) NOT NULL DEFAULT 0,
    discount DECIMAL(12, 4) NOT NULL DEFAULT 0,
    total DECIMAL(12, 4) NOT NULL DEFAULT 0,
    customer JSONB NOT NULL DEFAULT '{}'::jsonb,
    shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    ordered_at TIMESTAMPTZ NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, channel_account_id, external_order_id)
);

-- Add foreign key constraint for inventory_reservations(order_id)
ALTER TABLE inventory_reservations 
    ADD CONSTRAINT fk_reservations_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- 4.15 order_items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
    external_line_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12, 4) NOT NULL DEFAULT 0,
    discount DECIMAL(12, 4) NOT NULL DEFAULT 0,
    tax DECIMAL(12, 4) NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.16 inventory_events (Immutable event ledger)
CREATE TABLE IF NOT EXISTS inventory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    event_type inventory_event_type NOT NULL,
    quantity_delta INTEGER NOT NULL,
    source_type inventory_source_type NOT NULL,
    source_id TEXT NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES inventory_reservations(id) ON DELETE SET NULL,
    before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT UNIQUE,
    correlation_id UUID NOT NULL,
    actor_type actor_type NOT NULL,
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.17 returns
CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    external_return_id TEXT NOT NULL,
    status return_status NOT NULL DEFAULT 'REQUESTED',
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, external_return_id)
);

-- 4.18 suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.19 purchase_orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    status purchase_order_status NOT NULL DEFAULT 'DRAFT',
    ordered_at TIMESTAMPTZ,
    expected_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    currency TEXT NOT NULL DEFAULT 'USD',
    total DECIMAL(12, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.20 purchase_order_items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
    ordered_quantity INTEGER NOT NULL CHECK (ordered_quantity > 0),
    received_quantity INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.21 sync_jobs
CREATE TABLE IF NOT EXISTS sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    operation sync_operation NOT NULL,
    target_quantity INTEGER NOT NULL,
    status sync_status NOT NULL DEFAULT 'QUEUED',
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    idempotency_key TEXT UNIQUE,
    correlation_id UUID NOT NULL,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    last_error_code TEXT,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.22 reconciliation_runs
CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status reconciliation_status NOT NULL DEFAULT 'RUNNING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.23 reconciliation_results
CREATE TABLE IF NOT EXISTS reconciliation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    internal_quantity INTEGER NOT NULL,
    external_quantity INTEGER NOT NULL,
    difference INTEGER NOT NULL,
    classification reconciliation_classification NOT NULL,
    recommended_action TEXT,
    status reconciliation_result_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 4.24 exceptions
CREATE TABLE IF NOT EXISTS exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type exception_type NOT NULL,
    severity exception_severity NOT NULL,
    status exception_status NOT NULL DEFAULT 'OPEN',
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    root_cause JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommended_action JSONB NOT NULL DEFAULT '{}'::jsonb,
    automatable BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 4.25 audit_logs (Strictly Append-Only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_type actor_type NOT NULL,
    actor_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    request_id TEXT,
    correlation_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PERFORMANCE AND INTEGRITY INDEXES
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org_user ON memberships(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_products_org_status ON products(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_skus_org_code ON skus(organization_id, code);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku_id ON product_variants(sku_id);

CREATE INDEX IF NOT EXISTS idx_channel_accounts_org ON channel_accounts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_mappings_account_sku ON channel_product_mappings(channel_account_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_mappings_external ON channel_product_mappings(channel_account_id, external_product_id, external_variant_id);

CREATE INDEX IF NOT EXISTS idx_balances_org_sku ON inventory_balances(organization_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_balances_sku_warehouse ON inventory_balances(sku_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_events_org_sku ON inventory_events(organization_id, sku_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_correlation ON inventory_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_idempotency ON inventory_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_reservations_sku_status ON inventory_reservations(sku_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_order ON inventory_reservations(order_id);

CREATE INDEX IF NOT EXISTS idx_orders_org_channel ON orders(organization_id, channel_account_id, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku_id);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_account_status ON sync_jobs(channel_account_id, status, queued_at);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_correlation ON sync_jobs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_idempotency ON sync_jobs(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_account ON reconciliation_runs(channel_account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_results_run ON reconciliation_results(reconciliation_run_id, status);

CREATE INDEX IF NOT EXISTS idx_exceptions_org_status_sev ON exceptions(organization_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_entity ON audit_logs(organization_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation ON audit_logs(correlation_id);

-- 6. AUTOMATIC updated_at TRIGGERS
CREATE OR REPLACE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_skus_updated_at BEFORE UPDATE ON skus FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_channel_accounts_updated_at BEFORE UPDATE ON channel_accounts FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_channel_product_mappings_updated_at BEFORE UPDATE ON channel_product_mappings FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_inventory_balances_updated_at BEFORE UPDATE ON inventory_balances FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_returns_updated_at BEFORE UPDATE ON returns FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_sync_jobs_updated_at BEFORE UPDATE ON sync_jobs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER trg_exceptions_updated_at BEFORE UPDATE ON exceptions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
