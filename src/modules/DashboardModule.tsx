import React, { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  BedDouble,
  CalendarPlus,
  CreditCard,
  FlaskConical,
  Pill,
  Stethoscope,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { ModuleKey, formatMwk, getRoleModules } from '../lib/roles-config';

interface DashboardData {
  kpis: {
    totalPatients: number;
    todaysAppointments: number;
    admittedPatients: number;
    availableDoctors: number;
    pendingLabTests: number;
    pendingPrescriptions: number;
    totalRevenueMwk: number;
    outstandingBalancesMwk: number;
    availableMedicineUnits: number;
  };
  trends: {
    date: string;
    label: string;
    registrations: number;
    appointments: number;
    revenueMwk: number;
  }[];
  departmentPerformance: {
    department: string;
    code: string;
    appointments: number;
    revenueMwk: number;
  }[];
  recentActivities: {
    id: number;
    userName: string;
    userRole: string;
    action: string;
    module: string;
    details: string;
    createdAt: string;
  }[];
  recentTransactions: {
    id: number;
    receiptNumber: string;
    amountMwk: number;
    paymentMethod: string;
    paidAt: string;
    patientName: string;
    patientNumber: string;
  }[];
}

export const DashboardModule: React.FC<{ onNavigate: (m: ModuleKey) => void }> = ({
  onNavigate,
}) => {
  const { user } = useAuth();
  const [range, setRange] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DashboardData>(`/api/dashboard/summary?range=${range}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Unable to load dashboard analytics.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const allowed = getRoleModules(user?.roleSlug);

  const quickActions: { label: string; module: ModuleKey; icon: React.ComponentType<{ className?: string }> }[] = (
    [
      { label: 'Register Patient', module: 'patients' as ModuleKey, icon: UserPlus },
      { label: 'Book Appointment', module: 'appointments' as ModuleKey, icon: CalendarPlus },
      { label: 'New Consultation', module: 'consultations' as ModuleKey, icon: Stethoscope },
      { label: 'Ward Admissions', module: 'admissions' as ModuleKey, icon: BedDouble },
      { label: 'Dispense Rx', module: 'pharmacy' as ModuleKey, icon: Pill },
      { label: 'Lab Queue', module: 'laboratory' as ModuleKey, icon: FlaskConical },
      { label: 'Record Payment', module: 'billing' as ModuleKey, icon: CreditCard },
    ] as const
  ).filter((a) => allowed.includes(a.module));

  return (
    <div className="space-y-6">
      {/* Header & Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Hospital Operations Overview
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Live clinical, pharmacy, laboratory, and MWK billing metrics from PostgreSQL
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {(['daily', 'weekly', 'monthly'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors whitespace-nowrap ${
                range === r
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {quickActions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.label}
              type="button"
              onClick={() => onNavigate(act.module)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:border-[#0D9488] hover:text-[#0D9488] rounded-lg text-xs font-semibold text-slate-700 transition-colors whitespace-nowrap"
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{act.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* KPI Grid (9 core metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          {
            label: 'Total Registered Patients',
            value: data ? String(data.kpis.totalPatients) : '—',
            sub: 'Active EHR dossiers',
            module: 'patients' as ModuleKey,
          },
          {
            label: "Today's Appointments",
            value: data ? String(data.kpis.todaysAppointments) : '—',
            sub: 'Scheduled clinic visits',
            module: 'appointments' as ModuleKey,
          },
          {
            label: 'Currently Admitted',
            value: data ? String(data.kpis.admittedPatients) : '—',
            sub: 'Occupied inpatient beds',
            module: 'admissions' as ModuleKey,
          },
          {
            label: 'Available Doctors',
            value: data ? String(data.kpis.availableDoctors) : '—',
            sub: 'Registered medical officers',
            module: 'staff' as ModuleKey,
          },
          {
            label: 'Pending Lab Tests',
            value: data ? String(data.kpis.pendingLabTests) : '—',
            sub: 'Awaiting specimen or result',
            module: 'laboratory' as ModuleKey,
          },
          {
            label: 'Pending Prescriptions',
            value: data ? String(data.kpis.pendingPrescriptions) : '—',
            sub: 'Awaiting pharmacy dispensing',
            module: 'pharmacy' as ModuleKey,
          },
          {
            label: `Revenue (${range})`,
            value: data ? formatMwk(data.kpis.totalRevenueMwk) : '—',
            sub: 'Collected receipts',
            module: 'billing' as ModuleKey,
          },
          {
            label: 'Outstanding Balances',
            value: data ? formatMwk(data.kpis.outstandingBalancesMwk) : '—',
            sub: 'Unpaid & partial invoices',
            module: 'billing' as ModuleKey,
          },
          {
            label: 'Medicine Stock Units',
            value: data ? data.kpis.availableMedicineUnits.toLocaleString() : '—',
            sub: 'Total dispensary units',
            module: 'pharmacy' as ModuleKey,
          },
        ].map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            disabled={loading || !allowed.includes(kpi.module)}
            onClick={() => allowed.includes(kpi.module) && onNavigate(kpi.module)}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-[#0D9488]/60 transition-colors disabled:hover:border-slate-200"
          >
            <div className="text-xs font-medium text-slate-500">{kpi.label}</div>
            <div className="mt-2 font-display text-xl font-bold text-slate-900 tabular-nums">
              {loading ? '...' : kpi.value}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{kpi.sub}</div>
          </button>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                7-Day Revenue Trend (MWK)
              </h2>
              <p className="text-xs text-slate-500">Daily collected payments across all desks</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  formatter={(val: any) => [formatMwk(val), 'Revenue']}
                  contentStyle={{ borderRadius: '8px', borderColor: '#E2E8F0', fontSize: '12px' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenueMwk"
                  stroke="#0D9488"
                  fill="#0D9488"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Patient Registrations & Appointments
              </h2>
              <p className="text-xs text-slate-500">7-day clinic throughput comparison</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.trends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', borderColor: '#E2E8F0', fontSize: '12px' }}
                />
                <Bar dataKey="appointments" name="Appointments" fill="#0F2942" radius={[4, 4, 0, 0]} />
                <Bar dataKey="registrations" name="New Patients" fill="#0D9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Department Performance + Recent Transactions + Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
            Department Performance
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-semibold">Department</th>
                  <th className="py-2 text-right font-semibold">Visits</th>
                  <th className="py-2 text-right font-semibold">Paid (MWK)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.departmentPerformance || []).map((dept) => (
                  <tr key={dept.code} className="hover:bg-slate-50">
                    <td className="py-2.5 font-medium text-slate-800">{dept.department}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">
                      {dept.appointments}
                    </td>
                    <td className="py-2.5 text-right font-mono-tabular text-slate-900">
                      {formatMwk(dept.revenueMwk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Recent Transactions
            </h2>
            {allowed.includes('billing') && (
              <button
                type="button"
                onClick={() => onNavigate('billing')}
                className="text-xs font-semibold text-[#0D9488] hover:underline inline-flex items-center gap-1"
              >
                <span>Ledger</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {(data?.recentTransactions || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No transactions recorded yet.</p>
            ) : (
              data?.recentTransactions.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {tx.patientName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tx.receiptNumber} · {tx.paymentMethod}
                    </div>
                  </div>
                  <div className="text-xs font-mono-tabular font-semibold text-emerald-700 shrink-0">
                    {formatMwk(tx.amountMwk)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
            Recent Hospital Activities
          </h2>
          <div className="divide-y divide-slate-100">
            {(data?.recentActivities || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-4">System audit stream is ready.</p>
            ) : (
              data?.recentActivities.map((act) => (
                <div key={act.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">{act.action}</span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {new Date(act.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 truncate">{act.details}</div>
                  <div className="text-[11px] text-slate-400">
                    {act.userName} · {act.module}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
