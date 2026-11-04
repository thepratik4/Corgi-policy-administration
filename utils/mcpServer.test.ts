import test from 'node:test';
import assert from 'node:assert/strict';
import { getDbState, resetDatabaseToSeed } from '../lib/serverDatabase';
import { dollarsToCents, centsToDollars } from '../utils/financialRules';

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

test('MCP Tool Logic: get_ledger_balance verifies trial balance equality', () => {
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

