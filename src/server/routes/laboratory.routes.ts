import { Router } from 'express';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  laboratoryRequests,
  laboratoryResults,
  laboratoryTests,
  medicalRecords,
  patients,
  staffProfiles,
  users,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const testSchema = z.object({
  testCode: z.string().trim().min(2).max(40),
  testName: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  priceMwk: z.number().int().min(0),
  normalRange: z.string().trim().max(300).optional().default(''),
  turnaroundHours: z.number().int().min(1).max(240).optional().default(4),
});

const requestSchema = z.object({
  patientId: z.number().int().positive(),
  doctorId: z.number().int().positive().nullable().optional(),
  testId: z.number().int().positive(),
  priority: z.enum(['Routine', 'Urgent', 'STAT']).optional().default('Routine'),
  clinicalNotes: z.string().trim().max(1000).optional().default(''),
});

const resultSchema = z.object({
  resultSummary: z.string().trim().min(2).max(1500),
  measuredValue: z.string().trim().max(300).optional().default(''),
  referenceRange: z.string().trim().max(300).optional().default(''),
  interpretation: z.enum(['Normal', 'Abnormal', 'Critical']).optional().default('Normal'),
  technicianNotes: z.string().trim().max(1500).optional().default(''),
  reportFileName: z.string().trim().max(200).optional().default(''),
  reportDataBase64: z.string().max(4_000_000).optional().default(''),
});

router.get('/', requireAuth, requirePermission('laboratory:read'), async (_req: AuthRequest, res) => {
  try {
    const [tests, requests, results] = await Promise.all([
      db.select().from(laboratoryTests).orderBy(laboratoryTests.category, laboratoryTests.testName),
      db
        .select({
          id: laboratoryRequests.id,
          requestNumber: laboratoryRequests.requestNumber,
          patientId: laboratoryRequests.patientId,
          patientName: patients.fullName,
          patientNumber: patients.patientNumber,
          doctorId: laboratoryRequests.doctorId,
          doctorName: staffProfiles.fullName,
          testId: laboratoryRequests.testId,
          testName: laboratoryTests.testName,
          testCode: laboratoryTests.testCode,
          testCategory: laboratoryTests.category,
          normalRange: laboratoryTests.normalRange,
          assignedTechnicianId: laboratoryRequests.assignedTechnicianId,
          technicianName: users.fullName,
          priority: laboratoryRequests.priority,
          status: laboratoryRequests.status,
          clinicalNotes: laboratoryRequests.clinicalNotes,
          requestedAt: laboratoryRequests.requestedAt,
          completedAt: laboratoryRequests.completedAt,
        })
        .from(laboratoryRequests)
        .leftJoin(patients, eq(laboratoryRequests.patientId, patients.id))
        .leftJoin(staffProfiles, eq(laboratoryRequests.doctorId, staffProfiles.id))
        .leftJoin(laboratoryTests, eq(laboratoryRequests.testId, laboratoryTests.id))
        .leftJoin(users, eq(laboratoryRequests.assignedTechnicianId, users.id))
        .orderBy(desc(laboratoryRequests.requestedAt)),
      db.select().from(laboratoryResults).orderBy(desc(laboratoryResults.recordedAt)),
    ]);

    const resultByReq = new Map(results.map((r) => [r.requestId, r]));
    const enrichedRequests = requests.map((req) => ({
      ...req,
      result: resultByReq.get(req.id) || null,
    }));

    res.json({ tests, requests: enrichedRequests });
  } catch (error) {
    console.error('Laboratory list error:', error);
    res.status(500).json({ error: 'Failed to load laboratory records.' });
  }
});

router.post('/tests', requireAuth, requirePermission('laboratory:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = testSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid lab test definition.' });
    const [created] = await db.insert(laboratoryTests).values(parsed.data).returning();
    res.status(201).json({ test: created });
  } catch (error) {
    console.error('Create lab test error:', error);
    res.status(500).json({ error: 'Failed to create laboratory test.' });
  }
});

router.post('/requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid lab request.' });

    const [{ value: total }] = await db.select({ value: count() }).from(laboratoryRequests);
    const reqNum = `LAB-${new Date().getFullYear()}-${String(Number(total) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

    const [created] = await db
      .insert(laboratoryRequests)
      .values({
        requestNumber: reqNum,
        patientId: parsed.data.patientId,
        doctorId: parsed.data.doctorId ?? null,
        testId: parsed.data.testId,
        priority: parsed.data.priority,
        clinicalNotes: parsed.data.clinicalNotes,
        status: 'Requested',
      })
      .returning();

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'CREATE_LAB_REQUEST',
      module: 'Laboratory',
      entityType: 'laboratory_request',
      entityId: created.id,
      details: `Ordered lab request ${reqNum}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ request: created });
  } catch (error) {
    console.error('Create lab request error:', error);
    res.status(500).json({ error: 'Failed to submit laboratory request.' });
  }
});

router.patch('/requests/:id/status', requireAuth, requirePermission('laboratory:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = z
      .enum(['Requested', 'Sample collected', 'Processing', 'Completed', 'Cancelled'])
      .parse(req.body.status);

    const [updated] = await db
      .update(laboratoryRequests)
      .set({
        status,
        assignedTechnicianId: req.authUser?.id ?? null,
        completedAt: status === 'Completed' ? new Date() : null,
      })
      .where(eq(laboratoryRequests.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Lab request not found.' });
    res.json({ request: updated });
  } catch (error) {
    console.error('Lab status update error:', error);
    res.status(400).json({ error: 'Invalid status update.' });
  }
});

router.post('/requests/:id/results', requireAuth, requirePermission('laboratory:manage'), async (req: AuthRequest, res) => {
  try {
    const requestId = Number(req.params.id);
    const parsed = resultSchema.safeParse(req.body);
    if (!parsed.success || !Number.isInteger(requestId)) {
      return res.status(400).json({ error: 'Invalid laboratory result payload.' });
    }

    const [labReq] = await db
      .select()
      .from(laboratoryRequests)
      .where(eq(laboratoryRequests.id, requestId))
      .limit(1);
    if (!labReq) return res.status(404).json({ error: 'Laboratory request not found.' });

    const [test] = await db
      .select()
      .from(laboratoryTests)
      .where(eq(laboratoryTests.id, labReq.testId))
      .limit(1);

    const [result] = await db
      .insert(laboratoryResults)
      .values({
        requestId,
        patientId: labReq.patientId,
        ...parsed.data,
        recordedByUserId: req.authUser?.id ?? null,
      })
      .returning();

    await db
      .update(laboratoryRequests)
      .set({
        status: 'Completed',
        assignedTechnicianId: req.authUser?.id ?? null,
        completedAt: new Date(),
      })
      .where(eq(laboratoryRequests.id, requestId));

    await db.insert(medicalRecords).values({
      patientId: labReq.patientId,
      recordType: 'Lab Result',
      referenceId: result.id,
      summary: `${test?.testName || 'Lab Test'} (${labReq.requestNumber}) · ${parsed.data.interpretation}`,
      details: `${parsed.data.resultSummary}${parsed.data.measuredValue ? ` (${parsed.data.measuredValue})` : ''}`,
      recordedByUserId: req.authUser?.id ?? null,
      recordedByName: req.authUser!.fullName,
    });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'RECORD_LAB_RESULT',
      module: 'Laboratory',
      entityType: 'laboratory_result',
      entityId: result.id,
      details: `Completed ${labReq.requestNumber} (${parsed.data.interpretation})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ result });
  } catch (error) {
    console.error('Record lab result error:', error);
    res.status(500).json({ error: 'Failed to record laboratory result.' });
  }
});

export default router;
