# Corgi Engineering Work Trial — Running Decision Log
**Candidate Track**: Track 1 — Commercial Insurance Policy Administration & Financial Subledger  
**Stack**: Next.js 15 (App Router), TypeScript 5.9, Tailwind CSS 4, Stripe SDK, Model Context Protocol (MCP)  
**Currency Standard**: USD in integer minor units (integer cents `¢`, no floats)

---

## Decision Log Entries

### Entry 1 — T0 + 1h: Architectural Foundation & Subledger Design
- **Context**: The brief specifies: *"You wrote the ledger. Double-entry, append-only, immutable. Your payment provider's balance is their ledger, not yours."*
- **Decision**: Implemented an in-memory & file-backed immutable double-entry subledger (`lib/serverDatabase.ts`).
  - Every external financial event (policy issuance, Stripe payment, mid-term endorsement, cancellation refund, claim reserve allocation, processor fee) produces a balanced journal entry.
  - Debits and credits are strictly validated: sum(debitCents) === sum(creditCents) > 0.
  - **Zero UPDATE or DELETE**: No journal entry or line may ever be updated or deleted. Corrections are executed via mirror reversal journal entries + subsequent re-booking entries referencing the original journal number.
- **Trade-off / Assumption**: Used a deterministic integer-cent memory-state engine persisted to disk (`.data/corgi-ledger-db.json`) paired with Prisma schemas and PostgreSQL migrations (`supabase/migrations/0001_corgi_financial_foundation.sql`). This ensures zero cloud friction for the debrief panel while maintaining full SQL production parity.

---

### Entry 2 — T0 + 3h: The Rounding Penny Rule & Pro-Rata Day Counts
- **Context**: Pro-rata daily earning across annual terms (365 days, or 366 in leap years) inevitably leaves fractional cents when dividing premium by days remaining.
- **Decision**: 
  - Standard annual policy term is modeled as full calendar anniversary (e.g. `2026-03-01` to `2027-03-01`), accurately capturing leap year durations (366 days).
  - **The Rounding Penny Rule**: 
    1. During daily pro-rata earnings and mid-term endorsements, daily rate is computed as `floor(totalPremiumCents / termDays)`.
    2. Any remaining odd penny (`cents % termDays`) is **absorbed by the carrier (Corgi)** on the final day of the policy term into account `4010-Earned-Premium-Adjustment`.
    3. On cancellation refunds, unearned premium is calculated in favor of the customer (`ceil(unearnedDays * dailyRateCents)`). Corgi never shortchanges policyholders on a rounding artifact.

---

### Entry 3 — T0 + 5h: Commission Accounting — Written vs. Collected
- **Context**: Domain Gauntlet #7 asks: *"Decide whether commission is earned on written or on collected premium — defend the choice — and claw it back when premium refunds."*
- **Decision**: 
  - Broker commission (standard 10%–15% per broker contract) is recognized as **payable only upon collected premium**, not on policy bind/written premium.
  - *Defense*: In commercial lines, policies bound with 30-day payment terms or installment schedules carry credit/cancellation risk. Paying commissions on uncollected written premium exposes the carrier to unrecoverable broker receivables if the insured defaults prior to payment.
  - **Clawback Rule**: When a policy is cancelled or a negative endorsement is executed, unearned premium refunded to the customer triggers an immediate automated **commission clawback** against account `2020-Broker-Commission-Payable` (`reversalLines`), debited from the broker's pending settlement balance on their monthly statement.

---

### Entry 4 — T0 + 8h: Taxes and Fees Isolation (Statutory Compliance)
- **Context**: Domain Gauntlet #11: *"Taxes and fees are not premium... They ride the same payment but never pollute the premium figure."*
- **Decision**:
  - Modeled state surplus lines tax (3.5% default, e.g. New York State) plus statutory regulatory stamping fee ($25.00 flat).
  - The customer checkout invoice charges the gross total (`premium + tax + stamping fee`).
  - The subledger splits this cleanly at payment capture:
    - `Debit 1010-Cash-Operating`: Total settled amount.
    - `Credit 2010-Unearned-Premium`: Premium only (subject to daily earning).
    - `Credit 2050-State-Tax-Payable`: State premium tax (held as fiduciary custody liability).
    - `Credit 2060-Stamping-Fee-Payable`: Regulatory stamping fee.
  - On cancellation, state tax is refunded pro-rata only if statutory state guidelines permit; stamping fee is non-refundable.

---

### Entry 5 — T0 + 12h: Live vs. Simulated Integration Strategy
- **Context**: The brief allows at least two live integrations while remaining slots can be high-fidelity simulators.
- **Provider Choices**:
  1. **Payments (Live)**: Stripe Test Mode (`stripe-node`). Generates real PaymentIntents, client secrets, card settlements, refunds via `stripe.refunds.create()`, and verified webhook signatures (`stripe.webhooks.constructEvent`).
  2. **Agent Surface (Live)**: Model Context Protocol (MCP) server running over JSON-RPC stdio with read/write tools.
  3. **Broker KYB (High-Fidelity Simulated)**: Persona/Middesk business verification simulator supporting `APPROVED`, `PENDING_REVIEW`, and `FAILED` states. Blocks unverified brokers at the policy bind gate.
  4. **Bank Account Verification (Simulated)**: Plaid Sandbox auth & identity structure for claimant account verification prior to claim loss payouts.
  5. **Claim Payout Rail (Simulated)**: High-fidelity ACH settlement engine simulating T+2 settlement delays, hold states, and return codes (e.g. `R01 Insufficient Funds`).

---

### Entry 6 — T0 + 16h: Webhook Idempotency & Out-of-Order Safety ("Twice is One")
- **Context**: The debrief panel will replay webhooks directly from the Stripe dashboard.
- **Decision**:
  - Implemented `processedStripeEventIds` Set and deduplication journal in `lib/serverDatabase.ts`.
  - Every incoming webhook verifies the cryptographic `stripe-signature`.
  - When replaying an existing event ID, the handler returns `HTTP 200 { status: 'DUPLICATE_IGNORED' }` without altering ledger balances.
  - If a `payment_intent.succeeded` event arrives before `payment_intent.created` (out-of-order network delivery), the state machine auto-creates the payment record and executes the settlement journal without throwing an unhandled exception.

---

### Entry 7 — T0 + 20h: The Correction Test (Backdated Endorsement Error)
- **Context**: Live-Fire scenario: An endorsement was entered with the wrong effective date. Correct it live in front of the panel.
- **Decision**:
  - Built `reverseAndRebookJournalInDb` in `lib/serverDatabase.ts` and exposed it via UI and API.
  - Generates a full mirror reversal journal entry (`Debit <-> Credit` inverted) tagged with `reversesJournalNumber: target.journalNumber`.
  - Appends a new re-booked journal entry with the corrected effective date and adjusted pro-rata daily calculation.
  - Original rows remain completely untouched. The monthly broker statement and trial balance reflect the net difference and tie out to the cent.



---

### Entry 8 — T0 + 24h: PostgreSQL Cloud Database, Immutability Triggers & Least-Privilege RLS
- **Context**: Moving beyond the local file cache to enterprise multi-tenant cloud storage while preserving the strict immutable subledger invariant.
- **Decision**: Integrated Supabase PostgreSQL (`supabase/migrations/0001_corgi_financial_foundation.sql`) with two custom database triggers:
  1. `prevent_posted_journal_mutation()`: Rejects any SQL `DELETE` on financial records (`journal_entries`, `journal_lines`), and rejects `UPDATE` on posted transaction fields (`journal_number`, `effective_date`, `recorded_at`, `reference`, `memo`, `posted_by_email`), permitting `reversed_by_entry_id` linking strictly when initially unset.
  2. `enforce_balanced_journal_entry()`: A deferred constraint trigger on `journal_lines` that evaluates at `COMMIT` time, asserting that each journal entry has at least 2 lines and that sum(debit_cents) === sum(credit_cents) > 0.
  3. **Least-Privilege RLS**: Revoked broad table permissions from `anon` and `authenticated`. Granted full access strictly to `service_role`, and granted read-only `SELECT` to `authenticated` staff on domain/reporting tables. System state is completely isolated from client roles.
  4. **Hybrid Outage Resilience**: Hydration tracks local mutation timestamps and in-flight sync promises to prevent older cloud snapshots from overwriting newer local state, maintaining seamless fallback operation during transient cloud outages.

---

### Entry 9 — T0 + 28h: Model Context Protocol (MCP) Guardrails & Segregation of Duties
- **Context**: Brief requirement: *"Three read tools, one write tool. The write tool must not directly modify money. It creates a request in the human approval queue. If your agent can modify the ledger on its own, you fail."*
- **Decision**: Implemented an MCP server (`mcp-server.ts`) running over stdio with 3 read tools and 1 strictly guarded write tool:
  1. `get_policy_as_of`: Reconstructs historical policy coverage schedule, active endorsements, and earned premium as of any arbitrary date T.
  2. `get_broker_statement`: Computes deterministic broker commission statements and clawback reconciliations tied to the ledger.
  3. `query_subledger`: Exposes trial balance, account balances, and journal entries with integer USD cent precision.
  4. `request_endorsement_or_reserve_adjustment` (Write Tool): **Strictly queues into the human Maker-Checker approval table (`approval_requests`)**. It explicitly **does not** post journal entries, update policies, or touch ledger balances.
- **Defense**: Financial fiduciary compliance forbids autonomous agents from altering subledger rows or releasing cash. All material adjustments (> $500 delta) require two-man human verification (Operations Admin proposes, Finance Approver decides, anti-self-approval enforced).

---

### Entry 10 — T0 + 32h: Declarations Document Generation & Temporal As-Of Policy Reconstruction
- **Context**: Evaluators need downloadable declarations pages reflecting historical policy terms and coverage schedules as of any specific point in time.
- **Decision**: Implemented server-side declarations page generator (`utils/declarationsGenerator.ts`) and temporal reconstructor (`utils/asOfDateReconstruction.ts`):
  1. **Deterministic As-Of Slicing**: Given policy P and date T, the engine evaluates T against policy effective/expiration dates and all endorsement effective dates.
  2. Endorsements with effectiveDate > T are excluded from coverage limits and historical premium calculations, while endorsements with effectiveDate <= T are prorated up to T.
  3. Formatted declarations HTML prints directly to clean, high-fidelity PDF documents via native browser print pipelines or downloadable documents, displaying itemized coverages, limits, deductibles, state surplus lines taxes, stamping fees, and producer attribution.


---

### Entry 11 — T0 + 36h: Short-Rate vs. Pro-Rata Cancellation & Retained Penalty Accounting
- **Context**: Domain Gauntlet #5 requires: *"Pro-rata versus short-rate refund — know the difference, implement one, and make the ledger capable of expressing the other. The refund is unearned premium, and it moves on the real rail."*
- **Decision**: Added short-rate cancellation alongside standard pro-rata cancellation in `utils/financialRules.ts` (`calculateCancellationRefundCents`):
  1. **Pro-Rata (Carrier/Standard)**: Customer receives 100% of remaining unearned premium refunded via the payment rail (`Debit 2010 Unearned Premium` vs `Credit 1020 Cash / Clearing`).
  2. **Short-Rate (Insured-Requested Early Termination)**: Standard commercial 90/10 rule. Insured receives 90% of unearned premium as a refund, and Corgi retains a 10% short-rate cancellation penalty as earned fee revenue.
  3. **Double-Entry Balance**:
     - `Debit 2010 Unearned Premium Reserve`: Gross unearned amount (e.g. $1,000.00).
     - `Credit 1020 Stripe Settlement Clearing`: 90% net refund to customer ($900.00).
     - `Credit 4020 Retained Short-Rate Cancellation Penalty`: 10% earned revenue ($100.00).
     - Sum(Debits) === Sum(Credits) strictly preserved to the cent.

---

### Entry 12 — T0 + 38h: Reinsurance Treaty Quota Share Cession Schedule & Cession Note
- **Context**: Track 1 Stretch Ladder #6: *"A reinsurance cession note: who else is on the risk, and what the ledger owes them."*
- **Decision**: Implemented commercial reinsurance quota-share facility modeling (`utils/reinsuranceSchedule.ts`):
  1. **Treaty Model**: Active commercial treaty with Munich Re America (`TREATY-QS-2026-MRE`, Rating: A+ Superior · AM Best Size XV) with a 25% Quota Share cession and 75% Corgi net retention.
  2. **Apportionment Schedule**: Calculates exact liability limit shares (Per-Occurrence: Corgi 75% / Munich Re 25%; Aggregate: Corgi 75% / Munich Re 25%) and written premium allocations.
  3. **Subledger Cession Accounting**: Models `Debit 5030 Ceded Reinsurance Premium Expense` vs `Credit 2050 Ceded Reinsurance Premium Payable — Munich Re`, plus 25% reinsurance recoverable asset on settled claim losses.
  4. **Document Generation**: One-click printable legal **Reinsurance Cession Note** (Schedule A) detailing treaty terms, signatory lines, NAIC group numbers, and the "Follow the Fortunes" binding clause.
