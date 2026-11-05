import fs from 'node:fs';
import path from 'node:path';
import { createInitialSeedState } from '../lib/serverDatabase';
import { getSupabaseClient } from '../lib/supabaseClient';
import { dollarsToCents } from '../utils/financialRules';

// Automatically load .env.local if present in the working directory
if (fs.existsSync(path.join(process.cwd(), '.env.local'))) {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
}

async function main() {
  console.log('Connecting to Supabase...');
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase client could not be initialized. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const state = createInitialSeedState();

  console.log(`Seeding baseline state into Supabase:
- ${state.brokers.length} brokers
- ${state.policies.length} policies
- ${state.payments.length} payments
- ${state.claims.length} claims
- ${state.ledgerTransactions.length} journal transactions
- ${state.approvalRequests.length} approval requests
- ${state.reconciliationItems.length} reconciliation items
  `);

  // 1. Snapshot State Table
  const { error: stateError } = await supabase
    .from('corgi_system_state')
    .upsert(
      {
        key: 'ACTIVE_SNAPSHOT',
        state: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (stateError) {
    console.warn('Warning syncing corgi_system_state:', stateError.message);
  } else {
    console.log('Successfully saved snapshot to corgi_system_state.');
  }

  // 2. Brokers
  const brokerRows = state.brokers.map((b) => ({
    id: b.id,
    code: b.code,
    agency_name: b.agencyName,
    principal_contact: b.principalContact,
    email: b.email,
    phone: b.phone || '',
    domicile_state: b.domicileState,
    state_license: b.stateLicense,
    kyb_status: b.kybStatus,
    commission_rate_bps: Math.round(b.commissionRate * 10000),
    collected_premium_cents: dollarsToCents(b.collectedPremium),
    commission_earned_cents: dollarsToCents(b.totalCommissionEarned),
    commission_paid_cents: dollarsToCents(b.totalCommissionPaid),
    currency: 'USD',
    persona_inquiry_id: b.personaInquiryId,
    onboarded_at: b.joinedDate || '2026-01-15',
  }));

  const { error: brokerError } = await supabase
    .from('brokers')
    .upsert(brokerRows, { onConflict: 'id' });
  if (brokerError) console.error('Error seeding brokers:', brokerError.message);
  else console.log(`Seeded ${brokerRows.length} brokers.`);

  // 3. Policies
  const policyRows = state.policies.map((p) => ({
    id: p.id,
    policy_number: p.policyNumber,
    customer_name: p.customerName,
    customer_industry: p.customerIndustry,
    customer_ein: p.customerEin,
    customer_address: p.customerAddress,
    broker_id: p.brokerId,
    broker_name: p.brokerName,
    line_of_business: p.lineOfBusiness,
    status: p.status,
    written_premium_cents: dollarsToCents(p.writtenPremium),
    taxes_and_fees_cents: dollarsToCents(p.taxesAndFees),
    total_invoice_cents: dollarsToCents(p.writtenPremium + p.taxesAndFees),
    earned_premium_cents: dollarsToCents(p.earnedPremium),
    unearned_premium_cents: dollarsToCents(p.unearnedPremium),
    collected_premium_cents: dollarsToCents(p.collectedPremium),
    aggregate_limit_cents: dollarsToCents(p.aggregateCoverageLimit),
    occurrence_limit_cents: dollarsToCents(p.perOccurrenceLimit),
    deductible_cents: dollarsToCents(p.deductible),
    currency: 'USD',
    effective_date: p.effectiveDate,
    expiration_date: p.expirationDate,
    bind_date: p.bindDate || (p.status !== 'Draft' && p.status !== 'Pending' ? p.effectiveDate : null),
    cancellation_date: p.cancellationDate || null,
    underwriter: p.underwriter,
    coverages: p.coverages || [],
    endorsements: p.endorsements || [],
    recorded_at: p.updatedAt ? `${p.updatedAt}T00:00:00Z` : new Date().toISOString(),
  }));

  const { error: policyError } = await supabase
    .from('policies')
    .upsert(policyRows, { onConflict: 'id' });
  if (policyError) console.error('Error seeding policies:', policyError.message);
  else console.log(`Seeded ${policyRows.length} policies.`);

  // 4. Payments
  const paymentRows = state.payments.map((pay) => ({
    id: pay.id,
    policy_id: pay.policyId,
    policy_number: pay.policyNumber,
    customer_name: pay.customerName,
    stripe_payment_intent_id: pay.stripePaymentIntentId,
    stripe_charge_id: pay.stripePaymentIntentId.replace('pi_', 'ch_'),
    amount_cents: dollarsToCents(pay.amount),
    refunded_amount_cents: dollarsToCents(pay.refundedAmount || 0),
    refunded_at: pay.refundedAt || null,
    refund_reason: pay.refundReason || null,
    currency: 'USD',
    status: pay.status,
    payment_method: pay.paymentMethod,
    is_sandbox: true,
    ledger_transaction_id: pay.ledgerTransactionId || '',
    last_webhook_event: pay.status === 'Succeeded' ? 'payment_intent.succeeded' : 'payment_intent.created',
    created_at: pay.createdAt,
  }));

  const { error: paymentError } = await supabase
    .from('payments')
    .upsert(paymentRows, { onConflict: 'id' });
  if (paymentError) console.error('Error seeding payments:', paymentError.message);
  else console.log(`Seeded ${paymentRows.length} payments.`);

  // 5. Claims
  const claimRows = state.claims.map((c) => ({
    id: c.id,
    claim_number: c.claimNumber,
    policy_id: c.policyId,
    policy_number: c.policyNumber,
    customer_name: c.customerName,
    line_of_business: c.lineOfBusiness,
    loss_date: c.lossDate,
    reported_date: c.reportedDate,
    description: c.description,
    status: c.status,
    payout_status: c.payoutStatus,
    policy_coverage_limit_cents: dollarsToCents(c.policyCoverageLimit),
    policy_deductible_cents: dollarsToCents(c.policyDeductible),
    claimed_amount_cents: dollarsToCents(c.claimedAmount),
    paid_amount_cents: dollarsToCents(c.paidAmount),
    outstanding_reserve_cents: dollarsToCents(c.outstandingReserve),
    adjuster_name: c.adjusterName,
    created_at: new Date().toISOString(),
  }));

  const { error: claimError } = await supabase
    .from('claims')
    .upsert(claimRows, { onConflict: 'id' });
  if (claimError) console.error('Error seeding claims:', claimError.message);
  else console.log(`Seeded ${claimRows.length} claims.`);

  // 6. Journal Entries & Journal Lines
  const journalRows: Array<Record<string, unknown>> = [];
  const lineRows: Array<Record<string, unknown>> = [];

  for (const txn of state.ledgerTransactions) {
    journalRows.push({
      id: txn.id,
      journal_number: txn.journalNumber,
      effective_date: txn.timestamp.slice(0, 10),
      recorded_at: txn.timestamp,
      reference: txn.reference,
      reference_type: txn.referenceType,
      memo: txn.description,
      source_module: 'POLICY_ADMIN',
      posted_by_email: txn.postedBy.includes('@') ? txn.postedBy : 'system.ledger@corgi.insure',
      status: txn.status === 'Posted' ? 'POSTED' : 'REVERSED',
      reverses_journal_number: txn.reversesJournalNumber || null,
      reversed_by_journal_number: txn.reversedByJournalNumber || null,
      rebooked_journal_number: txn.rebookedJournalNumber || null,
    });

    for (const ln of txn.lines) {
      lineRows.push({
        id: ln.id,
        journal_entry_id: txn.id,
        account_code: ln.accountCode,
        account_name: ln.accountName,
        debit_cents: dollarsToCents(ln.debit),
        credit_cents: dollarsToCents(ln.credit),
        currency: 'USD',
      });
    }
  }

  const { error: journalError } = await supabase
    .from('journal_entries')
    .upsert(journalRows, { onConflict: 'id', ignoreDuplicates: true });
  if (journalError) console.error('Error seeding journal entries:', journalError.message);
  else console.log(`Seeded ${journalRows.length} journal entries.`);

  const { error: linesError } = await supabase
    .from('journal_lines')
    .upsert(lineRows, { onConflict: 'id', ignoreDuplicates: true });
  if (linesError) console.error('Error seeding journal lines:', linesError.message);
  else console.log(`Seeded ${lineRows.length} journal lines.`);

  // 7. Approval Requests
  const approvalRows = state.approvalRequests.map((a) => ({
    id: a.id,
    reference_number: a.referenceNumber,
    action_type: a.actionType,
    target_entity_id: a.targetEntityId,
    target_reference: a.targetReference,
    customer_name: a.customerName,
    amount_cents: dollarsToCents(a.amount),
    currency: 'USD',
    initiator_name: a.initiatorName,
    initiator_email: a.initiatorEmail,
    initiator_role: a.initiatorRole,
    reason: a.reason,
    status: a.status,
    decided_by_name: a.decidedByName || null,
    decided_by_email: a.decidedByEmail || null,
    decided_at: a.decidedAt || null,
    decision_note: a.decisionNote || null,
    created_at: a.createdAt || new Date().toISOString(),
  }));

  const { error: apprError } = await supabase
    .from('approval_requests')
    .upsert(approvalRows, { onConflict: 'id' });
  if (apprError) console.error('Error seeding approval requests:', apprError.message);
  else console.log(`Seeded ${approvalRows.length} approval requests.`);

  // 8. Reconciliation Items
  const reconRows = state.reconciliationItems.map((r) => ({
    id: r.id,
    reconciliation_date: r.reconciliationDate,
    stripe_charge_id: r.stripeChargeId,
    policy_number: r.policyNumber,
    customer_name: r.customerName,
    stripe_amount_cents: dollarsToCents(r.stripeAmount),
    stripe_fee_cents: dollarsToCents(r.stripeFee),
    stripe_net_cents: dollarsToCents(r.stripeNetAmount ?? (r.stripeAmount - r.stripeFee)),
    ledger_amount_cents: dollarsToCents(r.ledgerGrossAmount ?? r.stripeAmount),
    variance_cents: dollarsToCents(r.differenceAmount ?? 0),
    status: r.matchStatus || 'Matched',
    investigation_status: r.investigationStatus || 'Verified',
    investigation_notes: r.notes || null,
    ledger_journal_number: r.ledgerJournalNumber,
    created_at: new Date().toISOString(),
  }));

  const { error: reconError } = await supabase
    .from('reconciliation_items')
    .upsert(reconRows, { onConflict: 'id' });
  if (reconError) console.error('Error seeding reconciliation items:', reconError.message);
  else console.log(`Seeded ${reconRows.length} reconciliation items.`);

  console.log('\nSupabase cloud database seed complete! All tables and state snapshot populated.');
}

main().catch((err) => {
  console.error('Fatal error during Supabase seeding:', err);
  process.exit(1);
});
