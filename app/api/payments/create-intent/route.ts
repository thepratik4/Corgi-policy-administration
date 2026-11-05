import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '../../../../lib/serverAuth';
import {
  getDbState,
  hydrateStateFromSupabaseIfAvailable,
  recordPaymentIntentCreatedInDb,
} from '../../../../lib/serverDatabase';
import {
  createStripePaymentIntent,
  generateStripeWebhookSignature,
} from '../../../../lib/stripeService';
import { dollarsToCents } from '../../../../utils/financialRules';

const CreatePaymentIntentSchema = z.object({
  policyId: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.string().min(2).default('Visa •••• 4242 (Stripe Test Card)'),
  idempotencyKey: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = CreatePaymentIntentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid PaymentIntent request payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await hydrateStateFromSupabaseIfAvailable();
    const db = getDbState();
    const policy = db.policies.find(
      (p) => p.id === parsed.data.policyId || p.policyNumber === parsed.data.policyId
    );
    if (!policy) {
      return NextResponse.json({ error: 'Target policy not found.' }, { status: 404 });
    }

    const amountCents = dollarsToCents(parsed.data.amount);
    const idempotencyKey =
      parsed.data.idempotencyKey || `idem_${policy.id}_${amountCents}_${Date.now()}`;

    const stripeIntent = await createStripePaymentIntent({
      amountCents,
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      customerName: policy.customerName,
      idempotencyKey,
      confirmImmediatelyWithTestCard: true,
    });

    // Record payment in Pending state — never settle payment or post cash on button click!
    const payment = await recordPaymentIntentCreatedInDb({
      policyId: policy.id,
      amountCents,
      paymentMethod: parsed.data.paymentMethod,
      stripePaymentIntentId: stripeIntent.paymentIntentId,
      idempotencyKey,
      actor: auth.user,
    });

    // Prepare a cryptographically signed webhook payload for `payment_intent.succeeded`
    const webhookEventPayload = JSON.stringify({
      id: `evt_3QTest_${stripeIntent.paymentIntentId.slice(-12)}`,
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: stripeIntent.paymentIntentId,
          amount: amountCents,
          currency: 'usd',
          metadata: {
            policyId: policy.id,
            policyNumber: policy.policyNumber,
            customerName: policy.customerName,
          },
        },
      },
    });
    const signatureHeader = generateStripeWebhookSignature(webhookEventPayload);

    return NextResponse.json(
      {
        payment,
        stripeIntent,
        signedWebhookDispatch: {
          rawBody: webhookEventPayload,
          signatureHeader,
        },
        state: getDbState(),
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create Stripe PaymentIntent.' },
      { status: 422 }
    );
  }
}
