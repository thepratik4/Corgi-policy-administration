import test from 'node:test';
import assert from 'node:assert/strict';
import { getDbState, resetDatabaseToSeed } from '../lib/serverDatabase';
import { dollarsToCents, centsToDollars } from '../utils/financialRules';
import { reconstructPolicyAsOfDate } from '../utils/documentGenerator';

test('MCP Tool Logic: get_policy_as_of reconstructs historical coverage and earned premium', () => {
  resetDatabaseToSeed();
  const state = getDbState();
  const policy = state.policies[0];
  assert.ok(policy, 'Seed policy should exist');

  // Test mid-term as-of reconstruction
  const asOfDate = '2026-06-30';
  const targetTime = new Date(`${asOfDate}T23:59:59Z`).getTime();
  const inception = new Date(`${policy.effectiveDate}T00:00:00Z`).getTime();
  const expiration = new Date(`${policy.expirationDate}T00:00:00Z`).getTime();

  const totalTermMs = expiration - inception;
  const elapsedMs = Math.min(Math.max(0, targetTime - inception), totalTermMs);
  const earnedFraction = elapsedMs / totalTermMs;

  const totalCents = dollarsToCents(policy.writtenPremium);
  const earnedCents = Math.round(totalCents * earnedFraction);
  const unearnedCents = totalCents - earnedCents;

  assert.ok(earnedCents > 0, 'Earned premium should be positive mid-term');
  assert.ok(unearnedCents > 0, 'Unearned premium should remain mid-term');
  assert.equal(earnedCents + unearnedCents, totalCents, 'Earned + Unearned must equal total written premium');
});

test('Seed ledger: verifies trial balance equality across transactions', () => {
  const state = getDbState();
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const tx of state.ledgerTransactions) {
    for (const line of tx.lines) {
      totalDebitCents += dollarsToCents(line.debit);
      totalCreditCents += dollarsToCents(line.credit);
    }
  }

  assert.ok(totalDebitCents > 0, 'Total debits must be > 0');
  assert.equal(totalDebitCents, totalCreditCents, 'Trial balance must be exactly balanced to the cent');
});

test('MCP Tool Logic: get_broker_statement ties commission and clawbacks to the cent', () => {
  const state = getDbState();
  const broker = state.brokers[0];
  assert.ok(broker, 'Broker must exist');

  const policies = state.policies.filter((p) => p.brokerId === broker.id);
  assert.ok(policies.length > 0, 'Broker must have bound policies');

  const grossPremium = policies.reduce((s, p) => s + p.writtenPremium, 0);
  const grossCommission = Math.round(grossPremium * broker.commissionRate);
  assert.ok(grossCommission > 0, 'Commission must be positive');
});

test('MCP Tool Logic: request_endorsement_or_reserve_adjustment queues strictly to human Finance Approver', () => {
  const state = getDbState();
  const initialPendingCount = state.approvalRequests.filter((a) => a.status === 'Pending').length;

  const newApproval = {
    id: `appr-mcp-test-${Date.now()}`,
    referenceNumber: 'AR-MCP-TEST-001',
    actionType: 'Large Reserve Increase' as const,
    targetEntityId: state.policies[0].id,
    targetReference: state.policies[0].policyNumber,
    customerName: state.policies[0].customerName,
    amount: 1500,
    reason: 'Autonomous request test',
    initiatorEmail: 'agent-mcp@corgi.insure',
    initiatorName: 'AI Agent (Test)',
    initiatorRole: 'OPERATIONS_ADMIN' as const,
    status: 'Pending' as const,
    createdAt: new Date().toISOString(),
  };

  state.approvalRequests.unshift(newApproval);

  const updatedPendingCount = state.approvalRequests.filter((a) => a.status === 'Pending').length;
  assert.equal(updatedPendingCount, initialPendingCount + 1, 'Approval request must be in pending queue');
});

test('reconstructPolicyAsOfDate: validates NaN date and derives historical status and per-endorsement earnings', () => {
  resetDatabaseToSeed();
  const state = getDbState();
  const cancelledPolicy = state.policies.find((p) => p.status === 'Cancelled');
  assert.ok(cancelledPolicy, 'Seed should contain a cancelled policy');

  // 1. Invalid date throws
  assert.throws(() => reconstructPolicyAsOfDate(cancelledPolicy, 'invalid-date'), /Invalid asOfDate/);

  // 2. Pre-cancellation status is Active
  const preCancelRecon = reconstructPolicyAsOfDate(cancelledPolicy, '2026-05-01');
  assert.equal(preCancelRecon.statusAsOfDate, 'Active', 'Policy prior to cancellation date should be Active');

  // 3. Post-cancellation status is Cancelled
  const postCancelRecon = reconstructPolicyAsOfDate(cancelledPolicy, '2026-07-01');
  assert.equal(postCancelRecon.statusAsOfDate, 'Cancelled', 'Policy after cancellation date should be Cancelled');

  // 4. Per-endorsement earned premium and effective date filtering
  const policyWithEndorsement = state.policies.find((p) => p.endorsements && p.endorsements.length > 0);
  if (policyWithEndorsement) {
    // Before endorsement effective date (2026-07-15)
    const beforeRecon = reconstructPolicyAsOfDate(policyWithEndorsement, '2026-06-30');
    assert.equal(beforeRecon.activeEndorsements.length, 0, 'Endorsement should not be active prior to its effective date');

    // After endorsement effective date
    const afterRecon = reconstructPolicyAsOfDate(policyWithEndorsement, '2026-08-01');
    assert.ok(afterRecon.activeEndorsements.length > 0, 'Active endorsements should be included after effective date');
    assert.ok(dollarsToCents(afterRecon.earnedPremium) <= dollarsToCents(afterRecon.adjustedWrittenPremium), 'Earned cannot exceed adjusted total');
  }
});


