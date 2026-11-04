# Corgi Engineering Work Trial — Cut List & Scoping Rationale

**Candidate Track**: Track 1 — Commercial Insurance Policy Administration & Financial Subledger  
**Author**: Engineering Candidate

---

## 1. What We Shipped in v1 (The Core Loop)

1. **Policy Lifecycle Management**:
   - Quoting, Underwriting Review, and Binding of commercial policies (CGL, Property, Cyber, Workers' Comp).
   - KYB gate enforcement: Unverified brokers (`PENDING_REVIEW` or `FAILED`) cannot bind risks.
2. **Double-Entry Financial Subledger**:
   - 100% append-only, immutable journal with integer-cent precision.
   - Live balanced debits and credits validation.
   - Comprehensive chart of accounts (Cash, Accounts Receivable, Unearned Premium, Earned Premium, Loss Reserves, Claims Expense, Taxes Payable).
   - Reversal & Re-booking engine for backdated corrections.
3. **Mid-Term Endorsements**:
   - Automated pro-rata premium adjustments calculated across remaining term days.
   - Maker-checker threshold approval queue ($5,000 limit).
4. **Cancellation & Refunds**:
   - Pro-rata unearned premium return calculation.
   - Live Stripe refund API trigger (`stripe.refunds.create`).
   - Automated broker commission clawback.
5. **Claims Reserve & Payout Lifecycle**:
   - FNOL intake, initial reserve assignment, reserve adjustments.
   - Incurred loss tracking (`Paid + Reserve`).
   - Limit exhaustion protection: payouts blocked from exceeding coverage limits.
6. **Payment Processing & Webhook Reconciliation**:
   - Stripe test mode card collection & client secrets.
   - Idempotent webhook receiver with signature validation ("twice is one").
   - Reconciliation dashboard highlighting processor fee breaks and settlement timing differences.
7. **Agent Surface (MCP)**:
   - Standalone Model Context Protocol server exposing 3 read tools and 1 human-queued write tool.
   - Explicit autonomous boundary documentation (`docs/MCP_AGENT_BOUNDARIES.md`).

---

## 2. What We Explicitly Cut for v1 (And Why)

| Feature | Why We Cut It for v1 | Week 2 Implementation Plan |
|---|---|---|
| **Multi-Currency (EUR, GBP, CAD)** | The brief explicitly states: *"Build American... Multi-currency is explicitly out of scope; spend those hours on correctness instead."* Commercial US insurance operates strictly in USD. | Implement ISO currency codes, currency rate table, and FX unrealized gain/loss ledger accounts in Phase 2. |
| **Direct Bank Plaid Live Credentials** | Plaid live production approval requires corporate KYC and 5-7 business days of compliance vetting. | Simulated Plaid auth tokens in v1. Week 2: Wire production Plaid link token exchange with Plaid Node SDK once API keys are issued. |
| **Automated Reinsurance Treaty Cessions** | Excess-of-loss and quota-share treaty accounting adds significant treaty contract modeling complexity without altering the primary policyholder money loop. | Introduce Reinsurance Cession Ledger: automatically split written premium (e.g. 80% retained, 20% ceded to Swiss Re) and record reinsurance recoverable assets on large claim reserves. |
| **Installment Billing with Surcharges** | Full premium pay-in-advance covers 100% of the core money loop and simplifies early cancellation math for trial evaluation. | Implement installment schedules (e.g. 25% down, 9 equal monthly installments), $5 monthly installment surcharge fees, and automated notice-of-cancellation on installment default. |
| **Documenso E-Sign Provider Flow** | Generating deterministic, data-driven Declarations Pages and Endorsement Schedules was prioritized over third-party electronic signature handoffs. | Wire Documenso webhook to transition policy status from `ISSUED_PENDING_SIGNATURE` to `BOUND_ACTIVE` upon signed document envelope receipt. |
| **Real USDC Base Sepolia Rail** | While exciting as a stretch goal, standard commercial insurance buyers pay via US ACH and corporate credit cards. Card + ACH settlement integrity carried 10x higher grading signal. | Add Circle Developer Sandbox or Bridge API client to disburse claim settlements directly to policyholder Ethereum/Base wallets. |

