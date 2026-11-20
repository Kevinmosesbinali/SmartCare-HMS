import { Router } from 'express';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { inventory, stockMovements, suppliers } from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactPerson: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().default(''),
  supplierType: z.string().trim().max(80).optional().default('Pharmaceutical & Medical'),
});

const itemSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  quantity: z.number().int().min(0),
  unit: z.string().trim().min(1).max(40),
  reorderLevel: z.number().int().min(0).optional().default(20),
  unitCostMwk: z.number().int().min(0).optional().default(0),
  expiryDate: z.string().trim().max(20).optional().default(''),
  supplierId: z.number().int().positive().nullable().optional(),
  location: z.string().trim().max(120).optional().default('Central Medical Store'),
});

const movementSchema = z.object({
  inventoryItemId: z.number().int().positive(),
  movementType: z.enum(['Purchase', 'Issue', 'Adjustment']),
  quantity: z.number().int().positive(),
  referenceNote: z.string().trim().max(300).optional().default(''),
});

router.get('/', requireAuth, requirePermission('inventory:read'), async (_req: AuthRequest, res) => {
  try {
    const [items, supplierRows, movements] = await Promise.all([
      db
        .select({
          id: inventory.id,
          itemCode: inventory.itemCode,
          name: inventory.name,
          category: inventory.category,
          quantity: inventory.quantity,
          unit: inventory.unit,
          reorderLevel: inventory.reorderLevel,
          unitCostMwk: inventory.unitCostMwk,
          expiryDate: inventory.expiryDate,
          supplierId: inventory.supplierId,
          supplierName: suppliers.name,
          location: inventory.location,
          updatedAt: inventory.updatedAt,
        })
        .from(inventory)
        .leftJoin(suppliers, eq(inventory.supplierId, suppliers.id))
        .orderBy(inventory.name),
      db.select().from(suppliers).orderBy(suppliers.name),
      db
        .select({
          id: stockMovements.id,
          itemType: stockMovements.itemType,
          inventoryItemId: stockMovements.inventoryItemId,
          itemName: inventory.name,
          movementType: stockMovements.movementType,
          quantityDelta: stockMovements.quantityDelta,
          referenceNote: stockMovements.referenceNote,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .leftJoin(inventory, eq(stockMovements.inventoryItemId, inventory.id))
        .where(eq(stockMovements.itemType, 'Inventory'))
        .orderBy(desc(stockMovements.createdAt))
        .limit(40),
    ]);

    res.json({
      items: items.map((i) => ({ ...i, isLowStock: i.quantity <= i.reorderLevel })),
      suppliers: supplierRows,
      movements,
    });
  } catch (error) {
    console.error('Inventory list error:', error);
    res.status(500).json({ error: 'Failed to load inventory records.' });
  }
});

router.post('/suppliers', requireAuth, requirePermission('inventory:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = supplierSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid supplier details.' });
    const [created] = await db
      .insert(suppliers)
      .values({ ...parsed.data, email: parsed.data.email || null })
      .returning();
    res.status(201).json({ supplier: created });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ error: 'Failed to register supplier.' });
  }
});

router.post('/items', requireAuth, requirePermission('inventory:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid inventory item details.' });

    const [{ value: total }] = await db.select({ value: count() }).from(inventory);
    const itemCode = `INV-${String(Number(total) + 1).padStart(4, '0')}-${Math.floor(10 + Math.random() * 89)}`;
    const [created] = await db
      .insert(inventory)
      .values({
        ...parsed.data,
        itemCode,
        expiryDate: parsed.data.expiryDate || null,
        supplierId: parsed.data.supplierId ?? null,
      })
      .returning();

    if (created.quantity > 0) {
      await db.insert(stockMovements).values({
        itemType: 'Inventory',
        inventoryItemId: created.id,
        movementType: 'Purchase',
        quantityDelta: created.quantity,
        referenceNote: 'Opening inventory stock',
        performedByUserId: req.authUser?.id ?? null,
      });
    }

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'CREATE_INVENTORY_ITEM',
      module: 'Inventory',
      entityType: 'inventory',
      entityId: created.id,
      details: `Added ${created.name} (${created.itemCode})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ item: created });
  } catch (error) {
    console.error('Create inventory item error:', error);
    res.status(500).json({ error: 'Failed to add inventory item.' });
  }
});

router.post('/movements', requireAuth, requirePermission('inventory:manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid stock movement payload.' });

    const d = parsed.data;
    const [item] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.id, d.inventoryItemId))
      .limit(1);
    if (!item) return res.status(404).json({ error: 'Inventory item not found.' });

    const delta = d.movementType === 'Issue' ? -d.quantity : d.quantity;
    const newQty = item.quantity + delta;
    if (newQty < 0) {
      return res.status(409).json({
        error: `Insufficient quantity for ${item.name}. Available: ${item.quantity} ${item.unit}.`,
      });
    }

    const [updated] = await db
      .update(inventory)
      .set({ quantity: newQty, updatedAt: new Date() })
      .where(eq(inventory.id, item.id))
      .returning();

    await db.insert(stockMovements).values({
      itemType: 'Inventory',
      inventoryItemId: item.id,
      movementType: d.movementType,
      quantityDelta: delta,
      referenceNote: d.referenceNote || `${d.movementType} recorded`,
      performedByUserId: req.authUser?.id ?? null,
    });

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: `INVENTORY_${d.movementType.toUpperCase()}`,
      module: 'Inventory',
      entityType: 'inventory',
      entityId: item.id,
      details: `${d.movementType} ${d.quantity} ${item.unit} of ${item.name}`,
      ipAddress: req.ip,
    });

    res.json({ item: updated });
  } catch (error) {
    console.error('Inventory movement error:', error);
    res.status(500).json({ error: 'Failed to record stock movement.' });
  }
});

export default router;
