'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileEdit,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const TONE_MAP: Record<string, { tone: StatusTone; icon: React.ComponentType<{ className?: string }> }> = {
  // Policy statuses
  Active: { tone: 'success', icon: CheckCircle2 },
  Pending: { tone: 'warning', icon: Clock },
  Draft: { tone: 'neutral', icon: FileEdit },
  Cancelled: { tone: 'danger', icon: XCircle },
  Expired: { tone: 'neutral', icon: Clock },
  // KYB & Approval statuses
  Approved: { tone: 'success', icon: CheckCircle2 },
  Failed: { tone: 'danger', icon: XCircle },
  Rejected: { tone: 'danger', icon: XCircle },
  // Payment statuses
  Succeeded: { tone: 'success', icon: CheckCircle2 },
  Refunded: { tone: 'info', icon: RotateCcw },
  // Claim & Payout statuses
  Open: { tone: 'warning', icon: AlertTriangle },
  'Under Review': { tone: 'warning', icon: Clock },
  Settled: { tone: 'success', icon: CheckCircle2 },
  Denied: { tone: 'danger', icon: XCircle },
  Unpaid: { tone: 'neutral', icon: Clock },
  'Pending Approval': { tone: 'warning', icon: Clock },
  'Partially Paid': { tone: 'info', icon: CheckCircle2 },
  'Paid in Full': { tone: 'success', icon: CheckCircle2 },
  Paid: { tone: 'success', icon: CheckCircle2 },
  Accrued: { tone: 'info', icon: Clock },
  'Held (KYB)': { tone: 'warning', icon: ShieldAlert },
  // Ledger & Reconciliation
  Posted: { tone: 'success', icon: CheckCircle2 },
  Reversed: { tone: 'neutral', icon: RotateCcw },
  Matched: { tone: 'success', icon: CheckCircle2 },
  Mismatched: { tone: 'danger', icon: AlertTriangle },
  Unmatched: { tone: 'warning', icon: AlertTriangle },
  Verified: { tone: 'success', icon: CheckCircle2 },
  'Open Break': { tone: 'danger', icon: AlertTriangle },
  Investigating: { tone: 'warning', icon: Clock },
  'Resolved via Adjustment': { tone: 'success', icon: CheckCircle2 },
  Applied: { tone: 'success', icon: CheckCircle2 },
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
  info: 'text-sky-700',
  neutral: 'text-slate-600',
};

export function StatusIndicator({ status }: { status: string }) {
  const entry = TONE_MAP[status] || { tone: 'neutral' as StatusTone, icon: Clock };
  const Icon = entry.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[entry.tone]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
