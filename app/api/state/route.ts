import { NextRequest, NextResponse } from 'next/server';
import {
  getDbState,
  hydrateStateFromSupabaseIfAvailable,
  resetDatabaseToSeed,
} from '../../../lib/serverDatabase';

export async function GET() {
  await hydrateStateFromSupabaseIfAvailable();
  const state = getDbState();
  return NextResponse.json({
    state,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body?.action === 'RESET_SEED') {
      const state = resetDatabaseToSeed();
      return NextResponse.json({
        reset: true,
        state,
      });
    }
    return NextResponse.json({ error: 'Unsupported state action.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to process state action.' },
      { status: 500 }
    );
  }
}
