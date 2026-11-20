import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  auditLogs,
  departments,
  hospitalServices,
  hospitalSettings,
  patients,
  permissions,
  rolePermissions,
  roles,
  users,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

router.get('/hospital', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const [settings] = await db.select().from(hospitalSettings).limit(1);
    const deptRows = await db.select().from(departments).orderBy(departments.name);
    const serviceRows = await db.select().from(hospitalServices).orderBy(hospitalServices.category);
    res.json({ settings, departments: deptRows, services: serviceRows });
  } catch (error) {
    console.error('Get hospital settings error:', error);
    res.status(500).json({ error: 'Failed to load hospital configuration.' });
  }
});

router.put('/hospital', requireAuth, requirePermission('settings:hospital'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      hospitalName: z.string().trim().min(2).max(160),
      tagline: z.string().trim().max(240),
      phone: z.string().trim().min(5).max(50),
      email: z.string().trim().email(),
      address: z.string().trim().min(3).max(250),
      city: z.string().trim().min(2).max(100),
      country: z.string().trim().min(2).max(100),
      taxNumber: z.string().trim().max(80).optional().default(''),
      backupSchedule: z.string().trim().max(120).optional().default('Daily at 02:00 CAT'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid hospital settings input.' });

    const [existing] = await db.select().from(hospitalSettings).limit(1);
    const [updated] = existing
      ? await db
          .update(hospitalSettings)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(hospitalSettings.id, existing.id))
          .returning()
      : await db.insert(hospitalSettings).values(parsed.data).returning();

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'UPDATE_HOSPITAL_SETTINGS',
      module: 'Settings',
      details: `Updated hospital profile: ${updated.hospitalName}`,
      ipAddress: req.ip,
    });

    res.json({ settings: updated });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to save hospital settings.' });
  }
});

router.post('/departments', requireAuth, requirePermission('settings:hospital'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2).max(120),
      code: z.string().trim().min(2).max(12).toUpperCase(),
      headDoctorName: z.string().trim().max(120).optional().default(''),
      consultationFeeMwk: z.number().int().min(0),
      description: z.string().trim().max(300).optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid department details.' });
    const [created] = await db.insert(departments).values(parsed.data).returning();
    res.status(201).json({ department: created });
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ error: 'Failed to create department (name/code may already exist).' });
  }
});

router.post('/services', requireAuth, requirePermission('settings:hospital'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2).max(160),
      category: z.string().trim().min(2).max(80),
      departmentId: z.number().int().positive().nullable().optional(),
      priceMwk: z.number().int().min(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid service details.' });
    const [created] = await db
      .insert(hospitalServices)
      .values({ ...parsed.data, departmentId: parsed.data.departmentId ?? null })
      .returning();
    res.status(201).json({ service: created });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Failed to create hospital service.' });
  }
});

router.get('/users-roles', requireAuth, requirePermission('settings:manage'), async (_req: AuthRequest, res) => {
  try {
    const [userRows, roleRows, permRows, rpRows, auditRows] = await Promise.all([
      db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          fullName: users.fullName,
          roleId: users.roleId,
          roleName: roles.name,
          roleSlug: roles.slug,
          departmentId: users.departmentId,
          departmentName: departments.name,
          phone: users.phone,
          isActive: users.isActive,
          isDemoAccount: users.isDemoAccount,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(roles, eq(users.roleId, roles.id))
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .orderBy(users.id),
      db.select().from(roles).orderBy(roles.id),
      db.select().from(permissions).orderBy(permissions.module, permissions.code),
      db.select().from(rolePermissions),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100),
    ]);

    res.json({
      users: userRows,
      roles: roleRows,
      permissions: permRows,
      rolePermissions: rpRows,
      auditLogs: auditRows,
    });
  } catch (error) {
    console.error('Load admin settings error:', error);
    res.status(500).json({ error: 'Failed to load user and role governance data.' });
  }
});

router.post('/users', requireAuth, requirePermission('settings:manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      username: z.string().trim().min(3).max(60),
      email: z.string().trim().email(),
      password: z.string().min(6).max(128),
      fullName: z.string().trim().min(2).max(150),
      roleId: z.number().int().positive(),
      departmentId: z.number().int().positive().nullable().optional(),
      phone: z.string().trim().max(40).optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid user account data.' });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const uid = `staff-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`;

    const [created] = await db
      .insert(users)
      .values({
        uid,
        username: parsed.data.username,
        email: parsed.data.email,
        passwordHash,
        fullName: parsed.data.fullName,
        roleId: parsed.data.roleId,
        departmentId: parsed.data.departmentId ?? null,
        phone: parsed.data.phone,
        isActive: true,
        isDemoAccount: false,
      })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        fullName: users.fullName,
        roleId: users.roleId,
      });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'CREATE_USER',
      module: 'Settings',
      entityType: 'user',
      entityId: created.id,
      details: `Provisioned user ${created.username} (${created.email})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ user: created });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user (username or email may already exist).' });
  }
});

router.patch('/users/:id', requireAuth, requirePermission('settings:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      roleId: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
      departmentId: z.number().int().positive().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success || !Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid user update request.' });
    }

    const [updated] = await db.update(users).set(parsed.data).where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ error: 'User not found.' });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'UPDATE_USER_ACCESS',
      module: 'Settings',
      entityType: 'user',
      entityId: id,
      details: `Updated access/role for ${updated.fullName}`,
      ipAddress: req.ip,
    });

    res.json({ user: updated });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

router.get('/backup', requireAuth, requirePermission('settings:manage'), async (req: AuthRequest, res) => {
  try {
    const [settingsRows, deptRows, patientRows] = await Promise.all([
      db.select().from(hospitalSettings),
      db.select().from(departments),
      db.select().from(patients),
    ]);

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'EXPORT_DATABASE_BACKUP',
      module: 'Settings',
      details: 'Generated encrypted-ready hospital JSON snapshot backup',
      ipAddress: req.ip,
    });

    res.json({
      exportedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      counts: {
        departments: deptRows.length,
        patients: patientRows.length,
      },
      snapshot: {
        hospitalSettings: settingsRows,
        departments: deptRows,
        patients: patientRows,
      },
    });
  } catch (error) {
    console.error('Backup export error:', error);
    res.status(500).json({ error: 'Backup generation failed.' });
  }
});

export default router;
