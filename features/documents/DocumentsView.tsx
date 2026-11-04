'use client';

import React, { useState, useMemo } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { DocumentCategory, PolicyDocument } from '../../types/domain';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import {
  generateDeclarationsPageHtml,
  printHtmlDocument,
  reconstructPolicyAsOfDate,
} from '../../utils/documentGenerator';
import {
  Search,
  FileText,
  Download,
  Eye,
  CheckCircle2,
  Printer,
  Calendar,
  ShieldCheck,
  Building2,
} from 'lucide-react';

const DOC_CATEGORIES: ('All' | DocumentCategory)[] = [
  'All',
  'Policy Declaration',
  'Broker Statement',
  'Claim Document',
];

export function DocumentsView() {
  const { documents, policies, brokers, addToast } = usePolicyAdmin();

  const [categoryFilter, setCategoryFilter] = useState<'All' | DocumentCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDoc, setPreviewDoc] = useState<PolicyDocument | null>(null);

  // As-Of Historical Document Generator State
  const [asOfPolicyId, setAsOfPolicyId] = useState<string>(policies[0]?.id || '');
  const [asOfDate, setAsOfDate] = useState<string>(policies[0]?.effectiveDate || '2026-05-03');

  const selectedAsOfPolicy = useMemo(() => {
    return policies.find((p) => p.id === asOfPolicyId) || policies[0] || null;
  }, [policies, asOfPolicyId]);

  const selectedAsOfBroker = useMemo(() => {
    if (!selectedAsOfPolicy) return null;
    return brokers.find((b) => b.id === selectedAsOfPolicy.brokerId) || null;
  }, [brokers, selectedAsOfPolicy]);

  const asOfReconstruction = useMemo(() => {
    if (!selectedAsOfPolicy) return null;
    try {
      return reconstructPolicyAsOfDate(selectedAsOfPolicy, asOfDate);
    } catch {
      return null;
    }
  }, [selectedAsOfPolicy, asOfDate]);

  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        d.documentCode.toLowerCase().includes(q) ||
        d.relatedReference.toLowerCase().includes(q) ||
        d.entityName.toLowerCase().includes(q)
      );
    });
  }, [documents, categoryFilter, searchQuery]);

  const handlePrintAsOfDeclarations = () => {
    if (!selectedAsOfPolicy) return;

    const targetTime = new Date(`${asOfDate}T00:00:00Z`).getTime();
    const effTime = new Date(`${selectedAsOfPolicy.effectiveDate}T00:00:00Z`).getTime();
    const expTime = new Date(`${selectedAsOfPolicy.expirationDate}T00:00:00Z`).getTime();

    if (Number.isNaN(targetTime) || targetTime < effTime || targetTime > expTime) {
      addToast({
        title: 'Invalid As-Of Date',
        description: `As-of date must fall within the policy term (${selectedAsOfPolicy.effectiveDate} to ${selectedAsOfPolicy.expirationDate}).`,
        variant: 'error',
      });
      return;
    }

    const html = generateDeclarationsPageHtml(selectedAsOfPolicy, asOfDate, selectedAsOfBroker);
    const printed = printHtmlDocument(
      `Declarations_${selectedAsOfPolicy.policyNumber}_AsOf_${asOfDate}`,
      html
    );

    if (printed) {
      addToast({
        title: 'Print Dialog Initiated',
        description: `Generated Official Declarations for ${selectedAsOfPolicy.policyNumber} as of ${asOfDate}.`,
        variant: 'success',
      });
    }
  };

  const handleDownload = (doc: PolicyDocument) => {
    // If it's a policy declaration, find the matching policy and print the official Dec Page
    const matchedPolicy = policies.find(
      (p) => p.policyNumber === doc.relatedReference || p.id === doc.relatedReference
    );

    if (matchedPolicy) {
      const broker = brokers.find((b) => b.id === matchedPolicy.brokerId) || null;
      const html = generateDeclarationsPageHtml(
        matchedPolicy,
        doc.generatedAt.slice(0, 10),
        broker
      );
      const printed = printHtmlDocument(doc.title, html);
      if (printed) {
        addToast({
          title: `Opened Official PDF: ${doc.documentCode}`,
          description: `Generated printable Acord-standard Declarations Page for ${matchedPolicy.policyNumber}.`,
          variant: 'success',
        });
      }
      return;
    }

    // Generic high-fidelity document sheet
    const summaryRows = doc.coverageOrFinancialSummary
      .map(
        (r) =>
          `<tr><td style="padding: 6px 10px; border: 1px solid #CBD5E1;">${r.label}</td><td style="padding: 6px 10px; border: 1px solid #CBD5E1; text-align: right; font-family: monospace; font-weight: 600;">${r.value}</td></tr>`
      )
      .join('');

    const genericHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${doc.title} — ${doc.documentCode}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0F172A; }
    .brand { font-size: 16px; font-weight: 800; color: #EA580C; }
    .meta { font-family: monospace; font-size: 11px; color: #64748B; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 11px; }
    th { background: #F1F5F9; border: 1px solid #CBD5E1; padding: 8px 10px; text-align: left; }
  </style>
</head>
<body>
  <div class="brand">CORGI COMMERCIAL INSURANCE SERVICES LLC</div>
  <h2 style="margin: 4px 0 8px 0;">${doc.title}</h2>
  <div class="meta">Code: ${doc.documentCode} | Ref: ${doc.relatedReference} | Entity: ${doc.entityName} | Generated: ${doc.generatedAt}</div>
  <p style="font-size: 12px; color: #334155;"><strong>Filing Summary:</strong></p>
  <ul>${doc.summaryPoints.map((s) => `<li>${s}</li>`).join('')}</ul>
  <table>
    <thead><tr><th>Schedule Item</th><th style="text-align: right;">Amount / Metric</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>
</body>
</html>`;

    const printed = printHtmlDocument(doc.title, genericHtml);
    if (printed) {
      addToast({
        title: `Generated ${doc.documentCode}.pdf`,
        description: `${doc.title} rendered and ready for print or Save as PDF.`,
        variant: 'success',
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Generated Artifacts & Statutory Filings"
        title="Documents Center"
        subtitle="Preview, generate, and print official commercial policy declarations, endorsement schedules, and producer statements tied to the subledger."
      />

      {/* Domain Gauntlet #9: As-Of Policy Declarations Generator */}
      <div className="bg-gradient-to-r from-orange-50 via-white to-amber-50/50 border border-orange-200/80 rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-orange-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-[#EA580C] text-white rounded">
                Domain Gauntlet #9
              </span>
              <h2 className="text-sm font-bold text-slate-900 font-display">
                Historical As-Of Policy Declarations Generator
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Reconstruct and print the statutory Declarations Page and Endorsement Schedule for any policy as it stood on any past calendar date (e.g. <em>May 3, 2026</em>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div>
              <label htmlFor="asof-pol-select" className="sr-only">
                Select Policy
              </label>
              <select
                id="asof-pol-select"
                aria-label="Select policy for as-of historical reconstruction"
                value={asOfPolicyId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setAsOfPolicyId(newId);
                  const matched = policies.find((p) => p.id === newId);
                  if (matched?.effectiveDate) {
                    setAsOfDate(matched.effectiveDate);
                  }
                }}
                className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-orange-500/20"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.policyNumber} — {p.customerName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                aria-label="Historical as-of date for document reconstruction"
                value={asOfDate}
                min={selectedAsOfPolicy?.effectiveDate}
                max={selectedAsOfPolicy?.expirationDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="text-xs text-slate-800 font-mono bg-transparent focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handlePrintAsOfDeclarations}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Policy As Of Date (PDF)</span>
            </button>
          </div>
        </div>

        {/* Live Reconstructed Position Box */}
        {selectedAsOfPolicy && asOfReconstruction && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-white border border-slate-200/80 rounded-xl">
              <span className="text-[11px] text-slate-500 block">As-Of Date</span>
              <span className="font-mono font-semibold text-slate-900 mt-0.5 block">
                {asOfDate}
              </span>
              <span className="text-[10px] text-slate-500">
                {asOfReconstruction.daysElapsed} of {asOfReconstruction.totalTermDays} term days elapsed
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200/80 rounded-xl">
              <span className="text-[11px] text-slate-500 block">Adjusted Written Premium</span>
              <span className="font-mono font-semibold text-slate-900 mt-0.5 block">
                {formatCurrency(asOfReconstruction.adjustedWrittenPremium)}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">
                {asOfReconstruction.activeEndorsements.length} active endorsements
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200/80 rounded-xl">
              <span className="text-[11px] text-slate-500 block">Pro-Rata Earned Revenue</span>
              <span className="font-mono font-semibold text-emerald-700 mt-0.5 block">
                {formatCurrency(asOfReconstruction.earnedPremium)}
              </span>
              <span className="text-[10px] text-slate-500">
                Recognized into Account 4010
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200/80 rounded-xl">
              <span className="text-[11px] text-slate-500 block">Unearned Premium Liability</span>
              <span className="font-mono font-semibold text-orange-700 mt-0.5 block">
                {formatCurrency(asOfReconstruction.unearnedPremium)}
              </span>
              <span className="text-[10px] text-slate-500">
                Held in Account 2010
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Category Filter & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter documents by category"
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto max-w-full"
        >
          {DOC_CATEGORIES.map((cat) => {
            const count =
              cat === 'All'
                ? documents.length
                : documents.filter((d) => d.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search documents by title, code, or policy reference"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search DEC-#, policy #, or entity..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Document Code</th>
                <th className="py-3 px-4">Document Title & Entity</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Related Reference</th>
                <th className="py-3 px-4">Version & Size</th>
                <th className="py-3 px-4">Generated Timestamp</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                    {doc.documentCode}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#EA580C] shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-900">{doc.title}</p>
                        <p className="text-[11px] text-slate-500">{doc.entityName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                    {doc.category}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                    {doc.relatedReference}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                    {doc.version} · {doc.fileSize}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {formatDateTime(doc.generatedAt)}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 inline-flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-md inline-flex items-center gap-1"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print PDF</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.title}
          subtitle={`${previewDoc.documentCode} · ${previewDoc.category} · ${previewDoc.version}`}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-5 text-xs">
            {/* Official Corgi Document Sheet */}
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-5">
              <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                <div>
                  <p className="text-sm font-bold text-slate-900 font-display">
                    CORGI COMMERCIAL INSURANCE SERVICES LLC
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    San Francisco, California · Commercial Lines Policy Administration
                  </p>
                </div>
                <div className="text-right font-mono">
                  <p className="text-xs font-semibold text-[#EA580C]">
                    {previewDoc.documentCode}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Ref: {previewDoc.relatedReference}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-800 mb-2">
                  Schedule & Filing Summary
                </h3>
                <ul className="space-y-1.5">
                  {previewDoc.summaryPoints.map((pt, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-800 mb-2">
                  Coverage & Financial Schedule
                </h3>
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
                  {previewDoc.coverageOrFinancialSummary.map((row) => (
                    <div
                      key={row.label}
                      className="px-4 py-2.5 flex items-center justify-between"
                    >
                      <span className="text-slate-600">{row.label}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDownload(previewDoc);
                  setPreviewDoc(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save as PDF</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
