'use client';

import React, { useState, useMemo } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { DocumentCategory, PolicyDocument } from '../../types/domain';
import { formatDateTime } from '../../utils/formatters';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import {
  Search,
  FileText,
  Download,
  Eye,
  CheckCircle2,
} from 'lucide-react';

const DOC_CATEGORIES: ('All' | DocumentCategory)[] = [
  'All',
  'Policy Declaration',
  'Broker Statement',
  'Claim Document',
];

export function DocumentsView() {
  const { documents, addToast } = usePolicyAdmin();

  const [categoryFilter, setCategoryFilter] = useState<'All' | DocumentCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDoc, setPreviewDoc] = useState<PolicyDocument | null>(null);

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

  const handleDownload = (doc: PolicyDocument) => {
    addToast({
      title: `Downloaded ${doc.documentCode}.pdf`,
      description: `${doc.title} (${doc.fileSize}) saved to your device.`,
      variant: 'success',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Generated Artifacts & Statutory Filings"
        title="Documents Center"
        subtitle="Preview and download bound commercial policy declarations, monthly producer commission statements, and independent loss adjuster reports."
      />

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
                      <Download className="w-3 h-3" />
                      <span>Download</span>
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
            {/* Simulated Official Corgi Document Sheet */}
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
                <Download className="w-3.5 h-3.5" />
                <span>Download Official PDF</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
