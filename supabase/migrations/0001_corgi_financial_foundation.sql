-- Corgi Track 1 Policy Administration — Supabase PostgreSQL Migration
-- Enforces integer USD cents, double-entry balance constraints, and append-only journal immutability.

CREATE TYPE user_role AS ENUM ('OPERATIONS_ADMIN', 'FINANCE_APPROVER');
CREATE TYPE kyb_status AS ENUM ('Approved', 'Pending', 'Failed');
CREATE TYPE policy_status AS ENUM ('Draft', 'Pending', 'Active', 'Cancelled', 'Expired');
CREATE TYPE payment_status AS ENUM ('Pending', 'Settled', 'Failed', 'Refunded');
CREATE TYPE account_category AS ENUM ('Asset', 'Liability', 'Revenue', 'Expense');
CREATE TYPE normal_balance AS ENUM ('Debit', 'Credit');
CREATE TYPE journal_status AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE approval_status AS ENUM ('Pending', 'Approved', 'Rejected');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  role_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  agency_name TEXT NOT NULL,
  principal_contact TEXT NOT NULL,
  email TEXT NOT NULL,
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  ein TEXT NOT NULL,
  industry TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  broker_id UUID NOT NULL REFERENCES brokers(id),
  line_of_business TEXT NOT NULL,
  status policy_status NOT NULL,
  written_premium_cents BIGINT NOT NULL CHECK (written_premium_cents > 0),
  taxes_and_fees_cents BIGINT NOT NULL CHECK (taxes_and_fees_cents >= 0),
  total_invoice_cents BIGINT NOT NULL CHECK (total_invoice_cents = written_premium_cents + taxes_and_fees_cents),
  earned_premium_cents BIGINT NOT NULL DEFAULT 0 CHECK (earned_premium_cents >= 0),
  unearned_premium_cents BIGINT NOT NULL CHECK (unearned_premium_cents >= 0),
  collected_premium_cents BIGINT NOT NULL DEFAULT 0 CHECK (collected_premium_cents >= 0),
  aggregate_limit_cents BIGINT NOT NULL CHECK (aggregate_limit_cents > 0),
  occurrence_limit_cents BIGINT NOT NULL CHECK (occurrence_limit_cents > 0),
  deductible_cents BIGINT NOT NULL CHECK (deductible_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  effective_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  underwriter TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policy_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  limit_cents BIGINT NOT NULL CHECK (limit_cents > 0),
  deductible_cents BIGINT NOT NULL CHECK (deductible_cents >= 0),
  base_premium_cents BIGINT NOT NULL CHECK (base_premium_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD')
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_charge_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status payment_status NOT NULL DEFAULT 'Pending',
  payment_method TEXT NOT NULL,
  last_webhook_event TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category account_category NOT NULL,
  normal_balance normal_balance NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  balance_cents BIGINT NOT NULL DEFAULT 0,
  description TEXT NOT NULL
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number TEXT NOT NULL UNIQUE,
  effective_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference TEXT NOT NULL,
  memo TEXT NOT NULL,
  source_module TEXT NOT NULL,
  posted_by_user_id UUID REFERENCES users(id),
  posted_by_email TEXT NOT NULL,
  status journal_status NOT NULL DEFAULT 'POSTED',
  reversal_of_entry_id UUID UNIQUE REFERENCES journal_entries(id),
  reversed_by_entry_id UUID UNIQUE REFERENCES journal_entries(id)
);

CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSED',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT NOT NULL UNIQUE,
  action_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  target_reference TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  initiator_user_id UUID REFERENCES users(id),
  initiator_name TEXT NOT NULL,
  initiator_email TEXT NOT NULL,
  initiator_role user_role NOT NULL,
  reason TEXT NOT NULL,
  status approval_status NOT NULL DEFAULT 'Pending',
  decided_by_user_id UUID REFERENCES users(id),
  decided_by_name TEXT,
  decided_by_email TEXT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT maker_checker_separation CHECK (
    decided_by_email IS NULL OR LOWER(decided_by_email) <> LOWER(initiator_email)
  )
);

-- ============================================================================
-- POSTGRESQL TRIGGERS: APPEND-ONLY IMMUTABILITY & DOUBLE-ENTRY BALANCE CHECK
-- ============================================================================

-- 1. Prevent DELETE or unauthorized UPDATE on posted journal_entries and journal_lines
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
    -- Only allow linking reversed_by_entry_id and marking status = REVERSED when a reversal entry is posted
    IF OLD.journal_number <> NEW.journal_number
       OR OLD.effective_date <> NEW.effective_date
       OR OLD.recorded_at <> NEW.recorded_at
       OR OLD.reference <> NEW.reference
       OR OLD.memo <> NEW.memo
       OR OLD.posted_by_email <> NEW.posted_by_email
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

-- 2. Deferred Constraint Trigger: Verify every journal entry has >= 2 lines and SUM(debit_cents) = SUM(credit_cents) > 0
CREATE OR REPLACE FUNCTION enforce_balanced_journal_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_id UUID;
  v_line_count INTEGER;
  v_total_debits BIGINT;
  v_total_credits BIGINT;
BEGIN
  v_entry_id := COALESCE(NEW.journal_entry_id, NEW.id);

  SELECT COUNT(*), COALESCE(SUM(debit_cents), 0), COALESCE(SUM(credit_cents), 0)
  INTO v_line_count, v_total_debits, v_total_credits
  FROM journal_lines
  WHERE journal_entry_id = v_entry_id;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'Double-Entry Violation: Journal entry % must contain at least 2 lines (found %).', v_entry_id, v_line_count;
  END IF;

  IF v_total_debits <= 0 OR v_total_debits <> v_total_credits THEN
    RAISE EXCEPTION 'Double-Entry Violation: Journal entry % is unbalanced (debits=% cents, credits=% cents).', v_entry_id, v_total_debits, v_total_credits;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balance
AFTER INSERT ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_balanced_journal_entry();
