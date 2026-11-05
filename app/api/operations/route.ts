import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, authorizeRole } from '../../../lib/serverAuth';
import {
  adjustClaimReserveInDb,
  decideApprovalInDb,
  fileClaimInDb,
  getDbState,
  requestClaimPayoutInDb,
  updateBrokerKybInDb,
  updateReconciliationBreakInDb,
} from '../../../lib/serverDatabase';

const OperationsActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('UPDATE_BROKER_KYB'),
    brokerId: z.string().min(1),
    kybStatus: z.enum(['Approved', 'Pending', 'Failed']),
  }),
  z.object({
    action: z.literal('FILE_CLAIM'),
    policyId: z.string().min(1),
    lossDate: z.string().min(8),
    description: z.string().min(2),
    claimedAmount: z.number().positive(),
    initialReserve: z.number().positive(),
  }),
  z.object({
    action: z.literal('ADJUST_CLAIM_RESERVE'),
    claimId: z.string().min(1),
    newReserve: z.number().nonnegative(),
    reason: z.string().min(2),
  }),
  z.object({
    action: z.literal('REQUEST_CLAIM_PAYOUT'),
    claimId: z.string().min(1),
    amount: z.number().positive(),
    reason: z.string().min(2),
  }),
  z.object({
    action: z.literal('DECIDE_APPROVAL'),
    requestId: z.string().min(1),
    decision: z.enum(['Approved', 'Rejected']),
    note: z.string().min(2),
  }),
  z.object({
    action: z.literal('RESOLVE_RECONCILIATION_BREAK'),
    itemId: z.string().min(1),
    status: z.enum(['Verified', 'Open Break', 'Investigating', 'Resolved via Adjustment']),
    notes: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = OperationsActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid operations action payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.action === 'UPDATE_BROKER_KYB') {
      const broker = await updateBrokerKybInDb({
        brokerId: data.brokerId,
        kybStatus: data.kybStatus,
        actor: auth.user,
      });
      return NextResponse.json({ broker, state: getDbState() });
    }

    if (data.action === 'FILE_CLAIM') {
      const res = await fileClaimInDb({
        policyId: data.policyId,
        lossDate: data.lossDate,
        description: data.description,
        claimedAmountDollars: data.claimedAmount,
        initialReserveDollars: data.initialReserve,
        actor: auth.user,
      });
      return NextResponse.json({ ...res, state: getDbState() }, { status: 201 });
    }

    if (data.action === 'ADJUST_CLAIM_RESERVE') {
      const res = await adjustClaimReserveInDb({
        claimId: data.claimId,
        newReserveDollars: data.newReserve,
        reason: data.reason,
        actor: auth.user,
      });
      return NextResponse.json({ ...res, state: getDbState() });
    }

    if (data.action === 'REQUEST_CLAIM_PAYOUT') {
      const approval = await requestClaimPayoutInDb({
        claimId: data.claimId,
        amountDollars: data.amount,
        reason: data.reason,
        actor: auth.user,
      });
      return NextResponse.json({ approval, state: getDbState() }, { status: 201 });
    }

    if (data.action === 'DECIDE_APPROVAL') {
      const roleCheck = authorizeRole(auth.user, ['FINANCE_APPROVER']);
      if (!roleCheck.authorized) {
        return NextResponse.json({ error: roleCheck.error }, { status: 403 });
      }
      const approval = await decideApprovalInDb({
        requestId: data.requestId,
        decision: data.decision,
        note: data.note,
        actor: auth.user,
      });
      return NextResponse.json({ approval, state: getDbState() });
    }

    const item = await updateReconciliationBreakInDb({
      itemId: data.itemId,
      status: data.status,
      notes: data.notes,
      actor: auth.user,
    });
    return NextResponse.json({ item, state: getDbState() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Operations action failed.' },
      { status: 422 }
    );
  }
}
