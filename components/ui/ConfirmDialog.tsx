'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'danger' | 'warning' | 'primary';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  defaultReason?: string;
  financialSummary?: { label: string; value: string }[];
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  variant = 'danger',
  requireReason = true,
  reasonLabel = 'Audit Reason / Justification',
  reasonPlaceholder = 'Enter mandatory audit trail justification...',
  defaultReason = '',
  financialSummary,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState(defaultReason);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && !reason.trim()) {
      setError('Please provide an audit trail reason before confirming.');
      return;
    }
    setError('');
    onConfirm(reason.trim());
    setReason('');
    onClose();
  };

  const buttonColor =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : variant === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700 text-white'
      : 'bg-[#EA580C] hover:bg-[#C2410C] text-white';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidthClass="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700 leading-relaxed">{description}</p>
        </div>

        {financialSummary && financialSummary.length > 0 && (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 bg-white">
            {financialSummary.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-slate-500">{row.label}</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {requireReason && (
          <div>
            <label htmlFor="confirm-reason-input" className="block text-xs font-medium text-slate-700 mb-1.5">
              {reasonLabel}
            </label>
            <textarea
              id="confirm-reason-input"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder={reasonPlaceholder}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-orange-600"
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${buttonColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
