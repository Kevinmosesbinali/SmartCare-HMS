import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, UserPlus } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatMwk, roleHasPermission } from '../lib/roles-config';

export const StaffModule: React.FC = () => {
  const { user, notify } = useAuth();
  const canManage = roleHasPermission(user?.roleSlug, 'staff:manage');

  const [staff, setStaff] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [filterType, setFilterType] = useState('All');
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    staffType: 'Doctor',
    specialization: '',
    licenseNumber: '',
    departmentId: '',
    phone: '',
    email: '',
    dutySchedule: 'Mon–Fri 07:30–16:30',
    consultationFeeMwk: 15000,
  });

  const [scheduleModal, setScheduleModal] = useState<{ doctor: any; items: any[] } | null>(null);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ staff: any[]; departments: any[] }>('/api/staff');
      setStaff(res.staff);
      setDepartments(res.departments);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load staff directory.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          departmentId: form.departmentId ? Number(form.departmentId) : null,
          consultationFeeMwk: Number(form.consultationFeeMwk || 0),
        }),
      });
      notify('success', 'Staff member registered.');
      setAddOpen(false);
      setForm({
        fullName: '',
        staffType: 'Doctor',
        specialization: '',
        licenseNumber: '',
        departmentId: '',
        phone: '',
        email: '',
        dutySchedule: 'Mon–Fri 07:30–16:30',
        consultationFeeMwk: 15000,
      });
      loadStaff();
    } catch (err: any) {
      notify('error', err.message || 'Failed to register staff.');
    }
  };

  const updateAvailability = async (id: number, availabilityStatus: string) => {
    try {
      await apiRequest(`/api/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ availabilityStatus }),
      });
      notify('success', `Availability updated to ${availabilityStatus}`);
      loadStaff();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update availability.');
    }
  };

  const openSchedule = async (doctor: any) => {
    try {
      const res = await apiRequest<{ schedule: any[] }>(`/api/staff/${doctor.id}/schedule`);
      setScheduleModal({ doctor, items: res.schedule });
    } catch (err: any) {
      notify('error', err.message || 'Failed to load doctor schedule.');
    }
  };

  const visible = staff.filter((s) => filterType === 'All' || s.staffType === filterType);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Doctors & Hospital Staff</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Department assignments, Medical Council registrations, duty rosters, and availability
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold rounded-lg whitespace-nowrap self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register Doctor / Staff</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-slate-200/70 rounded-lg self-start w-fit">
        {['All', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              filterType === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Staff ID</th>
                <th className="px-4 py-3 text-left font-semibold">Name & Specialisation</th>
                <th className="px-4 py-3 text-left font-semibold">Role / Department</th>
                <th className="px-4 py-3 text-left font-semibold">Duty Schedule</th>
                <th className="px-4 py-3 text-left font-semibold">Availability</th>
                <th className="px-4 py-3 text-right font-semibold">Fee / Roster</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    Loading staff directory...
                  </td>
                </tr>
              ) : (
                visible.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono-tabular text-xs font-semibold text-[#0F2942] whitespace-nowrap">
                      {s.staffNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{s.fullName}</div>
                      <div className="text-xs text-slate-500">
                        {s.specialization || s.staffType}
                        {s.licenseNumber ? ` · Reg: ${s.licenseNumber}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium text-slate-800">{s.staffType}</div>
                      <div className="text-slate-500">{s.departmentName || 'General'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{s.dutySchedule}</td>
                    <td className="px-4 py-3 text-xs">
                      {canManage ? (
                        <select
                          value={s.availabilityStatus}
                          onChange={(e) => updateAvailability(s.id, e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white"
                        >
                          <option>Available</option>
                          <option>On Duty</option>
                          <option>In Consultation</option>
                          <option>On Leave</option>
                          <option>Off Duty</option>
                        </select>
                      ) : (
                        <span className="font-semibold text-[#0D9488]">{s.availabilityStatus}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                      {s.staffType === 'Doctor' && (
                        <div className="flex items-center justify-end gap-3">
                          <span className="font-mono-tabular text-slate-700">
                            {formatMwk(s.consultationFeeMwk)}
                          </span>
                          <button
                            type="button"
                            onClick={() => openSchedule(s)}
                            className="inline-flex items-center gap-1 text-[#0D9488] font-semibold hover:underline"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Schedule</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Register Doctor or Staff Member"
        subtitle="Record professional registration, department, and duty schedule"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Category *</label>
              <select
                value={form.staffType}
                onChange={(e) => setForm({ ...form, staffType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option>Doctor</option>
                <option>Nurse</option>
                <option>Pharmacist</option>
                <option>Lab Technician</option>
                <option>Receptionist</option>
                <option>Accountant</option>
                <option>Administrator</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <select
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Specialisation</label>
              <input
                type="text"
                value={form.specialization}
                onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                placeholder="e.g. Internal Medicine"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">License / Council Reg</label>
              <input
                type="text"
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                placeholder="e.g. MCM-2026-0192"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Duty Schedule</label>
              <input
                type="text"
                value={form.dutySchedule}
                onChange={(e) => setForm({ ...form, dutySchedule: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Consultation Fee (MWK)</label>
              <input
                type="number"
                value={form.consultationFeeMwk}
                onChange={(e) => setForm({ ...form, consultationFeeMwk: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg"
            >
              Save Staff Profile
            </button>
          </div>
        </form>
      </Modal>

      {/* Doctor Schedule Modal */}
      <Modal
        open={Boolean(scheduleModal)}
        onClose={() => setScheduleModal(null)}
        title={scheduleModal ? `${scheduleModal.doctor.fullName} — Appointment Roster` : ''}
        subtitle={scheduleModal?.doctor.dutySchedule}
      >
        <div className="space-y-2">
          {(scheduleModal?.items || []).length === 0 ? (
            <p className="text-xs text-slate-500">No appointments assigned to this doctor yet.</p>
          ) : (
            scheduleModal?.items.map((ap) => (
              <div key={ap.id} className="p-3 border border-slate-200 rounded-lg flex justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900">
                    {ap.patientName} ({ap.patientNumber})
                  </div>
                  <div className="text-slate-500">{ap.reason}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono-tabular font-semibold text-slate-900">
                    {ap.appointmentDate} · {ap.appointmentTime}
                  </div>
                  <div className="text-[#0D9488] font-semibold">{ap.status}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};
