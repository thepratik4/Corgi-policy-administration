'use client';

import React, { useState, useMemo } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { Payment, PaymentStatus } from '../../types/domain';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import {
  Search,
  RotateCcw,
  Terminal,
  Eye,
  Plus,
  Webhook,
  CheckCircle2,
  Repeat,
  Loader2,
} from 'lucide-react';

const PAYMENT_STATUS_FILTERS: ('All' | PaymentStatus)[] = [
  'All',
  'Succeeded',
  'Pending',
  'Refunded',
  'Failed',
];

export function PaymentsView() {
  const {
    payments,
    policies,
    webhookEvents,
    navigateTo,
    initiateStripePayment,
    dispatchSignedStripeWebhook,
    refundPayment,
  } = usePolicyAdmin();

  const [statusFilter, setStatusFilter] = useState<'All' | PaymentStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);

  // Initiate Stripe Test Payment Modal State
  const [createIntentOpen, setCreateIntentOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState(policies[0]?.id || '');
  const [paymentAmount, setPaymentAmount] = useState('18500');
  const [paymentMethod, setPaymentMethod] = useState('Visa •••• 4242 (Stripe Test Card pm_card_visa)');
  const [intentSubmitting, setIntentSubmitting] = useState(false);
  const [intentError, setIntentError] = useState('');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.stripePaymentIntentId.toLowerCase().includes(q) ||
        p.policyNumber.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        p.paymentMethod.toLowerCase().includes(q)
      );
    });
  }, [payments, statusFilter, searchQuery]);

  const totalSucceeded = payments
    .filter((p) => p.status === 'Succeeded')
    .reduce((s, p) => s + p.amount, 0);
  const totalPending = payments
    .filter((p) => p.status === 'Pending')
    .reduce((s, p) => s + p.amount, 0);
  const totalRefunded = payments
    .filter((p) => p.status === 'Refunded')
    .reduce((s, p) => s + (p.refundedAmount || p.amount), 0);

  const handleCreateIntentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(paymentAmount);
    if (!selectedPolicyId || !amt || amt <= 0) {
      setIntentError('Select a policy and enter a positive dollar amount.');
      return;
    }
    setIntentError('');
    setIntentSubmitting(true);
    const res = await initiateStripePayment({
      policyId: selectedPolicyId,
      amount: amt,
      paymentMethod,
    });
    setIntentSubmitting(false);
    if (res.success) {
      setCreateIntentOpen(false);
    } else if (res.error) {
      setIntentError(res.error);
    }
  };

  const handleVerifyPending = async (pay: Payment) => {
    setVerifyingId(pay.stripePaymentIntentId);
    await dispatchSignedStripeWebhook({
      paymentIntentId: pay.stripePaymentIntentId,
      eventType: 'payment_intent.succeeded',
      amountDollars: pay.amount,
    });
    setVerifyingId(null);
  };

  const handleVerifyAllPending = async () => {
    const pendingList = payments.filter((p) => p.status === 'Pending');
    if (pendingList.length === 0) return;
    setVerifyingAll(true);
    for (const p of pendingList) {
      await dispatchSignedStripeWebhook({
        paymentIntentId: p.stripePaymentIntentId,
        eventType: 'payment_intent.succeeded',
        amountDollars: p.amount,
      });
    }
    setVerifyingAll(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Premium Collections & Clearing"
        title="Payments (Stripe Sandbox)"
        subtitle="Initiate Stripe test-mode PaymentIntents, verify signed raw-body webhooks, and enforce idempotent double-entry cash clearing."
        actions={
          <div className="flex items-center gap-2">
            {payments.some((p) => p.status === 'Pending') && (
              <button
                type="button"
                disabled={verifyingAll}
                onClick={handleVerifyAllPending}
                className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60 shadow-xs"
              >
                {verifyingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Auto-Verify All Pending ({payments.filter((p) => p.status === 'Pending').length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const defaultPol =
                  policies.find((p) => p.collectedPremium < p.writtenPremium) || policies[0];
                if (defaultPol) {
                  setSelectedPolicyId(defaultPol.id);
                  const remaining = Math.max(
                    1000,
                    defaultPol.writtenPremium - defaultPol.collectedPremium
                  );
                  setPaymentAmount(String(remaining));
                }
                setIntentError('');
                setCreateIntentOpen(true);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Initiate Stripe Test Payment</span>
            </button>
          </div>
        }
      />

      {/* Explicit Sandbox vs Real Money Banner */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Terminal className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-900">
              Stripe Test-Mode Sandbox & Verified Webhook Pipeline
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              Initiating a PaymentIntent (<span className="font-mono">POST /api/payments/create-intent</span>) creates a <span className="font-semibold">Pending</span> record with zero cash ledger impact. Balanced journal entries are posted strictly upon verified <span className="font-mono">POST /api/webhooks/stripe</span> (<span className="font-mono">payment_intent.succeeded</span>).
            </p>
          </div>
        </div>
        <span className="font-mono text-[11px] font-semibold text-amber-900 shrink-0">
          ENV: STRIPE_TEST_SANDBOX
        </span>
      </div>

      {/* Payment Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Succeeded Sandbox Settlements</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {formatCurrency(totalSucceeded)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">In-Flight / Pending Webhook</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {formatCurrency(totalPending)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Refunded Return Premiums</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatCurrency(totalRefunded)}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter payments by status"
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto max-w-full"
        >
          {PAYMENT_STATUS_FILTERS.map((st) => {
            const count =
              st === 'All'
                ? payments.length
                : payments.filter((p) => p.status === st).length;
            return (
              <button
                key={st}
                type="button"
                role="tab"
                aria-selected={statusFilter === st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search payments by PaymentIntent ID, policy, or customer"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pi_*, policy #, or insured..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-[#EA580C]"
          />
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-3.5">Stripe PaymentIntent</th>
                <th className="py-3 px-3.5">Policy & Insured</th>
                <th className="py-3 px-3.5">Method & Timestamp</th>
                <th className="py-3 px-3.5 text-right">Amount</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Webhook & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredPayments.map((pay) => (
                <tr key={pay.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3.5 font-mono text-slate-900 whitespace-nowrap">
                    <span className="font-medium text-[11px]">{pay.stripePaymentIntentId}</span>
                    <span className="block text-[10px] text-slate-500">
                      {pay.ledgerTransactionId}
                    </span>
                  </td>
                  <td className="py-3 px-3.5">
                    <button
                      type="button"
                      onClick={() => navigateTo('policies', pay.policyId)}
                      className="font-mono font-semibold text-[#EA580C] hover:underline block"
                    >
                      {pay.policyNumber}
                    </button>
                    <span className="text-[11px] font-medium text-slate-700 block truncate max-w-[200px]">
                      {pay.customerName}
                    </span>
                  </td>
                  <td className="py-3 px-3.5">
                    <span className="text-slate-700 block truncate max-w-[190px]">{pay.paymentMethod}</span>
                    <span className="font-mono text-[11px] text-slate-400 block">
                      {formatDateTime(pay.createdAt)}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                    {formatCurrency(pay.amount)}
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <StatusIndicator status={pay.status} />
                  </td>
                  <td className="py-3 px-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {pay.status === 'Pending' && (
                        <button
                          type="button"
                          disabled={verifyingId === pay.stripePaymentIntentId || verifyingAll}
                          onClick={() => handleVerifyPending(pay)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 rounded-md inline-flex items-center gap-1 shadow-xs transition-all active:scale-95"
                        >
                          {verifyingId === pay.stripePaymentIntentId || verifyingAll ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Verifying...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Verify Webhook</span>
                            </>
                          )}
                        </button>
                      )}
                      {pay.status === 'Succeeded' && (
                        <button
                          type="button"
                          onClick={() =>
                            dispatchSignedStripeWebhook({
                              paymentIntentId: pay.stripePaymentIntentId,
                              eventType: 'payment_intent.succeeded',
                              amountDollars: pay.amount,
                            })
                          }
                          title="Replay identical Stripe webhook event ID to test idempotency"
                          className="px-2 py-1 text-[11px] font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 inline-flex items-center gap-1"
                        >
                          <Repeat className="w-3 h-3" />
                          <span>Replay</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPayment(pay)}
                        className="px-2 py-1 text-[11px] font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Details</span>
                      </button>
                      {pay.status === 'Succeeded' && (
                        <button
                          type="button"
                          onClick={() => setRefundTarget(pay)}
                          className="px-2 py-1 text-[11px] font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Refund</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verified Stripe Webhook & Idempotency Log */}
      {webhookEvents.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-[#EA580C]" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 font-display">
                  Signed Stripe Webhook Delivery & Idempotency Log ({webhookEvents.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Raw-body HMAC-SHA256 signature verification (<span className="font-mono">Stripe-Signature</span>) and unique <span className="font-mono">stripe_event_id</span> deduplication
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Stripe Event ID</th>
                  <th className="py-2.5 px-4">Event Type</th>
                  <th className="py-2.5 px-4">PaymentIntent</th>
                  <th className="py-2.5 px-4">Idempotency Outcome</th>
                  <th className="py-2.5 px-4">Ledger & Audit Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {webhookEvents.slice(0, 8).map((wh) => (
                  <tr key={wh.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {wh.stripeEventId}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {wh.eventType}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {wh.paymentIntentId}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                          wh.status === 'PROCESSED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {wh.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{wh.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Initiate Stripe Test Payment Modal */}
      <Modal
        isOpen={createIntentOpen}
        onClose={() => setCreateIntentOpen(false)}
        title="Initiate Stripe Test-Mode PaymentIntent"
        subtitle="Creates a Stripe PaymentIntent in Pending state. Ledger cash is only booked after verified webhook delivery."
      >
        <form onSubmit={handleCreateIntentSubmit} className="space-y-4">
          <div>
            <label htmlFor="pay-policy-select" className="block text-xs font-medium text-slate-700 mb-1">
              Select Policy to Bill
            </label>
            <select
              id="pay-policy-select"
              value={selectedPolicyId}
              onChange={(e) => {
                setSelectedPolicyId(e.target.value);
                const pol = policies.find((p) => p.id === e.target.value);
                if (pol) {
                  const rem = Math.max(1000, pol.writtenPremium - pol.collectedPremium);
                  setPaymentAmount(String(rem));
                }
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {policies.map((pol) => (
                <option key={pol.id} value={pol.id}>
                  {pol.policyNumber} — {pol.customerName} (Written: {formatCurrency(pol.writtenPremium)}, Collected: {formatCurrency(pol.collectedPremium)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pay-amount-input" className="block text-xs font-medium text-slate-700 mb-1">
                Charge Amount (USD $)
              </label>
              <input
                id="pay-amount-input"
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="pay-method-select" className="block text-xs font-medium text-slate-700 mb-1">
                Stripe Test Payment Method
              </label>
              <select
                id="pay-method-select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Visa •••• 4242 (Stripe Test Card pm_card_visa)">
                  Visa •••• 4242 (pm_card_visa)
                </option>
                <option value="Mastercard •••• 4444 (Stripe Test Card pm_card_mastercard)">
                  Mastercard •••• 4444 (pm_card_mastercard)
                </option>
                <option value="US Bank Account (ACH •••• 6789)">
                  US Bank Account (ACH •••• 6789)
                </option>
              </select>
            </div>
          </div>

          {intentError && <p className="text-xs text-red-600">{intentError}</p>}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setCreateIntentOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={intentSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg disabled:opacity-50"
            >
              {intentSubmitting ? 'Creating PaymentIntent...' : 'Create PaymentIntent (Pending)'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPayment(null)}
          title="Payment Settlement Details"
          subtitle={`Stripe Sandbox Record · ${selectedPayment.stripePaymentIntentId}`}
        >
          <div className="space-y-4 text-xs">
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Environment</span>
                <span className="font-mono font-semibold text-amber-800">
                  Stripe Test Mode (Integer USD Cents)
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">PaymentIntent ID</span>
                <span className="font-mono text-slate-900">{selectedPayment.stripePaymentIntentId}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Associated Policy</span>
                <span className="font-mono font-semibold text-slate-900">{selectedPayment.policyNumber}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Policyholder</span>
                <span className="font-medium text-slate-900">{selectedPayment.customerName}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Gross Settlement Amount</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(selectedPayment.amount, true)} {selectedPayment.currency} ({Math.round(selectedPayment.amount * 100).toLocaleString()} cents)
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Ledger Journal Reference</span>
                <span className="font-mono text-slate-900">{selectedPayment.ledgerTransactionId}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Payment Method</span>
                <span className="text-slate-900">{selectedPayment.paymentMethod}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Status</span>
                <StatusIndicator status={selectedPayment.status} />
              </div>
              {selectedPayment.refundReason && (
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-slate-500">Refund Audit Note</span>
                  <span className="text-slate-800 text-right max-w-xs">{selectedPayment.refundReason}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Refund Confirmation Dialog */}
      {refundTarget && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setRefundTarget(null)}
          onConfirm={(reason) => {
            refundPayment(refundTarget.id, reason);
            setRefundTarget(null);
          }}
          title="Issue Sandbox Payment Refund"
          description="This action calls the Stripe Refunds API, marks the PaymentIntent as Refunded, and posts an immutable double-entry reversal journal."
          confirmLabel="Confirm Sandbox Refund"
          variant="danger"
          reasonLabel="Refund Justification (Required for Audit Ledger)"
          reasonPlaceholder="e.g., Return premium due to mid-term endorsement reduction..."
          financialSummary={[
            { label: 'PaymentIntent ID', value: refundTarget.stripePaymentIntentId },
            { label: 'Policy Number', value: refundTarget.policyNumber },
            { label: 'Customer', value: refundTarget.customerName },
            { label: 'Refund Amount (Test Mode)', value: formatCurrency(refundTarget.amount, true) },
          ]}
        />
      )}
    </div>
  );
}
