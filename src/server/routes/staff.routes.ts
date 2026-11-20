import { Router } from 'express';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { appointments, departments, patients, staffProfiles } from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const staffSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  staffType: z.enum(['Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Receptionist', 'Accountant', 'Administrator']),
  specialization: z.string().trim().max(150).optional().default(''),
  licenseNumber: z.string().trim().max(80).optional().default(''),
  departmentId: z.number().int().positive().nullable().optional(),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().optional().or(z.literal('')),
  availabilityStatus: z.enum(['Available', 'On Duty', 'In Consultation', 'On Leave', 'Off Duty']).optional().default('Available'),
  dutySchedule: z.string().trim().max(120).optional().default('Mon-Fri 07:30-16:30'),
  consultationFeeMwk: z.number().int().min(0).optional().default(15000),
});

router.get('/', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: staffProfiles.id,
        userId: staffProfiles.userId,
        staffNumber: staffProfiles.staffNumber,
        fullName: staffProfiles.fullName,
        staffType: staffProfiles.staffType,
        specialization: staffProfiles.specialization,
        licenseNumber: staffProfiles.licenseNumber,
        departmentId: staffProfiles.departmentId,
        departmentName: departments.name,
        phone: staffProfiles.phone,
        email: staffProfiles.email,
        availabilityStatus: staffProfiles.availabilityStatus,
        dutySchedule: staffProfiles.dutySchedule,
        consultationFeeMwk: staffProfiles.consultationFeeMwk,
        isActive: staffProfiles.isActive,
        createdAt: staffProfiles.createdAt,
      })
      .from(staffProfiles)
      .leftJoin(departments, eq(staffProfiles.departmentId, departments.id))
      .orderBy(staffProfiles.staffType, staffProfiles.fullName);

    const deptRows = await db.select().from(departments).orderBy(departments.name);
    res.json({ staff: rows, departments: deptRows });
  } catch (error) {
    console.error('List staff error:', error);
    res.status(500).json({ error: 'Failed to load staff directory.' });
  }
});

router.get('/:id/schedule', requireAuth, async (req: AuthRequest, res) => {
  try {
    const doctorId = Number(req.params.id);
    const appts = await db
      .select({
        id: appointments.id,
        appointmentNumber: appointments.appointmentNumber,
        appointmentDate: appointments.appointmentDate,
        appointmentTime: appointments.appointmentTime,
        status: appointments.status,
        reason: appointments.reason,
        patientName: patients.fullName,
        patientNumber: patients.patientNumber,
      })
      .from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .where(eq(appointments.doctorId, doctorId))
      .orderBy(desc(appointments.appointmentDate), appointments.appointmentTime);

    res.json({ schedule: appts });
  } catch (error) {
    console.error('Doctor schedule error:', error);
    res.status(500).json({ error: 'Failed to load doctor appointment schedule.' });
  }
});

router.post('/', requireAuth, requirePermission('staff:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = staffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid staff registration details.' });
    }

    const [{ value: total }] = await db.select({ value: count() }).from(staffProfiles);
    const prefix = parsed.data.staffType === 'Doctor' ? 'DOC' : 'STF';
    const staffNumber = `SC-${prefix}-${String(Number(total) + 1).padStart(3, '0')}-${Math.floor(10 + Math.random() * 89)}`;

    const [created] = await db
      .insert(staffProfiles)
      .values({
        ...parsed.data,
        email: parsed.data.email || null,
        departmentId: parsed.data.departmentId ?? null,
        staffNumber,
      })
      .returning();

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'CREATE_STAFF',
      module: 'Staff',
      entityType: 'staff_profile',
      entityId: created.id,
      details: `Added ${created.staffType}: ${created.fullName} (${created.staffNumber})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ staff: created });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ error: 'Failed to register staff member.' });
  }
});

router.patch('/:id', requireAuth, requirePermission('staff:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = staffSchema.partial().safeParse(req.body);
    if (!parsed.success || !Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid staff update payload.' });
    }

    const [updated] = await db
      .update(staffProfiles)
      .set(parsed.data)
      .where(eq(staffProfiles.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Staff profile not found.' });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'UPDATE_STAFF',
      module: 'Staff',
      entityType: 'staff_profile',
      entityId: updated.id,
      details: `Updated ${updated.fullName} status/schedule`,
      ipAddress: req.ip,
    });

    res.json({ staff: updated });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ error: 'Failed to update staff record.' });
  }
});

export default router;
