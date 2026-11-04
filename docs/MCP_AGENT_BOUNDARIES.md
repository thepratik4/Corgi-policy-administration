# Autonomous Agent Governance & Safeguard Boundaries

**System**: Corgi Commercial Insurance Policy Administration & Financial Subledger  
**Document**: Operations Strictly Prohibited from Autonomous Agent Execution  
**Policy Standard**: Non-Negotiable #6 (Maker-Checker Thresholds) & Non-Negotiable #8 (MCP Surface Integrity)

---

## Executive Summary

While autonomous AI agents offer high utility for data summarization, document extraction, and read-only portfolio analysis, **insurance balance sheets and fiduciary escrow accounts must be insulated from unconstrained algorithmic autonomy**. In an append-only, legally audited double-entry financial environment, allowing an agent to unilaterally authorize financial liabilities or disburse funds creates catastrophic legal, regulatory, and insolvency risks.

The Corgi platform enforces a strict architectural boundary: **Autonomous agents may propose actions, but only verified human officers (Finance Approvers) may authorize money movements.**

---

## 5 Operations We Will NEVER Hand to an Autonomous Agent (And Why)

### 1. Unilateral Outbound Claim Disbursements and Loss Settlement Payouts
- **The Operation**: Directly issuing ACH, wire, or card refund payouts from `1010-Cash-Operating` to an external bank account without human authorization.
- **Why It Is Forbidden**: 
  - Claim payouts are final and irrecoverable once settled across the Federal Reserve ACH rail.
  - Agents are vulnerable to prompt injection, synthetic fraud rings, and manipulated loss reports. A malicious actor could exploit an agent's context window to validate fraudulent invoices and drain loss reserves.
  - *Corgi Rule*: Claim loss payments must be initiated by an Operations Admin and confirmed with dual-maker sign-off by a licensed human Claims Adjuster / Finance Approver.

### 2. Autonomous Binding of Unverified or High-Risk KYB Brokers
- **The Operation**: Overriding or bypassing Know-Your-Business (Middesk/Persona KYB) verification checks to grant a broker immediate binding authority.
- **Why It Is Forbidden**:
  - Under state insurance codes, issuing commercial policies through unverified or unlicensed producers is an immediate statutory violation that risks carrier license revocation.
  - If an agent could flip a broker from `PENDING_REVIEW` or `FAILED` to `APPROVED`, rogue brokers could bind uninsurable risks (e.g. hazardous manufacturing or structural demolition) under Corgi's paper.
  - *Corgi Rule*: KYB overrides require documented corporate legal verification and explicit compliance officer approval.

### 3. Arbitrary Subledger Reclassifications and Journal Re-bookings
- **The Operation**: Unilaterally generating manual journal entries that reclassify accounts (e.g. moving balances between `2010-Unearned-Premium`, `4010-Earned-Premium`, or `2030-Claims-Loss-Reserves`).
- **Why It Is Forbidden**:
  - Double-entry subledgers establish statutory solvency ratios (Risk-Based Capital) audited by state insurance commissioners. 
  - An agent attempting to "fix" an apparent reconciliation break might balance debits and credits mathematically while committing regulatory fraud (e.g., reclassifying required loss reserves into earned revenue to mask underwriting losses).
  - *Corgi Rule*: Every reversal and re-booking requires an explicit business justification logged in the audit trail by an identified human actor (`sarah.chen@corgi.insure`).

### 4. Direct Inception Date Alteration or Policy Cancellation Override
- **The Operation**: Modifying the statutory effective date or cancellation date of a bound policy retroactively.
- **Why It Is Forbidden**:
  - In insurance law, backdating effective dates creates exposure for losses that have already occurred (known as "burning building" fraud).
  - If a loss occurred on Tuesday and an agent backdates policy coverage to Monday, the carrier is unlawfully assuming an existing claim.
  - *Corgi Rule*: Effective date corrections cannot be performed by database mutation; they require formal cancellation and append-only re-issuance with underwriting review.

### 5. Modification of Policy Coverage Limits Above Threshold
- **The Operation**: Raising per-occurrence or aggregate liability limits (e.g., from $1M to $5M) via mid-term endorsement without underwriting committee approval.
- **Why It Is Forbidden**:
  - Commercial liability capacity is backed by strict reinsurance treaty treaties (Quota Share / Excess of Loss).
  - Unilaterally raising limits exposes Corgi to liabilities outside its approved treaty guidelines, potentially voiding reinsurance protection.
  - *Corgi Rule*: The MCP agent write tool (`request_endorsement_or_reserve_adjustment`) is strictly sandboxed to submit an `ApprovalRequest` to the human queue. It can never auto-bind limit increases.

---

## Architectural Guarantee

The Corgi Model Context Protocol implementation encodes these principles directly in code:
- All MCP read tools (`get_policy_as_of`, `get_ledger_balance`, `get_broker_statement`) are stateless and read-only.
- The single MCP write tool (`request_endorsement_or_reserve_adjustment`) **hard-codes** `requiresRole: 'FINANCE_APPROVER'` and status `PENDING`.
- No tool exists in the MCP server that can emit a Stripe payout, execute an SQL `DELETE` or `UPDATE`, or post a journal transaction without human verification.

