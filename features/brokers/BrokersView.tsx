'use client';

import React, { useState, useMemo } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { KybStatus } from '../../types/domain';
import { formatCurrency, formatDate, formatPercent } from '../../utils/formatters';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Modal } from '../../components/ui/Modal';
import {
  Search,
  ArrowLeft,
  FileText,
  Download,
  ShieldCheck,
} from 'lucide-react';

const KYB_FILTERS: ('All' | KybStatus)[] = ['All', 'Approved', 'Pending', 'Failed'];

export function BrokersView() {
  const {
    brokers,
    policies,
    selectedBrokerId,
    setSelectedBrokerId,
    navigateTo,
    updateBrokerKybStatus,
    addToast,
  } = usePolicyAdmin();

  const [searchQuery, setSearchQuery] = useState('');
  const [kybFilter, setKybFilter] = useState<'All' | KybStatus>('All');
  const [statementOpen, setStatementOpen] = useState(false);

  const selectedBroker = useMemo(
    () => brokers.find((b) => b.id === selectedBrokerId) || null,
    [brokers, selectedBrokerId]
  );

  const filteredBrokers = useMemo(() => {
    return brokers.filter((b) => {
      if (kybFilter !== 'All' && b.kybStatus !== kybFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        b.agencyName.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.principalContact.toLowerCase().includes(q) ||
        b.domicileState.toLowerCase().includes(q)
      );
    });
  }, [brokers, kybFilter, searchQuery]);

  if (selectedBroker) {
    const brokerPolicies = policies.filter((p) => p.brokerId === selectedBroker.id);

    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => setSelectedBrokerId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Broker Directory</span>
          </button>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-[#EA580C]">
                  {selectedBroker.code}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <StatusIndicator status={selectedBroker.kybStatus} />
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-xs text-slate-500">
                  State License: {selectedBroker.stateLicense}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 font-display mt-1">
                {selectedBroker.agencyName}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Principal Producer: {selectedBroker.principalContact} · Domicile: {selectedBroker.domicileState} · Persona Sandbox Inquiry: <span className="font-mono">{selectedBroker.personaInquiryId}</span>
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {selectedBroker.kybStatus !== 'Approved' && (
                <button
                  type="button"
                  onClick={() => updateBrokerKybStatus(selectedBroker.id, 'Approved')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg inline-flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Approve KYB (Sandbox)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setStatementOpen(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View Broker Statement</span>
              </button>
            </div>
          </div>
        </div>

        {/* Broker Financial Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Contractual Commission Rate</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatPercent(selectedBroker.commissionRate, 1)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Standard commercial producer agreement</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Collected Premium Volume</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedBroker.collectedPremium)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Across {brokerPolicies.length} placed policies</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Total Commission Earned</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatCurrency(selectedBroker.totalCommissionEarned)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Gross producer compensation</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Commission Disbursed YTD</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedBroker.totalCommissionPaid)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {selectedBroker.kybStatus === 'Approved' ? 'Eligible for ACH settlement' : 'Disbursement held pending KYB'}
            </p>
          </div>
        </div>

        {/* Commission History Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Commission History & Policy Attribution
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Policy-level collected premium and calculated producer commission ledger
              </p>
            </div>
          </div>
          {selectedBroker.commissions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No collected premium or commission entries recorded yet for {selectedBroker.agencyName}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Policy Number</th>
                    <th className="py-2.5 px-4">Named Insured</th>
                    <th className="py-2.5 px-4 text-right">Collected Premium</th>
                    <th className="py-2.5 px-4 text-right">Commission Rate</th>
                    <th className="py-2.5 px-4 text-right">Commission Amount</th>
                    <th className="py-2.5 px-4">Settlement Date</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {selectedBroker.commissions.map((com) => (
                    <tr key={com.id}>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => navigateTo('policies', com.policyId)}
                          className="text-[#EA580C] hover:underline"
                        >
                          {com.policyNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-800">{com.customerName}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        {formatCurrency(com.premiumCollected)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {formatPercent(com.commissionRate, 1)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(com.commissionAmount)}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {com.settledDate}
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={com.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Broker Statement Modal */}
        <Modal
          isOpen={statementOpen}
          onClose={() => setStatementOpen(false)}
          title={`Producer Commission Statement — ${selectedBroker.agencyName}`}
          subtitle={`Statement Period: October 2026 · Producer Code ${selectedBroker.code}`}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-semibold text-slate-900">{selectedBroker.agencyName}</p>
                <p className="text-slate-500">
                  License: {selectedBroker.stateLicense} · Contact: {selectedBroker.email}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <StatusIndicator status={selectedBroker.kybStatus} />
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Persona ID: {selectedBroker.personaInquiryId}
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 text-xs">
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600">Total Collected Net Premium</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(selectedBroker.collectedPremium, true)}
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600">Contractual Commission Rate</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {formatPercent(selectedBroker.commissionRate, 1)}
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600">Total Commission Earned</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(selectedBroker.totalCommissionEarned, true)}
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600">Less: Disbursed YTD</span>
                <span className="font-mono text-slate-900 tabular-nums">
                  ({formatCurrency(selectedBroker.totalCommissionPaid, true)})
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between bg-slate-50 font-semibold">
                <span className="text-slate-900">Net Statement Balance</span>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatCurrency(
                    selectedBroker.totalCommissionEarned - selectedBroker.totalCommissionPaid,
                    true
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setStatementOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  addToast({
                    title: `Statement Downloaded`,
                    description: `Saved ${selectedBroker.code}-Statement-2026-10.pdf`,
                    variant: 'success',
                  });
                  setStatementOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Statement PDF</span>
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Producer Distribution & KYB Compliance"
        title="Broker Directory"
        subtitle="Manage appointed commercial insurance brokers, Persona KYB verification states, commission rates, and monthly producer statements."
      />

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter brokers by KYB status"
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit"
        >
          {KYB_FILTERS.map((st) => {
            const count =
              st === 'All'
                ? brokers.length
                : brokers.filter((b) => b.kybStatus === st).length;
            return (
              <button
                key={st}
                type="button"
                role="tab"
                aria-selected={kybFilter === st}
                onClick={() => setKybFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  kybFilter === st
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
            aria-label="Search brokers by agency name, code, or state"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agency, license, or state..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-[#EA580C]"
          />
        </div>
      </div>

      {/* Brokers Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Broker Code</th>
                <th className="py-3 px-4">Agency Name</th>
                <th className="py-3 px-4">Domicile & License</th>
                <th className="py-3 px-4">KYB Verification</th>
                <th className="py-3 px-4 text-right">Commission Rate</th>
                <th className="py-3 px-4 text-right">Collected Premium</th>
                <th className="py-3 px-4 text-right">Earned Commission</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredBrokers.map((brk) => (
                <tr key={brk.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedBrokerId(brk.id)}
                      className="hover:text-[#EA580C] hover:underline"
                    >
                      {brk.code}
                    </button>
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-semibold text-slate-900">{brk.agencyName}</p>
                    <p className="text-[11px] text-slate-500">{brk.email}</p>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <p className="text-slate-800">{brk.domicileState}</p>
                    <p className="text-[11px] font-mono text-slate-500">{brk.stateLicense}</p>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusIndicator status={brk.kybStatus} />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                    {formatPercent(brk.commissionRate, 1)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                    {formatCurrency(brk.collectedPremium)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                    {formatCurrency(brk.totalCommissionEarned)}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedBrokerId(brk.id)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
