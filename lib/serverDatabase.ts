import fs from 'node:fs';
import path from 'node:path';
import {
  ApprovalRequest,
  AuditLogRecord,
  Broker,
  Claim,
  DemoUser,
  InvestigationStatus,
  KybStatus,
  LedgerTransaction,
  Payment,
  Policy,
  PolicyDocument,
  ReconciliationItem,
  WebhookEventRecord,
} from '../types/domain';
import {
  DEMO_USERS,
  INITIAL_APPROVAL_REQUESTS,
  INITIAL_BROKERS,
  INITIAL_CLAIMS,
  INITIAL_DOCUMENTS,
  INITIAL_LEDGER_TRANSACTIONS,
  INITIAL_PAYMENTS,
  INITIAL_POLICIES,
  INITIAL_RECONCILIATION_ITEMS,
} from '../mocks/seedData';
import {
  buildReversalJournalLines,
  calculatePolicyInvoiceBreakdownCents,
  canUserDecideApproval,
  centsToDollars,
  dollarsToCents,
  evaluateWebhookEventTransition,
  validateBrokerBindingEligibility,
  validateClaimAgainstCoverageLimit,
  validateIntegerCentsDoubleEntry,
} from '../utils/financialRules';

export interface CorgiDatabaseState {
  users: DemoUser[];
  policies: Policy[];
  brokers: Broker[];
  payments: Payment[];
  claims: Claim[];
  ledgerTransactions: LedgerTransaction[];
  reconciliationItems: ReconciliationItem[];
  approvalRequests: ApprovalRequest[];
  documents: PolicyDocument[];
  webhookEvents: WebhookEventRecord[];
  auditLogs: AuditLogRecord[];
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'corgi-ledger-db.json');

declare global {
  var _corgiDbState: CorgiDatabaseState | undefined;
}

function createInitialSeedState(): CorgiDatabaseState {
  const nowIso = '2026-11-04T09:00:00Z';
  const initialWebhookEvents: WebhookEventRecord[] = INITIAL_PAYMENTS.map((pay, idx) => ({
    id: `wh-seed-${idx + 1}`,
    stripeEventId: `evt_seed_${pay.stripePaymentIntentId.slice(-10)}`,
    eventType:
      pay.status === 'Succeeded'
        ? 'payment_intent.succeeded'
        : pay.status === 'Refunded'
        ? 'charge.refunded'
        : pay.status === 'Failed'
        ? 'payment_intent.payment_failed'
        : 'payment_intent.created',
    paymentIntentId: pay.stripePaymentIntentId,
    status: 'PROCESSED',
    processedAt: pay.createdAt,
    recordedAt: pay.createdAt,
    summary: `Initial seeded ${pay.status} webhook for ${pay.policyNumber} ($${pay.amount.toLocaleString()})`,
  }));

  const initialAuditLogs: AuditLogRecord[] = [
    {
      id: 'aud-seed-01',
      actorEmail: 'alex.rivera@corgi.insure',
      actorRole: 'OPERATIONS_ADMIN',
      action: 'SYSTEM_LEDGER_INITIALIZED',
      entityType: 'LEDGER',
      entityId: 'CHART-OF-ACCOUNTS',
      metadataJson: JSON.stringify({ currency: 'USD', precision: 'INTEGER_CENTS' }),
      recordedAt: nowIso,
    },
  ];

  return {
    users: structuredClone(Object.values(DEMO_USERS)),
    policies: structuredClone(INITIAL_POLICIES),
    brokers: structuredClone(INITIAL_BROKERS),
    payments: structuredClone(INITIAL_PAYMENTS),
    claims: structuredClone(INITIAL_CLAIMS),
    ledgerTransactions: structuredClone(INITIAL_LEDGER_TRANSACTIONS),
    reconciliationItems: structuredClone(INITIAL_RECONCILIATION_ITEMS),
    approvalRequests: structuredClone(INITIAL_APPROVAL_REQUESTS),
    documents: structuredClone(INITIAL_DOCUMENTS),
    webhookEvents: initialWebhookEvents,
    auditLogs: initialAuditLogs,
  };
}

export function getDbState(): CorgiDatabaseState {
  if (global._corgiDbState) {
    return global._corgiDbState;
  }

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as CorgiDatabaseState;
      if (parsed && Array.isArray(parsed.policies) && Array.isArray(parsed.ledgerTransactions)) {
        global._corgiDbState = parsed;
        return global._corgiDbState;
      }
    }
  } catch (err) {
    console.warn('Initializing fresh Corgi database state:', err);
  }

  const fresh = createInitialSeedState();
  global._corgiDbState = fresh;
  persistDbState(fresh);
  return fresh;
}

function persistDbState(state: CorgiDatabaseState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Failed to persist Corgi DB file:', err);
  }
}

/**
 * Executes a database mutation inside an atomic snapshot transaction.
 * If an exception is thrown or validation fails, all changes are rolled back.
 */
export function runDbTransaction<T>(fn: (state: CorgiDatabaseState) => T): T {
  const current = getDbState();
  const snapshot = structuredClone(current);
  try {
    const result = fn(snapshot);
    global._corgiDbState = snapshot;
    persistDbState(snapshot);
    return result;
  } catch (err) {
    // Atomic rollback: global._corgiDbState remains untouched
    throw err;
  }
}

export function resetDatabaseToSeed(): CorgiDatabaseState {
  const fresh = createInitialSeedState();
  global._corgiDbState = fresh;
  persistDbState(fresh);
  return fresh;
}

function appendAuditLog(
  state: CorgiDatabaseState,
  params: {
    actor: Pick<DemoUser, 'email' | 'role'>;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }
): AuditLogRecord {
  const record: AuditLogRecord = {
    id: `aud-${Date.now()}-${state.auditLogs.length + 1}`,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    metadataJson: JSON.stringify(params.metadata || {}),
    recordedAt: new Date().toISOString(),
  };
  state.auditLogs.unshift(record);
  return record;
}

/**
 * Posts a new append-only balanced double-entry journal entry in integer USD cents.
 */
export function postBalancedJournalEntryInState(
  state: CorgiDatabaseState,
  params: {
    reference: string;
    referenceType: LedgerTransaction['referenceType'];
    description: string;
    effectiveDate?: string;
    actor: Pick<DemoUser, 'name' | 'email' | 'role'>;
    reversesJournalNumber?: string;
    lines: {
      accountCode: string;
      accountName: string;
      debitCents: number;
      creditCents: number;
      memo?: string;
    }[];
  }
): LedgerTransaction {
  const check = validateIntegerCentsDoubleEntry(
    params.lines.map((l) => ({
      accountCode: l.accountCode,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
    }))
  );

  if (!check.isBalanced) {
    throw new Error(check.errorMessage || 'Unbalanced double-entry journal transaction.');
  }

  const nextNum = 8900 + state.ledgerTransactions.length + 1;
  const journalNumber = `JE-2026-${nextNum}`;
  const txId = `je-${nextNum}`;
  const nowIso = new Date().toISOString();
  const effectiveDate = params.effectiveDate || nowIso.slice(0, 10);

  const tx: LedgerTransaction = {
    id: txId,
    journalNumber,
    timestamp: nowIso,
    reference: params.reference,
    referenceType: params.referenceType,
    description: params.description,
    postedBy: `${params.actor.name} (${params.actor.email})`,
    status: 'Posted',
    reversesJournalNumber: params.reversesJournalNumber,
    lines: params.lines.map((l, idx) => ({
      id: `${txId}-ln-${idx + 1}`,
      transactionId: txId,
      entryDate: effectiveDate,
      accountCode: l.accountCode,
      accountName: l.accountName,
      debit: centsToDollars(l.debitCents),
      credit: centsToDollars(l.creditCents),
      currency: 'USD',
      referenceType: params.referenceType,
      referenceId: params.reference,
      memo: l.memo || params.description,
    })),
  };

  state.ledgerTransactions.unshift(tx);
  return tx;
}

/**
 * Reverses an existing posted journal entry and optionally rebooks a corrected entry.
 * Enforces append-only immutability: never deletes or mutates lines on the original entry.
 */
export function reverseAndRebookJournalInDb(params: {
  journalIdOrNumber: string;
  reason: string;
  actor: DemoUser;
  rebookLines?: {
    accountCode: string;
    accountName: string;
    debitCents: number;
    creditCents: number;
    memo?: string;
  }[];
  rebookDescription?: string;
}): {
  originalEntry: LedgerTransaction;
  reversalEntry: LedgerTransaction;
  rebookedEntry?: LedgerTransaction;
} {
  return runDbTransaction((state) => {
    const target = state.ledgerTransactions.find(
      (t) => t.id === params.journalIdOrNumber || t.journalNumber === params.journalIdOrNumber
    );
    if (!target) {
      throw new Error(`Journal entry ${params.journalIdOrNumber} not found.`);
    }
    if (target.status === 'Reversed') {
      throw new Error(
        `Immutable Ledger: Journal entry ${target.journalNumber} has already been reversed by ${target.reversedByJournalNumber}.`
      );
    }

    const effectiveDate = new Date().toISOString().slice(0, 10);
    const revLines = buildReversalJournalLines(
      target.lines,
      'pending',
      effectiveDate,
      target.journalNumber
    );

    const reversalEntry = postBalancedJournalEntryInState(state, {
      reference: target.reference,
      referenceType: 'REVERSAL',
      description: `REVERSAL of ${target.journalNumber}: ${params.reason}`,
      effectiveDate,
      actor: params.actor,
      reversesJournalNumber: target.journalNumber,
      lines: revLines.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        debitCents: dollarsToCents(l.debit),
        creditCents: dollarsToCents(l.credit),
        memo: l.memo,
      })),
    });

    target.status = 'Reversed';
    target.reversedByJournalNumber = reversalEntry.journalNumber;

    let rebookedEntry: LedgerTransaction | undefined;
    if (params.rebookLines && params.rebookLines.length >= 2) {
      rebookedEntry = postBalancedJournalEntryInState(state, {
        reference: target.reference,
        referenceType: target.referenceType,
        description:
          params.rebookDescription ||
          `REBOOKED correction for ${target.journalNumber}: ${params.reason}`,
        effectiveDate,
        actor: params.actor,
        lines: params.rebookLines,
      });
      target.rebookedJournalNumber = rebookedEntry.journalNumber;
      reversalEntry.rebookedJournalNumber = rebookedEntry.journalNumber;
    }

    appendAuditLog(state, {
      actor: params.actor,
      action: 'JOURNAL_REVERSED_AND_REBOOKED',
      entityType: 'JOURNAL_ENTRY',
      entityId: target.journalNumber,
      metadata: {
        reversalJournalNumber: reversalEntry.journalNumber,
        rebookedJournalNumber: rebookedEntry?.journalNumber || null,
        reason: params.reason,
      },
    });

    return {
      originalEntry: target,
      reversalEntry,
      rebookedEntry,
    };
  });
}

/**
 * Issues and binds a commercial policy in a single database transaction:
 * 1. Verifies broker KYB status === 'Approved'
 * 2. Calculates writtenPremiumCents, taxesAndFeesCents (3.5%), and totalInvoiceCents in integer cents
 * 3. Generates unique policy number
 * 4. Persists policy & coverage schedule
 * 5. Posts balanced initial receivable/unearned journal entry
 * 6. Records audit log & declaration document
 */
export function issuePolicyInDb(params: {
  customerName: string;
  customerIndustry: string;
  customerEin: string;
  customerAddress: string;
  brokerId: string;
  lineOfBusiness: Policy['lineOfBusiness'];
  writtenPremiumDollars: number;
  aggregateCoverageLimitDollars: number;
  perOccurrenceLimitDollars: number;
  deductibleDollars: number;
  effectiveDate: string;
  expirationDate: string;
  actor: DemoUser;
}): {
  policy: Policy;
  journalEntry: LedgerTransaction;
} {
  return runDbTransaction((state) => {
    const broker = state.brokers.find((b) => b.id === params.brokerId);
    const brokerCheck = validateBrokerBindingEligibility(broker);
    if (!brokerCheck.allowed || !broker) {
      throw new Error(brokerCheck.errorMessage || 'Broker is not eligible to bind policies.');
    }

    const writtenPremiumCents = dollarsToCents(params.writtenPremiumDollars);
    const aggregateLimitCents = dollarsToCents(params.aggregateCoverageLimitDollars);
    const occurrenceLimitCents = dollarsToCents(params.perOccurrenceLimitDollars);
    const deductibleCents = dollarsToCents(params.deductibleDollars);

    if (writtenPremiumCents <= 0 || aggregateLimitCents <= 0) {
      throw new Error('Written premium and aggregate coverage limit must be positive integer cent amounts.');
    }

    const invoiceBreakdown = calculatePolicyInvoiceBreakdownCents(writtenPremiumCents, 350);
    const seq = 1091 + state.policies.length;
    const policyNumber = `CRG-POL-2026-${seq}`;
    const policyId = `pol-2026-${seq}`;

    const newPolicy: Policy = {
      id: policyId,
      policyNumber,
      customerName: params.customerName.trim(),
      customerIndustry: params.customerIndustry.trim(),
      customerEin: params.customerEin.trim(),
      customerAddress: params.customerAddress.trim(),
      brokerId: broker.id,
      brokerName: broker.agencyName,
      lineOfBusiness: params.lineOfBusiness,
      writtenPremium: centsToDollars(invoiceBreakdown.writtenPremiumCents),
      earnedPremium: 0,
      unearnedPremium: centsToDollars(invoiceBreakdown.writtenPremiumCents),
      collectedPremium: 0,
      taxesAndFees: centsToDollars(invoiceBreakdown.taxesAndFeesCents),
      effectiveDate: params.effectiveDate,
      expirationDate: params.expirationDate,
      status: 'Active',
      bindDate: params.effectiveDate,
      aggregateCoverageLimit: centsToDollars(aggregateLimitCents),
      perOccurrenceLimit: centsToDollars(occurrenceLimitCents),
      deductible: centsToDollars(deductibleCents),
      coverages: [
        {
          id: `cov-${seq}-1`,
          name: `${params.lineOfBusiness} Primary Insuring Agreement`,
          code: 'PRM-01',
          limit: centsToDollars(occurrenceLimitCents),
          deductible: centsToDollars(deductibleCents),
          basePremium: centsToDollars(invoiceBreakdown.writtenPremiumCents),
        },
      ],
      endorsements: [],
      underwriter: params.actor.name,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    state.policies.unshift(newPolicy);
    broker.activePoliciesCount += 1;

    // Book balanced double-entry journal in integer cents:
    // DR 1100 Premiums Receivable = writtenPremiumCents
    // CR 2010 Unearned Premium Reserve = writtenPremiumCents
    const journalEntry = postBalancedJournalEntryInState(state, {
      reference: policyNumber,
      referenceType: 'POLICY',
      description: `Policy issuance & binding — ${newPolicy.customerName} (${policyNumber})`,
      effectiveDate: params.effectiveDate,
      actor: params.actor,
      lines: [
        {
          accountCode: '1100',
          accountName: 'Premiums Receivable',
          debitCents: invoiceBreakdown.writtenPremiumCents,
          creditCents: 0,
          memo: `Written premium receivable — ${policyNumber}`,
        },
        {
          accountCode: '2010',
          accountName: 'Unearned Premium Reserve',
          debitCents: 0,
          creditCents: invoiceBreakdown.writtenPremiumCents,
          memo: `Unearned premium reserve — ${policyNumber}`,
        },
      ],
    });

    const newDoc: PolicyDocument = {
      id: `doc-${seq}`,
      title: `Commercial Policy Declarations — ${newPolicy.customerName}`,
      documentCode: `DEC-2026-${seq}`,
      category: 'Policy Declaration',
      relatedReference: policyNumber,
      entityName: newPolicy.customerName,
      generatedAt: new Date().toISOString().slice(0, 10),
      fileSize: '218 KB',
      version: 'v1.0 (Bound)',
      summaryPoints: [
        `Named Insured: ${newPolicy.customerName} (EIN ${newPolicy.customerEin})`,
        `Broker of Record: ${broker.agencyName} (${broker.code}) — KYB Approved`,
        `Policy Period: ${newPolicy.effectiveDate} to ${newPolicy.expirationDate}`,
      ],
      coverageOrFinancialSummary: [
        { label: 'Aggregate Limit', value: `$${newPolicy.aggregateCoverageLimit.toLocaleString()}` },
        { label: 'Occurrence Limit', value: `$${newPolicy.perOccurrenceLimit.toLocaleString()}` },
        { label: 'Annual Written Premium', value: `$${newPolicy.writtenPremium.toLocaleString()}` },
        { label: 'Taxes & Fees (3.5%)', value: `$${newPolicy.taxesAndFees.toLocaleString()}` },
      ],
    };
    state.documents.unshift(newDoc);

    appendAuditLog(state, {
      actor: params.actor,
      action: 'POLICY_ISSUED_AND_BOUND',
      entityType: 'POLICY',
      entityId: policyNumber,
      metadata: {
        policyId,
        brokerId: broker.id,
        brokerKybStatus: broker.kybStatus,
        writtenPremiumCents: invoiceBreakdown.writtenPremiumCents,
        taxesAndFeesCents: invoiceBreakdown.taxesAndFeesCents,
        totalInvoiceCents: invoiceBreakdown.totalInvoiceCents,
        journalNumber: journalEntry.journalNumber,
      },
    });

    return { policy: newPolicy, journalEntry };
  });
}

/**
 * Binds an existing Draft or Pending policy after verifying Broker KYB approval.
 */
export function bindExistingPolicyInDb(params: {
  policyId: string;
  actor: DemoUser;
}): {
  policy: Policy;
  journalEntry: LedgerTransaction;
} {
  return runDbTransaction((state) => {
    const policy = state.policies.find((p) => p.id === params.policyId);
    if (!policy) {
      throw new Error('Policy not found.');
    }
    if (policy.status === 'Active') {
      throw new Error(`Policy ${policy.policyNumber} is already Active.`);
    }

    const broker = state.brokers.find((b) => b.id === policy.brokerId);
    const brokerCheck = validateBrokerBindingEligibility(broker);
    if (!brokerCheck.allowed || !broker) {
      throw new Error(brokerCheck.errorMessage || 'Broker is not KYB-Approved for binding.');
    }

    const writtenPremiumCents = dollarsToCents(policy.writtenPremium);
    policy.status = 'Active';
    policy.unearnedPremium = centsToDollars(writtenPremiumCents);
    policy.updatedAt = new Date().toISOString().slice(0, 10);

    const journalEntry = postBalancedJournalEntryInState(state, {
      reference: policy.policyNumber,
      referenceType: 'POLICY',
      description: `Bound policy ${policy.policyNumber} — ${policy.customerName}`,
      effectiveDate: policy.effectiveDate,
      actor: params.actor,
      lines: [
        {
          accountCode: '1100',
          accountName: 'Premiums Receivable',
          debitCents: writtenPremiumCents,
          creditCents: 0,
        },
        {
          accountCode: '2010',
          accountName: 'Unearned Premium Reserve',
          debitCents: 0,
          creditCents: writtenPremiumCents,
        },
      ],
    });

    appendAuditLog(state, {
      actor: params.actor,
      action: 'POLICY_BOUND',
      entityType: 'POLICY',
      entityId: policy.policyNumber,
      metadata: {
        writtenPremiumCents,
        journalNumber: journalEntry.journalNumber,
      },
    });

    return { policy, journalEntry };
  });
}

/**
 * Phase 5 Step 1: Creates a Pending Payment record in the database when a Stripe PaymentIntent is initiated.
 * CRITICAL INVARIANT: Never marks a payment Succeeded or posts cash journal entries on initiation!
 * Cash journal posting ONLY happens when the signed Stripe webhook (`payment_intent.succeeded`) is verified.
 */
export function recordPaymentIntentCreatedInDb(params: {
  policyId: string;
  amountCents: number;
  paymentMethod: string;
  stripePaymentIntentId: string;
  idempotencyKey: string;
  actor: DemoUser;
}): Payment {
  return runDbTransaction((state) => {
    const policy = state.policies.find((p) => p.id === params.policyId);
    if (!policy) {
      throw new Error('Target policy not found for payment initiation.');
    }

    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new Error('Payment amount must be a positive integer in USD cents.');
    }

    const maxCollectibleCents =
      dollarsToCents(policy.writtenPremium) +
      dollarsToCents(policy.taxesAndFees) -
      dollarsToCents(policy.collectedPremium);

    if (params.amountCents > maxCollectibleCents && maxCollectibleCents > 0) {
      throw new Error(
        `Payment amount ($${centsToDollars(params.amountCents).toLocaleString()}) exceeds remaining policy invoice balance ($${centsToDollars(maxCollectibleCents).toLocaleString()}).`
      );
    }

    // Check if idempotencyKey or stripePaymentIntentId already exists
    const existing = state.payments.find(
      (p) => p.stripePaymentIntentId === params.stripePaymentIntentId
    );
    if (existing) {
      return existing;
    }

    const seq = 10 + state.payments.length;
    const nowIso = new Date().toISOString();
    const amountDollars = centsToDollars(params.amountCents);

    const payment: Payment = {
      id: `pay-${seq}`,
      stripePaymentIntentId: params.stripePaymentIntentId,
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      customerName: policy.customerName,
      amount: amountDollars,
      currency: 'USD',
      status: 'Pending',
      paymentMethod: params.paymentMethod,
      isSandbox: true,
      createdAt: nowIso,
      ledgerTransactionId: 'Pending Webhook Settlement',
    };

    state.payments.unshift(payment);

    // Create an Unmatched reconciliation item until the signed webhook settles the cash
    state.reconciliationItems.unshift({
      id: `rec-pi-${seq}`,
      reconciliationDate: nowIso.slice(0, 10),
      stripeChargeId: params.stripePaymentIntentId,
      policyNumber: policy.policyNumber,
      customerName: policy.customerName,
      stripeAmount: amountDollars,
      stripeFee: 0,
      stripeNetAmount: amountDollars,
      ledgerGrossAmount: 0,
      ledgerJournalNumber: 'Awaiting Webhook',
      differenceAmount: amountDollars,
      matchStatus: 'Unmatched',
      investigationStatus: 'Open Break',
      notes: 'PaymentIntent created; awaiting verified Stripe payment_intent.succeeded webhook before posting ledger cash.',
      assignedTo: params.actor.name,
    });

    appendAuditLog(state, {
      actor: params.actor,
      action: 'STRIPE_PAYMENT_INTENT_CREATED',
      entityType: 'PAYMENT',
      entityId: params.stripePaymentIntentId,
      metadata: {
        policyNumber: policy.policyNumber,
        amountCents: params.amountCents,
        status: 'Pending',
      },
    });

    return payment;
  });
}

/**
 * Phase 5 Step 2: Processes a verified Stripe Webhook Event idempotently inside a database transaction.
 * - Rejects duplicate `stripeEventId` replays (`DUPLICATE_IGNORED`)
 * - Rejects out-of-order events (`OUT_OF_ORDER_IGNORED`)
 * - Posts balanced double-entry journal entries ONLY when `payment_intent.succeeded` or `charge.refunded` is confirmed.
 */
export function processVerifiedStripeWebhookInDb(params: {
  stripeEventId: string;
  eventType: 'payment_intent.created' | 'payment_intent.succeeded' | 'payment_intent.payment_failed' | 'charge.refunded';
  paymentIntentId: string;
  amountCents?: number;
  actor?: Pick<DemoUser, 'name' | 'email' | 'role'>;
}): {
  outcome: 'APPLY' | 'DUPLICATE_IGNORED' | 'OUT_OF_ORDER_IGNORED';
  webhookRecord: WebhookEventRecord;
  payment: Payment;
  journalEntries: LedgerTransaction[];
  reason: string;
} {
  return runDbTransaction((state) => {
    const payment = state.payments.find(
      (p) => p.stripePaymentIntentId === params.paymentIntentId || p.id === params.paymentIntentId
    );
    if (!payment) {
      throw new Error(`PaymentIntent ${params.paymentIntentId} not found in database.`);
    }

    const processedEventIds = new Set(state.webhookEvents.map((e) => e.stripeEventId));
    const transition = evaluateWebhookEventTransition({
      stripeEventId: params.stripeEventId,
      eventType: params.eventType,
      currentPaymentStatus: payment.status,
      processedEventIds,
    });

    const nowIso = new Date().toISOString();
    const actor = params.actor || {
      name: 'Stripe Webhook Signer',
      email: 'webhooks@stripe.com',
      role: 'OPERATIONS_ADMIN' as const,
    };

    if (transition.action !== 'APPLY') {
      const ignoredRecord: WebhookEventRecord = {
        id: `wh-${Date.now()}-${state.webhookEvents.length + 1}`,
        stripeEventId: params.stripeEventId,
        eventType: params.eventType,
        paymentIntentId: payment.stripePaymentIntentId,
        status: transition.action,
        processedAt: nowIso,
        recordedAt: nowIso,
        summary: transition.reason,
      };
      // Only insert into webhookEvents if it wasn't already recorded by stripeEventId
      if (!processedEventIds.has(params.stripeEventId)) {
        state.webhookEvents.unshift(ignoredRecord);
      }
      return {
        outcome: transition.action,
        webhookRecord: ignoredRecord,
        payment,
        journalEntries: [],
        reason: transition.reason,
      };
    }

    const amountCents = params.amountCents ?? dollarsToCents(payment.amount);
    const createdJournals: LedgerTransaction[] = [];

    if (params.eventType === 'payment_intent.succeeded') {
      payment.status = 'Succeeded';

      // 1. Post Cash Clearing vs Premiums Receivable Journal Entry in integer cents
      const cashJournal = postBalancedJournalEntryInState(state, {
        reference: payment.stripePaymentIntentId,
        referenceType: 'PAYMENT',
        description: `Verified Stripe webhook (${params.stripeEventId}) settlement for ${payment.policyNumber} — ${payment.customerName}`,
        effectiveDate: nowIso.slice(0, 10),
        actor,
        lines: [
          {
            accountCode: '1020',
            accountName: 'Stripe Settlement Clearing',
            debitCents: amountCents,
            creditCents: 0,
            memo: `Stripe settlement clearing (${payment.stripePaymentIntentId})`,
          },
          {
            accountCode: '1100',
            accountName: 'Premiums Receivable',
            debitCents: 0,
            creditCents: amountCents,
            memo: `Receivable settled for ${payment.policyNumber}`,
          },
        ],
      });
      payment.ledgerTransactionId = cashJournal.journalNumber;
      createdJournals.push(cashJournal);

      // 2. Update Policy collectedPremium and Broker commission accrual
      const policy = state.policies.find((p) => p.id === payment.policyId);
      if (policy) {
        const nextCollectedCents = dollarsToCents(policy.collectedPremium) + amountCents;
        policy.collectedPremium = centsToDollars(nextCollectedCents);

        const broker = state.brokers.find((b) => b.id === policy.brokerId);
        if (broker) {
          const commissionCents = Math.round(amountCents * broker.commissionRate);
          broker.collectedPremium = centsToDollars(
            dollarsToCents(broker.collectedPremium) + amountCents
          );
          broker.totalCommissionEarned = centsToDollars(
            dollarsToCents(broker.totalCommissionEarned) + commissionCents
          );
          broker.commissions.unshift({
            id: `com-${Date.now()}`,
            brokerId: broker.id,
            policyId: policy.id,
            policyNumber: policy.policyNumber,
            customerName: policy.customerName,
            premiumCollected: centsToDollars(amountCents),
            commissionRate: broker.commissionRate,
            commissionAmount: centsToDollars(commissionCents),
            status: broker.kybStatus === 'Approved' ? 'Accrued' : 'Held (KYB)',
            settledDate: nowIso.slice(0, 10),
          });

          if (commissionCents > 0) {
            const commJournal = postBalancedJournalEntryInState(state, {
              reference: policy.policyNumber,
              referenceType: 'PAYMENT',
              description: `Producer commission accrual (${(broker.commissionRate * 100).toFixed(1)}%) — ${broker.agencyName}`,
              effectiveDate: nowIso.slice(0, 10),
              actor,
              lines: [
                {
                  accountCode: '5100',
                  accountName: 'Broker Commission Expense',
                  debitCents: commissionCents,
                  creditCents: 0,
                  memo: `Producer commission expense — ${policy.policyNumber}`,
                },
                {
                  accountCode: '2200',
                  accountName: 'Broker Commissions Payable',
                  debitCents: 0,
                  creditCents: commissionCents,
                  memo: `Commission payable to ${broker.code}`,
                },
              ],
            });
            createdJournals.push(commJournal);
          }
        }
      }

      // 3. Reconcile the Stripe vs Ledger record
      const recItem = state.reconciliationItems.find(
        (r) => r.stripeChargeId === payment.stripePaymentIntentId
      );
      if (recItem) {
        recItem.ledgerGrossAmount = centsToDollars(amountCents);
        recItem.ledgerJournalNumber = cashJournal.journalNumber;
        recItem.differenceAmount = 0;
        recItem.matchStatus = 'Matched';
        recItem.investigationStatus = 'Verified';
        recItem.notes = `Auto-reconciled on verified Stripe webhook ${params.stripeEventId} (${cashJournal.journalNumber}).`;
      } else {
        state.reconciliationItems.unshift({
          id: `rec-${Date.now()}`,
          reconciliationDate: nowIso.slice(0, 10),
          stripeChargeId: payment.stripePaymentIntentId,
          policyNumber: payment.policyNumber,
          customerName: payment.customerName,
          stripeAmount: centsToDollars(amountCents),
          stripeFee: 0,
          stripeNetAmount: centsToDollars(amountCents),
          ledgerGrossAmount: centsToDollars(amountCents),
          ledgerJournalNumber: cashJournal.journalNumber,
          differenceAmount: 0,
          matchStatus: 'Matched',
          investigationStatus: 'Verified',
          notes: `Auto-reconciled on verified Stripe webhook ${params.stripeEventId}.`,
          assignedTo: 'Automated Clearing Engine',
        });
      }
    } else if (params.eventType === 'charge.refunded') {
      payment.status = 'Refunded';
      payment.refundedAmount = centsToDollars(amountCents);
      payment.refundedAt = nowIso;

      const refundJournal = postBalancedJournalEntryInState(state, {
        reference: payment.stripePaymentIntentId,
        referenceType: 'REVERSAL',
        description: `Verified Stripe refund (${params.stripeEventId}) for ${payment.policyNumber} — ${payment.customerName}`,
        effectiveDate: nowIso.slice(0, 10),
        actor,
        lines: [
          {
            accountCode: '2300',
            accountName: 'Return Premiums & Refunds Payable',
            debitCents: amountCents,
            creditCents: 0,
            memo: `Return premium refund settled (${payment.stripePaymentIntentId})`,
          },
          {
            accountCode: '1020',
            accountName: 'Stripe Settlement Clearing',
            debitCents: 0,
            creditCents: amountCents,
            memo: `Stripe refund outflow (${payment.stripePaymentIntentId})`,
          },
        ],
      });
      createdJournals.push(refundJournal);

      const policy = state.policies.find((p) => p.id === payment.policyId);
      if (policy) {
        const nextCollectedCents = Math.max(0, dollarsToCents(policy.collectedPremium) - amountCents);
        policy.collectedPremium = centsToDollars(nextCollectedCents);
      }
    } else if (params.eventType === 'payment_intent.payment_failed') {
      payment.status = 'Failed';
    }

    const webhookRecord: WebhookEventRecord = {
      id: `wh-${Date.now()}-${state.webhookEvents.length + 1}`,
      stripeEventId: params.stripeEventId,
      eventType: params.eventType,
      paymentIntentId: payment.stripePaymentIntentId,
      status: 'PROCESSED',
      processedAt: nowIso,
      recordedAt: nowIso,
      summary: `${params.eventType} processed for ${payment.policyNumber} ($${centsToDollars(amountCents).toLocaleString()})${
        createdJournals.length > 0
          ? ` -> Posted ${createdJournals.map((j) => j.journalNumber).join(', ')}`
          : ''
      }`,
    };
    state.webhookEvents.unshift(webhookRecord);

    appendAuditLog(state, {
      actor,
      action: `WEBHOOK_${params.eventType.toUpperCase().replace(/\./g, '_')}`,
      entityType: 'WEBHOOK_EVENT',
      entityId: params.stripeEventId,
      metadata: {
        paymentIntentId: payment.stripePaymentIntentId,
        policyNumber: payment.policyNumber,
        amountCents,
        journalsPosted: createdJournals.map((j) => j.journalNumber),
      },
    });

    return {
      outcome: 'APPLY',
      webhookRecord,
      payment,
      journalEntries: createdJournals,
      reason: transition.reason,
    };
  });
}

export function updateBrokerKybInDb(params: {
  brokerId: string;
  kybStatus: KybStatus;
  actor: DemoUser;
}): Broker {
  return runDbTransaction((state) => {
    const broker = state.brokers.find((b) => b.id === params.brokerId);
    if (!broker) {
      throw new Error('Broker not found.');
    }
    const previous = broker.kybStatus;
    broker.kybStatus = params.kybStatus;

    appendAuditLog(state, {
      actor: params.actor,
      action: 'BROKER_KYB_STATUS_UPDATED',
      entityType: 'BROKER',
      entityId: broker.code,
      metadata: { previousStatus: previous, newStatus: params.kybStatus },
    });

    return broker;
  });
}

export function createEndorsementInDb(params: {
  policyId: string;
  effectiveDate: string;
  description: string;
  premiumDeltaDollars: number;
  actor: DemoUser;
}): { policy: Policy; journalEntry?: LedgerTransaction } {
  return runDbTransaction((state) => {
    const policy = state.policies.find((p) => p.id === params.policyId);
    if (!policy) {
      throw new Error('Policy not found.');
    }
    const deltaCents = dollarsToCents(params.premiumDeltaDollars);
    const endSeq = policy.endorsements.length + 1;
    const endorsementNumber = `END-${policy.policyNumber.slice(-4)}-0${endSeq}`;

    policy.endorsements.push({
      id: `end-${Date.now()}`,
      endorsementNumber,
      policyId: policy.id,
      effectiveDate: params.effectiveDate,
      description: params.description.trim(),
      premiumDelta: centsToDollars(deltaCents),
      status: 'Applied',
      createdBy: params.actor.name,
      createdAt: new Date().toISOString().slice(0, 10),
    });

    policy.writtenPremium = centsToDollars(
      Math.max(0, dollarsToCents(policy.writtenPremium) + deltaCents)
    );
    policy.unearnedPremium = centsToDollars(
      Math.max(0, dollarsToCents(policy.unearnedPremium) + deltaCents)
    );
    policy.taxesAndFees = centsToDollars(
      calculatePolicyInvoiceBreakdownCents(dollarsToCents(policy.writtenPremium)).taxesAndFeesCents
    );
    policy.updatedAt = new Date().toISOString().slice(0, 10);

    let journalEntry: LedgerTransaction | undefined;
    if (deltaCents !== 0) {
      const absCents = Math.abs(deltaCents);
      journalEntry = postBalancedJournalEntryInState(state, {
        reference: endorsementNumber,
        referenceType: 'ENDORSEMENT',
        description: `Endorsement ${endorsementNumber} on ${policy.policyNumber}: ${params.description}`,
        effectiveDate: params.effectiveDate,
        actor: params.actor,
        lines:
          deltaCents > 0
            ? [
                {
                  accountCode: '1100',
                  accountName: 'Premiums Receivable',
                  debitCents: absCents,
                  creditCents: 0,
                },
                {
                  accountCode: '2010',
                  accountName: 'Unearned Premium Reserve',
                  debitCents: 0,
                  creditCents: absCents,
                },
              ]
            : [
                {
                  accountCode: '2010',
                  accountName: 'Unearned Premium Reserve',
                  debitCents: absCents,
                  creditCents: 0,
                },
                {
                  accountCode: '2300',
                  accountName: 'Return Premiums & Refunds Payable',
                  debitCents: 0,
                  creditCents: absCents,
                },
              ],
      });
    }

    appendAuditLog(state, {
      actor: params.actor,
      action: 'POLICY_ENDORSED',
      entityType: 'POLICY',
      entityId: policy.policyNumber,
      metadata: { endorsementNumber, deltaCents },
    });

    return { policy, journalEntry };
  });
}

export function cancelPolicyInDb(params: {
  policyId: string;
  reason: string;
  actor: DemoUser;
}): Policy {
  return runDbTransaction((state) => {
    const policy = state.policies.find((p) => p.id === params.policyId);
    if (!policy) {
      throw new Error('Policy not found.');
    }
    const unearnedCents = dollarsToCents(policy.unearnedPremium);
    const cancelIsoDate = new Date().toISOString().slice(0, 10);
    policy.status = 'Cancelled';
    policy.cancellationDate = cancelIsoDate;
    policy.unearnedPremium = 0;
    policy.updatedAt = cancelIsoDate;

    if (unearnedCents > 0) {
      const reqSeq = 410 + state.approvalRequests.length;
      state.approvalRequests.unshift({
        id: `apr-${reqSeq}`,
        referenceNumber: `APR-2026-0${reqSeq}`,
        actionType: 'Policy Cancellation Return Premium',
        targetEntityId: policy.id,
        targetReference: policy.policyNumber,
        customerName: policy.customerName,
        amount: centsToDollars(unearnedCents),
        reason: `Cancellation of ${policy.policyNumber}: ${params.reason}`,
        initiatorEmail: params.actor.email,
        initiatorName: params.actor.name,
        initiatorRole: params.actor.role,
        createdAt: new Date().toISOString(),
        status: 'Pending',
      });
    }

    appendAuditLog(state, {
      actor: params.actor,
      action: 'POLICY_CANCELLED',
      entityType: 'POLICY',
      entityId: policy.policyNumber,
      metadata: { reason: params.reason, unearnedReturnCents: unearnedCents },
    });

    return policy;
  });
}

export function fileClaimInDb(params: {
  policyId: string;
  lossDate: string;
  description: string;
  claimedAmountDollars: number;
  initialReserveDollars: number;
  actor: DemoUser;
}): { claim: Claim; journalEntry: LedgerTransaction } {
  return runDbTransaction((state) => {
    const policy = state.policies.find((p) => p.id === params.policyId);
    if (!policy) {
      throw new Error('Policy not found.');
    }

    const validation = validateClaimAgainstCoverageLimit({
      claimedAmount: params.claimedAmountDollars,
      paidAmount: 0,
      outstandingReserve: params.initialReserveDollars,
      policyCoverageLimit: policy.perOccurrenceLimit,
    });
    if (!validation.valid) {
      throw new Error(validation.errorMessage || 'Claim exceeds policy coverage limit.');
    }

    const reserveCents = dollarsToCents(params.initialReserveDollars);
    const seq = 905 + state.claims.length;
    const claimNumber = `CLM-2026-0${seq}`;
    const claimId = `clm-${seq}`;

    const journalEntry = postBalancedJournalEntryInState(state, {
      reference: claimNumber,
      referenceType: 'CLAIM_RESERVE',
      description: `Initial loss reserve for ${claimNumber} (${policy.policyNumber})`,
      effectiveDate: params.lossDate,
      actor: params.actor,
      lines: [
        {
          accountCode: '5010',
          accountName: 'Incurred Claims Expense',
          debitCents: reserveCents,
          creditCents: 0,
        },
        {
          accountCode: '2100',
          accountName: 'Claims Loss Reserve',
          debitCents: 0,
          creditCents: reserveCents,
        },
      ],
    });

    const newClaim: Claim = {
      id: claimId,
      claimNumber,
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      customerName: policy.customerName,
      lineOfBusiness: policy.lineOfBusiness,
      lossDate: params.lossDate,
      reportedDate: new Date().toISOString().slice(0, 10),
      description: params.description.trim(),
      status: 'Open',
      payoutStatus: 'Unpaid',
      policyCoverageLimit: policy.perOccurrenceLimit,
      policyDeductible: policy.deductible,
      claimedAmount: params.claimedAmountDollars,
      paidAmount: 0,
      outstandingReserve: params.initialReserveDollars,
      adjusterName: params.actor.name,
      reserveHistory: [
        {
          id: `ra-${seq}-1`,
          claimId,
          previousReserve: 0,
          newReserve: params.initialReserveDollars,
          delta: params.initialReserveDollars,
          reason: 'Initial FNOL case reserve establishment',
          adjustedBy: `${params.actor.name} (${params.actor.email})`,
          timestamp: new Date().toISOString(),
          ledgerTransactionId: journalEntry.journalNumber,
        },
      ],
    };

    state.claims.unshift(newClaim);
    return { claim: newClaim, journalEntry };
  });
}

export function adjustClaimReserveInDb(params: {
  claimId: string;
  newReserveDollars: number;
  reason: string;
  actor: DemoUser;
}): { claim: Claim; journalEntry: LedgerTransaction } {
  return runDbTransaction((state) => {
    const claim = state.claims.find((c) => c.id === params.claimId);
    if (!claim) {
      throw new Error('Claim not found.');
    }

    const validation = validateClaimAgainstCoverageLimit({
      claimedAmount: claim.claimedAmount,
      paidAmount: claim.paidAmount,
      outstandingReserve: params.newReserveDollars,
      policyCoverageLimit: claim.policyCoverageLimit,
    });
    if (!validation.valid) {
      throw new Error(validation.errorMessage || 'Reserve adjustment exceeds coverage limit.');
    }

    const deltaCents =
      dollarsToCents(params.newReserveDollars) - dollarsToCents(claim.outstandingReserve);
    if (deltaCents === 0) {
      throw new Error('New reserve amount is identical to current outstanding reserve.');
    }

    const absCents = Math.abs(deltaCents);
    const journalEntry = postBalancedJournalEntryInState(state, {
      reference: claim.claimNumber,
      referenceType: 'CLAIM_RESERVE',
      description: `Reserve adjustment on ${claim.claimNumber}: ${params.reason}`,
      actor: params.actor,
      lines:
        deltaCents > 0
          ? [
              {
                accountCode: '5010',
                accountName: 'Incurred Claims Expense',
                debitCents: absCents,
                creditCents: 0,
              },
              {
                accountCode: '2100',
                accountName: 'Claims Loss Reserve',
                debitCents: 0,
                creditCents: absCents,
              },
            ]
          : [
              {
                accountCode: '2100',
                accountName: 'Claims Loss Reserve',
                debitCents: absCents,
                creditCents: 0,
              },
              {
                accountCode: '5010',
                accountName: 'Incurred Claims Expense',
                debitCents: 0,
                creditCents: absCents,
              },
            ],
    });

    const prev = claim.outstandingReserve;
    claim.outstandingReserve = params.newReserveDollars;
    claim.reserveHistory.unshift({
      id: `ra-${Date.now()}`,
      claimId: claim.id,
      previousReserve: prev,
      newReserve: params.newReserveDollars,
      delta: centsToDollars(deltaCents),
      reason: params.reason,
      adjustedBy: `${params.actor.name} (${params.actor.email})`,
      timestamp: new Date().toISOString(),
      ledgerTransactionId: journalEntry.journalNumber,
    });

    return { claim, journalEntry };
  });
}

export function decideApprovalInDb(params: {
  requestId: string;
  decision: 'Approved' | 'Rejected';
  note: string;
  actor: DemoUser;
}): ApprovalRequest {
  return runDbTransaction((state) => {
    const req = state.approvalRequests.find((r) => r.id === params.requestId);
    if (!req) {
      throw new Error('Approval request not found.');
    }

    const check = canUserDecideApproval(params.actor, req);
    if (!check.allowed) {
      throw new Error(check.reason || 'User is not authorized to decide this approval request.');
    }

    req.status = params.decision;
    req.decidedByEmail = params.actor.email;
    req.decidedByName = params.actor.name;
    req.decidedAt = new Date().toISOString();
    req.decisionNote = params.note;

    if (params.decision === 'Approved') {
      const amountCents = dollarsToCents(req.amount);
      if (req.actionType === 'Claim Payout Release') {
        const claim = state.claims.find((c) => c.id === req.targetEntityId);
        if (claim) {
          claim.payoutStatus = 'Paid in Full';
          claim.status = 'Settled';
          claim.paidAmount = centsToDollars(dollarsToCents(claim.paidAmount) + amountCents);
          claim.outstandingReserve = centsToDollars(
            Math.max(0, dollarsToCents(claim.outstandingReserve) - amountCents)
          );
          postBalancedJournalEntryInState(state, {
            reference: claim.claimNumber,
            referenceType: 'CLAIM_RESERVE',
            description: `Approved claim payout release (${req.referenceNumber}) for ${claim.claimNumber}`,
            actor: params.actor,
            lines: [
              {
                accountCode: '2100',
                accountName: 'Claims Loss Reserve',
                debitCents: amountCents,
                creditCents: 0,
              },
              {
                accountCode: '1010',
                accountName: 'Operating Cash — SVB Treasury',
                debitCents: 0,
                creditCents: amountCents,
              },
            ],
          });
        }
      } else if (
        req.actionType === 'Payment Refund' ||
        req.actionType === 'Policy Cancellation Return Premium'
      ) {
        postBalancedJournalEntryInState(state, {
          reference: req.targetReference,
          referenceType: 'REVERSAL',
          description: `Approved return premium / refund settlement (${req.referenceNumber})`,
          actor: params.actor,
          lines: [
            {
              accountCode: '2010',
              accountName: 'Unearned Premium Reserve',
              debitCents: amountCents,
              creditCents: 0,
            },
            {
              accountCode: '1020',
              accountName: 'Stripe Settlement Clearing',
              debitCents: 0,
              creditCents: amountCents,
            },
          ],
        });
      }
    }

    appendAuditLog(state, {
      actor: params.actor,
      action: `APPROVAL_${params.decision.toUpperCase()}`,
      entityType: 'APPROVAL_REQUEST',
      entityId: req.referenceNumber,
      metadata: { decision: params.decision, note: params.note },
    });

    return req;
  });
}

export function updateReconciliationBreakInDb(params: {
  itemId: string;
  status: InvestigationStatus;
  notes: string;
  actor: DemoUser;
}): ReconciliationItem {
  return runDbTransaction((state) => {
    const item = state.reconciliationItems.find((r) => r.id === params.itemId);
    if (!item) {
      throw new Error('Reconciliation item not found.');
    }

    item.investigationStatus = params.status;
    item.notes = params.notes;

    if (params.status === 'Resolved via Adjustment' && item.differenceAmount !== 0) {
      const diffCents = Math.abs(dollarsToCents(item.differenceAmount));
      const adjJournal = postBalancedJournalEntryInState(state, {
        reference: item.stripeChargeId,
        referenceType: 'PAYMENT',
        description: `Reconciliation break adjustment for ${item.stripeChargeId} (${item.policyNumber})`,
        actor: params.actor,
        lines: [
          {
            accountCode: '1020',
            accountName: 'Stripe Settlement Clearing',
            debitCents: diffCents,
            creditCents: 0,
          },
          {
            accountCode: '1100',
            accountName: 'Premiums Receivable',
            debitCents: 0,
            creditCents: diffCents,
          },
        ],
      });
      item.ledgerGrossAmount = item.stripeAmount;
      item.differenceAmount = 0;
      item.matchStatus = 'Matched';
      item.ledgerJournalNumber = adjJournal.journalNumber;
    }

    return item;
  });
}
