import { Router } from 'express';
import { asc, count, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  invoiceItems,
  invoices,
  medicalRecords,
  medicines,
  patients,
  pharmacyStock,
  prescriptionItems,
  prescriptions,
  staffProfiles,
  stockMovements,
  suppliers,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const medicineSchema = z.object({
  medicineName: z.string().trim().min(2).max(160),
  genericName: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(100),
  dosageForm: z.string().trim().min(2).max(60),
  strength: z.string().trim().max(60).optional().default(''),
  unitPriceMwk: z.number().int().min(1),
  reorderLevel: z.number().int().min(1).optional().default(50),
});

const purchaseStockSchema = z.object({
  medicineId: z.number().int().positive(),
  batchNumber: z.string().trim().min(2).max(80),
  quantity: z.number().int().positive(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplierId: z.number().int().positive().nullable().optional(),
  purchasePriceMwk: z.number().int().min(0).optional().default(0),
});

router.get('/', requireAuth, requirePermission('pharmacy:read'), async (_req: AuthRequest, res) => {
  try {
    const [medRows, stockRows, supplierRows, rxRows, rxItemsRows, movementRows] = await Promise.all([
      db.select().from(medicines).orderBy(medicines.medicineName),
      db
        .select({
          id: pharmacyStock.id,
          medicineId: pharmacyStock.medicineId,
          medicineName: medicines.medicineName,
          batchNumber: pharmacyStock.batchNumber,
          quantity: pharmacyStock.quantity,
          expiryDate: pharmacyStock.expiryDate,
          supplierId: pharmacyStock.supplierId,
          supplierName: suppliers.name,
          purchasePriceMwk: pharmacyStock.purchasePriceMwk,
          receivedAt: pharmacyStock.receivedAt,
        })
        .from(pharmacyStock)
        .leftJoin(medicines, eq(pharmacyStock.medicineId, medicines.id))
        .leftJoin(suppliers, eq(pharmacyStock.supplierId, suppliers.id))
        .orderBy(pharmacyStock.expiryDate),
      db.select().from(suppliers).orderBy(suppliers.name),
      db
        .select({
          id: prescriptions.id,
          prescriptionNumber: prescriptions.prescriptionNumber,
          patientId: prescriptions.patientId,
          patientName: patients.fullName,
          patientNumber: patients.patientNumber,
          doctorName: staffProfiles.fullName,
          status: prescriptions.status,
          notes: prescriptions.notes,
          dispensedAt: prescriptions.dispensedAt,
          createdAt: prescriptions.createdAt,
        })
        .from(prescriptions)
        .leftJoin(patients, eq(prescriptions.patientId, patients.id))
        .leftJoin(staffProfiles, eq(prescriptions.doctorId, staffProfiles.id))
        .orderBy(desc(prescriptions.createdAt)),
      db
        .select({
          id: prescriptionItems.id,
          prescriptionId: prescriptionItems.prescriptionId,
          medicineId: prescriptionItems.medicineId,
          medicineName: medicines.medicineName,
          unitPriceMwk: medicines.unitPriceMwk,
          dosage: prescriptionItems.dosage,
          frequency: prescriptionItems.frequency,
          duration: prescriptionItems.duration,
          quantityPrescribed: prescriptionItems.quantityPrescribed,
          quantityDispensed: prescriptionItems.quantityDispensed,
          instructions: prescriptionItems.instructions,
        })
        .from(prescriptionItems)
        .leftJoin(medicines, eq(prescriptionItems.medicineId, medicines.id)),
      db
        .select({
          id: stockMovements.id,
          itemType: stockMovements.itemType,
          medicineId: stockMovements.medicineId,
          medicineName: medicines.medicineName,
          movementType: stockMovements.movementType,
          quantityDelta: stockMovements.quantityDelta,
          referenceNote: stockMovements.referenceNote,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .leftJoin(medicines, eq(stockMovements.medicineId, medicines.id))
        .where(eq(stockMovements.itemType, 'Medicine'))
        .orderBy(desc(stockMovements.createdAt))
        .limit(40),
    ]);

    // Aggregate total stock per medicine
    const qtyMap = new Map<number, number>();
    for (const s of stockRows) {
      qtyMap.set(s.medicineId, (qtyMap.get(s.medicineId) || 0) + s.quantity);
    }

    const enrichedMedicines = medRows.map((m) => ({
      ...m,
      totalStock: qtyMap.get(m.id) || 0,
      isLowStock: (qtyMap.get(m.id) || 0) <= m.reorderLevel,
    }));

    const itemsByRx = new Map<number, typeof rxItemsRows>();
    for (const it of rxItemsRows) {
      const list = itemsByRx.get(it.prescriptionId) || [];
      list.push(it);
      itemsByRx.set(it.prescriptionId, list);
    }

    const enrichedPrescriptions = rxRows.map((rx) => ({
      ...rx,
      items: itemsByRx.get(rx.id) || [],
    }));

    res.json({
      medicines: enrichedMedicines,
      batches: stockRows,
      suppliers: supplierRows,
      prescriptions: enrichedPrescriptions,
      movements: movementRows,
    });
  } catch (error) {
    console.error('Pharmacy list error:', error);
    res.status(500).json({ error: 'Failed to load pharmacy records.' });
  }
});

router.post('/medicines', requireAuth, requirePermission('pharmacy:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = medicineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid medicine data.' });

    const [created] = await db.insert(medicines).values(parsed.data).returning();
    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'CREATE_MEDICINE',
      module: 'Pharmacy',
      entityType: 'medicine',
      entityId: created.id,
      details: `Added medicine ${created.medicineName} (${created.genericName})`,
      ipAddress: req.ip,
    });
    res.status(201).json({ medicine: created });
  } catch (error) {
    console.error('Create medicine error:', error);
    res.status(500).json({ error: 'Failed to add medicine.' });
  }
});

router.post('/stock', requireAuth, requirePermission('pharmacy:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = purchaseStockSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid stock batch payload.' });

    const d = parsed.data;
    const [batch] = await db
      .insert(pharmacyStock)
      .values({
        medicineId: d.medicineId,
        batchNumber: d.batchNumber,
        quantity: d.quantity,
        expiryDate: d.expiryDate,
        supplierId: d.supplierId ?? null,
        purchasePriceMwk: d.purchasePriceMwk,
      })
      .returning();

    await db.insert(stockMovements).values({
      itemType: 'Medicine',
      medicineId: d.medicineId,
      movementType: 'Purchase',
      quantityDelta: d.quantity,
      referenceNote: `Batch ${d.batchNumber} received (Exp ${d.expiryDate})`,
      performedByUserId: req.authUser?.id ?? null,
    });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'PURCHASE_MEDICINE_STOCK',
      module: 'Pharmacy',
      entityType: 'pharmacy_stock',
      entityId: batch.id,
      details: `Received ${d.quantity} units (Batch ${d.batchNumber})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ batch });
  } catch (error) {
    console.error('Purchase stock error:', error);
    res.status(500).json({ error: 'Failed to record medicine purchase.' });
  }
});

router.post('/prescriptions/:id/dispense', requireAuth, requirePermission('pharmacy:manage'), async (req: AuthRequest, res) => {
  try {
    const rxId = Number(req.params.id);
    const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, rxId)).limit(1);
    if (!rx) return res.status(404).json({ error: 'Prescription not found.' });
    if (rx.status === 'Dispensed') {
      return res.status(400).json({ error: 'Prescription has already been fully dispensed.' });
    }

    const items = await db
      .select()
      .from(prescriptionItems)
      .where(eq(prescriptionItems.prescriptionId, rxId));

    const billedLines: { description: string; qty: number; unitPrice: number }[] = [];

    for (const item of items) {
      const remainingToDispense = item.quantityPrescribed - item.quantityDispensed;
      if (remainingToDispense <= 0) continue;

      const [med] = await db.select().from(medicines).where(eq(medicines.id, item.medicineId)).limit(1);
      if (!med) continue;

      // FIFO batches ordered by earliest expiryDate
      const batches = await db
        .select()
        .from(pharmacyStock)
        .where(eq(pharmacyStock.medicineId, item.medicineId))
        .orderBy(asc(pharmacyStock.expiryDate));

      const available = batches
        .filter((b) => b.quantity > 0)
        .reduce((sum, b) => sum + b.quantity, 0);

      if (available < remainingToDispense) {
        return res.status(409).json({
          error: `Insufficient stock for ${med.medicineName}. Available: ${available}, Required: ${remainingToDispense}.`,
        });
      }

      let toDeduct = remainingToDispense;
      for (const batch of batches) {
        if (toDeduct <= 0) break;
        if (batch.quantity <= 0) continue;
        const deductHere = Math.min(batch.quantity, toDeduct);
        await db
          .update(pharmacyStock)
          .set({ quantity: batch.quantity - deductHere })
          .where(eq(pharmacyStock.id, batch.id));
        toDeduct -= deductHere;
      }

      await db
        .update(prescriptionItems)
        .set({ quantityDispensed: item.quantityPrescribed })
        .where(eq(prescriptionItems.id, item.id));

      await db.insert(stockMovements).values({
        itemType: 'Medicine',
        medicineId: med.id,
        movementType: 'Dispense',
        quantityDelta: -remainingToDispense,
        referenceNote: `Dispensed for ${rx.prescriptionNumber}`,
        performedByUserId: req.authUser?.id ?? null,
      });

      billedLines.push({
        description: `${med.medicineName} (${item.dosage}, ${item.frequency})`,
        qty: remainingToDispense,
        unitPrice: med.unitPriceMwk,
      });
    }

    const [updatedRx] = await db
      .update(prescriptions)
      .set({
        status: 'Dispensed',
        dispensedByUserId: req.authUser?.id ?? null,
        dispensedAt: new Date(),
      })
      .where(eq(prescriptions.id, rxId))
      .returning();

    // Auto-create pharmacy invoice in MWK
    if (billedLines.length > 0) {
      const totalMwk = billedLines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
      const [{ value: invTotal }] = await db.select({ value: count() }).from(invoices);
      const invNum = `INV-${new Date().getFullYear()}-${String(Number(invTotal) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;

      const [inv] = await db
        .insert(invoices)
        .values({
          invoiceNumber: invNum,
          patientId: rx.patientId,
          totalAmountMwk: totalMwk,
          paidAmountMwk: 0,
          balanceMwk: totalMwk,
          status: 'Unpaid',
          dueDate: new Date().toISOString().slice(0, 10),
          notes: `Pharmacy dispensing for ${rx.prescriptionNumber}`,
          createdByUserId: req.authUser?.id ?? null,
        })
        .returning();

      for (const line of billedLines) {
        await db.insert(invoiceItems).values({
          invoiceId: inv.id,
          category: 'Pharmacy',
          description: line.description,
          quantity: line.qty,
          unitPriceMwk: line.unitPrice,
          totalPriceMwk: line.qty * line.unitPrice,
          referenceType: 'prescription',
          referenceId: rx.id,
        });
      }
    }

    await db.insert(medicalRecords).values({
      patientId: rx.patientId,
      recordType: 'Prescription',
      referenceId: rx.id,
      summary: `Medication Dispensed (${rx.prescriptionNumber})`,
      details: billedLines.map((b) => `${b.description} x${b.qty}`).join('; '),
      recordedByUserId: req.authUser?.id ?? null,
      recordedByName: req.authUser!.fullName,
    });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'DISPENSE_PRESCRIPTION',
      module: 'Pharmacy',
      entityType: 'prescription',
      entityId: rx.id,
      details: `Dispensed ${rx.prescriptionNumber} and updated stock FIFO`,
      ipAddress: req.ip,
    });

    res.json({ prescription: updatedRx });
  } catch (error) {
    console.error('Dispense prescription error:', error);
    res.status(500).json({ error: 'Failed to dispense prescription.' });
  }
});

export default router;
