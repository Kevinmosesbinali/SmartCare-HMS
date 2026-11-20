import { Router } from 'express';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  departments,
  hospitalServices,
  invoiceItems,
  invoices,
  patients,
  payments,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const createInvoiceSchema = z.object({
  patientId: z.number().int().positive(),
  departmentId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional().default(''),
  items: z
    .array(
      z.object({
        category: z.enum(['Consultation', 'Laboratory', 'Pharmacy', 'Admission', 'Procedure', 'Imaging', 'Other']),
        description: z.string().trim().min(2).max(250),
        quantity: z.number().int().positive(),
        unitPriceMwk: z.number().int().min(0),
      })
    )
    .min(1),
});

const paymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  amountMwk: z.number().int().positive(),
  paymentMethod: z.enum(['Cash', 'Bank transfer', 'Mobile money', 'Card', 'Insurance']),
  referenceNumber: z.string().trim().max(120).optional().default(''),
  notes: z.string().trim().max(400).optional().default(''),
});

router.get('/', requireAuth, requirePermission('billing:read'), async (_req: AuthRequest, res) => {
  try {
    const [invRows, itemRows, payRows, serviceRows] = await Promise.all([
      db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          patientId: invoices.patientId,
          patientName: patients.fullName,
          patientNumber: patients.patientNumber,
          patientPhone: patients.phone,
          departmentId: invoices.departmentId,
          departmentName: departments.name,
          totalAmountMwk: invoices.totalAmountMwk,
          paidAmountMwk: invoices.paidAmountMwk,
          balanceMwk: invoices.balanceMwk,
          status: invoices.status,
          dueDate: invoices.dueDate,
          notes: invoices.notes,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .leftJoin(patients, eq(invoices.patientId, patients.id))
        .leftJoin(departments, eq(invoices.departmentId, departments.id))
        .orderBy(desc(invoices.createdAt)),
      db.select().from(invoiceItems),
      db
        .select({
          id: payments.id,
          receiptNumber: payments.receiptNumber,
          invoiceId: payments.invoiceId,
          invoiceNumber: invoices.invoiceNumber,
          patientId: payments.patientId,
          patientName: patients.fullName,
          amountMwk: payments.amountMwk,
          paymentMethod: payments.paymentMethod,
          referenceNumber: payments.referenceNumber,
          notes: payments.notes,
          paidAt: payments.paidAt,
        })
        .from(payments)
        .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
        .leftJoin(patients, eq(payments.patientId, patients.id))
        .orderBy(desc(payments.paidAt)),
      db.select().from(hospitalServices).orderBy(hospitalServices.category, hospitalServices.name),
    ]);

    const itemsByInv = new Map<number, typeof itemRows>();
    for (const it of itemRows) {
      const list = itemsByInv.get(it.invoiceId) || [];
      list.push(it);
      itemsByInv.set(it.invoiceId, list);
    }

    const enrichedInvoices = invRows.map((inv) => ({
      ...inv,
      items: itemsByInv.get(inv.id) || [],
    }));

    res.json({
      invoices: enrichedInvoices,
      payments: payRows,
      services: serviceRows,
    });
  } catch (error) {
    console.error('Billing list error:', error);
    res.status(500).json({ error: 'Failed to load billing and payment records.' });
  }
});

router.post('/invoices', requireAuth, requirePermission('billing:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid invoice details.' });

    const d = parsed.data;
    const totalAmountMwk = d.items.reduce((sum, it) => sum + it.quantity * it.unitPriceMwk, 0);
    const [{ value: total }] = await db.select({ value: count() }).from(invoices);
    const invNum = `INV-${new Date().getFullYear()}-${String(Number(total) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

    const [created] = await db
      .insert(invoices)
      .values({
        invoiceNumber: invNum,
        patientId: d.patientId,
        departmentId: d.departmentId ?? null,
        totalAmountMwk,
        paidAmountMwk: 0,
        balanceMwk: totalAmountMwk,
        status: 'Unpaid',
        dueDate: d.dueDate || new Date().toISOString().slice(0, 10),
        notes: d.notes,
        createdByUserId: req.authUser?.id ?? null,
      })
      .returning();

    for (const it of d.items) {
      await db.insert(invoiceItems).values({
        invoiceId: created.id,
        category: it.category,
        description: it.description,
        quantity: it.quantity,
        unitPriceMwk: it.unitPriceMwk,
        totalPriceMwk: it.quantity * it.unitPriceMwk,
      });
    }

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'CREATE_INVOICE',
      module: 'Billing',
      entityType: 'invoice',
      entityId: created.id,
      details: `Generated invoice ${invNum} for MWK ${totalAmountMwk.toLocaleString()}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ invoice: created });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to generate invoice.' });
  }
});

router.post('/payments', requireAuth, requirePermission('billing:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payment payload.' });

    const d = parsed.data;
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, d.invoiceId)).limit(1);
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    if (inv.balanceMwk <= 0) {
      return res.status(400).json({ error: 'Invoice is already settled in full.' });
    }

    const appliedAmount = Math.min(d.amountMwk, inv.balanceMwk);
    const [{ value: payTotal }] = await db.select({ value: count() }).from(payments);
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(Number(payTotal) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

    const [payment] = await db
      .insert(payments)
      .values({
        receiptNumber,
        invoiceId: inv.id,
        patientId: inv.patientId,
        amountMwk: appliedAmount,
        paymentMethod: d.paymentMethod,
        referenceNumber: d.referenceNumber,
        notes: d.notes,
        receivedByUserId: req.authUser?.id ?? null,
      })
      .returning();

    const newPaid = inv.paidAmountMwk + appliedAmount;
    const newBalance = Math.max(0, inv.totalAmountMwk - newPaid);
    const newStatus = newBalance === 0 ? 'Paid' : 'Partial';

    const [updatedInv] = await db
      .update(invoices)
      .set({
        paidAmountMwk: newPaid,
        balanceMwk: newBalance,
        status: newStatus,
      })
      .where(eq(invoices.id, inv.id))
      .returning();

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'RECORD_PAYMENT',
      module: 'Billing',
      entityType: 'payment',
      entityId: payment.id,
      details: `Receipt ${receiptNumber}: MWK ${appliedAmount.toLocaleString()} via ${d.paymentMethod} for ${inv.invoiceNumber}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ payment, invoice: updatedInv });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Failed to record payment.' });
  }
});

export default router;
