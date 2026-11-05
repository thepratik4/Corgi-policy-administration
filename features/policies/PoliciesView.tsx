'use client';

import React, { useState, useMemo } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { Policy, PolicyStatus } from '../../types/domain';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  generateDeclarationsPageHtml,
  printHtmlDocument,
  reconstructPolicyAsOfDate,
} from '../../utils/documentGenerator';
import {
  calculateCancellationRefundCents,
  centsToDollars,
  dollarsToCents,
} from '../../utils/financialRules';
import {
  calculatePolicyReinsuranceCession,
  generateReinsuranceCessionNoteHtml,
} from '../../utils/reinsuranceSchedule';
import {
  Search,
  Plus,
  ArrowLeft,
  FilePlus2,
  Ban,
  CheckCircle2,
  ArrowUpDown,
  Download,
  Printer,
  Calendar,
} from 'lucide-react';

const STATUS_FILTERS: ('All' | PolicyStatus)[] = [
  'All',
  'Draft',
  'Pending',
  'Active',
  'Cancelled',
  'Expired',
];

type PolicyDetailTab =
  | 'overview'
  | 'coverage'
  | 'premium'
  | 'endorsements'
  | 'reinsurance'
  | 'payments'
  | 'claims'
  | 'documents';

export function PoliciesView() {
  const {
    policies,
    brokers,
    payments,
    claims,
    documents,
    selectedPolicyId,
    setSelectedPolicyId,
    navigateTo,
    issueNewPolicy,
    bindDraftOrPendingPolicy,
    createEndorsement,
    cancelPolicy,
    addToast,
  } = usePolicyAdmin();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | PolicyStatus>('All');
  const [sortBy, setSortBy] = useState<'policyNumber' | 'writtenPremium' | 'effectiveDate'>('policyNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [detailTab, setDetailTab] = useState<PolicyDetailTab>('overview');

  // Modals
  const [issueOpen, setIssueOpen] = useState(false);
  const [endorseOpen, setEndorseOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Issue Policy Form
  const [customerName, setCustomerName] = useState('');
  const [customerIndustry, setCustomerIndustry] = useState('Commercial Manufacturing');
  const [brokerId, setBrokerId] = useState(brokers[0]?.id || 'brk-01');
  const [lineOfBusiness, setLineOfBusiness] = useState<Policy['lineOfBusiness']>('Commercial General Liability');
  const [writtenPremium, setWrittenPremium] = useState('45000');
  const [aggregateLimit, setAggregateLimit] = useState('2000000');
  const [deductible, setDeductible] = useState('10000');
  const [issueError, setIssueError] = useState('');

  // Endorse Form
  const [endorseDesc, setEndorseDesc] = useState('');
  const [endorseDelta, setEndorseDelta] = useState('4000');
  const [endorseDate, setEndorseDate] = useState('2026-11-04');
  const [endorseError, setEndorseError] = useState('');

  // As-Of Historical Declarations Modal State
  const [asOfDecModalOpen, setAsOfDecModalOpen] = useState(false);
  const [policyAsOfDate, setPolicyAsOfDate] = useState('2026-05-03');

  // Cancellation Form State (Domain Gauntlet #5: Pro-Rata vs Short-Rate)
  const [cancelReason, setCancelReason] = useState('');
  const [cancelType, setCancelType] = useState<'PRO_RATA' | 'SHORT_RATE'>('PRO_RATA');
  const [cancelError, setCancelError] = useState('');

  const selectedPolicy = useMemo(
    () => policies.find((p) => p.id === selectedPolicyId) || null,
    [policies, selectedPolicyId]
  );

  // Reinsurance Treaty Cession (Track 1 Stretch Ladder #6)
  const cession = useMemo(() => {
    if (!selectedPolicy) return null;
    return calculatePolicyReinsuranceCession(selectedPolicy);
  }, [selectedPolicy]);

  const handlePrintCessionNote = () => {
    if (!selectedPolicy || !cession) return;
    const broker = brokers.find((b) => b.id === selectedPolicy.brokerId) || null;
    const html = generateReinsuranceCessionNoteHtml(selectedPolicy, broker);
    const printed = printHtmlDocument(`Reinsurance_Cession_${selectedPolicy.policyNumber}`, html);
    if (!printed) return;
    addToast({
      title: 'Reinsurance Cession Note Generated',
      description: `Treaty Schedule printed for ${selectedPolicy.policyNumber} (Munich Re Quota Share).`,
      variant: 'success',
    });
  };

  const handleCancelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPolicy) return;
    if (!cancelReason.trim()) {
      setCancelError('Please provide an audit justification before confirming cancellation.');
      return;
    }
    setCancelError('');
    cancelPolicy(selectedPolicy.id, cancelReason.trim(), cancelType);
    setCancelConfirmOpen(false);
  };

  const policyAsOfRecon = useMemo(() => {
    if (!selectedPolicy || !policyAsOfDate) return null;
    const targetTime = new Date(`${policyAsOfDate}T00:00:00Z`).getTime();
    if (Number.isNaN(targetTime)) return null;
    try {
      return reconstructPolicyAsOfDate(selectedPolicy, policyAsOfDate);
    } catch {
      return null;
    }
  }, [selectedPolicy, policyAsOfDate]);

  const handlePrintSelectedPolicyAsOf = () => {
    if (!selectedPolicy || !policyAsOfDate) return;

    const targetTime = new Date(`${policyAsOfDate}T00:00:00Z`).getTime();
    const effTime = new Date(`${selectedPolicy.effectiveDate}T00:00:00Z`).getTime();
    const expTime = new Date(`${selectedPolicy.expirationDate}T00:00:00Z`).getTime();

    if (Number.isNaN(targetTime) || targetTime < effTime || targetTime > expTime) {
      addToast({
        title: 'Invalid As-Of Date',
        description: `As-of date must fall within the policy term (${selectedPolicy.effectiveDate} to ${selectedPolicy.expirationDate}).`,
        variant: 'error',
      });
      return;
    }

    const broker = brokers.find((b) => b.id === selectedPolicy.brokerId) || null;
    const html = generateDeclarationsPageHtml(selectedPolicy, policyAsOfDate, broker);
    const printed = printHtmlDocument(
      `Declarations_${selectedPolicy.policyNumber}_AsOf_${policyAsOfDate}`,
      html
    );

    if (printed) {
      setAsOfDecModalOpen(false);
      addToast({
        title: 'Generated Official Declarations Page',
        description: `Reconstructed ${selectedPolicy.policyNumber} as it stood on ${policyAsOfDate}.`,
        variant: 'success',
      });
    }
  };

  const filteredPolicies = useMemo(() => {
    return policies
      .filter((p) => {
        if (statusFilter !== 'All' && p.status !== statusFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          p.policyNumber.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q) ||
          p.brokerName.toLowerCase().includes(q) ||
          p.lineOfBusiness.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const mult = sortDir === 'asc' ? 1 : -1;
        if (sortBy === 'writtenPremium') {
          return (a.writtenPremium - b.writtenPremium) * mult;
        }
        if (sortBy === 'effectiveDate') {
          return a.effectiveDate.localeCompare(b.effectiveDate) * mult;
        }
        return a.policyNumber.localeCompare(b.policyNumber) * mult;
      });
  }, [policies, statusFilter, searchQuery, sortBy, sortDir]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const handleIssueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setIssueError('Please enter the customer / insured name.');
      return;
    }
    const prem = Number(writtenPremium);
    const lim = Number(aggregateLimit);
    if (!prem || prem <= 0 || !lim || lim <= 0) {
      setIssueError('Premium and coverage limit must be greater than zero.');
      return;
    }
    setIssueError('');
    const res = issueNewPolicy({
      customerName: customerName.trim(),
      customerIndustry,
      customerEin: '94-3819201',
      customerAddress: '350 Mission St, San Francisco, CA 94105',
      brokerId,
      lineOfBusiness,
      writtenPremium: prem,
      aggregateCoverageLimit: lim,
      perOccurrenceLimit: Math.round(lim / 2),
      deductible: Number(deductible) || 10000,
      effectiveDate: '2026-11-04',
      expirationDate: '2027-11-04',
    });
    if (res.success && res.policy) {
      setCustomerName('');
      setIssueOpen(false);
    } else if (res.error) {
      setIssueError(res.error);
    }
  };

  const handleEndorseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPolicy) return;
    if (!endorseDesc.trim()) {
      setEndorseError('Please describe the endorsement change.');
      return;
    }
    setEndorseError('');
    createEndorsement({
      policyId: selectedPolicy.id,
      effectiveDate: endorseDate,
      description: endorseDesc.trim(),
      premiumDelta: Number(endorseDelta) || 0,
    });
    setEndorseDesc('');
    setEndorseOpen(false);
  };

  if (selectedPolicy) {
    const policyPayments = payments.filter((p) => p.policyId === selectedPolicy.id);
    const policyClaims = claims.filter((c) => c.policyId === selectedPolicy.id);
    const policyDocs = documents.filter(
      (d) => d.relatedReference === selectedPolicy.policyNumber
    );

    return (
      <div className="space-y-6">
        {/* Back button + Header */}
        <div>
          <button
            type="button"
            onClick={() => setSelectedPolicyId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Policy Directory</span>
          </button>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-[#EA580C]">
                  {selectedPolicy.policyNumber}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <StatusIndicator status={selectedPolicy.status} />
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-xs text-slate-500">
                  {selectedPolicy.lineOfBusiness}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 font-display mt-1">
                {selectedPolicy.customerName}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Broker of Record: {selectedPolicy.brokerName} · Effective {formatDate(selectedPolicy.effectiveDate)} to {formatDate(selectedPolicy.expirationDate)}
              </p>
            </div>

            {/* Policy Actions: Issue (if Draft/Pending), Endorse, Cancel */}
            <div className="flex items-center gap-2.5 shrink-0">
              {(selectedPolicy.status === 'Draft' || selectedPolicy.status === 'Pending') && (
                <button
                  type="button"
                  onClick={() => bindDraftOrPendingPolicy(selectedPolicy.id)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Issue & Bind Policy</span>
                </button>
              )}

              {selectedPolicy.status === 'Active' && (
                <button
                  type="button"
                  onClick={() => setEndorseOpen(true)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <FilePlus2 className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>Endorse Policy</span>
                </button>
              )}

              {selectedPolicy.status !== 'Draft' && selectedPolicy.status !== 'Pending' && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPolicy?.effectiveDate) {
                      setPolicyAsOfDate(selectedPolicy.effectiveDate);
                    }
                    setAsOfDecModalOpen(true);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>As-Of Dec Page</span>
                </button>
              )}

              {selectedPolicy.status !== 'Cancelled' && selectedPolicy.status !== 'Expired' && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelReason('');
                    setCancelError('');
                    setCancelType('PRO_RATA');
                    setCancelConfirmOpen(true);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Cancel Policy</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Written Premium</p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedPolicy.writtenPremium)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Earned Premium</p>
            <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatCurrency(selectedPolicy.earnedPremium)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Unearned Premium</p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedPolicy.unearnedPremium)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Aggregate Limit</p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedPolicy.aggregateCoverageLimit)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Occurrence Limit</p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedPolicy.perOccurrenceLimit)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Deductible</p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(selectedPolicy.deductible)}
            </p>
          </div>
        </div>

        {/* Detail Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto max-w-full">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'coverage', label: `Coverage (${selectedPolicy.coverages.length})` },
              { id: 'premium', label: 'Premium Breakdown' },
              { id: 'endorsements', label: `Endorsements (${selectedPolicy.endorsements.length})` },
              { id: 'reinsurance', label: 'Reinsurance Treaty (25% Ceded)' },
              { id: 'payments', label: `Payments (${policyPayments.length})` },
              { id: 'claims', label: `Claims (${policyClaims.length})` },
              { id: 'documents', label: `Documents (${policyDocs.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDetailTab(t.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                detailTab === t.id
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {detailTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Named Insured & Risk Profile
              </h2>
              <dl className="divide-y divide-slate-200 text-xs">
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Legal Entity Name</dt>
                  <dd className="font-medium text-slate-900 text-right">{selectedPolicy.customerName}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Federal EIN</dt>
                  <dd className="font-mono text-slate-900">{selectedPolicy.customerEin}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Industry Classification</dt>
                  <dd className="text-slate-900 text-right">{selectedPolicy.customerIndustry}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Principal Risk Address</dt>
                  <dd className="text-slate-900 text-right">{selectedPolicy.customerAddress}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Lead Underwriter</dt>
                  <dd className="text-slate-900">{selectedPolicy.underwriter}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Policy Term & Producer Attribution
              </h2>
              <dl className="divide-y divide-slate-200 text-xs">
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Policy Number</dt>
                  <dd className="font-mono font-semibold text-slate-900">{selectedPolicy.policyNumber}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Effective Date</dt>
                  <dd className="font-mono text-slate-900">{formatDate(selectedPolicy.effectiveDate)}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Expiration Date</dt>
                  <dd className="font-mono text-slate-900">{formatDate(selectedPolicy.expirationDate)}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Broker of Record</dt>
                  <dd className="text-right">
                    <button
                      type="button"
                      onClick={() => navigateTo('brokers', selectedPolicy.brokerId)}
                      className="font-medium text-[#EA580C] hover:underline"
                    >
                      {selectedPolicy.brokerName}
                    </button>
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Collected Cash Status</dt>
                  <dd className="font-mono text-slate-900">
                    {formatCurrency(selectedPolicy.collectedPremium)} of {formatCurrency(selectedPolicy.writtenPremium)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {detailTab === 'coverage' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Schedule of Coverages & Sub-Limits
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Contractual insuring agreements bound under {selectedPolicy.policyNumber}
              </p>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Coverage Code</th>
                  <th className="py-2.5 px-4">Insuring Agreement</th>
                  <th className="py-2.5 px-4 text-right">Limit of Liability</th>
                  <th className="py-2.5 px-4 text-right">Deductible / Retention</th>
                  <th className="py-2.5 px-4 text-right">Allocated Base Premium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {selectedPolicy.coverages.map((cov) => (
                  <tr key={cov.id}>
                    <td className="py-3 px-4 font-mono text-slate-700">{cov.code}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{cov.name}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(cov.limit)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {formatCurrency(cov.deductible)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(cov.basePremium)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detailTab === 'premium' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4">
            <h2 className="text-base font-semibold text-slate-900 font-display">
              Premium & Statutory Tax Breakdown
            </h2>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
              <div className="px-4 py-3 flex justify-between text-xs">
                <span className="text-slate-600">Base Coverage Schedule Premium</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatCurrency(
                    selectedPolicy.coverages.reduce((s, c) => s + c.basePremium, 0)
                  )}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between text-xs">
                <span className="text-slate-600">Net Mid-Term Endorsements</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatCurrency(
                    selectedPolicy.endorsements.reduce((s, e) => s + e.premiumDelta, 0)
                  )}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between text-xs font-semibold bg-slate-50">
                <span className="text-slate-900">Total Annual Written Premium</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatCurrency(selectedPolicy.writtenPremium)}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between text-xs">
                <span className="text-slate-600">State Surplus Lines Tax & Stamping Fee (3.5%)</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatCurrency(selectedPolicy.taxesAndFees)}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between text-xs font-bold bg-orange-50/50">
                <span className="text-slate-900">Total Policyholder Invoice Amount</span>
                <span className="font-mono tabular-nums text-[#EA580C]">
                  {formatCurrency(selectedPolicy.writtenPremium + selectedPolicy.taxesAndFees)}
                </span>
              </div>
            </div>
          </div>
        )}

        {detailTab === 'endorsements' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 font-display">
                  Policy Endorsement History
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological log of mid-term policy changes and pro-rata premium adjustments
                </p>
              </div>
              {selectedPolicy.status === 'Active' && (
                <button
                  type="button"
                  onClick={() => setEndorseOpen(true)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
                >
                  New Endorsement
                </button>
              )}
            </div>
            {selectedPolicy.endorsements.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No mid-term endorsements have been issued for {selectedPolicy.policyNumber}.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Endorsement #</th>
                    <th className="py-2.5 px-4">Effective Date</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4 text-right">Premium Delta</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {selectedPolicy.endorsements.map((end) => (
                    <tr key={end.id}>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {end.endorsementNumber}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatDate(end.effectiveDate)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{end.description}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {end.premiumDelta >= 0 ? `+${formatCurrency(end.premiumDelta)}` : formatCurrency(end.premiumDelta)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={end.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {detailTab === 'reinsurance' && cession && (
          <div className="space-y-6">
            {/* Header banner */}
            <div className="bg-slate-900 text-white rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-orange-600 text-white rounded">
                    Track 1 Stretch Ladder #6
                  </span>
                  <span className="text-xs text-slate-300 font-mono">
                    Treaty Ref: {cession.treaty.treatyCode}
                  </span>
                </div>
                <h2 className="text-lg font-bold font-display text-white mt-1">
                  {cession.treaty.treatyName}
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Treaty Reinsurer: <span className="font-semibold text-white">{cession.treaty.reinsurerName}</span> ({cession.treaty.reinsurerRating})
                </p>
              </div>
              <button
                type="button"
                onClick={handlePrintCessionNote}
                className="px-4 py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center shadow-xs"
              >
                <Printer className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>Print Reinsurance Cession Note</span>
              </button>
            </div>

            {/* Split metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-medium">Underlying Written Premium</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatCurrency(cession.grossWrittenPremiumDollars)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">100.0% Direct Commercial Policy</p>
              </div>
              <div className="bg-white border border-blue-200 bg-blue-50/30 rounded-xl p-4">
                <p className="text-xs text-blue-700 font-medium">Corgi Net Retention ({cession.treaty.retentionRatePercent}%)</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-blue-900 mt-1">
                  {formatCurrency(cession.netRetainedPremiumDollars)}
                </p>
                <p className="text-[11px] text-blue-700 mt-1">Retained Balance Sheet Exposure</p>
              </div>
              <div className="bg-white border border-orange-200 bg-orange-50/30 rounded-xl p-4">
                <p className="text-xs text-orange-700 font-medium">Munich Re Ceded Share ({cession.treaty.cessionRatePercent}%)</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-[#EA580C] mt-1">
                  {formatCurrency(cession.cededPremiumDollars)}
                </p>
                <p className="text-[11px] text-orange-700 mt-1">Payable under Account {cession.cededPayableAccountCode}</p>
              </div>
            </div>

            {/* Limit apportionments and accounting schedule */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 font-display">
                  Liability Limit Apportionment Schedule
                </h3>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">Per-Occurrence Policy Limit</span>
                    <span className="font-mono text-slate-900 font-semibold">{formatCurrency(cession.grossOccurrenceLimitDollars)}</span>
                  </div>
                  <div className="py-2 flex justify-between pl-3 border-l-2 border-blue-500">
                    <span className="text-blue-800">Corgi Retained Occurrence Exposure (75%)</span>
                    <span className="font-mono text-blue-900 font-medium">{formatCurrency(cession.netRetainedOccurrenceLimitDollars)}</span>
                  </div>
                  <div className="py-2 flex justify-between pl-3 border-l-2 border-orange-500">
                    <span className="text-orange-800">Munich Re Ceded Occurrence Limit (25%)</span>
                    <span className="font-mono text-orange-900 font-medium">{formatCurrency(cession.cededOccurrenceLimitDollars)}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">Aggregate Policy Limit</span>
                    <span className="font-mono text-slate-900 font-semibold">{formatCurrency(cession.grossAggregateLimitDollars)}</span>
                  </div>
                  <div className="py-2 flex justify-between pl-3 border-l-2 border-blue-500">
                    <span className="text-blue-800">Corgi Retained Aggregate Exposure (75%)</span>
                    <span className="font-mono text-blue-900 font-medium">{formatCurrency(cession.netRetainedLimitDollars)}</span>
                  </div>
                  <div className="py-2 flex justify-between pl-3 border-l-2 border-orange-500">
                    <span className="text-orange-800">Munich Re Ceded Aggregate Limit (25%)</span>
                    <span className="font-mono text-orange-900 font-medium">{formatCurrency(cession.cededLimitDollars)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 font-display">
                  Subledger Double-Entry Cession Impact
                </h3>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-slate-600 block">5030 · Ceded Reinsurance Premium Expense</span>
                      <span className="text-[11px] text-slate-400">Expense (Debit)</span>
                    </div>
                    <span className="font-mono text-slate-900 font-bold tabular-nums">
                      {formatCurrency(cession.cededPremiumDollars)}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-slate-600 block">2050 · Ceded Reinsurance Premium Payable</span>
                      <span className="text-[11px] text-slate-400">Liability (Credit)</span>
                    </div>
                    <span className="font-mono text-slate-900 font-bold tabular-nums">
                      {formatCurrency(cession.cededPremiumDollars)}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-slate-600 block">1300 · Reinsurance Recoverable on Paid Losses</span>
                      <span className="text-[11px] text-slate-400">Asset (Receivable on Claims)</span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      25% on Settled Losses
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {detailTab === 'payments' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Associated Stripe Sandbox Settlements
              </h2>
            </div>
            {policyPayments.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No payments recorded yet for this policy.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Stripe PaymentIntent</th>
                    <th className="py-2.5 px-4">Method</th>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {policyPayments.map((pay) => (
                    <tr key={pay.id}>
                      <td className="py-3 px-4 font-mono text-slate-900">
                        {pay.stripePaymentIntentId}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{pay.paymentMethod}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatDate(pay.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatCurrency(pay.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={pay.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {detailTab === 'claims' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Claims Filed Against {selectedPolicy.policyNumber}
              </h2>
            </div>
            {policyClaims.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Loss-free policy period — zero claims filed.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Claim #</th>
                    <th className="py-2.5 px-4">Loss Date</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4 text-right">Outstanding Reserve</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {policyClaims.map((clm) => (
                    <tr key={clm.id}>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => navigateTo('claims', clm.id)}
                          className="text-[#EA580C] hover:underline"
                        >
                          {clm.claimNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatDate(clm.lossDate)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{clm.description}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatCurrency(clm.outstandingReserve)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={clm.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {detailTab === 'documents' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Policy Declarations & Endorsement Packets
              </h2>
              <button
                type="button"
                onClick={() => navigateTo('documents')}
                className="text-xs font-medium text-[#EA580C] hover:underline"
              >
                Open Document Center
              </button>
            </div>
            {policyDocs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No generated declarations found for this policy.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {policyDocs.map((doc) => (
                  <div key={doc.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{doc.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        {doc.documentCode} · {doc.version} · {doc.fileSize}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        addToast({
                          title: `Downloaded ${doc.documentCode}.pdf`,
                          description: doc.title,
                          variant: 'info',
                        })
                      }
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Endorse Modal */}
        <Modal
          isOpen={endorseOpen}
          onClose={() => setEndorseOpen(false)}
          title={`Endorse Policy ${selectedPolicy.policyNumber}`}
          subtitle="Creates an endorsement record and books the corresponding double-entry receivable/unearned adjustment."
        >
          <form onSubmit={handleEndorseSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pol-end-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Endorsement Effective Date
                </label>
                <input
                  id="pol-end-date"
                  type="date"
                  value={endorseDate}
                  onChange={(e) => setEndorseDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="pol-end-delta" className="block text-xs font-medium text-slate-700 mb-1">
                  Pro-Rata Premium Delta ($)
                </label>
                <input
                  id="pol-end-delta"
                  type="number"
                  value={endorseDelta}
                  onChange={(e) => setEndorseDelta(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label htmlFor="pol-end-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Schedule Modification Details
              </label>
              <textarea
                id="pol-end-desc"
                rows={3}
                value={endorseDesc}
                onChange={(e) => setEndorseDesc(e.target.value)}
                placeholder="Describe added insured locations, coverage limit changes, or payroll updates..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            {endorseError && <p className="text-xs text-red-600">{endorseError}</p>}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEndorseOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
              >
                Apply Endorsement
              </button>
            </div>
          </form>
        </Modal>

        {/* Cancel Policy Modal (Domain Gauntlet #5: Pro-Rata vs Short-Rate) */}
        <Modal
          isOpen={cancelConfirmOpen}
          onClose={() => setCancelConfirmOpen(false)}
          title={`Cancel Policy ${selectedPolicy.policyNumber}`}
          subtitle="Domain Gauntlet #5: Pro-Rata vs. Short-Rate Cancellation with Double-Entry Accounting"
          maxWidthClass="max-w-xl"
        >
          <form onSubmit={handleCancelSubmit} className="space-y-4 text-xs">
            {/* Cancellation Type Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-900 block">
                Cancellation Type & Proration Rule
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`p-3.5 border rounded-xl cursor-pointer transition-all flex flex-col justify-between ${
                    cancelType === 'PRO_RATA'
                      ? 'border-[#EA580C] bg-orange-50/40 ring-1 ring-[#EA580C]'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="cancelType"
                      checked={cancelType === 'PRO_RATA'}
                      onChange={() => setCancelType('PRO_RATA')}
                      className="text-[#EA580C] focus:ring-[#EA580C]"
                    />
                    <span className="font-semibold text-slate-900">Pro-Rata (Standard)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 pl-5">
                    Carrier or mutual cancellation. Insured receives <strong>100%</strong> of unearned premium back.
                  </p>
                </label>

                <label
                  className={`p-3.5 border rounded-xl cursor-pointer transition-all flex flex-col justify-between ${
                    cancelType === 'SHORT_RATE'
                      ? 'border-[#EA580C] bg-orange-50/40 ring-1 ring-[#EA580C]'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="cancelType"
                      checked={cancelType === 'SHORT_RATE'}
                      onChange={() => setCancelType('SHORT_RATE')}
                      className="text-[#EA580C] focus:ring-[#EA580C]"
                    />
                    <span className="font-semibold text-slate-900">Short-Rate (90/10)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 pl-5">
                    Insured-requested early termination. Insured receives <strong>90%</strong> refund; Corgi retains <strong>10% penalty</strong>.
                  </p>
                </label>
              </div>
            </div>

            {/* Financial Preview Box */}
            {(() => {
              const unearnedCents = dollarsToCents(selectedPolicy.unearnedPremium);
              const preview = calculateCancellationRefundCents(unearnedCents, cancelType);
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Calculated Return Premium & Subledger Impact
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Gross Unearned</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {formatCurrency(centsToDollars(preview.grossUnearnedCents))}
                      </span>
                    </div>
                    <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 font-medium block">Refund to Insured</span>
                      <span className="font-mono font-bold text-emerald-800">
                        {formatCurrency(centsToDollars(preview.refundCents))}
                      </span>
                    </div>
                    <div className={`p-2 rounded-lg border ${preview.retainedPenaltyCents > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}>
                      <span className={`text-[10px] block ${preview.retainedPenaltyCents > 0 ? 'text-orange-700 font-medium' : 'text-slate-400'}`}>
                        Corgi Retained Fee
                      </span>
                      <span className={`font-mono font-bold ${preview.retainedPenaltyCents > 0 ? 'text-[#EA580C]' : 'text-slate-500'}`}>
                        {formatCurrency(centsToDollars(preview.retainedPenaltyCents))}
                      </span>
                    </div>
                  </div>
                  {cancelType === 'SHORT_RATE' && (
                    <p className="text-[11px] text-orange-800 bg-orange-100/60 p-2 rounded-md">
                      <strong>Double-Entry Rule</strong>: Debit 2010 Unearned Premium ({formatCurrency(centsToDollars(preview.grossUnearnedCents))}) = Credit 1020 Cash/Clearing ({formatCurrency(centsToDollars(preview.refundCents))}) + Credit 4020 Retained Penalty ({formatCurrency(centsToDollars(preview.retainedPenaltyCents))}).
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Audit Reason Textarea */}
            <div>
              <label htmlFor="cancel-reason" className="text-xs font-semibold text-slate-900 block mb-1">
                Audit Trail Justification / Mandatory Reason
              </label>
              <textarea
                id="cancel-reason"
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Insured requested early cancellation due to sale of commercial facility..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
              {cancelError && <p className="text-red-600 text-xs mt-1">{cancelError}</p>}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-2xs"
              >
                Confirm Cancellation & Route to Queue
              </button>
            </div>
          </form>
        </Modal>

        {/* As-Of Policy Declarations Page Modal (Domain Gauntlet #9) */}
        <Modal
          isOpen={asOfDecModalOpen}
          onClose={() => setAsOfDecModalOpen(false)}
          title={`Reconstruct Policy Declarations — ${selectedPolicy.policyNumber}`}
          subtitle="Generate statutory Acord-standard Declarations Page and Endorsement Schedule as of any past calendar date."
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-orange-50/60 border border-orange-200/80 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#EA580C] block">
                    Domain Gauntlet #9: As-Of Reconstruction
                  </span>
                  <label htmlFor="modal-as-of-date" className="text-xs font-semibold text-slate-900 mt-0.5 block">
                    Reconstruction Date:
                  </label>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs">
                  <Calendar className="w-4 h-4 text-[#EA580C]" />
                  <input
                    id="modal-as-of-date"
                    type="date"
                    aria-label="Reconstruction calendar date"
                    value={policyAsOfDate}
                    min={selectedPolicy.effectiveDate}
                    max={selectedPolicy.expirationDate}
                    onChange={(e) => setPolicyAsOfDate(e.target.value)}
                    className="font-mono text-xs text-slate-900 font-semibold bg-transparent focus:outline-none"
                  />
                </div>
              </div>

              {policyAsOfRecon && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-orange-100">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Adjusted Premium</span>
                    <span className="font-mono font-bold text-slate-900 text-xs mt-0.5 block">
                      {formatCurrency(policyAsOfRecon.adjustedWrittenPremium)}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Earned as of Date</span>
                    <span className="font-mono font-bold text-emerald-700 text-xs mt-0.5 block">
                      {formatCurrency(policyAsOfRecon.earnedPremium)}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Active Endorsements</span>
                    <span className="font-mono font-bold text-[#EA580C] text-xs mt-0.5 block">
                      {policyAsOfRecon.activeEndorsements.length} on or before date
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 text-slate-700 space-y-2">
              <p className="font-semibold text-slate-900 text-xs">
                What will be generated:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                <li>Commercial Policy Declarations Page with Carrier & Insured headers.</li>
                <li>Coverage schedules: Per-Occurrence & Aggregate liability limits.</li>
                <li>Endorsement Schedule: Excludes changes entered after {policyAsOfDate}.</li>
                <li>Statutory premium tie-out including Surplus Lines Tax (3.5%) & Stamping Fee ($25).</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAsOfDecModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePrintSelectedPolicyAsOf();
                  setAsOfDecModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Official Declarations Page (PDF)</span>
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
        kicker="Underwriting & Policy Administration"
        title="Commercial Policies"
        subtitle="Search, filter, issue, endorse, and administer commercial lines policies across all states and brokers."
        actions={
          <button
            type="button"
            onClick={() => setIssueOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Issue New Policy</span>
          </button>
        }
      />

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div
          role="tablist"
          aria-label="Filter policies by status"
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto max-w-full"
        >
          {STATUS_FILTERS.map((st) => {
            const count =
              st === 'All'
                ? policies.length
                : policies.filter((p) => p.status === st).length;
            return (
              <button
                key={st}
                type="button"
                role="tab"
                aria-selected={statusFilter === st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
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

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search policies by number, customer, or broker"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search policy #, insured, or broker..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-[#EA580C]"
          />
        </div>
      </div>

      {/* Policies Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredPolicies.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-slate-800">
              No matching policies found
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Try clearing your search filter or issue a new commercial policy.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('All');
                setSearchQuery('');
              }}
              className="mt-4 px-3.5 py-1.5 text-xs font-medium text-[#EA580C] border border-orange-200 rounded-lg hover:bg-orange-50"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-3.5">
                    <button
                      type="button"
                      onClick={() => toggleSort('policyNumber')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      <span>Policy Number</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3.5">Customer / Insured</th>
                  <th className="py-3 px-3.5">Broker & Line</th>
                  <th className="py-3 px-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('writtenPremium')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      <span>Premium</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3.5">
                    <button
                      type="button"
                      onClick={() => toggleSort('effectiveDate')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      <span>Effective — Expiration</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredPolicies.map((pol) => (
                  <tr
                    key={pol.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-3.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPolicyId(pol.id);
                          setDetailTab('overview');
                        }}
                        className="hover:text-[#EA580C] hover:underline text-left"
                      >
                        {pol.policyNumber}
                      </button>
                    </td>
                    <td className="py-3 px-3.5">
                      <p className="font-medium text-slate-900">{pol.customerName}</p>
                      <p className="text-[11px] text-slate-500">{pol.customerIndustry}</p>
                    </td>
                    <td className="py-3 px-3.5">
                      <p className="text-slate-800 font-medium">{pol.brokerName}</p>
                      <p className="text-[11px] text-slate-500">{pol.lineOfBusiness}</p>
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(pol.writtenPremium)}
                    </td>
                    <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(pol.effectiveDate)} — {formatDate(pol.expirationDate)}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <StatusIndicator status={pol.status} />
                    </td>
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPolicyId(pol.id);
                          setDetailTab('overview');
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Issue New Policy Modal */}
      <Modal
        isOpen={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Issue New Commercial Policy"
        subtitle="Binds primary commercial coverage and posts initial unearned premium journal entry."
      >
        <form onSubmit={handleIssueSubmit} className="space-y-4">
          <div>
            <label htmlFor="pol-customer-name" className="block text-xs font-medium text-slate-700 mb-1">
              Named Insured / Legal Entity
            </label>
            <input
              id="pol-customer-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., Pacific Horizon BioSciences Corp."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pol-lob" className="block text-xs font-medium text-slate-700 mb-1">
                Line of Business
              </label>
              <select
                id="pol-lob"
                value={lineOfBusiness}
                onChange={(e) => setLineOfBusiness(e.target.value as Policy['lineOfBusiness'])}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Commercial General Liability">Commercial General Liability</option>
                <option value="Cyber & Tech E&O">Cyber & Tech E&O</option>
                <option value="Commercial Property">Commercial Property</option>
                <option value="Workers Compensation">Workers Compensation</option>
                <option value="Directors & Officers">Directors & Officers</option>
              </select>
            </div>
            <div>
              <label htmlFor="pol-broker" className="block text-xs font-medium text-slate-700 mb-1">
                Broker of Record
              </label>
              <select
                id="pol-broker"
                value={brokerId}
                onChange={(e) => setBrokerId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.agencyName} ({b.kybStatus})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="pol-prem" className="block text-xs font-medium text-slate-700 mb-1">
                Annual Written Premium ($)
              </label>
              <input
                id="pol-prem"
                type="number"
                value={writtenPremium}
                onChange={(e) => setWrittenPremium(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="pol-lim" className="block text-xs font-medium text-slate-700 mb-1">
                Aggregate Limit ($)
              </label>
              <input
                id="pol-lim"
                type="number"
                value={aggregateLimit}
                onChange={(e) => setAggregateLimit(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="pol-ded" className="block text-xs font-medium text-slate-700 mb-1">
                Deductible ($)
              </label>
              <input
                id="pol-ded"
                type="number"
                value={deductible}
                onChange={(e) => setDeductible(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="pol-ind" className="block text-xs font-medium text-slate-700 mb-1">
              Industry Sector
            </label>
            <input
              id="pol-ind"
              type="text"
              value={customerIndustry}
              onChange={(e) => setCustomerIndustry(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {issueError && <p className="text-xs text-red-600">{issueError}</p>}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIssueOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
            >
              Issue Policy
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
