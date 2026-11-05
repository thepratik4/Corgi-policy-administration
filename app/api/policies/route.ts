import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '../../../lib/serverAuth';
import {
  bindExistingPolicyInDb,
  cancelPolicyInDb,
  createEndorsementInDb,
  getDbState,
  issuePolicyInDb,
} from '../../../lib/serverDatabase';

const IssuePolicySchema = z.object({
  customerName: z.string().min(2, 'Customer legal name is required'),
  customerIndustry: z.string().min(2),
  customerEin: z.string().min(4),
  customerAddress: z.string().min(4),
  brokerId: z.string().min(1),
  lineOfBusiness: z.enum([
    'Commercial General Liability',
    'Cyber & Tech E&O',
    'Commercial Property',
    'Workers Compensation',
    'Directors & Officers',
  ]),
  writtenPremium: z.number().positive(),
  aggregateCoverageLimit: z.number().positive(),
  perOccurrenceLimit: z.number().positive(),
  deductible: z.number().nonnegative(),
  effectiveDate: z.string().min(8),
  expirationDate: z.string().min(8),
});

const PolicyMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('BIND'),
    policyId: z.string().min(1),
  }),
  z.object({
    action: z.literal('ENDORSE'),
    policyId: z.string().min(1),
    effectiveDate: z.string().min(8),
    description: z.string().min(2),
    premiumDelta: z.number(),
  }),
  z.object({
    action: z.literal('CANCEL'),
    policyId: z.string().min(1),
    reason: z.string().min(2),
  }),
]);

export async function GET() {
  const state = getDbState();
  return NextResponse.json({
    policies: state.policies,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = IssuePolicySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid policy issuance payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await issuePolicyInDb({
      customerName: parsed.data.customerName,
      customerIndustry: parsed.data.customerIndustry,
      customerEin: parsed.data.customerEin,
      customerAddress: parsed.data.customerAddress,
      brokerId: parsed.data.brokerId,
      lineOfBusiness: parsed.data.lineOfBusiness,
      writtenPremiumDollars: parsed.data.writtenPremium,
      aggregateCoverageLimitDollars: parsed.data.aggregateCoverageLimit,
      perOccurrenceLimitDollars: parsed.data.perOccurrenceLimit,
      deductibleDollars: parsed.data.deductible,
      effectiveDate: parsed.data.effectiveDate,
      expirationDate: parsed.data.expirationDate,
      actor: auth.user,
    });

    return NextResponse.json(
      {
        policy: result.policy,
        journalEntry: result.journalEntry,
        state: getDbState(),
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Policy issuance failed.' },
      { status: 422 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = PolicyMutationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid policy mutation payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'BIND') {
      const res = await bindExistingPolicyInDb({
        policyId: parsed.data.policyId,
        actor: auth.user,
      });
      return NextResponse.json({
        policy: res.policy,
        journalEntry: res.journalEntry,
        state: getDbState(),
      });
    }

    if (parsed.data.action === 'ENDORSE') {
      const res = await createEndorsementInDb({
        policyId: parsed.data.policyId,
        effectiveDate: parsed.data.effectiveDate,
        description: parsed.data.description,
        premiumDeltaDollars: parsed.data.premiumDelta,
        actor: auth.user,
      });
      return NextResponse.json({
        policy: res.policy,
        journalEntry: res.journalEntry,
        state: getDbState(),
      });
    }

    const cancelled = await cancelPolicyInDb({
      policyId: parsed.data.policyId,
      reason: parsed.data.reason,
      actor: auth.user,
    });
    return NextResponse.json({
      policy: cancelled,
      state: getDbState(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Policy action failed.' },
      { status: 422 }
    );
  }
}
