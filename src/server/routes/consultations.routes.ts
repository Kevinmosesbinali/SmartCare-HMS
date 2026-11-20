import { Router } from 'express';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  appointments,
  consultations,
  departments,
  diagnoses,
  invoiceItems,
  invoices,
  laboratoryRequests,
  laboratoryTests,
  medicalRecords,
  patients,
  prescriptionItems,
  prescriptions,
  staffProfiles,
  wardObservations,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const consultationSchema = z.object({
  patientId: z.number().int().positive(),
  doctorId: z.number().int().positive(),
  appointmentId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  chiefComplaints: z.string().trim().min(2).max(1500),
  symptoms: z.string().trim().max(1500).optional().default(''),
  vitalTempC: z.string().trim().max(20).optional().default(''),
  vitalBp: z.string().trim().max(25).optional().default(''),
  vitalPulseBpm: z.number().int().min(20).max(260).nullable().optional(),
  vitalRespRate: z.number().int().min(5).max(80).nullable().optional(),
  vitalSpo2: z.number().int().min(40).max(100).nullable().optional(),
  vitalWeightKg: z.string().trim().max(20).optional().default(''),
  clinicalNotes: z.string().trim().max(3000).optional().default(''),
  diagnosis: z.string().trim().min(2).max(500),
  icdCode: z.string().trim().max(40).optional().default(''),
  severity: z.enum(['Mild', 'Moderate', 'Severe', 'Critical']).optional().default('Moderate'),
  treatmentPlan: z.string().trim().max(2000).optional().default(''),
  followUpDate: z.string().trim().max(20).optional().default(''),
  prescriptionItems: z
    .array(
      z.object({
        medicineId: z.number().int().positive(),
        dosage: z.string().trim().min(1).max(80),
        frequency: z.string().trim().min(1).max(80),
        duration: z.string().trim().min(1).max(80),
        quantityPrescribed: z.number().int().positive(),
        instructions: z.string().trim().max(300).optional().default(''),
      })
    )
    .optional()
    .default([]),
  labTestIds: z.array(z.number().int().positive()).optional().default([]),
  autoCreateInvoice: z.boolean().optional().default(true),
});

const vitalsSchema = z.object({
  patientId: z.number().int().positive(),
  admissionId: z.number().int().positive().nullable().optional(),
  tempC: z.string().trim().max(20).optional().default(''),
  bloodPressure: z.string().trim().max(25).optional().default(''),
  pulseBpm: z.number().int().min(20).max(260).nullable().optional(),
  respiratoryRate: z.number().int().min(5).max(80).nullable().optional(),
  spo2: z.number().int().min(40).max(100).nullable().optional(),
  nursingNote: z.string().trim().min(2).max(1500),
});

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const patientId = Number(req.query.patientId || 0);
    const rows = await db
      .select({
        id: consultations.id,
        consultationNumber: consultations.consultationNumber,
        patientId: consultations.patientId,
        patientName: patients.fullName,
        patientNumber: patients.patientNumber,
        doctorId: consultations.doctorId,
        doctorName: staffProfiles.fullName,
        departmentName: departments.name,
        chiefComplaints: consultations.chiefComplaints,
        symptoms: consultations.symptoms,
        vitalTempC: consultations.vitalTempC,
        vitalBp: consultations.vitalBp,
        vitalPulseBpm: consultations.vitalPulseBpm,
        vitalRespRate: consultations.vitalRespRate,
        vitalSpo2: consultations.vitalSpo2,
        vitalWeightKg: consultations.vitalWeightKg,
        clinicalNotes: consultations.clinicalNotes,
        diagnosis: consultations.diagnosis,
        icdCode: consultations.icdCode,
        treatmentPlan: consultations.treatmentPlan,
        followUpDate: consultations.followUpDate,
        isLocked: consultations.isLocked,
        createdAt: consultations.createdAt,
      })
      .from(consultations)
      .leftJoin(patients, eq(consultations.patientId, patients.id))
      .leftJoin(staffProfiles, eq(consultations.doctorId, staffProfiles.id))
      .leftJoin(departments, eq(consultations.departmentId, departments.id))
      .where(patientId > 0 ? eq(consultations.patientId, patientId) : undefined)
      .orderBy(desc(consultations.createdAt));

    const observations = await db
      .select({
        id: wardObservations.id,
        patientId: wardObservations.patientId,
        patientName: patients.fullName,
        patientNumber: patients.patientNumber,
        recordedByName: wardObservations.recordedByName,
        tempC: wardObservations.tempC,
        bloodPressure: wardObservations.bloodPressure,
        pulseBpm: wardObservations.pulseBpm,
        respiratoryRate: wardObservations.respiratoryRate,
        spo2: wardObservations.spo2,
        nursingNote: wardObservations.nursingNote,
        observedAt: wardObservations.observedAt,
      })
      .from(wardObservations)
      .leftJoin(patients, eq(wardObservations.patientId, patients.id))
      .where(patientId > 0 ? eq(wardObservations.patientId, patientId) : undefined)
      .orderBy(desc(wardObservations.observedAt))
      .limit(50);

    res.json({ consultations: rows, observations });
  } catch (error) {
    console.error('List consultations error:', error);
    res.status(500).json({ error: 'Failed to load consultations.' });
  }
});

router.post('/', requireAuth, requirePermission('consultations:write'), async (req: AuthRequest, res) => {
  try {
    const parsed = consultationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid consultation form data.' });
    }

    const data = parsed.data;
    const [{ value: cTotal }] = await db.select({ value: count() }).from(consultations);
    const consultNumber = `CON-${new Date().getFullYear()}-${String(Number(cTotal) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

    const [created] = await db
      .insert(consultations)
      .values({
        consultationNumber: consultNumber,
        patientId: data.patientId,
        doctorId: data.doctorId,
        appointmentId: data.appointmentId ?? null,
        departmentId: data.departmentId ?? null,
        chiefComplaints: data.chiefComplaints,
        symptoms: data.symptoms,
        vitalTempC: data.vitalTempC,
        vitalBp: data.vitalBp,
        vitalPulseBpm: data.vitalPulseBpm ?? null,
        vitalRespRate: data.vitalRespRate ?? null,
        vitalSpo2: data.vitalSpo2 ?? null,
        vitalWeightKg: data.vitalWeightKg,
        clinicalNotes: data.clinicalNotes,
        diagnosis: data.diagnosis,
        icdCode: data.icdCode,
        treatmentPlan: data.treatmentPlan,
        followUpDate: data.followUpDate,
        isLocked: true,
      })
      .returning();

    await db.insert(diagnoses).values({
      consultationId: created.id,
      patientId: data.patientId,
      code: data.icdCode || null,
      description: data.diagnosis,
      severity: data.severity,
      isPrimary: true,
    });

    const [docRow] = await db
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.id, data.doctorId))
      .limit(1);

    await db.insert(medicalRecords).values({
      patientId: data.patientId,
      recordType: 'Consultation',
      referenceId: created.id,
      summary: `Consultation (${consultNumber}) · ${data.diagnosis}`,
      details: `Complaints: ${data.chiefComplaints}. Plan: ${data.treatmentPlan || 'See clinical notes'}`,
      recordedByUserId: req.authUser?.id ?? null,
      recordedByName: docRow?.fullName || req.authUser!.fullName,
    });

    if (data.appointmentId) {
      await db
        .update(appointments)
        .set({ status: 'Completed', attendanceRecordedAt: new Date() })
        .where(eq(appointments.id, data.appointmentId));
    }

    // Inline prescriptions
    if (data.prescriptionItems.length > 0) {
      const [{ value: rxTotal }] = await db.select({ value: count() }).from(prescriptions);
      const rxNumber = `RX-${new Date().getFullYear()}-${String(Number(rxTotal) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;
      const [rx] = await db
        .insert(prescriptions)
        .values({
          prescriptionNumber: rxNumber,
          consultationId: created.id,
          patientId: data.patientId,
          doctorId: data.doctorId,
          status: 'Pending',
          notes: `Ordered during ${consultNumber}`,
        })
        .returning();

      for (const item of data.prescriptionItems) {
        await db.insert(prescriptionItems).values({
          prescriptionId: rx.id,
          ...item,
        });
      }
    }

    // Inline laboratory test requests
    const labCharges: { description: string; priceMwk: number; refId: number }[] = [];
    for (const testId of data.labTestIds) {
      const [test] = await db
        .select()
        .from(laboratoryTests)
        .where(eq(laboratoryTests.id, testId))
        .limit(1);
      if (!test) continue;

      const [{ value: lrTotal }] = await db.select({ value: count() }).from(laboratoryRequests);
      const reqNum = `LAB-${new Date().getFullYear()}-${String(Number(lrTotal) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;
      const [labReq] = await db
        .insert(laboratoryRequests)
        .values({
          requestNumber: reqNum,
          patientId: data.patientId,
          consultationId: created.id,
          doctorId: data.doctorId,
          testId: test.id,
          priority: 'Routine',
          status: 'Requested',
          clinicalNotes: `Requested in ${consultNumber}`,
        })
        .returning();

      labCharges.push({
        description: `Lab Test: ${test.testName}`,
        priceMwk: test.priceMwk,
        refId: labReq.id,
      });
    }

    // Auto-create consultation + lab invoice in MWK
    if (data.autoCreateInvoice) {
      const consultFee = docRow?.consultationFeeMwk ?? 15000;
      const totalMwk =
        consultFee + labCharges.reduce((sum, l) => sum + Number(l.priceMwk || 0), 0);
      const [{ value: invTotal }] = await db.select({ value: count() }).from(invoices);
      const invNum = `INV-${new Date().getFullYear()}-${String(Number(invTotal) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

      const [inv] = await db
        .insert(invoices)
        .values({
          invoiceNumber: invNum,
          patientId: data.patientId,
          departmentId: data.departmentId ?? docRow?.departmentId ?? null,
          totalAmountMwk: totalMwk,
          paidAmountMwk: 0,
          balanceMwk: totalMwk,
          status: 'Unpaid',
          dueDate: new Date().toISOString().slice(0, 10),
          notes: `Auto-generated from ${consultNumber}`,
          createdByUserId: req.authUser?.id ?? null,
        })
        .returning();

      await db.insert(invoiceItems).values({
        invoiceId: inv.id,
        category: 'Consultation',
        description: `Consultation — ${docRow?.fullName || 'Clinician'}`,
        quantity: 1,
        unitPriceMwk: consultFee,
        totalPriceMwk: consultFee,
        referenceType: 'consultation',
        referenceId: created.id,
      });

      for (const lc of labCharges) {
        await db.insert(invoiceItems).values({
          invoiceId: inv.id,
          category: 'Laboratory',
          description: lc.description,
          quantity: 1,
          unitPriceMwk: lc.priceMwk,
          totalPriceMwk: lc.priceMwk,
          referenceType: 'laboratory_request',
          referenceId: lc.refId,
        });
      }
    }

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'CREATE_CONSULTATION',
      module: 'Consultations',
      entityType: 'consultation',
      entityId: created.id,
      details: `Recorded consultation ${consultNumber} (${data.diagnosis})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ consultation: created });
  } catch (error) {
    console.error('Create consultation error:', error);
    res.status(500).json({ error: 'Failed to save clinical consultation.' });
  }
});

router.post('/vitals', requireAuth, requirePermission('vitals:write'), async (req: AuthRequest, res) => {
  try {
    const parsed = vitalsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid vital signs or nursing note payload.' });
    }

    const d = parsed.data;
    const [obs] = await db
      .insert(wardObservations)
      .values({
        patientId: d.patientId,
        admissionId: d.admissionId ?? null,
        recordedByUserId: req.authUser?.id ?? null,
        recordedByName: req.authUser!.fullName,
        tempC: d.tempC,
        bloodPressure: d.bloodPressure,
        pulseBpm: d.pulseBpm ?? null,
        respiratoryRate: d.respiratoryRate ?? null,
        spo2: d.spo2 ?? null,
        nursingNote: d.nursingNote,
      })
      .returning();

    await db.insert(medicalRecords).values({
      patientId: d.patientId,
      recordType: 'Vitals',
      referenceId: obs.id,
      summary: `Vitals & Nursing Observation · BP ${d.bloodPressure || '—'} · Temp ${d.tempC || '—'}°C`,
      details: d.nursingNote,
      recordedByUserId: req.authUser?.id ?? null,
      recordedByName: req.authUser!.fullName,
    });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'RECORD_VITALS',
      module: 'Consultations',
      entityType: 'ward_observation',
      entityId: obs.id,
      details: `Recorded vitals/nursing observation for patient #${d.patientId}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ observation: obs });
  } catch (error) {
    console.error('Record vitals error:', error);
    res.status(500).json({ error: 'Failed to record vital signs.' });
  }
});

export default router;
