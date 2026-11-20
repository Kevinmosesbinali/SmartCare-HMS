import React, { useCallback, useEffect, useState } from 'react';
import { BedDouble, ClipboardList, LogOut } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatMwk, roleHasPermission } from '../lib/roles-config';

export const AdmissionsModule: React.FC = () => {
  const { user, notify } = useAuth();
  const canManage = roleHasPermission(user?.roleSlug, 'admissions:manage');

  const [wards, setWards] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [admitOpen, setAdmitOpen] = useState(false);
  const [admitForm, setAdmitForm] = useState({
    patientId: '',
    wardId: '',
    bedId: '',
    admittingDoctorId: '',
    admissionReason: '',
  });

  const [dischargeTarget, setDischargeTarget] = useState<any | null>(null);
  const [dischargeForm, setDischargeForm] = useState({
    dischargeSummary: '',
    dischargeCondition: 'Stable & Improved',
    billWardStay: true,
  });

  const [obsTarget, setObsTarget] = useState<any | null>(null);
  const [obsForm, setObsForm] = useState({
    tempC: '36.8',
    bloodPressure: '120/80',
    pulseBpm: '78',
    spo2: '98',
    nursingNote: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [admRes, patRes, stfRes] = await Promise.all([
        apiRequest<{ wards: any[]; beds: any[]; admissions: any[] }>('/api/admissions'),
        apiRequest<{ patients: any[] }>('/api/patients'),
        apiRequest<{ staff: any[] }>('/api/staff'),
      ]);
      setWards(admRes.wards);
      setBeds(admRes.beds);
      setAdmissions(admRes.admissions);
      setPatients(patRes.patients);
      setDoctors(stfRes.staff.filter((s) => s.staffType === 'Doctor'));
    } catch (err: any) {
      notify('error', err.message || 'Failed to load wards and admissions.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admissions/admit', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(admitForm.patientId),
          wardId: Number(admitForm.wardId),
          bedId: Number(admitForm.bedId),
          admittingDoctorId: Number(admitForm.admittingDoctorId),
          admissionReason: admitForm.admissionReason,
        }),
      });
      notify('success', 'Patient admitted and bed assigned.');
      setAdmitOpen(false);
      setAdmitForm({
        patientId: '',
        wardId: '',
        bedId: '',
        admittingDoctorId: '',
        admissionReason: '',
      });
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Admission failed.');
    }
  };

  const handleDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dischargeTarget) return;
    try {
      await apiRequest(`/api/admissions/${dischargeTarget.id}/discharge`, {
        method: 'POST',
        body: JSON.stringify(dischargeForm),
      });
      notify('success', 'Patient discharged and bed freed.');
      setDischargeTarget(null);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Discharge failed.');
    }
  };

  const handleRecordObs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsTarget) return;
    try {
      await apiRequest('/api/consultations/vitals', {
        method: 'POST',
        body: JSON.stringify({
          patientId: obsTarget.patientId,
          admissionId: obsTarget.id,
          tempC: obsForm.tempC,
          bloodPressure: obsForm.bloodPressure,
          pulseBpm: Number(obsForm.pulseBpm || 75),
          spo2: Number(obsForm.spo2 || 98),
          nursingNote: obsForm.nursingNote,
        }),
      });
      notify('success', 'Daily ward observation recorded.');
      setObsTarget(null);
      setObsForm({ ...obsForm, nursingNote: '' });
    } catch (err: any) {
      notify('error', err.message || 'Failed to save ward observation.');
    }
  };

  const availableBedsForWard = beds.filter(
    (b) => String(b.wardId) === admitForm.wardId && (b.status === 'Available' || b.status === 'Reserved')
  );

  const bedCounts = {
    available: beds.filter((b) => b.status === 'Available').length,
    occupied: beds.filter((b) => b.status === 'Occupied').length,
    reserved: beds.filter((b) => b.status === 'Reserved').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Admissions & Ward Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time bed availability ({bedCounts.available} available · {bedCounts.occupied} occupied · {bedCounts.reserved} reserved)
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setAdmitOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold rounded-lg whitespace-nowrap self-start sm:self-auto"
          >
            <BedDouble className="w-4 h-4" />
            <span>Admit Patient</span>
          </button>
        )}
      </div>

      {/* Ward & Bed Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wards.map((ward) => {
          const wBeds = beds.filter((b) => b.wardId === ward.id);
          return (
            <div key={ward.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">{ward.name}</h2>
                  <div className="text-xs text-slate-500">
                    {ward.wardType} · {formatMwk(ward.dailyRateMwk)} / day
                  </div>
                </div>
                <div className="text-xs font-mono-tabular text-slate-600">
                  {wBeds.filter((b) => b.status === 'Available').length}/{wBeds.length} free
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {wBeds.map((bed) => {
                  const occ = admissions.find(
                    (a) => a.bedId === bed.id && a.status === 'Admitted'
                  );
                  const style =
                    bed.status === 'Occupied'
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : bed.status === 'Reserved'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900';

                  return (
                    <div key={bed.id} className={`p-2.5 rounded-lg border text-xs ${style}`}>
                      <div className="font-mono-tabular font-bold">{bed.bedNumber}</div>
                      <div className="text-[11px] font-medium mt-0.5 truncate">
                        {occ ? occ.patientName : bed.status}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inpatient Admissions Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-bold text-slate-900">
          Inpatient Admissions Ledger
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Admission #</th>
                <th className="px-4 py-3 text-left font-semibold">Patient</th>
                <th className="px-4 py-3 text-left font-semibold">Ward & Bed</th>
                <th className="px-4 py-3 text-left font-semibold">Admitted</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    Loading admissions...
                  </td>
                </tr>
              ) : admissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    No admissions recorded.
                  </td>
                </tr>
              ) : (
                admissions.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50 text-xs">
                    <td className="px-4 py-3 font-mono-tabular font-semibold text-[#0F2942]">
                      {adm.admissionNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{adm.patientName}</div>
                      <div className="text-slate-500">{adm.admissionReason}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{adm.wardName}</div>
                      <div className="font-mono-tabular text-slate-500">Bed {adm.bedNumber}</div>
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                      {new Date(adm.admissionDate).toLocaleDateString()}
                      {adm.dischargeDate && ` → ${new Date(adm.dischargeDate).toLocaleDateString()}`}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      <span className={adm.status === 'Admitted' ? 'text-amber-700' : 'text-emerald-700'}>
                        {adm.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                      {adm.status === 'Admitted' && canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => setObsTarget(adm)}
                            className="inline-flex items-center gap-1 text-[#0D9488] font-semibold hover:underline"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            <span>Ward Obs</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDischargeTarget(adm)}
                            className="inline-flex items-center gap-1 text-[#0F2942] font-semibold hover:underline"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Discharge</span>
                          </button>
                        </>
                      )}
                      {adm.status === 'Discharged' && (
                        <span className="text-slate-500">{adm.dischargeCondition}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admit Patient Modal */}
      <Modal
        open={admitOpen}
        onClose={() => setAdmitOpen(false)}
        title="Admit Patient to Ward"
        subtitle="Select ward, available bed, and admitting medical officer"
      >
        <form onSubmit={handleAdmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Patient *</label>
              <select
                required
                value={admitForm.patientId}
                onChange={(e) => setAdmitForm({ ...admitForm, patientId: e.target.value })}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ward *</label>
              <select
                required
                value={admitForm.wardId}
                onChange={(e) => setAdmitForm({ ...admitForm, wardId: e.target.value, bedId: '' })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select ward...</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatMwk(w.dailyRateMwk)}/day)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Available Bed *</label>
              <select
                required
                value={admitForm.bedId}
                onChange={(e) => setAdmitForm({ ...admitForm, bedId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select bed...</option>
                {availableBedsForWard.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bedNumber} ({b.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Admitting Doctor *</label>
              <select
                required
                value={admitForm.admittingDoctorId}
                onChange={(e) => setAdmitForm({ ...admitForm, admittingDoctorId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select doctor...</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Admission Reason *</label>
              <textarea
                required
                rows={2}
                value={admitForm.admissionReason}
                onChange={(e) => setAdmitForm({ ...admitForm, admissionReason: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setAdmitOpen(false)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg"
            >
              Confirm Admission
            </button>
          </div>
        </form>
      </Modal>

      {/* Ward Observation Modal */}
      <Modal
        open={Boolean(obsTarget)}
        onClose={() => setObsTarget(null)}
        title="Record Daily Ward Observation"
        subtitle={obsTarget ? `${obsTarget.patientName} · Bed ${obsTarget.bedNumber}` : ''}
        size="md"
      >
        <form onSubmit={handleRecordObs} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Temp (°C)</label>
              <input
                type="text"
                value={obsForm.tempC}
                onChange={(e) => setObsForm({ ...obsForm, tempC: e.target.value })}
                className="w-full mt-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">BP</label>
              <input
                type="text"
                value={obsForm.bloodPressure}
                onChange={(e) => setObsForm({ ...obsForm, bloodPressure: e.target.value })}
                className="w-full mt-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Pulse</label>
              <input
                type="number"
                value={obsForm.pulseBpm}
                onChange={(e) => setObsForm({ ...obsForm, pulseBpm: e.target.value })}
                className="w-full mt-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">SpO2 (%)</label>
              <input
                type="number"
                value={obsForm.spo2}
                onChange={(e) => setObsForm({ ...obsForm, spo2: e.target.value })}
                className="w-full mt-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono-tabular"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nursing Note *</label>
            <textarea
              required
              rows={3}
              value={obsForm.nursingNote}
              onChange={(e) => setObsForm({ ...obsForm, nursingNote: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setObsTarget(null)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg"
            >
              Save Observation
            </button>
          </div>
        </form>
      </Modal>

      {/* Discharge Modal */}
      <Modal
        open={Boolean(dischargeTarget)}
        onClose={() => setDischargeTarget(null)}
        title="Discharge Patient & Generate Summary"
        subtitle={dischargeTarget ? `${dischargeTarget.admissionNumber} · ${dischargeTarget.patientName}` : ''}
        size="md"
      >
        <form onSubmit={handleDischarge} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Condition at Discharge *</label>
            <input
              type="text"
              required
              value={dischargeForm.dischargeCondition}
              onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeCondition: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Discharge Summary & Follow-Up Instructions *</label>
            <textarea
              required
              rows={4}
              value={dischargeForm.dischargeSummary}
              onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeSummary: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={dischargeForm.billWardStay}
              onChange={(e) => setDischargeForm({ ...dischargeForm, billWardStay: e.target.checked })}
            />
            <span>Automatically generate inpatient ward stay invoice in MWK</span>
          </label>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setDischargeTarget(null)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg"
            >
              Complete Discharge
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
