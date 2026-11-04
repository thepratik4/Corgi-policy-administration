import { NextRequest, NextResponse } from 'next/server';
import {
  getDbState,
  processVerifiedStripeWebhookInDb,
} from '../../../../lib/serverDatabase';
import {
  generateStripeWebhookSignature,
  verifyStripeWebhookSignature,
} from '../../../../lib/stripeService';

/**
 * Publicly accessible Stripe Webhook Endpoint (`POST /api/webhooks/stripe`).
 * - Verifies `Stripe-Signature` against the raw request body (`await req.text()`).
 * - Enforces idempotency using `stripe_event_id`.
 * - Handles duplicate and out-of-order events safely.
 * - Posts balanced double-entry journal entries ONLY when `payment_intent.succeeded` or `charge.refunded` is verified.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let signatureHeader = req.headers.get('stripe-signature');

    // Support internal signed test-webhook trigger header when dispatching from the Corgi Webhook Simulator UI
    if (!signatureHeader && req.headers.get('x-corgi-sign-test-webhook') === '1') {
      signatureHeader = generateStripeWebhookSignature(rawBody);
    }

    const verification = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader,
    });

    if (!verification.verified || !verification.event) {
      return NextResponse.json(
        {
          verified: false,
          error: verification.error || 'Webhook signature verification failed.',
        },
        { status: 400 }
      );
    }

    const evt = verification.event;
    const paymentIntentId =
      evt.data.object.payment_intent || evt.data.object.id;

    const result = processVerifiedStripeWebhookInDb({
      stripeEventId: evt.id,
      eventType: evt.type,
      paymentIntentId,
      amountCents: evt.data.object.amount,
    });

    return NextResponse.json({
      verified: true,
      outcome: result.outcome,
      duplicate: result.outcome === 'DUPLICATE_IGNORED',
      outOfOrder: result.outcome === 'OUT_OF_ORDER_IGNORED',
      webhookRecord: result.webhookRecord,
      payment: result.payment,
      journalEntries: result.journalEntries,
      reason: result.reason,
      state: getDbState(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook processing failed.' },
      { status: 422 }
    );
  }
}
