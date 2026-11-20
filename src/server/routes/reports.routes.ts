import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  admissions,
  appointments,
  consultations,
  departments,
  inventory,
  invoices,
  laboratoryRequests,
  laboratoryTests,
  medicines,
  patients,
  payments,
  pharmacyStock,
  staffProfiles,
  wards,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { recordAuditLog } from '../audit.ts';

const router = Router();

router.get('/', requireAuth, requirePermission('reports:read'), async (req: AuthRequest, res) => {
  try {
    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    const departmentId = Number(req.query.departmentId || 0);

    const [
      allPatients,
      allAppts,
      allConsultations,
      allAdmissions,
      allInvoices,
      allPayments,
      allMeds,
      allStock,
      allLabReqs,
      allInventory,
      allDepts,
      allStaff,
    ] = await Promise.all([
      db.select().from(patients).orderBy(desc(patients.createdAt)),
      db
        .select({
          id: appointments.id,
          appointmentNumber: appointments.appointmentNumber,
          appointmentDate: appointments.appointmentDate,
          appointmentTime: appointments.appointmentTime,
          status: appointments.status,
          departmentId: appointments.departmentId,
          departmentName: departments.name,
          doctorId: appointments.doctorId,
          doctorName: staffProfiles.fullName,
          patientName: patients.fullName,
        })
        .from(appointments)
        .leftJoin(departments, eq(appointments.departmentId, departments.id))
        .leftJoin(staffProfiles, eq(appointments.doctorId, staffProfiles.id))
        .leftJoin(patients, eq(appointments.patientId, patients.id)),
      db
        .select({
          id: consultations.id,
          doctorId: consultations.doctorId,
          doctorName: staffProfiles.fullName,
          departmentId: consultations.departmentId,
          diagnosis: consultations.diagnosis,
          createdAt: consultations.createdAt,
        })
        .from(consultations)
        .leftJoin(staffProfiles, eq(consultations.doctorId, staffProfiles.id)),
      db
        .select({
          id: admissions.id,
          admissionNumber: admissions.admissionNumber,
          patientName: patients.fullName,
          wardName: wards.name,
          departmentId: wards.departmentId,
          status: admissions.status,
          admissionDate: admissions.admissionDate,
          dischargeDate: admissions.dischargeDate,
        })
        .from(admissions)
        .leftJoin(patients, eq(admissions.patientId, patients.id))
        .leftJoin(wards, eq(admissions.wardId, wards.id)),
      db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          patientName: patients.fullName,
          departmentId: invoices.departmentId,
          departmentName: departments.name,
          totalAmountMwk: invoices.totalAmountMwk,
          paidAmountMwk: invoices.paidAmountMwk,
          balanceMwk: invoices.balanceMwk,
          status: invoices.status,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .leftJoin(patients, eq(invoices.patientId, patients.id))
        .leftJoin(departments, eq(invoices.departmentId, departments.id)),
      db
        .select({
          id: payments.id,
          receiptNumber: payments.receiptNumber,
          amountMwk: payments.amountMwk,
          paymentMethod: payments.paymentMethod,
          paidAt: payments.paidAt,
          patientName: patients.fullName,
          departmentId: invoices.departmentId,
          departmentName: departments.name,
        })
        .from(payments)
        .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
        .leftJoin(departments, eq(invoices.departmentId, departments.id))
        .leftJoin(patients, eq(payments.patientId, patients.id)),
      db.select().from(medicines),
      db.select().from(pharmacyStock),
      db
        .select({
          id: laboratoryRequests.id,
          requestNumber: laboratoryRequests.requestNumber,
          testName: laboratoryTests.testName,
          category: laboratoryTests.category,
          priceMwk: laboratoryTests.priceMwk,
          status: laboratoryRequests.status,
          requestedAt: laboratoryRequests.requestedAt,
        })
        .from(laboratoryRequests)
        .leftJoin(laboratoryTests, eq(laboratoryRequests.testId, laboratoryTests.id)),
      db.select().from(inventory),
      db.select().from(departments),
      db.select().from(staffProfiles).where(eq(staffProfiles.staffType, 'Doctor')),
    ]);

    const inDateRange = (dateVal: Date | string | null | undefined) => {
      if (!dateVal) return true;
      const iso = typeof dateVal === 'string' ? dateVal.slice(0, 10) : dateVal.toISOString().slice(0, 10);
      if (startDate && iso < startDate) return false;
      if (endDate && iso > endDate) return false;
      return true;
    };

    const filteredPatients = allPatients.filter((p) => inDateRange(p.createdAt));
    const filteredAppts = allAppts.filter(
      (a) => inDateRange(a.appointmentDate) && (!departmentId || a.departmentId === departmentId)
    );
    const filteredConsults = allConsultations.filter(
      (c) => inDateRange(c.createdAt) && (!departmentId || c.departmentId === departmentId)
    );
    const filteredAdmissions = allAdmissions.filter(
      (a) => inDateRange(a.admissionDate) && (!departmentId || a.departmentId === departmentId)
    );
    const filteredInvoices = allInvoices.filter(
      (i) => inDateRange(i.createdAt) && (!departmentId || i.departmentId === departmentId)
    );
    const filteredPayments = allPayments.filter(
      (p) => inDateRange(p.paidAt) && (!departmentId || p.departmentId === departmentId)
    );
    const filteredLabs = allLabReqs.filter((l) => inDateRange(l.requestedAt));

    // Revenue by department
    const revByDeptMap = new Map<string, number>();
    for (const pay of filteredPayments) {
      const key = pay.departmentName || 'General / Pharmacy';
      revByDeptMap.set(key, (revByDeptMap.get(key) || 0) + Number(pay.amountMwk || 0));
    }

    // Payment method summary
    const revByMethodMap = new Map<string, number>();
    for (const pay of filteredPayments) {
      revByMethodMap.set(
        pay.paymentMethod,
        (revByMethodMap.get(pay.paymentMethod) || 0) + Number(pay.amountMwk || 0)
      );
    }

    // Doctor performance
    const doctorPerformance = allStaff.map((doc) => {
      const appts = filteredAppts.filter((a) => a.doctorId === doc.id);
      const consults = filteredConsults.filter((c) => c.doctorId === doc.id);
      return {
        doctorName: doc.fullName,
        specialization: doc.specialization,
        totalAppointments: appts.length,
        completedAppointments: appts.filter((a) => a.status === 'Completed').length,
        consultationsRecorded: consults.length,
      };
    });

    // Pharmacy stock summary
    const stockByMed = new Map<number, number>();
    for (const s of allStock) {
      stockByMed.set(s.medicineId, (stockByMed.get(s.medicineId) || 0) + s.quantity);
    }
    const pharmacyReport = allMeds.map((m) => ({
      medicineName: m.medicineName,
      category: m.category,
      totalQuantity: stockByMed.get(m.id) || 0,
      reorderLevel: m.reorderLevel,
      unitPriceMwk: m.unitPriceMwk,
      stockValuationMwk: (stockByMed.get(m.id) || 0) * m.unitPriceMwk,
    }));

    const totalRevenueMwk = filteredPayments.reduce((s, p) => s + Number(p.amountMwk || 0), 0);
    const totalBilledMwk = filteredInvoices.reduce((s, i) => s + Number(i.totalAmountMwk || 0), 0);
    const totalOutstandingMwk = filteredInvoices.reduce((s, i) => s + Number(i.balanceMwk || 0), 0);

    await recordAuditLog({
      userId: req.authUser?.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.roleName,
      action: 'VIEW_REPORTS',
      module: 'Reports',
      details: `Generated analytics report (dept: ${departmentId || 'All'})`,
      ipAddress: req.ip,
    });

    res.json({
      departments: allDepts,
      summary: {
        registrations: filteredPatients.length,
        appointments: filteredAppts.length,
        attendanceRate:
          filteredAppts.length > 0
            ? Math.round(
                (filteredAppts.filter((a) => a.status === 'Completed' || a.status === 'Checked in').length /
                  filteredAppts.length) *
                  100
              )
            : 0,
        admissions: filteredAdmissions.length,
        discharges: filteredAdmissions.filter((a) => a.status === 'Discharged').length,
        labRequests: filteredLabs.length,
        labCompleted: filteredLabs.filter((l) => l.status === 'Completed').length,
        totalBilledMwk,
        totalRevenueMwk,
        totalOutstandingMwk,
      },
      revenueByDepartment: Array.from(revByDeptMap.entries()).map(([department, amountMwk]) => ({
        department,
        amountMwk,
      })),
      revenueByMethod: Array.from(revByMethodMap.entries()).map(([method, amountMwk]) => ({
        method,
        amountMwk,
      })),
      doctorPerformance,
      pharmacyReport,
      outstandingInvoices: filteredInvoices.filter((i) => i.balanceMwk > 0),
      inventoryReport: allInventory,
      patientsList: filteredPatients,
      appointmentsList: filteredAppts,
      admissionsList: filteredAdmissions,
      labList: filteredLabs,
      paymentsList: filteredPayments,
    });
  } catch (error) {
    console.error('Reports generation error:', error);
    res.status(500).json({ error: 'Failed to generate analytical reports.' });
  }
});

export default router;
