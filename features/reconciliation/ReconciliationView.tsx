'use client';

import React, { useState, useMemo } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import {
  InvestigationStatus,
  ReconciliationItem,
  ReconciliationMatchStatus,
} from '../../types/domain';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Modal } from '../../components/ui/Modal';
import { Search, SlidersHorizontal } from 'lucide-react';

const MATCH_FILTERS: ('All' | ReconciliationMatchStatus)[] = [
  'All',
  'Matched',
  'Mismatched',
  'Unmatched',
];

export function ReconciliationView() {
  const { reconciliationItems, updateReconciliationInvestigation } = usePolicyAdmin();

  const [matchFilter, setMatchFilter] = useState<'All' | ReconciliationMatchStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBreak, setActiveBreak] = useState<ReconciliationItem | null>(null);
  const [investigationStatus, setInvestigationStatus] = useState<InvestigationStatus>('Investigating');
  const [investigationNote, setInvestigationNote] = useState('');

  const matchedItems = reconciliationItems.filter((r) => r.matchStatus === 'Matched');
  const mismatchedItems = reconciliationItems.filter((r) => r.matchStatus === 'Mismatched');
  const unmatchedItems = reconciliationItems.filter((r) => r.matchStatus === 'Unmatched');
  const breaksList = reconciliationItems.filter((r) => r.matchStatus !== 'Matched');

  const netVariance = reconciliationItems.reduce(
    (sum, r) => sum + Math.abs(r.differenceAmount),
    0
  );

  const filteredItems = useMemo(() => {
    return reconciliationItems.filter((item) => {
      if (matchFilter !== 'All' && item.matchStatus !== matchFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.stripeChargeId.toLowerCase().includes(q) ||
        item.policyNumber.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        item.ledgerJournalNumber.toLowerCase().includes(q)
      );
    });
  }, [reconciliationItems, matchFilter, searchQuery]);

  const handleSaveInvestigation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBreak) return;
    updateReconciliationInvestigation(activeBreak.id, investigationStatus, investigationNote);
    setActiveBreak(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Automated Clearing & Subledger Verification"
        title="Stripe vs. Ledger Reconciliation"
        subtitle="Compare Stripe provider settlement records against internal double-entry cash clearing journals and resolve unmatched or mismatched breaks."
      />

      {/* Reconciliation Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Matched Transactions</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {matchedItems.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">$0.00 variance verified</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Mismatched Records</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
            {mismatchedItems.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Fee or tax split variance</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Unmatched Records</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {unmatchedItems.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Awaiting ledger cash posting</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Gross Absolute Break Exposure</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatCurrency(netVariance, true)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Across {breaksList.length} active breaks
          </p>
        </div>
      </div>

      {/* Actionable Breaks Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50/40">
          <div>
            <h2 className="text-base font-semibold text-slate-900 font-display">
              Active Reconciliation Breaks ({breaksList.length})
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Unmatched or mismatched items requiring accounting investigation or adjustment entry
            </p>
          </div>
        </div>
        {breaksList.length === 0 ? (
          <div className="p-8 text-center text-xs text-emerald-700 font-medium">
            All Stripe provider settlements are 100% reconciled with the internal ledger.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Stripe Record</th>
                  <th className="py-2.5 px-4">Policy #</th>
                  <th className="py-2.5 px-4 text-right">Stripe Gross</th>
                  <th className="py-2.5 px-4 text-right">Ledger Gross</th>
                  <th className="py-2.5 px-4 text-right">Difference</th>
                  <th className="py-2.5 px-4">Break Type</th>
                  <th className="py-2.5 px-4">Investigation Status</th>
                  <th className="py-2.5 px-4">Diagnostic Note</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {breaksList.map((brk) => (
                  <tr key={brk.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {brk.stripeChargeId}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {brk.policyNumber}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(brk.stripeAmount, true)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(brk.ledgerGrossAmount, true)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-red-700">
                      {brk.differenceAmount >= 0
                        ? `+${formatCurrency(brk.differenceAmount, true)}`
                        : formatCurrency(brk.differenceAmount, true)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusIndicator status={brk.matchStatus} />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusIndicator status={brk.investigationStatus} />
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={brk.notes}>
                      {brk.notes}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveBreak(brk);
                          setInvestigationStatus(brk.investigationStatus);
                          setInvestigationNote(brk.notes);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg inline-flex items-center gap-1"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>Investigate</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full Comparison Register */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div
            role="tablist"
            aria-label="Filter reconciliation records by match status"
            className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit"
          >
            {MATCH_FILTERS.map((st) => {
              const count =
                st === 'All'
                  ? reconciliationItems.length
                  : reconciliationItems.filter((i) => i.matchStatus === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  role="tab"
                  aria-selected={matchFilter === st}
                  onClick={() => setMatchFilter(st)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    matchFilter === st
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
              aria-label="Search reconciliation records"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Stripe ID, policy #, or JE-#..."
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Recon Date</th>
                  <th className="py-3 px-4">Stripe Provider Record</th>
                  <th className="py-3 px-4">Policy & Customer</th>
                  <th className="py-3 px-4">Ledger Journal</th>
                  <th className="py-3 px-4 text-right">Stripe Gross</th>
                  <th className="py-3 px-4 text-right">Ledger Gross</th>
                  <th className="py-3 px-4 text-right">Difference</th>
                  <th className="py-3 px-4">Match Status</th>
                  <th className="py-3 px-4">Investigation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {formatDate(item.reconciliationDate)}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {item.stripeChargeId}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-mono font-medium text-slate-900">{item.policyNumber}</p>
                      <p className="text-[11px] text-slate-500">{item.customerName}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {item.ledgerJournalNumber}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(item.stripeAmount, true)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(item.ledgerGrossAmount, true)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                        item.differenceAmount === 0 ? 'text-slate-500' : 'text-red-700'
                      }`}
                    >
                      {item.differenceAmount > 0
                        ? `+${formatCurrency(item.differenceAmount, true)}`
                        : formatCurrency(item.differenceAmount, true)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusIndicator status={item.matchStatus} />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusIndicator status={item.investigationStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Break Investigation Modal */}
      {activeBreak && (
        <Modal
          isOpen={true}
          onClose={() => setActiveBreak(null)}
          title={`Investigate Break — ${activeBreak.stripeChargeId}`}
          subtitle={`Policy ${activeBreak.policyNumber} · Variance: ${formatCurrency(activeBreak.differenceAmount, true)}`}
        >
          <form onSubmit={handleSaveInvestigation} className="space-y-4">
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 text-xs">
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Stripe Provider Settlement</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(activeBreak.stripeAmount, true)}
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Internal Ledger Amount ({activeBreak.ledgerJournalNumber})</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(activeBreak.ledgerGrossAmount, true)}
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between bg-red-50/50">
                <span className="text-red-800 font-medium">Reconciliation Difference</span>
                <span className="font-mono font-bold text-red-700">
                  {formatCurrency(activeBreak.differenceAmount, true)}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="rec-inv-status" className="block text-xs font-medium text-slate-700 mb-1">
                Update Investigation Status
              </label>
              <select
                id="rec-inv-status"
                value={investigationStatus}
                onChange={(e) => setInvestigationStatus(e.target.value as InvestigationStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Open Break">Open Break</option>
                <option value="Investigating">Investigating</option>
                <option value="Resolved via Adjustment">Resolved via Adjustment (Clear Break)</option>
              </select>
            </div>

            <div>
              <label htmlFor="rec-inv-note" className="block text-xs font-medium text-slate-700 mb-1">
                Reconciliation Resolution / Audit Note
              </label>
              <textarea
                id="rec-inv-note"
                rows={3}
                value={investigationNote}
                onChange={(e) => setInvestigationNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setActiveBreak(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
              >
                Save Investigation Update
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
