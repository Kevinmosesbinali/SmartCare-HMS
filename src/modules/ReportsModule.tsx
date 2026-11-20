import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, exportToCsv } from '../lib/api';
import { formatMwk } from '../lib/roles-config';

export const ReportsModule: React.FC = () => {
  const { notify } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [reportTab, setReportTab] = useState<
    | 'financial'
    | 'doctors'
    | 'pharmacy'
    | 'patients'
    | 'appointments'
    | 'admissions'
    | 'laboratory'
    | 'inventory'
  >('financial');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (departmentId) params.set('departmentId', departmentId);
      const res = await apiRequest<any>(`/api/reports?${params.toString()}`);
      setData(res);
    } catch (err: any) {
      notify('error', err.message || 'Failed to generate reports.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, departmentId, notify]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleDownloadCsv = () => {
    if (!data) return;
    const map: Record<string, any[]> = {
      financial: data.paymentsList || [],
      doctors: data.doctorPerformance || [],
      pharmacy: data.pharmacyReport || [],
      patients: data.patientsList || [],
      appointments: data.appointmentsList || [],
      admissions: data.admissionsList || [],
      laboratory: data.labList || [],
      inventory: data.inventoryReport || [],
    };
    exportToCsv(`smartcare_${reportTab}_report.csv`, map[reportTab] || []);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Hospital Reports & Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Downloadable CSV and printable operational, clinical, and MWK financial reports
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50"
          >
            <Download className="w-4 h-4 text-[#0D9488]" />
            <span>Download CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F2942] text-white text-xs font-semibold rounded-lg"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-4 no-print">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">To Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Department</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Departments</option>
            {(data?.departments || []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Summary */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Registrations</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums">{data.summary.registrations}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Attendance Rate</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums">{data.summary.attendanceRate}%</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Admissions / Discharges</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums">
              {data.summary.admissions} / {data.summary.discharges}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Revenue Collected</div>
            <div className="mt-1 font-display text-lg font-bold text-emerald-700 font-mono-tabular">
              {formatMwk(data.summary.totalRevenueMwk)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Outstanding Balances</div>
            <div className="mt-1 font-display text-lg font-bold text-amber-700 font-mono-tabular">
              {formatMwk(data.summary.totalOutstandingMwk)}
            </div>
          </div>
        </div>
      )}

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-200/70 rounded-lg no-print">
        {(
          [
            { id: 'financial', label: 'Financial & Revenue' },
            { id: 'doctors', label: 'Doctor Performance' },
            { id: 'pharmacy', label: 'Pharmacy Stock' },
            { id: 'patients', label: 'Patient Registrations' },
            { id: 'appointments', label: 'Appointments' },
            { id: 'admissions', label: 'Admissions' },
            { id: 'laboratory', label: 'Laboratory' },
            { id: 'inventory', label: 'Inventory' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setReportTab(t.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              reportTab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
          Compiling report metrics...
        </div>
      ) : (
        <div className="space-y-6 print-only-full">
          {reportTab === 'financial' && data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="font-display text-sm font-bold text-slate-900 mb-3">
                  Revenue by Department (MWK)
                </h2>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.revenueByDepartment}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => formatMwk(v)} />
                      <Bar dataKey="amountMwk" fill="#0F2942" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="font-display text-sm font-bold text-slate-900 mb-3">
                  Outstanding Balance Invoices
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 text-left">Invoice</th>
                        <th className="py-2 text-left">Patient</th>
                        <th className="py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.outstandingInvoices.map((inv: any) => (
                        <tr key={inv.id}>
                          <td className="py-2 font-mono-tabular font-semibold">{inv.invoiceNumber}</td>
                          <td className="py-2">{inv.patientName}</td>
                          <td className="py-2 text-right font-mono-tabular text-red-700 font-bold">
                            {formatMwk(inv.balanceMwk)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {reportTab === 'doctors' && data && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Doctor</th>
                    <th className="px-4 py-3 text-left">Specialisation</th>
                    <th className="px-4 py-3 text-right">Total Appointments</th>
                    <th className="px-4 py-3 text-right">Completed</th>
                    <th className="px-4 py-3 text-right">Consultations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.doctorPerformance.map((d: any) => (
                    <tr key={d.doctorName}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{d.doctorName}</td>
                      <td className="px-4 py-3 text-slate-600">{d.specialization}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.totalAppointments}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.completedAppointments}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-[#0D9488]">
                        {d.consultationsRecorded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reportTab === 'pharmacy' && data && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Medicine</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">Stock Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Valuation (MWK)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.pharmacyReport.map((p: any) => (
                    <tr key={p.medicineName}>
                      <td className="px-4 py-3 font-semibold">{p.medicineName}</td>
                      <td className="px-4 py-3 text-slate-600">{p.category}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{p.totalQuantity}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{formatMwk(p.unitPriceMwk)}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-semibold">{formatMwk(p.stockValuationMwk)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(reportTab === 'patients' ||
            reportTab === 'appointments' ||
            reportTab === 'admissions' ||
            reportTab === 'laboratory' ||
            reportTab === 'inventory') &&
            data && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Reference</th>
                      <th className="px-4 py-3 text-left">Primary Subject</th>
                      <th className="px-4 py-3 text-left">Detail</th>
                      <th className="px-4 py-3 text-left">Status / Metric</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportTab === 'patients' &&
                      data.patientsList.map((p: any) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3 font-mono-tabular font-semibold">{p.patientNumber}</td>
                          <td className="px-4 py-3 font-semibold">{p.fullName}</td>
                          <td className="px-4 py-3">{p.gender} · {p.phone}</td>
                          <td className="px-4 py-3">{p.isDemoRecord ? 'Demo' : 'Facility'}</td>
                        </tr>
                      ))}
                    {reportTab === 'appointments' &&
                      data.appointmentsList.map((a: any) => (
                        <tr key={a.id}>
                          <td className="px-4 py-3 font-mono-tabular">{a.appointmentNumber}</td>
                          <td className="px-4 py-3 font-semibold">{a.patientName}</td>
                          <td className="px-4 py-3">{a.doctorName} · {a.appointmentDate} {a.appointmentTime}</td>
                          <td className="px-4 py-3 font-semibold">{a.status}</td>
                        </tr>
                      ))}
                    {reportTab === 'admissions' &&
                      data.admissionsList.map((ad: any) => (
                        <tr key={ad.id}>
                          <td className="px-4 py-3 font-mono-tabular">{ad.admissionNumber}</td>
                          <td className="px-4 py-3 font-semibold">{ad.patientName}</td>
                          <td className="px-4 py-3">{ad.wardName}</td>
                          <td className="px-4 py-3 font-semibold">{ad.status}</td>
                        </tr>
                      ))}
                    {reportTab === 'laboratory' &&
                      data.labList.map((l: any) => (
                        <tr key={l.id}>
                          <td className="px-4 py-3 font-mono-tabular">{l.requestNumber}</td>
                          <td className="px-4 py-3 font-semibold">{l.testName}</td>
                          <td className="px-4 py-3">{l.category}</td>
                          <td className="px-4 py-3 font-semibold">{l.status}</td>
                        </tr>
                      ))}
                    {reportTab === 'inventory' &&
                      data.inventoryReport.map((inv: any) => (
                        <tr key={inv.id}>
                          <td className="px-4 py-3 font-mono-tabular">{inv.itemCode}</td>
                          <td className="px-4 py-3 font-semibold">{inv.name}</td>
                          <td className="px-4 py-3">{inv.category} · {inv.location}</td>
                          <td className="px-4 py-3 font-mono-tabular font-semibold">{inv.quantity} {inv.unit}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  );
};
