import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '../../../../lib/serverAuth';
import {
  getDbState,
  hydrateStateFromSupabaseIfAvailable,
  processVerifiedStripeWebhookInDb,
} from '../../../../lib/serverDatabase';
import { createStripeRefund } from '../../../../lib/stripeService';
import { dollarsToCents } from '../../../../utils/financialRules';

const RefundPaymentSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().min(2),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = RefundPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid refund payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await hydrateStateFromSupabaseIfAvailable();
    const db = getDbState();
    const payment = db.payments.find(
      (p) => p.id === parsed.data.paymentId || p.stripePaymentIntentId === parsed.data.paymentId
    );
    if (!payment) {
      return NextResponse.json({ error: 'Payment record not found.' }, { status: 404 });
    }
    if (payment.status !== 'Succeeded') {
      return NextResponse.json(
        { error: `Only Succeeded payments can be refunded (current status: ${payment.status}).` },
        { status: 422 }
      );
    }

    const amountCents = dollarsToCents(payment.amount);
    const stripeRefund = await createStripeRefund({
      paymentIntentId: payment.stripePaymentIntentId,
      amountCents,
      reason: parsed.data.reason,
      idempotencyKey: `refund_${payment.stripePaymentIntentId}`,
    });

    if (
      stripeRefund.error ||
      (stripeRefund.status !== 'succeeded' && stripeRefund.status !== 'pending')
    ) {
      return NextResponse.json(
        { error: stripeRefund.error || `Stripe refund failed with status: ${stripeRefund.status}` },
        { status: 422 }
      );
    }

    const webhookResult = await processVerifiedStripeWebhookInDb({
      stripeEventId: `evt_refund_${stripeRefund.refundId.slice(-10)}`,
      eventType: 'charge.refunded',
      paymentIntentId: payment.stripePaymentIntentId,
      amountCents,
      actor: auth.user,
    });

    webhookResult.payment.refundReason = parsed.data.reason;

    return NextResponse.json({
      stripeRefund,
      payment: webhookResult.payment,
      journalEntries: webhookResult.journalEntries,
      state: getDbState(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stripe refund failed.' },
      { status: 422 }
    );
  }
}
