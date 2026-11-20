import { Router } from 'express';
import { and, count, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { appointments, departments, patients, staffProfiles } from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const createApptSchema = z.object({
  patientId: z.number().int().positive(),
  doctorId: z.number().int().positive(),
  departmentId: z.number().int().positive(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointmentTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(10).max(180).optional().default(30),
  reason: z.string().trim().min(2).max(500),
  notes: z.string().trim().max(500).optional().default(''),
});

const statusUpdateSchema = z.object({
  status: z.enum(['Scheduled', 'Confirmed', 'Checked in', 'Completed', 'Cancelled', 'No-show']),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  appointmentTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional(),
});

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function hasConflict(
  doctorId: number,
  appointmentDate: string,
  appointmentTime: string,
  durationMinutes: number,
  excludeId?: number
): Promise<boolean> {
  const existing = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorId, doctorId),
        eq(appointments.appointmentDate, appointmentDate),
        ne(appointments.status, 'Cancelled'),
        ne(appointments.status, 'No-show')
      )
    );

  const start = toMinutes(appointmentTime);
  const end = start + durationMinutes;

  for (const appt of existing) {
    if (excludeId && appt.id === excludeId) continue;
    const eStart = toMinutes(appt.appointmentTime);
    const eEnd = eStart + (appt.durationMinutes || 30);
    if (start < eEnd && end > eStart) {
      return true;
    }
  }
  return false;
}

router.get('/', requireAuth, requirePermission('appointments:read'), async (req: AuthRequest, res) => {
  try {
    const dateFilter = String(req.query.date || '').trim();
    const statusFilter = String(req.query.status || '').trim();
    const doctorFilter = Number(req.query.doctorId || 0);

    let rows = await db
      .select({
        id: appointments.id,
        appointmentNumber: appointments.appointmentNumber,
        patientId: appointments.patientId,
        patientName: patients.fullName,
        patientNumber: patients.patientNumber,
        patientPhone: patients.phone,
        doctorId: appointments.doctorId,
        doctorName: staffProfiles.fullName,
        departmentId: appointments.departmentId,
        departmentName: departments.name,
        appointmentDate: appointments.appointmentDate,
        appointmentTime: appointments.appointmentTime,
        durationMinutes: appointments.durationMinutes,
        reason: appointments.reason,
        status: appointments.status,
        attendanceRecordedAt: appointments.attendanceRecordedAt,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
      })
      .from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(staffProfiles, eq(appointments.doctorId, staffProfiles.id))
      .leftJoin(departments, eq(appointments.departmentId, departments.id))
      .orderBy(desc(appointments.appointmentDate), appointments.appointmentTime);

    if (dateFilter) {
      rows = rows.filter((r) => r.appointmentDate === dateFilter);
    }
    if (statusFilter && statusFilter !== 'All') {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (doctorFilter > 0) {
      rows = rows.filter((r) => r.doctorId === doctorFilter);
    }

    res.json({ appointments: rows });
  } catch (error) {
    console.error('List appointments error:', error);
    res.status(500).json({ error: 'Failed to load appointments.' });
  }
});

router.post('/', requireAuth, requirePermission('appointments:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = createApptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please complete all required appointment fields.' });
    }

    const data = parsed.data;
    const conflict = await hasConflict(
      data.doctorId,
      data.appointmentDate,
      data.appointmentTime,
      data.durationMinutes
    );

    if (conflict) {
      return res.status(409).json({
        error: 'Schedule conflict: Selected doctor already has an overlapping appointment at that date and time.',
      });
    }

    const [{ value: total }] = await db.select({ value: count() }).from(appointments);
    const apptNum = `APT-${new Date().getFullYear()}-${String(Number(total) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

    const [created] = await db
      .insert(appointments)
      .values({
        ...data,
        appointmentNumber: apptNum,
        status: 'Scheduled',
        createdByUserId: req.authUser?.id ?? null,
      })
      .returning();

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'BOOK_APPOINTMENT',
      module: 'Appointments',
      entityType: 'appointment',
      entityId: created.id,
      details: `Booked ${created.appointmentNumber} for ${data.appointmentDate} at ${data.appointmentTime}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ appointment: created });
  } catch (error) {
    console.error('Book appointment error:', error);
    res.status(500).json({ error: 'Failed to schedule appointment.' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success || !Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid appointment update request.' });
    }

    const [existing] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    const newDate = parsed.data.appointmentDate ?? existing.appointmentDate;
    const newTime = parsed.data.appointmentTime ?? existing.appointmentTime;

    if (
      (parsed.data.appointmentDate || parsed.data.appointmentTime) &&
      parsed.data.status !== 'Cancelled'
    ) {
      const conflict = await hasConflict(
        existing.doctorId,
        newDate,
        newTime,
        existing.durationMinutes,
        id
      );
      if (conflict) {
        return res.status(409).json({
          error: 'Reschedule conflict: Doctor has another appointment at that slot.',
        });
      }
    }

    const attendanceRecordedAt =
      parsed.data.status === 'Checked in' || parsed.data.status === 'Completed'
        ? existing.attendanceRecordedAt || new Date()
        : existing.attendanceRecordedAt;

    const [updated] = await db
      .update(appointments)
      .set({
        status: parsed.data.status,
        appointmentDate: newDate,
        appointmentTime: newTime,
        notes: parsed.data.notes ?? existing.notes,
        attendanceRecordedAt,
      })
      .where(eq(appointments.id, id))
      .returning();

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'UPDATE_APPOINTMENT',
      module: 'Appointments',
      entityType: 'appointment',
      entityId: updated.id,
      details: `Updated ${updated.appointmentNumber} to ${updated.status} (${newDate} ${newTime})`,
      ipAddress: req.ip,
    });

    res.json({ appointment: updated });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

export default router;
