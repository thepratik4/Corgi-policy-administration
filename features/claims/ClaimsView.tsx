'use client';

import React, { useState, useMemo } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { ClaimStatus } from '../../types/domain';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { validateClaimAgainstCoverageLimit } from '../../utils/financialRules';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Modal } from '../../components/ui/Modal';
import {
  Search,
  Plus,
  ArrowLeft,
  SlidersHorizontal,
  AlertCircle,
  Send,
  Clock,
} from 'lucide-react';

const CLAIM_FILTERS: ('All' | ClaimStatus)[] = [
  'All',
  'Open',
  'Under Review',
  'Approved',
  'Settled',
  'Denied',
];

export function ClaimsView() {
  const {
    claims,
    policies,
    selectedClaimId,
    setSelectedClaimId,
    navigateTo,
    openNewClaim,
    adjustClaimReserve,
    requestClaimPayout,
  } = usePolicyAdmin();

  const [statusFilter, setStatusFilter] = useState<'All' | ClaimStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [openClaimModal, setOpenClaimModal] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);

  // Open Claim Form
  const activePolicies = policies.filter((p) => p.status === 'Active');
  const [policyId, setPolicyId] = useState(activePolicies[0]?.id || '');
  const [lossDate, setLossDate] = useState('2026-11-01');
  const [claimedAmount, setClaimedAmount] = useState('15000');
  const [initialReserve, setInitialReserve] = useState('15000');
  const [isReserveCustomized, setIsReserveCustomized] = useState(false);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  // Adjust Reserve Form
  const [newReserveVal, setNewReserveVal] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState('');

  // Request Payout Form
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutReason, setPayoutReason] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);

  const selectedClaim = useMemo(
    () => claims.find((c) => c.id === selectedClaimId) || null,
    [claims, selectedClaimId]
  );

  const selectedPolicyForNewClaim = useMemo(
    () => policies.find((p) => p.id === policyId) || activePolicies[0],
    [policies, policyId, activePolicies]
  );

  const liveNewClaimValidation = useMemo(() => {
    if (!selectedPolicyForNewClaim) return null;
    return validateClaimAgainstCoverageLimit({
      claimedAmount: Number(claimedAmount) || 0,
      paidAmount: 0,
      outstandingReserve: Number(initialReserve) || 0,
      policyCoverageLimit: selectedPolicyForNewClaim.aggregateCoverageLimit,
    });
  }, [selectedPolicyForNewClaim, claimedAmount, initialReserve]);

  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.claimNumber.toLowerCase().includes(q) ||
        c.policyNumber.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [claims, statusFilter, searchQuery]);

  const handleOpenClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyId || !description.trim()) {
      setFormError('Please select a policy and provide a loss description.');
      return;
    }
    const res = openNewClaim({
      policyId,
      lossDate,
      description: description.trim(),
      claimedAmount: Number(claimedAmount) || 0,
      initialReserve: Number(initialReserve) || 0,
    });
    if (!res.success) {
      setFormError(res.error || 'Claim validation failed.');
      return;
    }
    setFormError('');
    setDescription('');
    setOpenClaimModal(false);
  };

  const handleClaimedAmountChange = (val: string) => {
    setClaimedAmount(val);
    setFormError('');
    if (!isReserveCustomized) {
      setInitialReserve(val);
    }
  };

  const handleInitialReserveChange = (val: string) => {
    setInitialReserve(val);
    setIsReserveCustomized(true);
    setFormError('');
  };

  const handleAdjustReserveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    if (!adjustReason.trim()) {
      setAdjustError('Please enter an actuarial / adjuster reason for the reserve change.');
      return;
    }
    const res = adjustClaimReserve({
      claimId: selectedClaim.id,
      newReserve: Number(newReserveVal),
      reason: adjustReason.trim(),
    });
    if (!res.success) {
      setAdjustError(res.error || 'Failed to adjust reserve.');
      return;
    }
    setAdjustError('');
    setAdjustReason('');
    setAdjustModalOpen(false);
  };

  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    const amt = Number(payoutAmount);
    if (!amt || amt <= 0) {
      setPayoutError('Please enter a positive payout amount.');
      return;
    }
    if (amt > selectedClaim.outstandingReserve) {
      setPayoutError(
        `Payout cannot exceed available case reserve of ${formatCurrency(selectedClaim.outstandingReserve)}.`
      );
      return;
    }
    if (!payoutReason.trim()) {
      setPayoutError('Please enter an adjuster justification or invoice reference.');
      return;
    }
    setPayoutSubmitting(true);
    const res = await requestClaimPayout({
      claimId: selectedClaim.id,
      amount: amt,
      reason: payoutReason.trim(),
    });
    setPayoutSubmitting(false);
    if (!res.success) {
      setPayoutError(res.error || 'Failed to submit payout release request.');
      return;
    }
    setPayoutError('');
    setPayoutModalOpen(false);
  };

  if (selectedClaim) {
    const totalIncurred = selectedClaim.paidAmount + selectedClaim.outstandingReserve;
    const utilizationPct = Math.min(
      100,
      Math.round((totalIncurred / selectedClaim.policyCoverageLimit) * 100)
    );

    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => setSelectedClaimId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Claims Register</span>
          </button>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-[#EA580C]">
                  {selectedClaim.claimNumber}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <StatusIndicator status={selectedClaim.status} />
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-xs text-slate-500">
                  Payout: {selectedClaim.payoutStatus}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 font-display mt-1">
                {selectedClaim.customerName}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Policy Reference:{' '}
                <button
                  type="button"
                  onClick={() => navigateTo('policies', selectedClaim.policyId)}
                  className="font-mono text-[#EA580C] hover:underline"
                >
                  {selectedClaim.policyNumber}
                </button>{' '}
                · Loss Date: {formatDate(selectedClaim.lossDate)} · Lead Adjuster: {selectedClaim.adjusterName}
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setNewReserveVal(String(selectedClaim.outstandingReserve));
                  setAdjustError('');
                  setAdjustModalOpen(true);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg inline-flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Adjust Case Reserve</span>
              </button>

              {selectedClaim.status !== 'Settled' && selectedClaim.payoutStatus !== 'Paid in Full' && (
                selectedClaim.payoutStatus === 'Pending Approval' ? (
                  <button
                    type="button"
                    onClick={() => navigateTo('approvals')}
                    className="px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Payout Pending Dual-Control Approval</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPayoutAmount(String(selectedClaim.outstandingReserve));
                      setPayoutReason(
                        `Indemnity settlement payout release for ${selectedClaim.claimNumber} (${selectedClaim.customerName})`
                      );
                      setPayoutError('');
                      setPayoutModalOpen(true);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Request Payout Release</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Claim Financial & Coverage Limit Enforcement Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Policy Coverage Limit</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedClaim.policyCoverageLimit)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Deductible: {formatCurrency(selectedClaim.policyDeductible)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Claimed Amount</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedClaim.claimedAmount)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Gross FNOL demand</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Paid Indemnity / LAE</p>
            <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatCurrency(selectedClaim.paidAmount)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Settled disbursements</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Outstanding Reserve</p>
            <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
              {formatCurrency(selectedClaim.outstandingReserve)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Account 2310 liability</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Remaining Limit Headroom</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(Math.max(0, selectedClaim.policyCoverageLimit - totalIncurred))}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {utilizationPct}% of policy limit utilized
            </p>
          </div>
        </div>

        {/* Incident Summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900 font-display mb-2">
            Incident Description & Adjuster Scope
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            {selectedClaim.description}
          </p>
        </div>

        {/* Reserve Adjustment History */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900 font-display">
              Reserve Adjustment Audit History
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Every reserve change automatically generates a double-entry ledger transaction in Account 5210 / 2310.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4 text-right">Previous Reserve</th>
                  <th className="py-2.5 px-4 text-right">New Reserve</th>
                  <th className="py-2.5 px-4 text-right">Net Change</th>
                  <th className="py-2.5 px-4">Adjusted By</th>
                  <th className="py-2.5 px-4">Audit Justification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {selectedClaim.reserveHistory.map((adj) => (
                  <tr key={adj.id}>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {formatDateTime(adj.timestamp)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {formatCurrency(adj.previousReserve)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(adj.newReserve)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-medium ${
                        adj.delta >= 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {adj.delta >= 0
                        ? `+${formatCurrency(adj.delta)}`
                        : formatCurrency(adj.delta)}
                    </td>
                    <td className="py-3 px-4 text-slate-800 whitespace-nowrap">
                      {adj.adjustedBy}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{adj.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Adjust Reserve Modal (with Policy Coverage Limit Enforcement) */}
        <Modal
          isOpen={adjustModalOpen}
          onClose={() => setAdjustModalOpen(false)}
          title={`Adjust Case Reserve — ${selectedClaim.claimNumber}`}
          subtitle={`Policy Limit: ${formatCurrency(selectedClaim.policyCoverageLimit)} · Paid to Date: ${formatCurrency(selectedClaim.paidAmount)}`}
        >
          <form onSubmit={handleAdjustReserveSubmit} className="space-y-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Policy Aggregate Coverage Limit:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(selectedClaim.policyCoverageLimit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Maximum Allowable Reserve (Limit − Paid):</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {formatCurrency(selectedClaim.policyCoverageLimit - selectedClaim.paidAmount)}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="adj-new-reserve" className="block text-xs font-medium text-slate-700 mb-1">
                New Outstanding Case Reserve ($)
              </label>
              <input
                id="adj-new-reserve"
                type="number"
                value={newReserveVal}
                onChange={(e) => {
                  setNewReserveVal(e.target.value);
                  if (adjustError) setAdjustError('');
                }}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="adj-reason" className="block text-xs font-medium text-slate-700 mb-1">
                Adjuster Valuation Note
              </label>
              <textarea
                id="adj-reason"
                rows={3}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Explain the basis for reserve strengthening or release..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {adjustError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{adjustError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
              >
                Post Reserve Adjustment
              </button>
            </div>
          </form>
        </Modal>

        {/* Request Claim Payout Release Modal */}
        <Modal
          isOpen={payoutModalOpen}
          onClose={() => setPayoutModalOpen(false)}
          title={`Request Claim Payout Release — ${selectedClaim.claimNumber}`}
          subtitle="Queues a disbursement authorization to the Approval Queue under dual-control treasury governance."
        >
          <form onSubmit={handlePayoutSubmit} className="space-y-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Claimant & Policy:</span>
                <span className="font-semibold text-slate-900">
                  {selectedClaim.customerName} ({selectedClaim.policyNumber})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Available Case Reserve (Account 2100):</span>
                <span className="font-mono font-bold text-amber-700">
                  {formatCurrency(selectedClaim.outstandingReserve)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Prior Settled Indemnity:</span>
                <span className="font-mono font-semibold text-slate-700">
                  {formatCurrency(selectedClaim.paidAmount)}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="payout-amount" className="block text-xs font-medium text-slate-700 mb-1">
                Disbursement Payout Amount ($)
              </label>
              <input
                id="payout-amount"
                type="number"
                value={payoutAmount}
                onChange={(e) => {
                  setPayoutAmount(e.target.value);
                  setPayoutError('');
                }}
                max={selectedClaim.outstandingReserve}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Maximum allowable release: {formatCurrency(selectedClaim.outstandingReserve)}
              </p>
            </div>

            <div>
              <label htmlFor="payout-reason" className="block text-xs font-medium text-slate-700 mb-1">
                Adjuster Justification & Settlement Reference
              </label>
              <textarea
                id="payout-reason"
                rows={3}
                value={payoutReason}
                onChange={(e) => {
                  setPayoutReason(e.target.value);
                  setPayoutError('');
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                placeholder="e.g. Verified vendor forensic invoice #INV-4412 or agreed settlement release deed"
                required
              />
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Dual-Control Treasury Governance:</p>
              <p>
                Submitting queues this release to the <strong>Approval Queue</strong>. Cash is only disbursed from Operating Cash (1010) when a <strong>Finance Approver (Sarah Chen, CPA)</strong> reviews and authorizes it.
              </p>
            </div>

            {payoutError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{payoutError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPayoutModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={payoutSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{payoutSubmitting ? 'Submitting...' : 'Submit to Approval Queue'}</span>
              </button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Loss Adjusting & Case Reserves"
        title="Claims & Reserves"
        subtitle="Administer commercial loss notices, enforce policy coverage limits, and maintain real-time case reserve liabilities."
        actions={
          <button
            type="button"
            onClick={() => {
              setClaimedAmount('15000');
              setInitialReserve('15000');
              setIsReserveCustomized(false);
              setFormError('');
              setOpenClaimModal(true);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Open New Claim</span>
          </button>
        }
      />

      {/* Filter & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter claims by status"
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto max-w-full"
        >
          {CLAIM_FILTERS.map((st) => {
            const count =
              st === 'All'
                ? claims.length
                : claims.filter((c) => c.status === st).length;
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
            aria-label="Search claims by claim number, policy, or customer"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search claim #, policy #, or customer..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-[#EA580C]"
          />
        </div>
      </div>

      {/* Claims Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-3.5">Claim & Policy Ref</th>
                <th className="py-3 px-3.5">Named Insured</th>
                <th className="py-3 px-3.5 text-right">Policy Limit</th>
                <th className="py-3 px-3.5 text-right">Claimed</th>
                <th className="py-3 px-3.5 text-right">Paid</th>
                <th className="py-3 px-3.5 text-right">Outstanding Reserve</th>
                <th className="py-3 px-3.5">Claim Status</th>
                <th className="py-3 px-3.5">Payout Status</th>
                <th className="py-3 px-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredClaims.map((clm) => (
                <tr key={clm.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3.5 font-mono whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedClaimId(clm.id)}
                      className="font-semibold text-slate-900 hover:text-[#EA580C] hover:underline block"
                    >
                      {clm.claimNumber}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateTo('policies', clm.policyId)}
                      className="text-[11px] text-slate-500 hover:text-[#EA580C] hover:underline"
                    >
                      {clm.policyNumber}
                    </button>
                  </td>
                  <td className="py-3 px-3.5">
                    <p className="font-medium text-slate-900">{clm.customerName}</p>
                    <p className="text-[11px] text-slate-500">Loss: {formatDate(clm.lossDate)}</p>
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums text-slate-600">
                    {formatCurrency(clm.policyCoverageLimit)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums text-slate-900">
                    {formatCurrency(clm.claimedAmount)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums text-emerald-700">
                    {formatCurrency(clm.paidAmount)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums font-semibold text-amber-700">
                    {formatCurrency(clm.outstandingReserve)}
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <StatusIndicator status={clm.status} />
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <StatusIndicator status={clm.payoutStatus} />
                  </td>
                  <td className="py-3 px-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedClaimId(clm.id)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Claim Modal with Live Coverage Limit Enforcement */}
      <Modal
        isOpen={openClaimModal}
        onClose={() => setOpenClaimModal(false)}
        title="Open New Commercial Claim"
        subtitle="Enforces policy coverage limits before booking initial case reserves."
      >
        <form onSubmit={handleOpenClaimSubmit} className="space-y-4">
          <div>
            <label htmlFor="clm-policy-select" className="block text-xs font-medium text-slate-700 mb-1">
              Active Policy
            </label>
            <select
              id="clm-policy-select"
              value={policyId}
              onChange={(e) => {
                setPolicyId(e.target.value);
                setFormError('');
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {activePolicies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.policyNumber} — {p.customerName} (Limit: {formatCurrency(p.aggregateCoverageLimit)})
                </option>
              ))}
            </select>
          </div>

          {selectedPolicyForNewClaim && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
              <span className="text-slate-600">Enforced Policy Aggregate Limit:</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatCurrency(selectedPolicyForNewClaim.aggregateCoverageLimit)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="clm-loss-date" className="block text-xs font-medium text-slate-700 mb-1">
                Loss Date
              </label>
              <input
                id="clm-loss-date"
                type="date"
                value={lossDate}
                onChange={(e) => setLossDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="clm-claimed-amt" className="block text-xs font-medium text-slate-700 mb-1">
                Claimed Amount ($)
              </label>
              <input
                id="clm-claimed-amt"
                type="number"
                value={claimedAmount}
                onChange={(e) => handleClaimedAmountChange(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="clm-init-reserve" className="block text-xs font-medium text-slate-700">
                  Initial Reserve ($)
                </label>
                {isReserveCustomized && (
                  <button
                    type="button"
                    onClick={() => {
                      setInitialReserve(claimedAmount);
                      setIsReserveCustomized(false);
                      setFormError('');
                    }}
                    className="text-[10px] text-[#EA580C] hover:underline"
                  >
                    Sync with Claimed
                  </button>
                )}
              </div>
              <input
                id="clm-init-reserve"
                type="number"
                value={initialReserve}
                onChange={(e) => handleInitialReserveChange(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                {isReserveCustomized
                  ? 'Customized reserve liability'
                  : 'Auto-synced with claimed amount'}
              </p>
            </div>
          </div>

          {liveNewClaimValidation && !liveNewClaimValidation.valid && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{liveNewClaimValidation.errorMessage}</span>
            </div>
          )}

          <div>
            <label htmlFor="clm-desc" className="block text-xs font-medium text-slate-700 mb-1">
              Incident Description
            </label>
            <textarea
              id="clm-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail the loss cause, affected property or third party, and initial adjuster notes..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {formError && (
            <p role="alert" className="text-xs text-red-600 font-medium">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setOpenClaimModal(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(liveNewClaimValidation && !liveNewClaimValidation.valid)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] disabled:opacity-50 rounded-lg"
            >
              Open Claim & Post Reserve
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
