import { Router } from 'express';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  admissions,
  beds,
  invoiceItems,
  invoices,
  medicalRecords,
  patients,
  staffProfiles,
  wardObservations,
  wards,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const admitSchema = z.object({
  patientId: z.number().int().positive(),
  wardId: z.number().int().positive(),
  bedId: z.number().int().positive(),
  admittingDoctorId: z.number().int().positive(),
  admissionReason: z.string().trim().min(2).max(1000),
});

const dischargeSchema = z.object({
  dischargeSummary: z.string().trim().min(4).max(3000),
  dischargeCondition: z.string().trim().min(2).max(300),
  billWardStay: z.boolean().optional().default(true),
});

router.get('/', requireAuth, requirePermission('admissions:read'), async (_req: AuthRequest, res) => {
  try {
    const [wardRows, bedRows, admissionRows, obsRows] = await Promise.all([
      db.select().from(wards).orderBy(wards.name),
      db.select().from(beds).orderBy(beds.wardId, beds.bedNumber),
      db
        .select({
          id: admissions.id,
          admissionNumber: admissions.admissionNumber,
          patientId: admissions.patientId,
          patientName: patients.fullName,
          patientNumber: patients.patientNumber,
          wardId: admissions.wardId,
          wardName: wards.name,
          wardDailyRateMwk: wards.dailyRateMwk,
          bedId: admissions.bedId,
          bedNumber: beds.bedNumber,
          admittingDoctorId: admissions.admittingDoctorId,
          doctorName: staffProfiles.fullName,
          admissionDate: admissions.admissionDate,
          dischargeDate: admissions.dischargeDate,
          admissionReason: admissions.admissionReason,
          status: admissions.status,
          dischargeSummary: admissions.dischargeSummary,
          dischargeCondition: admissions.dischargeCondition,
        })
        .from(admissions)
        .leftJoin(patients, eq(admissions.patientId, patients.id))
        .leftJoin(wards, eq(admissions.wardId, wards.id))
        .leftJoin(beds, eq(admissions.bedId, beds.id))
        .leftJoin(staffProfiles, eq(admissions.admittingDoctorId, staffProfiles.id))
        .orderBy(desc(admissions.admissionDate)),
      db.select().from(wardObservations).orderBy(desc(wardObservations.observedAt)).limit(60),
    ]);

    res.json({
      wards: wardRows,
      beds: bedRows,
      admissions: admissionRows,
      observations: obsRows,
    });
  } catch (error) {
    console.error('List admissions error:', error);
    res.status(500).json({ error: 'Failed to load wards and admissions.' });
  }
});

router.post('/admit', requireAuth, requirePermission('admissions:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = admitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid admission payload.' });
    }
    const d = parsed.data;

    const [bed] = await db.select().from(beds).where(eq(beds.id, d.bedId)).limit(1);
    if (!bed || bed.wardId !== d.wardId) {
      return res.status(400).json({ error: 'Selected bed does not belong to selected ward.' });
    }
    if (bed.status === 'Occupied') {
      return res.status(409).json({ error: 'Selected bed is currently occupied.' });
    }

    const [{ value: total }] = await db.select({ value: count() }).from(admissions);
    const admNumber = `ADM-${new Date().getFullYear()}-${String(Number(total) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

    const [created] = await db
      .insert(admissions)
      .values({
        admissionNumber: admNumber,
        patientId: d.patientId,
        wardId: d.wardId,
        bedId: d.bedId,
        admittingDoctorId: d.admittingDoctorId,
        admissionReason: d.admissionReason,
        status: 'Admitted',
      })
      .returning();

    await db
      .update(beds)
      .set({ status: 'Occupied', currentAdmissionId: created.id })
      .where(eq(beds.id, d.bedId));

    await db.insert(medicalRecords).values({
      patientId: d.patientId,
      recordType: 'Admission',
      referenceId: created.id,
      summary: `Inpatient Admission (${admNumber}) · Bed ${bed.bedNumber}`,
      details: d.admissionReason,
      recordedByUserId: req.authUser?.id ?? null,
      recordedByName: req.authUser!.fullName,
    });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'ADMIT_PATIENT',
      module: 'Admissions',
      entityType: 'admission',
      entityId: created.id,
      details: `Admitted patient #${d.patientId} to bed ${bed.bedNumber} (${admNumber})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ admission: created });
  } catch (error) {
    console.error('Admit patient error:', error);
    res.status(500).json({ error: 'Failed to admit patient.' });
  }
});

router.post('/:id/discharge', requireAuth, requirePermission('admissions:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = dischargeSchema.safeParse(req.body);
    if (!parsed.success || !Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid discharge summary payload.' });
    }

    const [adm] = await db.select().from(admissions).where(eq(admissions.id, id)).limit(1);
    if (!adm || adm.status !== 'Admitted') {
      return res.status(404).json({ error: 'Active admission record not found.' });
    }

    const dischargeDate = new Date();
    const [updated] = await db
      .update(admissions)
      .set({
        status: 'Discharged',
        dischargeDate,
        dischargeSummary: parsed.data.dischargeSummary,
        dischargeCondition: parsed.data.dischargeCondition,
      })
      .where(eq(admissions.id, id))
      .returning();

    await db
      .update(beds)
      .set({ status: 'Available', currentAdmissionId: null })
      .where(eq(beds.id, adm.bedId));

    const [ward] = await db.select().from(wards).where(eq(wards.id, adm.wardId)).limit(1);

    if (parsed.data.billWardStay && ward) {
      const days = Math.max(
        1,
        Math.ceil((dischargeDate.getTime() - new Date(adm.admissionDate).getTime()) / (1000 * 60 * 60 * 24))
      );
      const totalMwk = days * ward.dailyRateMwk;
      const [{ value: invTotal }] = await db.select({ value: count() }).from(invoices);
      const invNum = `INV-${new Date().getFullYear()}-${String(Number(invTotal) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

      const [inv] = await db
        .insert(invoices)
        .values({
          invoiceNumber: invNum,
          patientId: adm.patientId,
          departmentId: ward.departmentId ?? null,
          totalAmountMwk: totalMwk,
          paidAmountMwk: 0,
          balanceMwk: totalMwk,
          status: 'Unpaid',
          dueDate: dischargeDate.toISOString().slice(0, 10),
          notes: `Inpatient stay charges for ${adm.admissionNumber} (${days} day(s))`,
          createdByUserId: req.authUser?.id ?? null,
        })
        .returning();

      await db.insert(invoiceItems).values({
        invoiceId: inv.id,
        category: 'Admission',
        description: `${ward.name} (${days} day(s) @ MWK ${ward.dailyRateMwk.toLocaleString()})`,
        quantity: days,
        unitPriceMwk: ward.dailyRateMwk,
        totalPriceMwk: totalMwk,
        referenceType: 'admission',
        referenceId: adm.id,
      });
    }

    await db.insert(medicalRecords).values({
      patientId: adm.patientId,
      recordType: 'Discharge',
      referenceId: adm.id,
      summary: `Discharged (${adm.admissionNumber}) · Condition: ${parsed.data.dischargeCondition}`,
      details: parsed.data.dischargeSummary,
      recordedByUserId: req.authUser?.id ?? null,
      recordedByName: req.authUser!.fullName,
    });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'DISCHARGE_PATIENT',
      module: 'Admissions',
      entityType: 'admission',
      entityId: adm.id,
      details: `Discharged ${adm.admissionNumber}`,
      ipAddress: req.ip,
    });

    res.json({ admission: updated });
  } catch (error) {
    console.error('Discharge error:', error);
    res.status(500).json({ error: 'Failed to discharge patient.' });
  }
});

router.patch('/beds/:id', requireAuth, requirePermission('admissions:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = z.enum(['Available', 'Reserved', 'Maintenance']).parse(req.body.status);
    const [updated] = await db
      .update(beds)
      .set({ status })
      .where(eq(beds.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Bed not found.' });
    res.json({ bed: updated });
  } catch (error) {
    console.error('Update bed error:', error);
    res.status(400).json({ error: 'Unable to update bed status.' });
  }
});

export default router;
