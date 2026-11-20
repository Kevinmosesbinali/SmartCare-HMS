import { Router } from 'express';
import { count, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  admissions,
  appointments,
  consultations,
  invoices,
  laboratoryRequests,
  laboratoryResults,
  laboratoryTests,
  medicalRecords,
  patientDocuments,
  patients,
  prescriptions,
  staffProfiles,
  wardObservations,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const patientSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(['Male', 'Female', 'Other']),
  phone: z.string().trim().min(6).max(40),
  residentialAddress: z.string().trim().min(2).max(300),
  emergencyContactName: z.string().trim().min(2).max(160),
  emergencyContactPhone: z.string().trim().min(6).max(40),
  nextOfKinName: z.string().trim().min(2).max(160),
  nextOfKinRelationship: z.string().trim().max(80).optional().default('Relative'),
  nextOfKinPhone: z.string().trim().max(40).optional().default(''),
  bloodGroup: z.string().trim().max(15).optional().default('Unknown'),
  allergies: z.string().trim().max(300).optional().default('None known'),
  medicalHistory: z.string().trim().max(1500).optional().default(''),
  isDemoRecord: z.boolean().optional().default(false),
});

router.get('/', requireAuth, requirePermission('patients:read'), async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const filterDemo = req.query.demo;

    let rows = await db
      .select()
      .from(patients)
      .where(
        q
          ? or(
              ilike(patients.fullName, `%${q}%`),
              ilike(patients.patientNumber, `%${q}%`),
              ilike(patients.phone, `%${q}%`)
            )
          : undefined
      )
      .orderBy(desc(patients.createdAt));

    if (filterDemo === 'real') {
      rows = rows.filter((r) => !r.isDemoRecord);
    } else if (filterDemo === 'demo') {
      rows = rows.filter((r) => r.isDemoRecord);
    }

    res.json({ patients: rows });
  } catch (error) {
    console.error('List patients error:', error);
    res.status(500).json({ error: 'Failed to load patient registry.' });
  }
});

router.get('/:id', requireAuth, requirePermission('patients:read'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid patient ID.' });
    }

    const [patient] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
    if (!patient) {
      return res.status(404).json({ error: 'Patient record not found.' });
    }

    const [
      patientAppointments,
      patientConsultations,
      patientPrescriptions,
      patientLabRequests,
      patientLabResults,
      patientInvoices,
      patientAdmissions,
      patientObservations,
      patientTimeline,
      documents,
    ] = await Promise.all([
      db
        .select({
          id: appointments.id,
          appointmentNumber: appointments.appointmentNumber,
          appointmentDate: appointments.appointmentDate,
          appointmentTime: appointments.appointmentTime,
          reason: appointments.reason,
          status: appointments.status,
          doctorName: staffProfiles.fullName,
        })
        .from(appointments)
        .leftJoin(staffProfiles, eq(appointments.doctorId, staffProfiles.id))
        .where(eq(appointments.patientId, id))
        .orderBy(desc(appointments.appointmentDate)),
      db
        .select({
          id: consultations.id,
          consultationNumber: consultations.consultationNumber,
          chiefComplaints: consultations.chiefComplaints,
          symptoms: consultations.symptoms,
          vitalTempC: consultations.vitalTempC,
          vitalBp: consultations.vitalBp,
          vitalPulseBpm: consultations.vitalPulseBpm,
          vitalSpo2: consultations.vitalSpo2,
          vitalWeightKg: consultations.vitalWeightKg,
          clinicalNotes: consultations.clinicalNotes,
          diagnosis: consultations.diagnosis,
          icdCode: consultations.icdCode,
          treatmentPlan: consultations.treatmentPlan,
          createdAt: consultations.createdAt,
          doctorName: staffProfiles.fullName,
        })
        .from(consultations)
        .leftJoin(staffProfiles, eq(consultations.doctorId, staffProfiles.id))
        .where(eq(consultations.patientId, id))
        .orderBy(desc(consultations.createdAt)),
      db
        .select({
          id: prescriptions.id,
          prescriptionNumber: prescriptions.prescriptionNumber,
          status: prescriptions.status,
          notes: prescriptions.notes,
          createdAt: prescriptions.createdAt,
          doctorName: staffProfiles.fullName,
        })
        .from(prescriptions)
        .leftJoin(staffProfiles, eq(prescriptions.doctorId, staffProfiles.id))
        .where(eq(prescriptions.patientId, id))
        .orderBy(desc(prescriptions.createdAt)),
      db
        .select({
          id: laboratoryRequests.id,
          requestNumber: laboratoryRequests.requestNumber,
          status: laboratoryRequests.status,
          priority: laboratoryRequests.priority,
          requestedAt: laboratoryRequests.requestedAt,
          testName: laboratoryTests.testName,
        })
        .from(laboratoryRequests)
        .leftJoin(laboratoryTests, eq(laboratoryRequests.testId, laboratoryTests.id))
        .where(eq(laboratoryRequests.patientId, id))
        .orderBy(desc(laboratoryRequests.requestedAt)),
      db
        .select()
        .from(laboratoryResults)
        .where(eq(laboratoryResults.patientId, id))
        .orderBy(desc(laboratoryResults.recordedAt)),
      db
        .select()
        .from(invoices)
        .where(eq(invoices.patientId, id))
        .orderBy(desc(invoices.createdAt)),
      db
        .select()
        .from(admissions)
        .where(eq(admissions.patientId, id))
        .orderBy(desc(admissions.admissionDate)),
      db
        .select()
        .from(wardObservations)
        .where(eq(wardObservations.patientId, id))
        .orderBy(desc(wardObservations.observedAt)),
      db
        .select()
        .from(medicalRecords)
        .where(eq(medicalRecords.patientId, id))
        .orderBy(desc(medicalRecords.createdAt)),
      db
        .select({
          id: patientDocuments.id,
          title: patientDocuments.title,
          documentType: patientDocuments.documentType,
          fileName: patientDocuments.fileName,
          mimeType: patientDocuments.mimeType,
          createdAt: patientDocuments.createdAt,
        })
        .from(patientDocuments)
        .where(eq(patientDocuments.patientId, id))
        .orderBy(desc(patientDocuments.createdAt)),
    ]);

    res.json({
      patient,
      appointments: patientAppointments,
      consultations: patientConsultations,
      prescriptions: patientPrescriptions,
      labRequests: patientLabRequests,
      labResults: patientLabResults,
      invoices: patientInvoices,
      admissions: patientAdmissions,
      observations: patientObservations,
      timeline: patientTimeline,
      documents,
    });
  } catch (error) {
    console.error('Get patient profile error:', error);
    res.status(500).json({ error: 'Failed to load patient medical profile.' });
  }
});

router.post('/', requireAuth, requirePermission('patients:write'), async (req: AuthRequest, res) => {
  try {
    const parsed = patientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }

    const [{ value: total }] = await db.select({ value: count() }).from(patients);
    const year = new Date().getFullYear();
    const seq = String(Number(total) + 1).padStart(4, '0');
    const randSuffix = Math.floor(10 + Math.random() * 89);
    const patientNumber = `MW-${year}-${seq}-${randSuffix}`;

    const [created] = await db
      .insert(patients)
      .values({
        ...parsed.data,
        patientNumber,
        createdByUserId: req.authUser?.id ?? null,
      })
      .returning();

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'CREATE_PATIENT',
      module: 'Patients',
      entityType: 'patient',
      entityId: created.id,
      details: `Registered patient ${created.fullName} (${created.patientNumber})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ patient: created });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ error: 'Failed to register patient.' });
  }
});

router.put('/:id', requireAuth, requirePermission('patients:write'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid patient ID.' });
    }

    const parsed = patientSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid patient update fields.' });
    }

    const [updated] = await db
      .update(patients)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'UPDATE_PATIENT',
      module: 'Patients',
      entityType: 'patient',
      entityId: updated.id,
      details: `Updated demographics for ${updated.fullName} (${updated.patientNumber})`,
      ipAddress: req.ip,
    });

    res.json({ patient: updated });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Failed to update patient information.' });
  }
});

const docSchema = z.object({
  title: z.string().trim().min(2).max(160),
  documentType: z.enum(['Referral Letter', 'ID Copy', 'Lab Report', 'Imaging', 'Consent Form', 'Other']),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(100),
  fileDataBase64: z.string().min(4).max(4_000_000),
});

router.post('/:id/documents', requireAuth, requirePermission('patients:write'), async (req: AuthRequest, res) => {
  try {
    const patientId = Number(req.params.id);
    const parsed = docSchema.safeParse(req.body);
    if (!parsed.success || !Number.isInteger(patientId)) {
      return res.status(400).json({ error: 'Invalid document upload payload.' });
    }

    const [created] = await db
      .insert(patientDocuments)
      .values({
        patientId,
        ...parsed.data,
        uploadedByUserId: req.authUser?.id ?? null,
      })
      .returning({
        id: patientDocuments.id,
        title: patientDocuments.title,
        documentType: patientDocuments.documentType,
        fileName: patientDocuments.fileName,
        mimeType: patientDocuments.mimeType,
        createdAt: patientDocuments.createdAt,
      });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'UPLOAD_PATIENT_DOCUMENT',
      module: 'Patients',
      entityType: 'patient_document',
      entityId: created.id,
      details: `Uploaded ${created.title} (${created.documentType}) for patient #${patientId}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ document: created });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Failed to upload patient document.' });
  }
});

router.get('/:id/documents/:docId', requireAuth, requirePermission('patients:read'), async (req: AuthRequest, res) => {
  try {
    const docId = Number(req.params.docId);
    const [doc] = await db
      .select()
      .from(patientDocuments)
      .where(eq(patientDocuments.id, docId))
      .limit(1);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    res.json({ document: doc });
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
});

export default router;
