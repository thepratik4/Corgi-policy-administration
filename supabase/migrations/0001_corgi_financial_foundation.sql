-- Corgi Track 1 Policy Administration — Supabase PostgreSQL Foundation Migration
-- Idempotent, immutable append-only financial subledger with integer USD cents precision.

-- 1. Teardown in reverse dependency order for clean re-runs in Supabase SQL Editor
-- (Note: DROP TABLE ... CASCADE automatically drops any triggers on the tables)
DROP FUNCTION IF EXISTS enforce_balanced_journal_entry() CASCADE;
DROP FUNCTION IF EXISTS prevent_posted_journal_mutation() CASCADE;

DROP TABLE IF EXISTS corgi_system_state CASCADE;
DROP TABLE IF EXISTS reconciliation_items CASCADE;
DROP TABLE IF EXISTS reserve_adjustments CASCADE;
DROP TABLE IF EXISTS claims CASCADE;
DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS journal_lines CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS ledger_accounts CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS policy_coverages CASCADE;
DROP TABLE IF EXISTS policies CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS brokers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS approval_status CASCADE;
DROP TYPE IF EXISTS journal_status CASCADE;
DROP TYPE IF EXISTS normal_balance CASCADE;
DROP TYPE IF EXISTS account_category CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS policy_status CASCADE;
DROP TYPE IF EXISTS kyb_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS claim_status CASCADE;
DROP TYPE IF EXISTS payout_status CASCADE;

-- 2. Domain Enums
CREATE TYPE user_role AS ENUM ('OPERATIONS_ADMIN', 'FINANCE_APPROVER');
CREATE TYPE kyb_status AS ENUM ('Approved', 'Pending', 'Failed');
CREATE TYPE policy_status AS ENUM ('Draft', 'Pending', 'Active', 'Cancelled', 'Expired');
CREATE TYPE payment_status AS ENUM ('Pending', 'Settled', 'Succeeded', 'Failed', 'Refunded');
CREATE TYPE account_category AS ENUM ('Asset', 'Liability', 'Revenue', 'Expense');
CREATE TYPE normal_balance AS ENUM ('Debit', 'Credit');
CREATE TYPE journal_status AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE approval_status AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE claim_status AS ENUM ('Open', 'Under Review', 'Approved', 'Settled', 'Denied');
CREATE TYPE payout_status AS ENUM ('Unpaid', 'Pending Approval', 'Partially Paid', 'Paid in Full', 'Hold');

-- 3. Core Relational Tables
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supabase_uid TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  role_label TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Commercial Insurance',
  avatar_initials TEXT NOT NULL DEFAULT 'CI',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE brokers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code TEXT NOT NULL UNIQUE,
  agency_name TEXT NOT NULL,
  principal_contact TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  domicile_state TEXT NOT NULL,
  state_license TEXT NOT NULL UNIQUE,
  kyb_status kyb_status NOT NULL DEFAULT 'Pending',
  commission_rate_bps INTEGER NOT NULL CHECK (commission_rate_bps >= 0 AND commission_rate_bps <= 5000),
  collected_premium_cents BIGINT NOT NULL DEFAULT 0 CHECK (collected_premium_cents >= 0),
  commission_earned_cents BIGINT NOT NULL DEFAULT 0 CHECK (commission_earned_cents >= 0),
  commission_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (commission_paid_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  persona_inquiry_id TEXT NOT NULL,
  onboarded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  legal_name TEXT NOT NULL,
  ein TEXT NOT NULL,
  industry TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_number TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_industry TEXT NOT NULL,
  customer_ein TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  broker_id TEXT NOT NULL REFERENCES brokers(id),
  broker_name TEXT NOT NULL,
  line_of_business TEXT NOT NULL,
  status policy_status NOT NULL,
  written_premium_cents BIGINT NOT NULL CHECK (written_premium_cents > 0),
  taxes_and_fees_cents BIGINT NOT NULL CHECK (taxes_and_fees_cents >= 0),
  total_invoice_cents BIGINT NOT NULL,
  earned_premium_cents BIGINT NOT NULL DEFAULT 0 CHECK (earned_premium_cents >= 0),
  unearned_premium_cents BIGINT NOT NULL CHECK (unearned_premium_cents >= 0),
  collected_premium_cents BIGINT NOT NULL DEFAULT 0 CHECK (collected_premium_cents >= 0),
  aggregate_limit_cents BIGINT NOT NULL CHECK (aggregate_limit_cents > 0),
  occurrence_limit_cents BIGINT NOT NULL CHECK (occurrence_limit_cents > 0),
  deductible_cents BIGINT NOT NULL CHECK (deductible_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  effective_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  bind_date DATE,
  cancellation_date DATE,
  underwriter TEXT NOT NULL,
  coverages JSONB NOT NULL DEFAULT '[]'::jsonb,
  endorsements JSONB NOT NULL DEFAULT '[]'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policy_coverages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  limit_cents BIGINT NOT NULL CHECK (limit_cents > 0),
  deductible_cents BIGINT NOT NULL CHECK (deductible_cents >= 0),
  base_premium_cents BIGINT NOT NULL CHECK (base_premium_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD')
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  policy_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_charge_id TEXT NOT NULL DEFAULT '',
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  refunded_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (refunded_amount_cents >= 0),
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status payment_status NOT NULL DEFAULT 'Pending',
  payment_method TEXT NOT NULL,
  is_sandbox BOOLEAN NOT NULL DEFAULT true,
  ledger_transaction_id TEXT NOT NULL DEFAULT '',
  last_webhook_event TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  claim_number TEXT NOT NULL UNIQUE,
  policy_id TEXT NOT NULL REFERENCES policies(id),
  policy_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  line_of_business TEXT NOT NULL,
  loss_date DATE NOT NULL,
  reported_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  status claim_status NOT NULL DEFAULT 'Open',
  payout_status payout_status NOT NULL DEFAULT 'Unpaid',
  policy_coverage_limit_cents BIGINT NOT NULL CHECK (policy_coverage_limit_cents > 0),
  policy_deductible_cents BIGINT NOT NULL CHECK (policy_deductible_cents >= 0),
  claimed_amount_cents BIGINT NOT NULL CHECK (claimed_amount_cents > 0),
  paid_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount_cents >= 0),
  outstanding_reserve_cents BIGINT NOT NULL CHECK (outstanding_reserve_cents >= 0),
  adjuster_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reserve_adjustments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  previous_reserve_cents BIGINT NOT NULL CHECK (previous_reserve_cents >= 0),
  new_reserve_cents BIGINT NOT NULL CHECK (new_reserve_cents >= 0),
  delta_cents BIGINT NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by TEXT NOT NULL,
  ledger_transaction_id TEXT NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ledger_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category account_category NOT NULL,
  normal_balance normal_balance NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  balance_cents BIGINT NOT NULL DEFAULT 0,
  description TEXT NOT NULL
);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  journal_number TEXT NOT NULL UNIQUE,
  effective_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference TEXT NOT NULL,
  reference_type TEXT NOT NULL DEFAULT 'GENERAL',
  memo TEXT NOT NULL,
  source_module TEXT NOT NULL DEFAULT 'POLICY_ADMIN',
  posted_by_user_id TEXT REFERENCES users(id),
  posted_by_email TEXT NOT NULL,
  status journal_status NOT NULL DEFAULT 'POSTED',
  reversal_of_entry_id TEXT UNIQUE REFERENCES journal_entries(id),
  reversed_by_entry_id TEXT UNIQUE REFERENCES journal_entries(id),
  reverses_journal_number TEXT,
  reversed_by_journal_number TEXT,
  rebooked_journal_number TEXT
);

CREATE TABLE journal_lines (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  debit_cents BIGINT NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents BIGINT NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  CONSTRAINT single_sided_line_check CHECK (
    (debit_cents > 0 AND credit_cents = 0) OR (credit_cents > 0 AND debit_cents = 0)
  )
);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PROCESSED',
  summary TEXT NOT NULL DEFAULT '',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_user_id TEXT REFERENCES users(id),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE approval_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reference_number TEXT NOT NULL UNIQUE,
  action_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  target_reference TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  initiator_user_id TEXT REFERENCES users(id),
  initiator_name TEXT NOT NULL,
  initiator_email TEXT NOT NULL,
  initiator_role user_role NOT NULL,
  reason TEXT NOT NULL,
  status approval_status NOT NULL DEFAULT 'Pending',
  decided_by_user_id TEXT REFERENCES users(id),
  decided_by_name TEXT,
  decided_by_email TEXT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT maker_checker_separation CHECK (
    decided_by_email IS NULL OR LOWER(decided_by_email) <> LOWER(initiator_email)
  )
);

CREATE TABLE reconciliation_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reconciliation_date DATE NOT NULL,
  stripe_charge_id TEXT NOT NULL,
  policy_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  stripe_amount_cents BIGINT NOT NULL,
  stripe_fee_cents BIGINT NOT NULL,
  stripe_net_cents BIGINT NOT NULL,
  ledger_amount_cents BIGINT NOT NULL,
  variance_cents BIGINT NOT NULL,
  status TEXT NOT NULL,
  investigation_status TEXT NOT NULL,
  investigation_notes TEXT,
  ledger_journal_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE corgi_system_state (
  key TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Append-Only Immutability Trigger
CREATE OR REPLACE FUNCTION prevent_posted_journal_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Immutable Ledger Violation: Posted records in % cannot be deleted. Use reversal and rebooking.', TG_TABLE_NAME;
  END IF;

  IF TG_TABLE_NAME = 'journal_lines' AND TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Immutable Ledger Violation: Journal lines cannot be updated after posting.';
  END IF;

  IF TG_TABLE_NAME = 'journal_entries' AND TG_OP = 'UPDATE' THEN
    IF OLD.journal_number <> NEW.journal_number
       OR OLD.effective_date <> NEW.effective_date
       OR OLD.reference <> NEW.reference
       OR (OLD.reversed_by_entry_id IS NOT NULL AND OLD.reversed_by_entry_id <> NEW.reversed_by_entry_id) THEN
      RAISE EXCEPTION 'Immutable Ledger Violation: Posted journal entry fields are immutable.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_journal_entries
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_mutation();

CREATE TRIGGER trg_immutable_journal_lines
BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_mutation();

-- 5. Chart of Accounts Baseline Data
INSERT INTO ledger_accounts (code, name, category, normal_balance, description) VALUES
('1010', 'Cash & Stripe Settlement Clearing', 'Asset', 'Debit', 'Real-time settlement clearing for card, ACH, and wire collections via Stripe test/live mode.'),
('1100', 'Premium Accounts Receivable', 'Asset', 'Debit', 'Amounts invoiced to commercial policyholders pending electronic settlement or broker remittance.'),
('2010', 'Unearned Premium Reserve', 'Liability', 'Credit', 'Unearned premium reserve held liability-side, recognized pro-rata on as-of basis over active coverage terms.'),
('2020', 'Taxes & Regulatory Fees Payable', 'Liability', 'Credit', 'State surplus lines taxes, stamping fees, and regulatory assessments accrued on bound policies.'),
('2030', 'Broker Commission Payable', 'Liability', 'Credit', 'Accrued intermediary commissions payable to KYB-approved brokerages upon premium collection.'),
('2040', 'Loss & LAE Reserves', 'Liability', 'Credit', 'Actuarial case reserves and loss adjustment expenses accrued on open commercial insurance claims.'),
('4010', 'Gross Written Premium', 'Revenue', 'Credit', 'Recognized earned premium revenue derived from active bound commercial insurance contracts.'),
('5010', 'Incurred Losses & LAE', 'Expense', 'Debit', 'Underwriting loss expense recognized upon initial case reserve establishment or upward adjustment.'),
('5020', 'Broker Commission Expense', 'Expense', 'Debit', 'Acquisition costs incurred from distributor commissions based on agreed basis points.')
ON CONFLICT (code) DO NOTHING;

-- 6. Demo Users Baseline Data
INSERT INTO users (id, email, full_name, role, role_label, department, avatar_initials) VALUES
('usr-ops-01', 'alex.rivera@corgi.insure', 'Alex Rivera', 'OPERATIONS_ADMIN', 'Operations Admin', 'Commercial Policy Operations', 'AR'),
('usr-fin-02', 'sarah.chen@corgi.insure', 'Sarah Chen, CPA', 'FINANCE_APPROVER', 'Finance Approver', 'Controllership & Treasury', 'SC')
ON CONFLICT (email) DO NOTHING;

-- 7. Row Level Security (RLS) Configuration
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserve_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE corgi_system_state ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;
