import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '../../../lib/serverAuth';
import {
  getDbState,
  hydrateStateFromSupabaseIfAvailable,
  postBalancedJournalEntryInState,
  reverseAndRebookJournalInDb,
  runDbTransaction,
} from '../../../lib/serverDatabase';
import { dollarsToCents } from '../../../utils/financialRules';

const LedgerMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('POST_JOURNAL'),
    reference: z.string().min(1),
    referenceType: z.enum(['POLICY', 'PAYMENT', 'CLAIM_RESERVE', 'ENDORSEMENT', 'REVERSAL']),
    description: z.string().min(2),
    effectiveDate: z.string().optional(),
    lines: z
      .array(
        z.object({
          accountCode: z.string().min(2),
          accountName: z.string().min(2),
          debit: z.number().nonnegative(),
          credit: z.number().nonnegative(),
          memo: z.string().optional(),
        })
      )
      .min(2),
  }),
  z.object({
    action: z.literal('REVERSE_AND_REBOOK'),
    journalIdOrNumber: z.string().min(1),
    reason: z.string().min(2),
    rebookDescription: z.string().optional(),
    rebookLines: z
      .array(
        z.object({
          accountCode: z.string().min(2),
          accountName: z.string().min(2),
          debit: z.number().nonnegative(),
          credit: z.number().nonnegative(),
          memo: z.string().optional(),
        })
      )
      .optional(),
  }),
]);

export async function GET() {
  await hydrateStateFromSupabaseIfAvailable();
  const state = getDbState();
  return NextResponse.json({
    ledgerTransactions: state.ledgerTransactions,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = LedgerMutationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid ledger request payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.action === 'POST_JOURNAL') {
      const tx = await runDbTransaction((state) =>
        postBalancedJournalEntryInState(state, {
          reference: data.reference,
          referenceType: data.referenceType,
          description: data.description,
          effectiveDate: data.effectiveDate,
          actor: auth.user!,
          lines: data.lines.map((l) => ({
            accountCode: l.accountCode,
            accountName: l.accountName,
            debitCents: dollarsToCents(l.debit),
            creditCents: dollarsToCents(l.credit),
            memo: l.memo,
          })),
        })
      );

      return NextResponse.json(
        {
          journalEntry: tx,
          state: getDbState(),
        },
        { status: 201 }
      );
    }

    const revResult = await reverseAndRebookJournalInDb({
      journalIdOrNumber: data.journalIdOrNumber,
      reason: data.reason,
      actor: auth.user,
      rebookDescription: data.rebookDescription,
      rebookLines: data.rebookLines?.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        debitCents: dollarsToCents(l.debit),
        creditCents: dollarsToCents(l.credit),
        memo: l.memo,
      })),
    });

    return NextResponse.json({
      ...revResult,
      state: getDbState(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ledger mutation failed.' },
      { status: 422 }
    );
  }
}
