'use client';

import React, { useState } from 'react';
import { usePolicyAdmin } from '../../services/policyAdminStore';
import { ApprovalRequest } from '../../types/domain';
import { canUserDecideApproval } from '../../utils/financialRules';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  CheckCircle2,
  XCircle,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';

export function ApprovalsView() {
  const {
    currentUser,
    approvalRequests,
    decideApprovalRequest,
    switchRole,
  } = usePolicyAdmin();

  const [decisionTarget, setDecisionTarget] = useState<{
    request: ApprovalRequest;
    decision: 'Approved' | 'Rejected';
  } | null>(null);

  const pendingRequests = approvalRequests.filter((r) => r.status === 'Pending');
  const historyRequests = approvalRequests.filter((r) => r.status !== 'Pending');

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Dual-Control Treasury & Underwriting Governance"
        title="Approval Queue"
        subtitle="Enforces four-eyes separation of duties on high-value claim payouts, policy refunds, and ledger reclassifications. Initiators can never approve their own requests."
      />

      {/* Active Session Role Context Banner */}
      {currentUser && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-[#EA580C] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Signed in as {currentUser.name} ({currentUser.email}) — {currentUser.roleLabel}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {currentUser.role === 'OPERATIONS_ADMIN'
                  ? 'Operations Admins can initiate requests but cannot approve items. Switch to Finance Approver (Sarah Chen, CPA) to authorize requests initiated by Alex Rivera.'
                  : 'As Finance Approver, you can approve or reject requests initiated by other team members. Self-initiated requests remain locked.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              switchRole(
                currentUser.role === 'OPERATIONS_ADMIN'
                  ? 'FINANCE_APPROVER'
                  : 'OPERATIONS_ADMIN'
              )
            }
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
          >
            Switch to{' '}
            {currentUser.role === 'OPERATIONS_ADMIN'
              ? 'Finance Approver (Sarah Chen)'
              : 'Operations Admin (Alex Rivera)'}
          </button>
        </div>
      )}

      {/* Pending Financial Actions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 font-display">
            Pending Financial Actions ({pendingRequests.length})
          </h2>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {pendingRequests.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              All pending approval requests have been processed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Request #</th>
                    <th className="py-3 px-4">Action Type & Target</th>
                    <th className="py-3 px-4">Initiator</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Justification</th>
                    <th className="py-3 px-4 text-right">Decision Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {pendingRequests.map((req) => {
                    const check = currentUser
                      ? canUserDecideApproval(currentUser, req)
                      : { allowed: false, reason: 'Not signed in' };
                    const isSelfRequest =
                      currentUser?.email.toLowerCase() === req.initiatorEmail.toLowerCase();

                    return (
                      <tr key={req.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {req.referenceNumber}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-900">{req.actionType}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {req.targetReference} · {req.customerName}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <p className="font-medium text-slate-900">{req.initiatorName}</p>
                          <p className="text-[11px] font-mono text-slate-500">{req.initiatorEmail}</p>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {formatDateTime(req.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(req.amount, true)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                          {req.reason}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {check.allowed ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setDecisionTarget({ request: req, decision: 'Approved' })
                                }
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg inline-flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDecisionTarget({ request: req, decision: 'Rejected' })
                                }
                                className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg inline-flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>
                                  {isSelfRequest
                                    ? 'Self-Approval Blocked (Initiator)'
                                    : 'Requires Finance Approver Role'}
                                </span>
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Approval History */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 font-display">
          Completed Approval History ({historyRequests.length})
        </h2>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Request #</th>
                  <th className="py-3 px-4">Action Type</th>
                  <th className="py-3 px-4">Target Entity</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Initiator</th>
                  <th className="py-3 px-4">Decided By</th>
                  <th className="py-3 px-4">Decision Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {historyRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {req.referenceNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {req.actionType}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {req.targetReference} · {req.customerName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(req.amount, true)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{req.initiatorName}</td>
                    <td className="py-3 px-4 text-slate-800 font-medium">
                      {req.decidedByName || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {req.decidedAt ? formatDateTime(req.decidedAt) : '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusIndicator status={req.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Approve / Reject Confirmation Dialog */}
      {decisionTarget && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDecisionTarget(null)}
          onConfirm={(note) => {
            decideApprovalRequest(
              decisionTarget.request.id,
              decisionTarget.decision,
              note
            );
            setDecisionTarget(null);
          }}
          title={`${decisionTarget.decision === 'Approved' ? 'Approve' : 'Reject'} Request ${decisionTarget.request.referenceNumber}`}
          description={
            decisionTarget.decision === 'Approved'
              ? 'Approving this request authorizes immediate financial execution and records your sign-off in the immutable audit log.'
              : 'Rejecting this request cancels the proposed financial action and notifies the initiating operations administrator.'
          }
          confirmLabel={
            decisionTarget.decision === 'Approved'
              ? 'Authorize & Approve'
              : 'Confirm Rejection'
          }
          variant={decisionTarget.decision === 'Approved' ? 'primary' : 'danger'}
          defaultReason={
            decisionTarget.decision === 'Approved'
              ? 'Verified supporting documentation and subledger balance.'
              : 'Insufficient supporting documentation.'
          }
          financialSummary={[
            { label: 'Action Type', value: decisionTarget.request.actionType },
            { label: 'Target Reference', value: decisionTarget.request.targetReference },
            { label: 'Initiated By', value: `${decisionTarget.request.initiatorName} (${decisionTarget.request.initiatorEmail})` },
            { label: 'Amount', value: formatCurrency(decisionTarget.request.amount, true) },
          ]}
        />
      )}
    </div>
  );
}
