import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { DemoUser, UserRole } from '../types/domain';
import { DEMO_USERS } from '../mocks/seedData';

export interface VerifiedJwtClaims {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  department: string;
  avatarInitials: string;
  iat: number;
  exp: number;
  iss: string;
}

function getJwtSecret(): string {
  return (
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'corgi-track1-server-jwt-signing-secret-2026'
  );
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

/**
 * Signs a server-verified HS256 JWT token for an authenticated Corgi user.
 */
export function signServerJwt(user: DemoUser, expiresInSeconds = 86400): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: VerifiedJwtClaims = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    roleLabel: user.roleLabel,
    department: user.department,
    avatarInitials: user.avatarInitials,
    iat: now,
    exp: now + expiresInSeconds,
    iss: 'corgi-policy-admin-auth',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(signingInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${signingInput}.${encodedSignature}`;
}

/**
 * Verifies an HS256 JWT token or validates a Supabase Auth Bearer token via Supabase Auth API.
 */
export async function verifyJwtToken(token: string): Promise<VerifiedJwtClaims | null> {
  if (!token || typeof token !== 'string') return null;

  // 1. Verify HMAC-SHA256 signature locally first
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const [encodedHeader, encodedPayload, encodedSig] = parts;
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const expectedSig = base64UrlEncode(
        crypto.createHmac('sha256', getJwtSecret()).update(signingInput).digest()
      );

      if (
        encodedSig.length === expectedSig.length &&
        crypto.timingSafeEqual(Buffer.from(encodedSig), Buffer.from(expectedSig))
      ) {
        const claims = JSON.parse(base64UrlDecode(encodedPayload)) as VerifiedJwtClaims;
        const now = Math.floor(Date.now() / 1000);
        if (claims.exp && claims.exp < now) {
          return null;
        }
        return claims;
      }
    } catch {
      // Fall through to Supabase Auth verification if configured
    }
  }

  // 2. If Supabase URL and Anon Key are configured, verify token against Supabase Auth /auth/v1/user
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref')
  ) {
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      });
      if (res.ok) {
        const supaUser = await res.json();
        const email: string = supaUser.email || '';
        const role: UserRole =
          supaUser.app_metadata?.role === 'FINANCE_APPROVER' ||
          supaUser.user_metadata?.role === 'FINANCE_APPROVER' ||
          email.toLowerCase().includes('sarah.chen')
            ? 'FINANCE_APPROVER'
            : 'OPERATIONS_ADMIN';
        const demoList = Object.values(DEMO_USERS);
        const matchedDemo =
          demoList.find((u) => u.email.toLowerCase() === email.toLowerCase()) ||
          DEMO_USERS[role];
        const now = Math.floor(Date.now() / 1000);
        return {
          sub: supaUser.id || matchedDemo.id,
          email: email || matchedDemo.email,
          name: supaUser.user_metadata?.full_name || matchedDemo.name,
          role,
          roleLabel: matchedDemo.roleLabel,
          department: matchedDemo.department,
          avatarInitials: matchedDemo.avatarInitials,
          iat: now,
          exp: now + 3600,
          iss: 'supabase-auth',
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Extracts and verifies the authenticated user from a NextRequest Authorization header.
 */
export async function authenticateRequest(req: NextRequest): Promise<{
  authenticated: boolean;
  user?: DemoUser;
  error?: string;
}> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      error: 'Unauthorized: Missing Bearer JWT token in Authorization header.',
    };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const claims = await verifyJwtToken(token);
  if (!claims) {
    return {
      authenticated: false,
      error: 'Unauthorized: Invalid or expired JWT token.',
    };
  }

  return {
    authenticated: true,
    user: {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      role: claims.role,
      roleLabel: claims.roleLabel,
      department: claims.department,
      avatarInitials: claims.avatarInitials,
    },
  };
}

/**
 * Enforces Role-Based Access Control (RBAC) on backend API routes.
 */
export function authorizeRole(
  user: DemoUser,
  allowedRoles: UserRole[]
): { authorized: boolean; error?: string } {
  if (!allowedRoles.includes(user.role)) {
    return {
      authorized: false,
      error: `Forbidden: Role ${user.role} is not permitted for this operation. Required: ${allowedRoles.join(' or ')}.`,
    };
  }
  return { authorized: true };
}
