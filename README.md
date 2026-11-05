# Corgi — Commercial Policy Administration & Financial Subledger

> **Track 1 Work Trial**: Commercial Insurance Policy Administration, Append-Only Double-Entry Subledger, Real Stripe Test-Mode Rails, and Model Context Protocol (MCP).

---

## 🔗 Live Deployment & Evaluator Access

* **Live URL**: [https://corgi-policy-administration.vercel.app/](https://corgi-policy-administration.vercel.app/)
* **Evaluator Credentials (Enforced Maker-Checker Roles)**:
  * **Operations Admin** (Maker): `alex.rivera@corgi.insure` · Password: `corgi-ops-sandbox-2026`
  * **Finance Approver** (Checker): `sarah.chen@corgi.insure` · Password: `corgi-fin-approver-2026`

---

## Executive Overview

The platform unifies commercial insurance policy lifecycles with bank-grade financial accounting controls. Every underwriting, binding, endorsement, claim reserve, and cancellation event immediately reflects in an immutable, balanced double-entry accounting subledger.

```
                               ┌────────────────────────────────────────────────────────┐
                               │             OPERATIONAL EVENT BOUNDARY                 │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
          ┌───────────────────────────────────────────────┼──────────────────────────────────────────────┐
          ▼                                               ▼                                              ▼
┌───────────────────┐                           ┌───────────────────┐                          ┌───────────────────┐
│  Policy Issuance  │                           │  Stripe Payment   │                          │   Claim Reserve   │
│  (KYB-Approved)   │                           │  Verified Webhook │                          │    Adjustment     │
└─────────┬─────────┘                           └─────────┬─────────┘                          └─────────┬─────────┘
          │                                               │                                              │
          └───────────────────────────────────────────────┼──────────────────────────────────────────────┘
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │           IMMUTABLE DOUBLE-ENTRY SUBLEDGER             │
                               │  - Conservation of Money: sum(Debits) === sum(Credits) │
                               │  - Integer USD Cents (No float rounding drift)         │
                               │  - PostgreSQL Triggers: Zero UPDATE or DELETE          │
                               │  - Backdated Correction via Reversal & Rebooking       │
                               └────────────────────────────────────────────────────────┘
```

---

## Core Financial & Domain Invariants

1. **Integer Minor Units (`USD_CENTS`)**:
   All financial values (written premium, unearned premium, tax, stamping fees, commission, and claims reserves) are stored and computed in 64-bit integer USD cents (`BIGINT`), completely eliminating IEEE 754 floating-point drift.
2. **Conservation of Money**:
   Every financial transaction is booked as a double-entry journal entry where $\sum\text{Debits} \equiv \sum\text{Credits} > 0$.
3. **Hard Ledger Immutability (Zero UPDATE or DELETE)**:
   Financial records are append-only. In Supabase PostgreSQL, the trigger `prevent_posted_journal_mutation()` actively rejects any `DELETE` or `UPDATE` on `journal_lines` and `journal_entries`.
4. **Reversal & Rebooking Error Correction**:
   Corrections (such as backdated endorsements or cancellation refunds) are executed via a mirror reversal journal entry (swapping debits and credits) and an offsetting rebooking entry. Original records remain permanently intact.
5. **Real Stripe Sandbox Payment Rails**:
   Initiating a PaymentIntent creates a `Pending` record with **zero cash ledger impact**. Cash and revenue clearing are posted strictly upon verified, cryptographically signed webhook delivery (`POST /api/webhooks/stripe` with `payment_intent.succeeded`).
6. **Webhook Idempotency & Out-of-Order Safety**:
   Incoming webhooks verify the cryptographic `stripe-signature` against the raw request body. Replayed events are deduplicated via `stripe_event_id` and return `200 DUPLICATE_IGNORED` without mutating balances. Out-of-order events auto-synthesize payment records safely.
7. **Maker-Checker Segregation of Duties**:
   Policy endorsements or reserve adjustments exceeding \$500 require two-man approval (`approval_requests`). Operations Admins submit proposals; only Finance Approvers can approve or reject. Anti-self-approval is strictly enforced.
8. **Persona Broker KYB Gating**:
   Brokers are tracked with Persona inquiry IDs (`inq_sandbox_...`) and KYB states (`Approved`, `Pending`, `Failed`). Brokers with `Pending` or `Failed` status are hard-blocked from binding policies.
9. **Taxes & Statutory Fees Isolation**:
   State surplus lines tax (3.5%) and regulatory stamping fees (\$25.00) ride the customer invoice but are isolated into dedicated liability accounts (`2020 Taxes & Regulatory Fees Payable`), never polluting unearned premium revenue.
10. **The Rounding Penny Rule**:
    Daily pro-rata calculations account for leap years (366 days). Any fractional rounding pennies are absorbed on the final policy day by Corgi into account `4010 Earned Premium Adjustment`, never charged to the policyholder.

---

## Tech Stack

* **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Actions, Route Handlers)
* **Frontend**: [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [Recharts](https://recharts.org/)
* **Language**: [TypeScript 5.9](https://www.typescriptlang.org/) (Strict type checking)
* **Database & Subledger**: [Supabase PostgreSQL](https://supabase.com/) with native triggers & least-privilege RLS + Prisma Schema
* **Payments & Webhooks**: [Stripe Node SDK](https://github.com/stripe/stripe-node)
* **AI Agent Surface**: [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) over JSON-RPC stdio
* **Hosting**: [Vercel Edge & Serverless Infrastructure](https://vercel.com/)

---

## Model Context Protocol (MCP) Server

The repository includes a production-ready stdio MCP server (`mcp-server.ts`) implementing 3 read tools and 1 guarded write tool:

### Available Tools:
1. `get_policy_as_of`: Reconstructs policy coverage schedule, active endorsements, and earned premium as of any arbitrary historical date $T$.
2. `get_broker_statement`: Generates deterministic monthly broker commission statements and clawback reconciliations tied to the subledger.
3. `query_subledger`: Exposes trial balances, chart of accounts, and journal entries with integer-cent precision.
4. `request_endorsement_or_reserve_adjustment` (Guardrailed Write Tool):
   * **Financial Safety Invariant**: Autonomous AI agents are strictly forbidden from directly updating ledger rows or releasing funds.
   * This tool **strictly queues requests into the human Maker-Checker approval table (`approval_requests`)**, requiring an authorized Finance Approver to inspect and authorize the change.

### Launching the MCP Server:
```bash
npm run mcp
```

---

## Local Development & Setup

### Prerequisites
* **Node.js**: v20 or later
* **npm** or **pnpm**

### 1. Installation
```bash
npm install
```

### 2. Environment Configuration
Copy the template configuration:
```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `APP_URL` | Base public URL (e.g. `http://localhost:3000` or Vercel URL) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase PostgreSQL project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret (server-side only) |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `STRIPE_SECRET_KEY` | Stripe test API key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_...`) |

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Database Seeding & Migrations
* Apply the foundation migration in Supabase SQL editor: [`supabase/migrations/0001_corgi_financial_foundation.sql`](supabase/migrations/0001_corgi_financial_foundation.sql)
* Seed baseline domain entities and Chart of Accounts:
```bash
npm run seed:supabase
```

---

## Automated Verification & Test Suite

The test suite runs 21 comprehensive unit and integration tests verifying all financial math, double-entry conservation, Stripe webhooks, limits, and approval workflows:

```bash
# Run unit & integration tests
npm test

# Run TypeScript typecheck
npx tsc --noEmit
```

### Test Coverage Highlights:
* `validateBrokerBindingEligibility`: Hard-blocks Pending or Failed KYB brokers from binding policies.
* `Policy issuance`: Validates KYB broker gate, calculates 3.5% tax, and books balanced integer-cent journal entries.
* `Stripe lifecycle`: Verified webhook signature, zero cash on click, idempotency on replay, out-of-order event synthesis.
* `Append-only reversal`: Inverts debits and credits, balances to zero net impact, and links reversal numbers.
* `Maker-Checker`: Prevents self-approval and restricts authorization decisions to Finance Approvers.
* `MCP Tool logic`: As-of policy reconstruction, broker statement commission tie-out, and human approval queue routing.

---

## Live-Fire Debrief Cheat Sheet

During the live-fire debrief, evaluators will test the system against attack scenarios. Here is how each invariant holds:

| Attack Scenario | What Evaluators Do | System Behavior & Defense |
|---|---|---|
| **SQL Immutability Attack** | Run `DELETE FROM journal_entries` or `UPDATE journal_lines` | PostgreSQL trigger `prevent_posted_journal_mutation()` throws `Immutable Ledger Violation: Posted records cannot be deleted/updated`. |
| **Double-Entry Violation** | Insert unbalanced debit/credit lines | PostgreSQL deferred constraint trigger `trg_check_journal_entry_balance` raises `Double-Entry Violation: Journal entry is unbalanced` at `COMMIT`. |
| **Webhook Replay Attack** | Re-post the same Stripe webhook event ID | Webhook handler detects existing `stripe_event_id` and returns `200 DUPLICATE_IGNORED` with zero balance mutation. |
| **Maker-Checker Bypass** | Operations Admin attempts to self-approve a $5,000 endorsement | System rejects: `Maker-Checker Violation: Initiator cannot decide their own approval request`. |
| **Autonomous Agent Mutation** | Prompt MCP agent to alter an account balance | MCP write tool strictly creates a pending approval request in `approval_requests` with zero ledger mutation. |
| **Broker KYB Violation** | Bind policy with `brk-03` (Lone Star Risk, Pending) | UI and backend reject: `Broker "Lone Star Risk Intermediaries" has KYB status "Pending". Only KYB-Approved brokers are authorized`. |
| **Claim Over-Limit Attack** | Submit claim exceeding policy aggregate limit | System validates limits and rejects claim before any reserve is established. |
