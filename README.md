# Corgi — Commercial Policy Administration & Financial Subledger

A comprehensive commercial insurance policy administration, claims reserve management, double-entry financial ledger, and payment reconciliation platform built for Corgi Insurance Services.

---

## Overview

The Corgi Policy Administration platform unifies day-to-day policy lifecycles with enterprise financial controls. It guarantees that every operational insurance event (policy bind, mid-term endorsement, claim reserve adjustment, cancellation, refund) strictly reflects in an immutable, balanced double-entry accounting subledger.

### Key Capabilities

- **Policy Lifecycle Administration**: Underwrite, bind, endorse, renew, and cancel commercial lines including Commercial General Liability, Commercial Property, Cyber & Privacy, and Workers' Compensation.
- **Mid-Term Endorsements**: Calculate pro-rata premium adjustments, update coverage schedules, and log reason-based endorsement histories.
- **Claims Reserve Tracking**: First-notice-of-loss intake, initial reserve allocations, reserve revisions, claim payouts against reserves, and salvage/subrogation logging.
- **Double-Entry Financial Subledger**: Guaranteed balanced debits and credits across assets, liabilities, equities, and revenue accounts (Cash, Accounts Receivable, Unearned Premium, Earned Premium, Loss Reserves, Claims Expense).
- **Payment Processing & Webhook Reconciliation**: Stripe Payment Intent workflow, test card support, payment webhook handling, processor fee tracking, and discrepancy identification.
- **Role-Based Access Control (RBAC)**: Enforced segregation of duties between **Operations Admin** (`alex.rivera@corgi.insure`) and **Finance Approver** (`sarah.chen@corgi.insure`).

---

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **UI Library**: [React 19](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Icons & Data Visualization**: [Lucide React](https://lucide.dev/) & [Recharts](https://recharts.org/)
- **Payments**: [Stripe Node SDK](https://github.com/stripe/stripe-node)
- **Validation**: [Zod](https://zod.dev/)

---

## Getting Started

### Prerequisites

- **Node.js**: v20 or later
- **npm** or **bun**

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

Configure your environment variables as needed:

| Variable | Description |
|---|---|
| `APP_URL` | Base URL of the application (default: `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (optional for mock database mode) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `STRIPE_SECRET_KEY` | Stripe test API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |

*Note: The platform includes high-fidelity in-memory and local mock data stores for offline development and testing.*

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Production Build

```bash
# Build the production application
npm run build

# Start the production server
npm run start
```

---

## Testing & Quality

```bash
# Run ESLint checks
npm run lint
```
