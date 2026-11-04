'use client';

import React, { useState, useMemo } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { LedgerTransaction } from '../../types/domain';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { validateDoubleEntryBalance } from '../../utils/financialRules';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Modal } from '../../components/ui/Modal';
import {
  Search,
  Lock,
  RotateCcw,
  Eye,
} from 'lucide-react';

export function LedgerView() {
  const { ledgerTransactions, reverseAndRebookTransaction } = usePolicyAdmin();

  const [searchQuery, setSearchQuery] = useState('');
  const [refFilter, setRefFilter] = useState<'ALL' | LedgerTransaction['referenceType']>('ALL');
  const [selectedTransaction, setSelectedTransaction] = useState<LedgerTransaction | null>(null);
  const [rebookModalTxn, setRebookModalTxn] = useState<LedgerTransaction | null>(null);
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [rebookReason, setRebookReason] = useState('');
  const [rebookError, setRebookError] = useState('');

  const allLinesWithParent = useMemo(() => {
    return ledgerTransactions.flatMap((txn) =>
      txn.lines.map((line) => ({
        ...line,
        journalNumber: txn.journalNumber,
        timestamp: txn.timestamp,
        txnStatus: txn.status,
        txnDescription: txn.description,
        parentTxn: txn,
      }))
    );
  }, [ledgerTransactions]);

  const filteredLines = useMemo(() => {
    return allLinesWithParent.filter((l) => {
      if (refFilter !== 'ALL' && l.referenceType !== refFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        l.journalNumber.toLowerCase().includes(q) ||
        l.accountCode.toLowerCase().includes(q) ||
        l.accountName.toLowerCase().includes(q) ||
        l.referenceId.toLowerCase().includes(q) ||
        l.memo.toLowerCase().includes(q)
      );
    });
  }, [allLinesWithParent, refFilter, searchQuery]);

  const ledgerBalance = useMemo(
    () => validateDoubleEntryBalance(allLinesWithParent),
    [allLinesWithParent]
  );

  const handleRebookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rebookModalTxn) return;
    const amt = Number(correctedAmount);
    if (!amt || amt <= 0) {
      setRebookError('Corrected rebooking amount must be greater than $0.');
      return;
    }
    if (!rebookReason.trim()) {
      setRebookError('Mandatory audit justification is required to reverse and rebook.');
      return;
    }
    setRebookError('');
    reverseAndRebookTransaction(rebookModalTxn.id, amt, rebookReason.trim());
    setRebookModalTxn(null);
    setSelectedTransaction(null);
    setRebookReason('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Immutable Double-Entry Subledger"
        title="Financial Ledger"
        subtitle="Append-only double-entry general ledger journal. Posted entries cannot be edited or deleted; corrections require a formal contra-entry reversal and rebooking."
      />

      {/* Immutability & Double-Entry Proof Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Posted Debits</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatCurrency(ledgerBalance.totalDebit, true)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Posted Credits</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatCurrency(ledgerBalance.totalCredit, true)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Trial Balance Variance</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {formatCurrency(ledgerBalance.imbalance, true)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {ledgerBalance.isBalanced ? 'Balanced (Debits = Credits)' : 'Imbalance Detected'}
          </p>
        </div>
        <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300">Audit Control Policy</span>
            <Lock className="w-4 h-4 text-[#EA580C]" />
          </div>
          <p className="text-xs font-medium text-slate-100 mt-2 leading-relaxed">
            Append-only ledger: Edit & Delete operations are prohibited at the schema level.
          </p>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter journal lines by reference type"
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto max-w-full"
        >
          {(
            [
              { id: 'ALL', label: 'All Entries' },
              { id: 'POLICY', label: 'Policy Binds' },
              { id: 'PAYMENT', label: 'Payments' },
              { id: 'CLAIM_RESERVE', label: 'Claim Reserves' },
              { id: 'ENDORSEMENT', label: 'Endorsements' },
              { id: 'REVERSAL', label: 'Reversals' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={refFilter === tab.id}
              onClick={() => setRefFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                refFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search ledger entries by journal number, account, or reference"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search JE-#, account, or reference..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-[#EA580C]"
          />
        </div>
      </div>

      {/* Double-Entry Journal Table (Strictly No Edit or Delete Actions) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Journal #</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Currency</th>
                <th className="py-3 px-4 text-right">Debit</th>
                <th className="py-3 px-4 text-right">Credit</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4 text-right">Audit Trail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredLines.map((line) => (
                <tr key={line.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedTransaction(line.parentTxn)}
                      className="hover:text-[#EA580C] hover:underline"
                    >
                      {line.journalNumber}
                    </button>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {formatDateTime(line.timestamp)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono font-semibold text-slate-700 mr-1.5">
                      {line.accountCode}
                    </span>
                    <span className="text-slate-900 font-medium">{line.accountName}</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">{line.memo}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                    {line.referenceId}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {line.currency}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                    {line.debit > 0 ? formatCurrency(line.debit, true) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                    {line.credit > 0 ? formatCurrency(line.credit, true) : '—'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusIndicator status={line.txnStatus} />
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedTransaction(line.parentTxn)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 inline-flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Journal Detail</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Detail Modal showing Linked Journal Entries + Reversal & Rebooking History */}
      {selectedTransaction && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedTransaction(null)}
          title={`Journal Entry ${selectedTransaction.journalNumber}`}
          subtitle={`${selectedTransaction.description} · Posted by ${selectedTransaction.postedBy}`}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-slate-500">Source Reference: </span>
                <span className="font-mono font-semibold text-slate-900">
                  {selectedTransaction.reference} ({selectedTransaction.referenceType})
                </span>
              </div>
              <StatusIndicator status={selectedTransaction.status} />
            </div>

            {/* Reversal & Rebooking Chain Metadata */}
            {(selectedTransaction.reversedByJournalNumber ||
              selectedTransaction.reversesJournalNumber ||
              selectedTransaction.rebookedJournalNumber) && (
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1">
                <p className="font-semibold text-amber-900">
                  Reversal & Rebooking Audit Chain
                </p>
                {selectedTransaction.reversedByJournalNumber && (
                  <p className="text-amber-800">
                    Reversed by Contra-Journal:{' '}
                    <span className="font-mono font-semibold">
                      {selectedTransaction.reversedByJournalNumber}
                    </span>
                  </p>
                )}
                {selectedTransaction.rebookedJournalNumber && (
                  <p className="text-amber-800">
                    Rebooked Replacement Journal:{' '}
                    <span className="font-mono font-semibold">
                      {selectedTransaction.rebookedJournalNumber}
                    </span>
                  </p>
                )}
                {selectedTransaction.reversesJournalNumber && (
                  <p className="text-amber-800">
                    References Original Reversed Entry:{' '}
                    <span className="font-mono font-semibold">
                      {selectedTransaction.reversesJournalNumber}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Linked Double-Entry Lines */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2 px-3">Account Code & Title</th>
                    <th className="py-2 px-3">Line Memo</th>
                    <th className="py-2 px-3 text-right">Debit (USD)</th>
                    <th className="py-2 px-3 text-right">Credit (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {selectedTransaction.lines.map((ln) => (
                    <tr key={ln.id}>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-semibold text-slate-700 mr-1.5">
                          {ln.accountCode}
                        </span>
                        <span className="font-medium text-slate-900">{ln.accountName}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{ln.memo}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {ln.debit > 0 ? formatCurrency(ln.debit, true) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {ln.credit > 0 ? formatCurrency(ln.credit, true) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Immutable posted record (Edit/Delete disabled)</span>
              </span>

              <div className="flex items-center gap-2.5">
                {selectedTransaction.status === 'Posted' &&
                  selectedTransaction.referenceType !== 'REVERSAL' && (
                    <button
                      type="button"
                      onClick={() => {
                        const currentAmt =
                          selectedTransaction.lines.find((l) => l.debit > 0)?.debit || 1000;
                        setCorrectedAmount(String(currentAmt));
                        setRebookError('');
                        setRebookModalTxn(selectedTransaction);
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reverse & Rebook Entry</span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setSelectedTransaction(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Reverse & Rebook Modal */}
      {rebookModalTxn && (
        <Modal
          isOpen={true}
          onClose={() => setRebookModalTxn(null)}
          title={`Reverse & Rebook ${rebookModalTxn.journalNumber}`}
          subtitle="Generates an offsetting contra-entry and posts a new corrected journal entry."
        >
          <form onSubmit={handleRebookSubmit} className="space-y-4">
            <div>
              <label htmlFor="reb-amt" className="block text-xs font-medium text-slate-700 mb-1">
                Corrected Rebooking Amount (USD)
              </label>
              <input
                id="reb-amt"
                type="number"
                value={correctedAmount}
                onChange={(e) => setCorrectedAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="reb-reason" className="block text-xs font-medium text-slate-700 mb-1">
                Audit Reason for Reversal & Rebooking
              </label>
              <textarea
                id="reb-reason"
                rows={3}
                value={rebookReason}
                onChange={(e) => setRebookReason(e.target.value)}
                placeholder="Explain the accounting adjustment..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {rebookError && <p className="text-xs text-red-600">{rebookError}</p>}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRebookModalTxn(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
              >
                Post Reversal & Rebook
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
