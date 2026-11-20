import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { roles, sessions, users } from '../../db/schema.ts';
import {
  AuthRequest,
  SESSION_COOKIE_NAME,
  getFullUserById,
  hashSessionToken,
  requireAuth,
} from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';
import { ensureSeeded } from '../seed.ts';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(2).max(120),
  password: z.string().min(4).max(128),
});

router.get('/demo-accounts', async (_req, res) => {
  try {
    await ensureSeeded();
    const rows = await db
      .select({
        username: users.username,
        email: users.email,
        fullName: users.fullName,
        roleName: roles.name,
        roleSlug: roles.slug,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.isDemoAccount, true));

    res.json({ accounts: rows });
  } catch (error) {
    console.error('Failed to list demo accounts:', error);
    res.status(500).json({ error: 'Unable to load demo directory.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    await ensureSeeded();
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please provide valid username/email and password.' });
    }

    const { identifier, password } = parsed.data;
    const foundUsers = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
      .limit(1);

    const userRow = foundUsers[0];
    if (!userRow || !userRow.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    if (!userRow.isActive) {
      return res.status(403).json({ error: 'This staff account is deactivated. Contact System Admin.' });
    }

    const valid = await bcrypt.compare(password, userRow.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12); // 12 hours

    await db.insert(sessions).values({
      tokenHash,
      userId: userRow.id,
      expiresAt,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userRow.id));

    const fullUser = await getFullUserById(userRow.id);
    if (!fullUser) {
      return res.status(403).json({ error: 'User profile could not be loaded.' });
    }

    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || req.protocol === 'https',
      sameSite: 'none',
      expires: expiresAt,
      path: '/',
    });

    await recordAuditLog({
      userId: fullUser.id,
      userName: fullUser.fullName,
      userRole: fullUser.roleName,
      action: 'LOGIN_CREDENTIALS',
      module: 'Authentication',
      entityType: 'user',
      entityId: fullUser.id,
      details: `Staff sign-in (${fullUser.username || fullUser.email})`,
      ipAddress: req.ip,
    });

    res.json({ user: fullUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication service error.' });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: req.authUser });
});

router.post('/firebase-sync', requireAuth, async (req: AuthRequest, res) => {
  if (req.authUser) {
    await recordAuditLog({
      userId: req.authUser.id,
      userName: req.authUser.fullName,
      userRole: req.authUser.roleName,
      action: 'LOGIN_GOOGLE',
      module: 'Authentication',
      entityType: 'user',
      entityId: req.authUser.id,
      details: `Google OAuth sign-in (${req.authUser.email})`,
      ipAddress: req.ip,
    });
  }
  res.json({ user: req.authUser });
});

router.post('/logout', async (req: AuthRequest, res) => {
  try {
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawCookie && typeof rawCookie === 'string') {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(rawCookie)));
    }
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || req.protocol === 'https',
      sameSite: 'none',
      path: '/',
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed.' });
  }
});

export default router;
