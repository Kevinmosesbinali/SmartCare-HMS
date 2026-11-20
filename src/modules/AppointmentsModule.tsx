import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { roleHasPermission } from '../lib/roles-config';

interface AppointmentRow {
  id: number;
  appointmentNumber: string;
  patientId: number;
  patientName: string;
  patientNumber: string;
  doctorId: number;
  doctorName: string;
  departmentId: number;
  departmentName: string;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
  reason: string;
  status: 'Scheduled' | 'Confirmed' | 'Checked in' | 'Completed' | 'Cancelled' | 'No-show';
  notes: string;
}

export const AppointmentsModule: React.FC = () => {
  const { user, notify, confirmAction } = useAuth();
  const canManage = roleHasPermission(user?.roleSlug, 'appointments:manage');

  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState('All');

  const [bookOpen, setBookOpen] = useState(false);
  const [form, setForm] = useState({
    patientId: '',
    doctorId: '',
    departmentId: '',
    appointmentDate: new Date().toISOString().slice(0, 10),
    appointmentTime: '09:00',
    durationMinutes: 30,
    reason: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentRow | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [apptRes, staffRes, patRes] = await Promise.all([
        apiRequest<{ appointments: AppointmentRow[] }>('/api/appointments'),
        apiRequest<{ staff: any[]; departments: any[] }>('/api/staff'),
        apiRequest<{ patients: any[] }>('/api/patients'),
      ]);
      setAppointments(apptRes.appointments);
      setDoctors(staffRes.staff.filter((s) => s.staffType === 'Doctor'));
      setDepartments(staffRes.departments);
      setPatients(patRes.patients);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load appointments.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(form.patientId),
          doctorId: Number(form.doctorId),
          departmentId: Number(form.departmentId),
          appointmentDate: form.appointmentDate,
          appointmentTime: form.appointmentTime,
          durationMinutes: Number(form.durationMinutes),
          reason: form.reason,
          notes: form.notes,
        }),
      });
      notify('success', 'Appointment booked successfully.');
      setBookOpen(false);
      setForm({ ...form, reason: '', notes: '' });
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Could not schedule appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (appt: AppointmentRow, status: AppointmentRow['status']) => {
    if (status === 'Cancelled') {
      const ok = await confirmAction({
        title: 'Cancel Appointment',
        description: `Cancel ${appt.appointmentNumber} for ${appt.patientName}?`,
        confirmLabel: 'Cancel Appointment',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await apiRequest(`/api/appointments/${appt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify('success', `Appointment updated to ${status}`);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update status.');
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    try {
      await apiRequest(`/api/appointments/${rescheduleTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'Scheduled',
          appointmentDate: rescheduleDate,
          appointmentTime: rescheduleTime,
        }),
      });
      notify('success', 'Appointment rescheduled.');
      setRescheduleTarget(null);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Reschedule conflict or error.');
    }
  };

  const visibleAppointments = appointments.filter((a) => {
    if (statusFilter !== 'All' && a.status !== statusFilter) return false;
    if (viewMode === 'daily') {
      return a.appointmentDate === selectedDate;
    }
    if (viewMode === 'weekly') {
      const base = new Date(selectedDate);
      const target = new Date(a.appointmentDate);
      const diffDays = Math.abs((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    }
    // monthly
    return a.appointmentDate.slice(0, 7) === selectedDate.slice(0, 7);
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'text-emerald-700';
      case 'Checked in':
        return 'text-[#0D9488]';
      case 'Confirmed':
        return 'text-blue-700';
      case 'Cancelled':
      case 'No-show':
        return 'text-red-700';
      default:
        return 'text-amber-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Appointment Scheduling</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Doctor rosters with automatic conflict detection, check-ins, and attendance tracking
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setBookOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>Book Appointment</span>
          </button>
        )}
      </div>

      {/* Calendar Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['daily', 'weekly', 'monthly'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${
                  viewMode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono-tabular"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
          >
            <option value="All">All Statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Checked in">Checked in</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
            <option value="No-show">No-show</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 tabular-nums">
          Showing {visibleAppointments.length} appointment(s)
        </div>
      </div>

      {/* Appointments Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Ref / Slot</th>
                <th className="px-4 py-3 text-left font-semibold">Patient</th>
                <th className="px-4 py-3 text-left font-semibold">Doctor & Department</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Workflow Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    Loading schedule...
                  </td>
                </tr>
              ) : visibleAppointments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    No appointments scheduled for this {viewMode} view.
                  </td>
                </tr>
              ) : (
                visibleAppointments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-mono-tabular text-xs font-semibold text-slate-900">
                        {a.appointmentDate} · {a.appointmentTime}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono-tabular">
                        {a.appointmentNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{a.patientName}</div>
                      <div className="text-xs text-slate-500 font-mono-tabular">{a.patientNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{a.doctorName}</div>
                      <div className="text-xs text-slate-500">{a.departmentName}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-xs truncate">
                      {a.reason}
                    </td>
                    <td className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${statusColor(a.status)}`}>
                      {a.status}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      {a.status === 'Scheduled' && (
                        <button
                          type="button"
                          onClick={() => updateStatus(a, 'Confirmed')}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          Confirm
                        </button>
                      )}
                      {(a.status === 'Scheduled' || a.status === 'Confirmed') && (
                        <button
                          type="button"
                          onClick={() => updateStatus(a, 'Checked in')}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D9488] hover:underline"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Check In</span>
                        </button>
                      )}
                      {a.status === 'Checked in' && (
                        <button
                          type="button"
                          onClick={() => updateStatus(a, 'Completed')}
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          Complete
                        </button>
                      )}
                      {canManage && a.status !== 'Completed' && a.status !== 'Cancelled' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRescheduleTarget(a);
                              setRescheduleDate(a.appointmentDate);
                              setRescheduleTime(a.appointmentTime);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Reschedule</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(a, 'No-show')}
                            className="text-xs font-medium text-amber-700 hover:underline"
                          >
                            No-show
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(a, 'Cancelled')}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Book Appointment Modal */}
      <Modal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        title="Schedule New Appointment"
        subtitle="System automatically prevents overlapping bookings for the selected doctor"
      >
        <form onSubmit={handleBook} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Patient *</label>
              <select
                required
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.patientNumber})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department *</label>
              <select
                required
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select department...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Doctor *</label>
              <select
                required
                value={form.doctorId}
                onChange={(e) => {
                  const doc = doctors.find((d) => String(d.id) === e.target.value);
                  setForm({
                    ...form,
                    doctorId: e.target.value,
                    departmentId: form.departmentId || (doc?.departmentId ? String(doc.departmentId) : ''),
                  });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select doctor...</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName} ({d.availabilityStatus})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={form.appointmentDate}
                onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Time & Duration *</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  required
                  value={form.appointmentTime}
                  onChange={(e) => setForm({ ...form, appointmentTime: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <select
                  value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Visit *</label>
              <input
                type="text"
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Antenatal follow-up, Fever & cough assessment"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setBookOpen(false)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#163A5C] rounded-lg"
            >
              {submitting ? 'Booking...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        open={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Reschedule Appointment"
        subtitle={rescheduleTarget ? `${rescheduleTarget.appointmentNumber} · ${rescheduleTarget.patientName}` : ''}
        size="md"
      >
        <form onSubmit={handleReschedule} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Date</label>
              <input
                type="date"
                required
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Time</label>
              <input
                type="time"
                required
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setRescheduleTarget(null)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Save New Slot</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
