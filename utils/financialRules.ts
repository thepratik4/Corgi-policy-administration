import {
  ApprovalRequest,
  DemoUser,
  KybStatus,
  LedgerEntryLine,
  PaymentStatus,
  Policy,
  ReconciliationMatchStatus,
} from '../types/domain';

/**
 * Converts a USD dollar number or numeric string into exact integer USD cents.
 * Never leaves floating-point fractions.
 */
export function dollarsToCents(dollars: number | string): number {
  const num = typeof dollars === 'string' ? Number(dollars) : dollars;
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Converts integer USD cents into a 2-decimal USD dollar number for UI formatting.
 */
export function centsToDollars(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

/**
 * Validates integer-cent double-entry journal lines:
 * - At least 2 lines
 * - Every line has integer debitCents >= 0 and creditCents >= 0
 * - Every line is strictly single-sided (either debit > 0 or credit > 0, never both)
 * - Total debits in cents === Total credits in cents > 0
 */
export function validateIntegerCentsDoubleEntry(
  lines: { accountCode: string; debitCents: number; creditCents: number }[]
): {
  isBalanced: boolean;
  totalDebitCents: number;
  totalCreditCents: number;
  imbalanceCents: number;
  errorMessage?: string;
} {
  if (!Array.isArray(lines) || lines.length < 2) {
    return {
      isBalanced: false,
      totalDebitCents: 0,
      totalCreditCents: 0,
      imbalanceCents: 0,
      errorMessage: 'A double-entry journal transaction requires at least 2 lines.',
    };
  }

  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const line of lines) {
    const d = line.debitCents;
    const c = line.creditCents;
    if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) {
      return {
        isBalanced: false,
        totalDebitCents,
        totalCreditCents,
        imbalanceCents: Math.abs(totalDebitCents - totalCreditCents),
        errorMessage: `Account ${line.accountCode} has non-integer or negative cent amounts.`,
      };
    }
    if ((d === 0 && c === 0) || (d > 0 && c > 0)) {
      return {
        isBalanced: false,
        totalDebitCents,
        totalCreditCents,
        imbalanceCents: Math.abs(totalDebitCents - totalCreditCents),
        errorMessage: `Account ${line.accountCode} must have either a positive debit or a positive credit (not both or zero).`,
      };
    }
    totalDebitCents += d;
    totalCreditCents += c;
  }

  const imbalanceCents = Math.abs(totalDebitCents - totalCreditCents);
  const isBalanced = totalDebitCents > 0 && imbalanceCents === 0;

  return {
    isBalanced,
    totalDebitCents,
    totalCreditCents,
    imbalanceCents,
    errorMessage: isBalanced
      ? undefined
      : `Unbalanced journal entry: debits (${totalDebitCents}¢) != credits (${totalCreditCents}¢).`,
  };
}

/**
 * Validates that a set of double-entry journal lines is strictly balanced
 * using integer-cent conversion under the hood (sum of debits === sum of credits, and total > 0).
 */
export function validateDoubleEntryBalance(lines: Pick<LedgerEntryLine, 'debit' | 'credit'>[]): {
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  imbalance: number;
} {
  const totalDebitCents = lines.reduce((sum, line) => sum + dollarsToCents(Number(line.debit) || 0), 0);
  const totalCreditCents = lines.reduce((sum, line) => sum + dollarsToCents(Number(line.credit) || 0), 0);
  const imbalanceCents = Math.abs(totalDebitCents - totalCreditCents);
  return {
    isBalanced: totalDebitCents > 0 && imbalanceCents === 0,
    totalDebit: centsToDollars(totalDebitCents),
    totalCredit: centsToDollars(totalCreditCents),
    imbalance: centsToDollars(imbalanceCents),
  };
}

/**
 * Calculates base written premium, 3.5% statutory surplus lines tax & stamping fee,
 * and total policyholder invoice amount in exact integer USD cents.
 */
export function calculatePolicyInvoiceBreakdownCents(
  writtenPremiumCents: number,
  taxRateBps = 350 // 350 bps = 3.50%
): {
  writtenPremiumCents: number;
  taxesAndFeesCents: number;
  totalInvoiceCents: number;
  currency: 'USD';
} {
  const safePremiumCents = Math.max(0, Math.round(writtenPremiumCents));
  const taxesAndFeesCents = Math.round((safePremiumCents * taxRateBps) / 10000);
  const totalInvoiceCents = safePremiumCents + taxesAndFeesCents;
  return {
    writtenPremiumCents: safePremiumCents,
    taxesAndFeesCents,
    totalInvoiceCents,
    currency: 'USD',
  };
}

/**
 * Calculates cancellation unearned return premium and carrier retained penalty.
 * - PRO_RATA (Standard/Carrier cancellation): 100% of unearned premium refunded to insured.
 * - SHORT_RATE (Insured request cancellation): 90% refunded to insured, 10% penalty retained
 *   by carrier as earned fee revenue in account 4020 Retained Short-Rate Penalty.
 */
export function calculateCancellationRefundCents(
  unearnedPremiumCents: number,
  cancellationType: 'PRO_RATA' | 'SHORT_RATE' = 'PRO_RATA'
): {
  grossUnearnedCents: number;
  refundCents: number;
  retainedPenaltyCents: number;
  cancellationType: 'PRO_RATA' | 'SHORT_RATE';
} {
  const safeUnearned = Math.max(0, Math.round(unearnedPremiumCents));
  if (cancellationType === 'SHORT_RATE') {
    const retainedPenaltyCents = Math.round(safeUnearned * 0.10);
    const refundCents = safeUnearned - retainedPenaltyCents;
    return {
      grossUnearnedCents: safeUnearned,
      refundCents,
      retainedPenaltyCents,
      cancellationType: 'SHORT_RATE',
    };
  }
  return {
    grossUnearnedCents: safeUnearned,
    refundCents: safeUnearned,
    retainedPenaltyCents: 0,
    cancellationType: 'PRO_RATA',
  };
}

/**
 * Verifies whether a broker is eligible to bind/issue a commercial policy.
 * Unverified, Pending, or Failed KYB brokers are strictly blocked from binding policies.
 */
export function validateBrokerBindingEligibility(broker: {
  id: string;
  agencyName: string;
  kybStatus: KybStatus;
} | null | undefined): {
  allowed: boolean;
  errorMessage?: string;
} {
  if (!broker) {
    return {
      allowed: false,
      errorMessage: 'Selected broker does not exist in the producer registry.',
    };
  }
  if (broker.kybStatus !== 'Approved') {
    return {
      allowed: false,
      errorMessage: `Broker "${broker.agencyName}" has KYB status "${broker.kybStatus}". Only KYB-Approved brokers are authorized to bind policies.`,
    };
  }
  return { allowed: true };
}

/**
 * Builds exact mirror-image reversal lines (swapping debit and credit amounts)
 * for an existing posted journal entry to enforce append-only reversal & rebooking.
 */
export function buildReversalJournalLines(
  originalLines: Pick<LedgerEntryLine, 'accountCode' | 'accountName' | 'debit' | 'credit' | 'referenceType' | 'referenceId'>[],
  reversalTransactionId: string,
  entryDate: string,
  originalJournalNumber: string
): LedgerEntryLine[] {
  return originalLines.map((line, index) => ({
    id: `${reversalTransactionId}-rev-ln-${index + 1}`,
    transactionId: reversalTransactionId,
    entryDate,
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: centsToDollars(dollarsToCents(line.credit)),
    credit: centsToDollars(dollarsToCents(line.debit)),
    currency: 'USD',
    referenceType: 'REVERSAL',
    referenceId: originalJournalNumber,
    memo: `Reversal of ${originalJournalNumber} (${line.accountCode})`,
  }));
}

/**
 * Evaluates incoming Stripe webhook events for idempotency and out-of-order state transitions.
 * - Duplicate stripeEventId -> DUPLICATE_IGNORED
 * - Out-of-order event (e.g., payment_intent.created arriving after payment is already Succeeded or Refunded) -> OUT_OF_ORDER_IGNORED
 */
export function evaluateWebhookEventTransition(params: {
  stripeEventId: string;
  eventType: 'payment_intent.created' | 'payment_intent.succeeded' | 'payment_intent.payment_failed' | 'charge.refunded';
  currentPaymentStatus: PaymentStatus | null;
  processedEventIds: Set<string> | string[];
}): {
  action: 'APPLY' | 'DUPLICATE_IGNORED' | 'OUT_OF_ORDER_IGNORED';
  nextPaymentStatus: PaymentStatus;
  shouldPostJournal: boolean;
  reason: string;
} {
  const { stripeEventId, eventType, currentPaymentStatus, processedEventIds } = params;
  const seen = Array.isArray(processedEventIds)
    ? new Set(processedEventIds)
    : processedEventIds;

  if (seen.has(stripeEventId)) {
    return {
      action: 'DUPLICATE_IGNORED',
      nextPaymentStatus: currentPaymentStatus || 'Pending',
      shouldPostJournal: false,
      reason: `Webhook event ${stripeEventId} was already processed; skipping duplicate ledger posting.`,
    };
  }

  // Out-of-order and duplication protection: terminal or advanced states cannot be downgraded
  if (currentPaymentStatus === 'Refunded') {
    if (eventType === 'charge.refunded') {
      return {
        action: 'DUPLICATE_IGNORED',
        nextPaymentStatus: 'Refunded',
        shouldPostJournal: false,
        reason: 'Payment is already in terminal state Refunded; skipping duplicate refund reversal journal.',
      };
    }
    return {
      action: 'OUT_OF_ORDER_IGNORED',
      nextPaymentStatus: 'Refunded',
      shouldPostJournal: false,
      reason: `Payment is already in terminal state Refunded; ignoring out-of-order ${eventType}.`,
    };
  }

  if (
    currentPaymentStatus === 'Succeeded' &&
    (eventType === 'payment_intent.created' || eventType === 'payment_intent.payment_failed')
  ) {
    return {
      action: 'OUT_OF_ORDER_IGNORED',
      nextPaymentStatus: 'Succeeded',
      shouldPostJournal: false,
      reason: `Payment is already Succeeded; ignoring out-of-order ${eventType}.`,
    };
  }

  if (currentPaymentStatus === 'Succeeded' && eventType === 'payment_intent.succeeded') {
    return {
      action: 'DUPLICATE_IGNORED',
      nextPaymentStatus: 'Succeeded',
      shouldPostJournal: false,
      reason: `Payment is already Succeeded; preventing duplicate settlement journal entry.`,
    };
  }

  if (eventType === 'payment_intent.succeeded') {
    return {
      action: 'APPLY',
      nextPaymentStatus: 'Succeeded',
      shouldPostJournal: true,
      reason: 'Verified payment_intent.succeeded webhook; settling payment and posting cash/receivable & commission journal entries.',
    };
  }

  if (eventType === 'charge.refunded') {
    return {
      action: 'APPLY',
      nextPaymentStatus: 'Refunded',
      shouldPostJournal: true,
      reason: 'Verified charge.refunded webhook; marking payment Refunded and posting return-premium reversal journal entry.',
    };
  }

  if (eventType === 'payment_intent.payment_failed') {
    return {
      action: 'APPLY',
      nextPaymentStatus: 'Failed',
      shouldPostJournal: false,
      reason: 'Verified payment_intent.payment_failed webhook; marking payment Failed with zero cash ledger impact.',
    };
  }

  return {
    action: 'APPLY',
    nextPaymentStatus: currentPaymentStatus || 'Pending',
    shouldPostJournal: false,
    reason: 'Recorded payment_intent.created lifecycle event; awaiting settlement confirmation before posting cash.',
  };
}

/**
 * Enforces policy coverage limits on claim filing or reserve adjustments.
 * Total exposure (paidAmount + newReserve) and claimedAmount cannot exceed policyCoverageLimit.
 */
export function validateClaimAgainstCoverageLimit(params: {
  claimedAmount: number;
  paidAmount: number;
  outstandingReserve: number;
  policyCoverageLimit: number;
}): {
  valid: boolean;
  totalIncurred: number;
  remainingLimit: number;
  errorMessage?: string;
} {
  const { claimedAmount, paidAmount, outstandingReserve, policyCoverageLimit } = params;
  const totalIncurred = centsToDollars(dollarsToCents(paidAmount) + dollarsToCents(outstandingReserve));
  const remainingLimit = centsToDollars(
    Math.max(0, dollarsToCents(policyCoverageLimit) - dollarsToCents(totalIncurred))
  );

  if (claimedAmount <= 0) {
    return {
      valid: false,
      totalIncurred,
      remainingLimit,
      errorMessage: 'Claimed amount must be greater than $0.',
    };
  }

  if (dollarsToCents(claimedAmount) > dollarsToCents(policyCoverageLimit)) {
    return {
      valid: false,
      totalIncurred,
      remainingLimit,
      errorMessage: `Claimed amount ($${claimedAmount.toLocaleString()}) exceeds policy coverage limit ($${policyCoverageLimit.toLocaleString()}).`,
    };
  }

  if (dollarsToCents(totalIncurred) > dollarsToCents(policyCoverageLimit)) {
    return {
      valid: false,
      totalIncurred,
      remainingLimit,
      errorMessage: `Total incurred exposure ($${totalIncurred.toLocaleString()} = Paid + Reserve) exceeds policy coverage limit ($${policyCoverageLimit.toLocaleString()}).`,
    };
  }

  return {
    valid: true,
    totalIncurred,
    remainingLimit,
  };
}

/**
 * Enforces four-eyes principle: a user cannot approve or reject their own request,
 * and only Finance Approvers (or another authorized reviewer) may approve.
 */
export function canUserDecideApproval(
  user: Pick<DemoUser, 'email' | 'role'>,
  request: Pick<ApprovalRequest, 'initiatorEmail' | 'status'>
): {
  allowed: boolean;
  reason?: string;
} {
  if (request.status !== 'Pending') {
    return { allowed: false, reason: 'Request has already been decided.' };
  }
  if (user.email.toLowerCase() === request.initiatorEmail.toLowerCase()) {
    return {
      allowed: false,
      reason: 'Four-eyes control: Initiators cannot approve or reject their own requests.',
    };
  }
  if (user.role !== 'FINANCE_APPROVER') {
    return {
      allowed: false,
      reason: 'Role restriction: Switch to Finance Approver role to authorize queue items.',
    };
  }
  return { allowed: true };
}

/**
 * Computes reconciliation match status and variance between Stripe provider amount and Ledger amount.
 */
export function evaluateReconciliationRecord(params: {
  stripeAmount: number;
  ledgerGrossAmount: number;
  hasLedgerRecord: boolean;
}): {
  differenceAmount: number;
  matchStatus: ReconciliationMatchStatus;
} {
  const { stripeAmount, ledgerGrossAmount, hasLedgerRecord } = params;
  const stripeCents = dollarsToCents(stripeAmount);
  const ledgerCents = dollarsToCents(ledgerGrossAmount);
  if (!hasLedgerRecord || ledgerCents === 0) {
    return {
      differenceAmount: centsToDollars(stripeCents),
      matchStatus: 'Unmatched',
    };
  }
  const diffCents = stripeCents - ledgerCents;
  if (diffCents === 0) {
    return {
      differenceAmount: 0,
      matchStatus: 'Matched',
    };
  }
  return {
    differenceAmount: centsToDollars(diffCents),
    matchStatus: 'Mismatched',
  };
}

/**
 * Calculates aggregate portfolio metrics across policies using integer-cent accumulation.
 */
export function calculatePortfolioMetrics(policies: Policy[]) {
  const activePolicies = policies.filter((p) => p.status === 'Active');
  const billablePolicies = policies.filter((p) => p.status === 'Active' || p.status === 'Expired');

  const writtenPremiumCents = billablePolicies.reduce((acc, p) => acc + dollarsToCents(p.writtenPremium), 0);
  const earnedPremiumCents = billablePolicies.reduce((acc, p) => acc + dollarsToCents(p.earnedPremium), 0);
  const unearnedPremiumCents = billablePolicies.reduce((acc, p) => acc + dollarsToCents(p.unearnedPremium), 0);
  const collectedPremiumCents = billablePolicies.reduce((acc, p) => acc + dollarsToCents(p.collectedPremium), 0);

  return {
    activeCount: activePolicies.length,
    writtenPremium: centsToDollars(writtenPremiumCents),
    earnedPremium: centsToDollars(earnedPremiumCents),
    unearnedPremium: centsToDollars(unearnedPremiumCents),
    collectedPremium: centsToDollars(collectedPremiumCents),
  };
}

/**
 * Calculates percentage breakdown of total book premium for the semi-circular portfolio gauge.
 */
export function calculatePortfolioProgressBreakdown(policies: Policy[]): {
  totalBookPremium: number;
  earnedPct: number;
  unearnedPct: number;
  pipelinePct: number;
  collectionPct: number;
} {
  const activeOrExpired = policies.filter((p) => p.status === 'Active' || p.status === 'Expired');
  const pipeline = policies.filter((p) => p.status === 'Pending' || p.status === 'Draft');

  const earned = activeOrExpired.reduce((s, p) => s + p.earnedPremium, 0);
  const unearned = activeOrExpired.reduce((s, p) => s + p.unearnedPremium, 0);
  const pipelinePremium = pipeline.reduce((s, p) => s + p.writtenPremium, 0);
  const boundWritten = activeOrExpired.reduce((s, p) => s + p.writtenPremium, 0);
  const collected = activeOrExpired.reduce((s, p) => s + p.collectedPremium, 0);

  const totalBookPremium = earned + unearned + pipelinePremium;
  if (totalBookPremium <= 0) {
    return {
      totalBookPremium: 0,
      earnedPct: 0,
      unearnedPct: 0,
      pipelinePct: 0,
      collectionPct: 0,
    };
  }

  const earnedPct = Math.round((earned / totalBookPremium) * 100);
  const unearnedPct = Math.round((unearned / totalBookPremium) * 100);
  const pipelinePct = Math.max(0, 100 - earnedPct - unearnedPct);
  const collectionPct = boundWritten > 0 ? Math.min(100, Math.round((collected / boundWritten) * 100)) : 0;

  return {
    totalBookPremium,
    earnedPct,
    unearnedPct,
    pipelinePct,
    collectionPct,
  };
}

/**
 * Formats a duration in seconds as HH:MM:SS for the SLA audit timer.
 */
export function formatDurationClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}
