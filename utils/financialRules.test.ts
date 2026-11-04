import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dollarsToCents,
  centsToDollars,
  validateIntegerCentsDoubleEntry,
  validateDoubleEntryBalance,
  calculatePolicyInvoiceBreakdownCents,
  validateBrokerBindingEligibility,
  buildReversalJournalLines,
  evaluateWebhookEventTransition,
  validateClaimAgainstCoverageLimit,
  canUserDecideApproval,
  evaluateReconciliationRecord,
  calculatePortfolioProgressBreakdown,
  formatDurationClock,
} from './financialRules';
import { INITIAL_POLICIES } from '../mocks/seedData';

test('dollarsToCents and validateIntegerCentsDoubleEntry enforce integer USD cent precision', () => {
  assert.equal(dollarsToCents(18500.25), 1850025);
  assert.equal(centsToDollars(1850025), 18500.25);

  const valid = validateIntegerCentsDoubleEntry([
    { accountCode: '1020', debitCents: 1850000, creditCents: 0 },
    { accountCode: '1100', debitCents: 0, creditCents: 1850000 },
  ]);
  assert.equal(valid.isBalanced, true);
  assert.equal(valid.imbalanceCents, 0);

  const floatRejected = validateIntegerCentsDoubleEntry([
    { accountCode: '1020', debitCents: 18500.5, creditCents: 0 },
    { accountCode: '1100', debitCents: 0, creditCents: 18500.5 },
  ]);
  assert.equal(floatRejected.isBalanced, false);
  assert.ok(floatRejected.errorMessage?.includes('non-integer'));
});

test('validateDoubleEntryBalance verifies equal debits and credits', () => {
  const balanced = validateDoubleEntryBalance([
    { debit: 18500, credit: 0 },
    { debit: 0, credit: 18500 },
  ]);
  assert.equal(balanced.isBalanced, true);
  assert.equal(balanced.imbalance, 0);

  const unbalanced = validateDoubleEntryBalance([
    { debit: 18500, credit: 0 },
    { debit: 0, credit: 18000 },
  ]);
  assert.equal(unbalanced.isBalanced, false);
  assert.equal(unbalanced.imbalance, 500);
});

test('calculatePolicyInvoiceBreakdownCents computes written premium and 3.5% tax in integer cents', () => {
  const breakdown = calculatePolicyInvoiceBreakdownCents(4500000); // $45,000.00
  assert.equal(breakdown.writtenPremiumCents, 4500000);
  assert.equal(breakdown.taxesAndFeesCents, 157500); // $1,575.00
  assert.equal(breakdown.totalInvoiceCents, 4657500); // $46,575.00
  assert.equal(breakdown.currency, 'USD');
});

test('validateBrokerBindingEligibility blocks Pending or Failed KYB brokers from binding policies', () => {
  assert.equal(
    validateBrokerBindingEligibility({
      id: 'brk-01',
      agencyName: 'Summit Commercial Risk Partners',
      kybStatus: 'Approved',
    }).allowed,
    true
  );

  const pendingCheck = validateBrokerBindingEligibility({
    id: 'brk-03',
    agencyName: 'Harbor Front Specialty Insurance',
    kybStatus: 'Pending',
  });
  assert.equal(pendingCheck.allowed, false);
  assert.ok(pendingCheck.errorMessage?.includes('Only KYB-Approved brokers'));

  const failedCheck = validateBrokerBindingEligibility({
    id: 'brk-04',
    agencyName: 'Liberty Star Commercial',
    kybStatus: 'Failed',
  });
  assert.equal(failedCheck.allowed, false);
});

test('buildReversalJournalLines swaps debits and credits and balances to zero net impact', () => {
  const originalLines = [
    {
      accountCode: '1100',
      accountName: 'Premiums Receivable',
      debit: 46575,
      credit: 0,
      referenceType: 'POLICY' as const,
      referenceId: 'CRG-POL-2026-1099',
    },
    {
      accountCode: '2010',
      accountName: 'Unearned Premium Reserve',
      debit: 0,
      credit: 46575,
      referenceType: 'POLICY' as const,
      referenceId: 'CRG-POL-2026-1099',
    },
  ];
  const reversalLines = buildReversalJournalLines(
    originalLines,
    'je-rev-01',
    '2026-11-04',
    'JE-2026-8810'
  );
  assert.equal(reversalLines[0].debit, 0);
  assert.equal(reversalLines[0].credit, 46575);
  assert.equal(reversalLines[1].debit, 46575);
  assert.equal(reversalLines[1].credit, 0);
  assert.equal(validateDoubleEntryBalance(reversalLines).isBalanced, true);
});

test('evaluateWebhookEventTransition enforces idempotency and out-of-order protection', () => {
  const processed = new Set<string>(['evt_already_seen']);

  // 1. Duplicate event replay is ignored
  const dup = evaluateWebhookEventTransition({
    stripeEventId: 'evt_already_seen',
    eventType: 'payment_intent.succeeded',
    currentPaymentStatus: 'Succeeded',
    processedEventIds: processed,
  });
  assert.equal(dup.action, 'DUPLICATE_IGNORED');
  assert.equal(dup.shouldPostJournal, false);

  // 2. First-time payment_intent.succeeded settles payment and posts journal
  const settle = evaluateWebhookEventTransition({
    stripeEventId: 'evt_new_success',
    eventType: 'payment_intent.succeeded',
    currentPaymentStatus: 'Pending',
    processedEventIds: processed,
  });
  assert.equal(settle.action, 'APPLY');
  assert.equal(settle.nextPaymentStatus, 'Succeeded');
  assert.equal(settle.shouldPostJournal, true);

  // 3. Out-of-order payment_intent.created arriving after Succeeded is ignored
  const outOfOrder = evaluateWebhookEventTransition({
    stripeEventId: 'evt_late_created',
    eventType: 'payment_intent.created',
    currentPaymentStatus: 'Succeeded',
    processedEventIds: processed,
  });
  assert.equal(outOfOrder.action, 'OUT_OF_ORDER_IGNORED');
  assert.equal(outOfOrder.nextPaymentStatus, 'Succeeded');
  assert.equal(outOfOrder.shouldPostJournal, false);
});

test('validateClaimAgainstCoverageLimit enforces policy aggregate and occurrence limits', () => {
  const validClaim = validateClaimAgainstCoverageLimit({
    claimedAmount: 120000,
    paidAmount: 25000,
    outstandingReserve: 95000,
    policyCoverageLimit: 1000000,
  });
  assert.equal(validClaim.valid, true);
  assert.equal(validClaim.totalIncurred, 120000);
  assert.equal(validClaim.remainingLimit, 880000);

  const overLimitClaim = validateClaimAgainstCoverageLimit({
    claimedAmount: 1250000,
    paidAmount: 0,
    outstandingReserve: 1250000,
    policyCoverageLimit: 1000000,
  });
  assert.equal(overLimitClaim.valid, false);
  assert.ok(overLimitClaim.errorMessage?.includes('exceeds policy coverage limit'));
});

test('canUserDecideApproval prevents self-approval and enforces Finance Approver role', () => {
  const selfAttempt = canUserDecideApproval(
    { email: 'alex.rivera@corgi.insure', role: 'FINANCE_APPROVER' },
    { initiatorEmail: 'alex.rivera@corgi.insure', status: 'Pending' }
  );
  assert.equal(selfAttempt.allowed, false);
  assert.ok(selfAttempt.reason?.includes('Four-eyes control'));

  const opsAdminAttempt = canUserDecideApproval(
    { email: 'alex.rivera@corgi.insure', role: 'OPERATIONS_ADMIN' },
    { initiatorEmail: 'sarah.chen@corgi.insure', status: 'Pending' }
  );
  assert.equal(opsAdminAttempt.allowed, false);

  const validApprover = canUserDecideApproval(
    { email: 'sarah.chen@corgi.insure', role: 'FINANCE_APPROVER' },
    { initiatorEmail: 'alex.rivera@corgi.insure', status: 'Pending' }
  );
  assert.equal(validApprover.allowed, true);
});

test('evaluateReconciliationRecord classifies matched, mismatched, and unmatched records', () => {
  const matched = evaluateReconciliationRecord({
    stripeAmount: 24500,
    ledgerGrossAmount: 24500,
    hasLedgerRecord: true,
  });
  assert.equal(matched.matchStatus, 'Matched');
  assert.equal(matched.differenceAmount, 0);

  const mismatched = evaluateReconciliationRecord({
    stripeAmount: 19200,
    ledgerGrossAmount: 19500,
    hasLedgerRecord: true,
  });
  assert.equal(mismatched.matchStatus, 'Mismatched');
  assert.equal(mismatched.differenceAmount, -300);

  const unmatched = evaluateReconciliationRecord({
    stripeAmount: 8400,
    ledgerGrossAmount: 0,
    hasLedgerRecord: false,
  });
  assert.equal(unmatched.matchStatus, 'Unmatched');
  assert.equal(unmatched.differenceAmount, 8400);
});

test('calculatePortfolioProgressBreakdown computes normalized percentages and formatDurationClock formats HH:MM:SS', () => {
  const breakdown = calculatePortfolioProgressBreakdown(INITIAL_POLICIES);
  assert.ok(breakdown.totalBookPremium > 0);
  assert.equal(breakdown.earnedPct + breakdown.unearnedPct + breakdown.pipelinePct, 100);
  assert.ok(breakdown.collectionPct > 0 && breakdown.collectionPct <= 100);

  assert.equal(formatDurationClock(5048), '01:24:08');
  assert.equal(formatDurationClock(0), '00:00:00');
});
