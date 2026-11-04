import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_USERS } from '../mocks/seedData';
import { signServerJwt, verifyJwtToken, authorizeRole } from '../lib/serverAuth';
import {
  generateStripeWebhookSignature,
  verifyStripeWebhookSignature,
} from '../lib/stripeService';
import {
  getDbState,
  resetDatabaseToSeed,
  issuePolicyInDb,
  recordPaymentIntentCreatedInDb,
  processVerifiedStripeWebhookInDb,
  reverseAndRebookJournalInDb,
} from '../lib/serverDatabase';
import { validateDoubleEntryBalance } from './financialRules';

test('Server JWT signing, verification, and RBAC role enforcement', async () => {
  const opsUser = DEMO_USERS.OPERATIONS_ADMIN;
  const finUser = DEMO_USERS.FINANCE_APPROVER;

  const opsToken = signServerJwt(opsUser);
  const verifiedOps = await verifyJwtToken(opsToken);
  assert.ok(verifiedOps);
  assert.equal(verifiedOps.email, opsUser.email);
  assert.equal(verifiedOps.role, 'OPERATIONS_ADMIN');

  // RBAC: Operations Admin cannot authorize Finance Approver queue
  assert.equal(authorizeRole(opsUser, ['FINANCE_APPROVER']).authorized, false);
  assert.equal(authorizeRole(finUser, ['FINANCE_APPROVER']).authorized, true);
});

test('Policy issuance enforces KYB Approved broker and books balanced integer-cent journal', async () => {
  await resetDatabaseToSeed();
  const opsUser = DEMO_USERS.OPERATIONS_ADMIN;

  // 1. Attempting to issue a policy with Pending KYB broker (brk-03) MUST fail
  await assert.rejects(
    async () =>
      await issuePolicyInDb({
        customerName: 'Unverified Broker Test Corp',
        customerIndustry: 'Technology',
        customerEin: '94-1112223',
        customerAddress: '100 Market St, San Francisco, CA',
        brokerId: 'brk-03', // Pending KYB
        lineOfBusiness: 'Cyber & Tech E&O',
        writtenPremiumDollars: 32000,
        aggregateCoverageLimitDollars: 2000000,
        perOccurrenceLimitDollars: 1000000,
        deductibleDollars: 10000,
        effectiveDate: '2026-11-04',
        expirationDate: '2027-11-04',
        actor: opsUser,
      }),
    /Only KYB-Approved brokers are authorized to bind policies/
  );

  // 2. Issuing a policy with Approved KYB broker (brk-01) succeeds and calculates 3.5% tax
  const issued = await issuePolicyInDb({
    customerName: 'Apex Precision Robotics Inc.',
    customerIndustry: 'Commercial Manufacturing',
    customerEin: '94-9988776',
    customerAddress: '500 Howard St, San Francisco, CA',
    brokerId: 'brk-01', // Approved KYB
    lineOfBusiness: 'Commercial General Liability',
    writtenPremiumDollars: 40000,
    aggregateCoverageLimitDollars: 2000000,
    perOccurrenceLimitDollars: 1000000,
    deductibleDollars: 10000,
    effectiveDate: '2026-11-04',
    expirationDate: '2027-11-04',
    actor: opsUser,
  });

  assert.equal(issued.policy.status, 'Active');
  assert.equal(issued.policy.writtenPremium, 40000);
  assert.equal(issued.policy.taxesAndFees, 1400); // 3.5% of $40,000 = $1,400
  assert.equal(validateDoubleEntryBalance(issued.journalEntry.lines).isBalanced, true);
});

test('Stripe PaymentIntent + Verified Webhook Lifecycle: no cash on click, idempotent on replay, out-of-order safe', async () => {
  await resetDatabaseToSeed();
  const opsUser = DEMO_USERS.OPERATIONS_ADMIN;

  // Issue a fresh policy ($28,000 written premium, $0 collected) to test collection
  const issued = await issuePolicyInDb({
    customerName: 'Beacon Maritime Logistics LLC',
    customerIndustry: 'Marine & Cargo',
    customerEin: '94-5544332',
    customerAddress: '200 Embarcadero, San Francisco, CA',
    brokerId: 'brk-01',
    lineOfBusiness: 'Commercial Property',
    writtenPremiumDollars: 28000,
    aggregateCoverageLimitDollars: 2000000,
    perOccurrenceLimitDollars: 1000000,
    deductibleDollars: 10000,
    effectiveDate: '2026-11-04',
    expirationDate: '2027-11-04',
    actor: opsUser,
  });

  const journalCountAfterIssue = getDbState().ledgerTransactions.length;

  const payment = await recordPaymentIntentCreatedInDb({
    policyId: issued.policy.id,
    amountCents: 2800000, // $28,000.00
    paymentMethod: 'Visa •••• 4242 (Stripe Test Card)',
    stripePaymentIntentId: 'pi_3QTest_Integration_1088',
    idempotencyKey: 'idem_test_1088',
    actor: opsUser,
  });

  // CRITICAL: Creating PaymentIntent MUST leave status Pending and MUST NOT add any journal entry
  assert.equal(payment.status, 'Pending');
  assert.equal(getDbState().ledgerTransactions.length, journalCountAfterIssue);

  // Verify raw-body Stripe-Signature HMAC-SHA256 verification
  const rawPayload = JSON.stringify({
    id: 'evt_3QTest_Success_1088',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_3QTest_Integration_1088',
        amount: 2800000,
        currency: 'usd',
      },
    },
  });

  // Tampered signature must be rejected
  const badVerify = verifyStripeWebhookSignature({
    rawBody: rawPayload,
    signatureHeader: 't=1700000000,v1=deadbeef',
  });
  assert.equal(badVerify.verified, false);

  // Valid signature must pass verification
  const validSig = generateStripeWebhookSignature(rawPayload);
  const goodVerify = verifyStripeWebhookSignature({
    rawBody: rawPayload,
    signatureHeader: validSig,
  });
  assert.equal(goodVerify.verified, true);

  // Process verified payment_intent.succeeded webhook
  const firstWebhook = await processVerifiedStripeWebhookInDb({
    stripeEventId: 'evt_3QTest_Success_1088',
    eventType: 'payment_intent.succeeded',
    paymentIntentId: 'pi_3QTest_Integration_1088',
    amountCents: 2800000,
  });
  assert.equal(firstWebhook.outcome, 'APPLY');
  assert.equal(firstWebhook.payment.status, 'Succeeded');
  assert.equal(firstWebhook.journalEntries.length, 2); // Cash Clearing + Broker Commission
  const countAfterFirst = getDbState().ledgerTransactions.length;
  assert.equal(countAfterFirst, journalCountAfterIssue + 2);

  // Replay exact same webhook event ID -> MUST be DUPLICATE_IGNORED with ZERO new journal entries
  const replayWebhook = await processVerifiedStripeWebhookInDb({
    stripeEventId: 'evt_3QTest_Success_1088',
    eventType: 'payment_intent.succeeded',
    paymentIntentId: 'pi_3QTest_Integration_1088',
    amountCents: 2800000,
  });
  assert.equal(replayWebhook.outcome, 'DUPLICATE_IGNORED');
  assert.equal(replayWebhook.journalEntries.length, 0);
  assert.equal(getDbState().ledgerTransactions.length, countAfterFirst);

  // Out-of-order payment_intent.created arriving AFTER Succeeded -> MUST be OUT_OF_ORDER_IGNORED
  const lateCreated = await processVerifiedStripeWebhookInDb({
    stripeEventId: 'evt_3QTest_LateCreated_1088',
    eventType: 'payment_intent.created',
    paymentIntentId: 'pi_3QTest_Integration_1088',
    amountCents: 2800000,
  });
  assert.equal(lateCreated.outcome, 'OUT_OF_ORDER_IGNORED');
  assert.equal(lateCreated.payment.status, 'Succeeded');
});

test('Append-Only Ledger Reversal & Rebooking preserves original entry and posts mirror reversal', async () => {
  const state = await resetDatabaseToSeed();
  const finUser = DEMO_USERS.FINANCE_APPROVER;
  const targetJournal = state.ledgerTransactions[0];

  const rev = await reverseAndRebookJournalInDb({
    journalIdOrNumber: targetJournal.journalNumber,
    reason: 'Correcting subledger account classification',
    actor: finUser,
  });

  assert.equal(rev.originalEntry.status, 'Reversed');
  assert.equal(rev.originalEntry.reversedByJournalNumber, rev.reversalEntry.journalNumber);
  assert.equal(rev.reversalEntry.reversesJournalNumber, targetJournal.journalNumber);
  assert.equal(validateDoubleEntryBalance(rev.reversalEntry.lines).isBalanced, true);

  // Attempting to reverse an already-reversed entry MUST fail
  await assert.rejects(
    async () =>
      await reverseAndRebookJournalInDb({
        journalIdOrNumber: targetJournal.journalNumber,
        reason: 'Duplicate reversal attempt',
        actor: finUser,
      }),
    /already been reversed/
  );
});
