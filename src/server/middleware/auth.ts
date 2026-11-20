import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { departments, roles, sessions, users } from '../../db/schema.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { roleHasPermission } from '../../lib/roles-config.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  username: string | null;
  email: string;
  fullName: string;
  roleId: number | null;
  roleName: string;
  roleSlug: string;
  departmentId: number | null;
  departmentName: string | null;
  isDemoAccount: boolean;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

export const SESSION_COOKIE_NAME = 'smartcare_session';

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function getFullUserById(userId: number): Promise<AuthenticatedUser | null> {
  const rows = await db
    .select({
      id: users.id,
      uid: users.uid,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      roleId: users.roleId,
      roleName: roles.name,
      roleSlug: roles.slug,
      departmentId: users.departmentId,
      departmentName: departments.name,
      isActive: users.isActive,
      isDemoAccount: users.isDemoAccount,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;

  return {
    id: row.id,
    uid: row.uid,
    username: row.username,
    email: row.email,
    fullName: row.fullName,
    roleId: row.roleId,
    roleName: row.roleName ?? 'System Administrator',
    roleSlug: row.roleSlug ?? 'system_admin',
    departmentId: row.departmentId,
    departmentName: row.departmentName ?? null,
    isDemoAccount: row.isDemoAccount,
  };
}

export async function upsertFirebaseUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<AuthenticatedUser | null> {
  // Check if user already exists by uid or email
  const existingByUid = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.uid, uid))
    .limit(1);

  if (existingByUid[0]) {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, existingByUid[0].id));
    return getFullUserById(existingByUid[0].id);
  }

  const existingByEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingByEmail[0]) {
    await db
      .update(users)
      .set({ uid, lastLoginAt: new Date() })
      .where(eq(users.id, existingByEmail[0].id));
    return getFullUserById(existingByEmail[0].id);
  }

  // First-time Google Sign-In user: if first non-demo user, assign System Administrator, else Receptionist
  const allRoles = await db.select().from(roles);
  const adminRole = allRoles.find((r) => r.slug === 'system_admin');
  const receptionistRole = allRoles.find((r) => r.slug === 'receptionist');
  const existingRealUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isDemoAccount, false))
    .limit(1);

  const assignedRole = existingRealUsers.length === 0 ? adminRole : (receptionistRole ?? adminRole);

  const inserted = await db
    .insert(users)
    .values({
      uid,
      email,
      fullName: displayName || email.split('@')[0],
      roleId: assignedRole?.id ?? null,
      isActive: true,
      isDemoAccount: false,
      lastLoginAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: { email, lastLoginAt: new Date() },
    })
    .returning();

  return getFullUserById(inserted[0].id);
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // 1. Check Bearer Firebase ID Token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      if (token) {
        const decoded = await adminAuth.verifyIdToken(token);
        const user = await upsertFirebaseUser(
          decoded.uid,
          decoded.email || `${decoded.uid}@smartcarehms.mw`,
          decoded.name
        );
        if (!user) {
          return res.status(403).json({ error: 'Account is disabled or unavailable.' });
        }
        req.authUser = user;
        return next();
      }
    }

    // 2. Check secure httpOnly session cookie
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawCookie && typeof rawCookie === 'string') {
      const tokenHash = hashSessionToken(rawCookie);
      const sessionRows = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
        .limit(1);

      if (sessionRows[0]) {
        const user = await getFullUserById(sessionRows[0].userId);
        if (user) {
          req.authUser = user;
          return next();
        }
      }
    }

    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication credentials.' });
  }
};

export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roleHasPermission(req.authUser.roleSlug, permission)) {
      return res.status(403).json({
        error: `Access denied. Role "${req.authUser.roleName}" lacks permission "${permission}".`,
      });
    }
    next();
  };
}
