import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DEMO_USERS } from '../../../../mocks/seedData';
import { authenticateRequest, signServerJwt } from '../../../../lib/serverAuth';
import {
  getDbState,
  hydrateStateFromSupabaseIfAvailable,
} from '../../../../lib/serverDatabase';

const SessionRequestSchema = z.object({
  role: z.enum(['OPERATIONS_ADMIN', 'FINANCE_APPROVER']).optional(),
  email: z.string().email().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json(
      { authenticated: false, error: auth.error || 'Unauthorized' },
      { status: 401 }
    );
  }
  return NextResponse.json({
    authenticated: true,
    user: auth.user,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid authentication request payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await hydrateStateFromSupabaseIfAvailable();
    const db = getDbState();
    const targetRole = parsed.data.role || 'OPERATIONS_ADMIN';
    const user =
      (parsed.data.email
        ? db.users.find((u) => u.email.toLowerCase() === parsed.data.email!.toLowerCase())
        : db.users.find((u) => u.role === targetRole)) ||
      DEMO_USERS[targetRole] ||
      DEMO_USERS.OPERATIONS_ADMIN;

    const token = signServerJwt(user);

    return NextResponse.json({
      authenticated: true,
      user,
      token,
      expiresIn: 86400,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Authentication failed.' },
      { status: 500 }
    );
  }
}
