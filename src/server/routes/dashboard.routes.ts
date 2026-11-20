import { Router } from 'express';
import { count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  admissions,
  appointments,
  auditLogs,
  departments,
  invoices,
  laboratoryRequests,
  patients,
  payments,
  pharmacyStock,
  prescriptions,
  staffProfiles,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';

const router = Router();

router.get('/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const range = String(req.query.range || 'monthly');
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const startDate = new Date(now);
    if (range === 'daily') {
      startDate.setDate(now.getDate() - 1);
    } else if (range === 'weekly') {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setDate(now.getDate() - 30);
    }

    const [
      patientTotalRow,
      todayApptRow,
      admittedRow,
      availableDocsRow,
      pendingLabRow,
      pendingRxRow,
      revenueRow,
      outstandingRow,
      medicineStockRow,
    ] = await Promise.all([
      db.select({ value: count() }).from(patients),
      db
        .select({ value: count() })
        .from(appointments)
        .where(eq(appointments.appointmentDate, todayStr)),
      db
        .select({ value: count() })
        .from(admissions)
        .where(eq(admissions.status, 'Admitted')),
      db
        .select({ value: count() })
        .from(staffProfiles)
        .where(eq(staffProfiles.staffType, 'Doctor')),
      db
        .select({ value: count() })
        .from(laboratoryRequests)
        .where(sql`${laboratoryRequests.status} IN ('Requested', 'Sample collected', 'Processing')`),
      db
        .select({ value: count() })
        .from(prescriptions)
        .where(sql`${prescriptions.status} IN ('Pending', 'Partially Dispensed')`),
      db
        .select({
          total: sql<number>`COALESCE(SUM(${payments.amountMwk}), 0)`,
        })
        .from(payments)
        .where(gte(payments.paidAt, startDate)),
      db
        .select({
          total: sql<number>`COALESCE(SUM(${invoices.balanceMwk}), 0)`,
        })
        .from(invoices)
        .where(sql`${invoices.status} IN ('Unpaid', 'Partial')`),
      db
        .select({
          total: sql<number>`COALESCE(SUM(${pharmacyStock.quantity}), 0)`,
        })
        .from(pharmacyStock),
    ]);

    const recentActivities = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(8);

    const recentTransactions = await db
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        amountMwk: payments.amountMwk,
        paymentMethod: payments.paymentMethod,
        paidAt: payments.paidAt,
        patientName: patients.fullName,
        patientNumber: patients.patientNumber,
      })
      .from(payments)
      .leftJoin(patients, eq(payments.patientId, patients.id))
      .orderBy(desc(payments.paidAt))
      .limit(6);

    const deptPerformance = await db
      .select({
        department: departments.name,
        code: departments.code,
        appointments: sql<number>`COUNT(DISTINCT ${appointments.id})`,
        revenueMwk: sql<number>`COALESCE(SUM(${invoices.paidAmountMwk}), 0)`,
      })
      .from(departments)
      .leftJoin(appointments, eq(appointments.departmentId, departments.id))
      .leftJoin(invoices, eq(invoices.departmentId, departments.id))
      .groupBy(departments.id, departments.name, departments.code);

    const allPatients = await db
      .select({ createdAt: patients.createdAt })
      .from(patients);

    const allPayments = await db
      .select({ amountMwk: payments.amountMwk, paidAt: payments.paidAt })
      .from(payments);

    const allAppts = await db
      .select({ appointmentDate: appointments.appointmentDate, status: appointments.status })
      .from(appointments);

    // Build 7-day trend series from real database rows
    const trendDays: {
      date: string;
      label: string;
      registrations: number;
      appointments: number;
      revenueMwk: number;
    }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
      const registrations = allPatients.filter(
        (p) => p.createdAt && p.createdAt.toISOString().slice(0, 10) === iso
      ).length;
      const apptsCount = allAppts.filter((a) => a.appointmentDate === iso).length;
      const rev = allPayments
        .filter((pay) => pay.paidAt && pay.paidAt.toISOString().slice(0, 10) === iso)
        .reduce((acc, cur) => acc + Number(cur.amountMwk || 0), 0);
      trendDays.push({
        date: iso,
        label,
        registrations,
        appointments: apptsCount,
        revenueMwk: rev,
      });
    }

    res.json({
      kpis: {
        totalPatients: Number(patientTotalRow[0]?.value ?? 0),
        todaysAppointments: Number(todayApptRow[0]?.value ?? 0),
        admittedPatients: Number(admittedRow[0]?.value ?? 0),
        availableDoctors: Number(availableDocsRow[0]?.value ?? 0),
        pendingLabTests: Number(pendingLabRow[0]?.value ?? 0),
        pendingPrescriptions: Number(pendingRxRow[0]?.value ?? 0),
        totalRevenueMwk: Number(revenueRow[0]?.total ?? 0),
        outstandingBalancesMwk: Number(outstandingRow[0]?.total ?? 0),
        availableMedicineUnits: Number(medicineStockRow[0]?.total ?? 0),
      },
      trends: trendDays,
      departmentPerformance: deptPerformance.map((d) => ({
        department: d.department,
        code: d.code,
        appointments: Number(d.appointments || 0),
        revenueMwk: Number(d.revenueMwk || 0),
      })),
      recentActivities,
      recentTransactions,
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Unable to load dashboard metrics.' });
  }
});

export default router;
