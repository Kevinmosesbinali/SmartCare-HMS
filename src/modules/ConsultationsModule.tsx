import React, { useCallback, useEffect, useState } from 'react';
import { Activity, FilePlus2, Lock, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { roleHasPermission } from '../lib/roles-config';

export const ConsultationsModule: React.FC = () => {
  const { user, notify } = useAuth();
  const canConsult = roleHasPermission(user?.roleSlug, 'consultations:write');
  const canVitals = roleHasPermission(user?.roleSlug, 'vitals:write') || canConsult;

  const [consultations, setConsultations] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [selectedPatientFilter, setSelectedPatientFilter] = useState('');
  const [tab, setTab] = useState<'consultations' | 'vitals'>('consultations');
  const [loading, setLoading] = useState(true);

  const [consultOpen, setConsultOpen] = useState(false);
  const [vitalsOpen, setVitalsOpen] = useState(false);

  const [cForm, setCForm] = useState({
    patientId: '',
    doctorId: '',
    chiefComplaints: '',
    symptoms: '',
    vitalTempC: '36.8',
    vitalBp: '120/80',
    vitalPulseBpm: '74',
    vitalRespRate: '16',
    vitalSpo2: '98',
    vitalWeightKg: '68',
    clinicalNotes: '',
    diagnosis: '',
    icdCode: '',
    severity: 'Moderate' as 'Mild' | 'Moderate' | 'Severe' | 'Critical',
    treatmentPlan: '',
    followUpDate: '',
    autoCreateInvoice: true,
  });

  const [rxLines, setRxLines] = useState<
    {
      medicineId: string;
      dosage: string;
      frequency: string;
      duration: string;
      quantityPrescribed: number;
    }[]
  >([]);
  const [selectedLabIds, setSelectedLabIds] = useState<number[]>([]);

  const [vForm, setVForm] = useState({
    patientId: '',
    tempC: '36.8',
    bloodPressure: '120/80',
    pulseBpm: '76',
    respiratoryRate: '16',
    spo2: '98',
    nursingNote: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const q = selectedPatientFilter ? `?patientId=${selectedPatientFilter}` : '';
      const [cRes, pRes, sRes] = await Promise.all([
        apiRequest<{ consultations: any[]; observations: any[] }>(`/api/consultations${q}`),
        apiRequest<{ patients: any[] }>('/api/patients'),
        apiRequest<{ staff: any[] }>('/api/staff'),
      ]);
      setConsultations(cRes.consultations);
      setObservations(cRes.observations);
      setPatients(pRes.patients);
      const docs = sRes.staff.filter((s) => s.staffType === 'Doctor');
      setDoctors(docs);

      if (canConsult) {
        const [phRes, lbRes] = await Promise.all([
          apiRequest<{ medicines: any[] }>('/api/pharmacy').catch(() => ({ medicines: [] })),
          apiRequest<{ tests: any[] }>('/api/laboratory').catch(() => ({ tests: [] })),
        ]);
        setMedicines(phRes.medicines || []);
        setLabTests(lbRes.tests || []);
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load EMR records.');
    } finally {
      setLoading(false);
    }
  }, [selectedPatientFilter, canConsult, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveConsult = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docObj = doctors.find((d) => String(d.id) === cForm.doctorId);
      await apiRequest('/api/consultations', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(cForm.patientId),
          doctorId: Number(cForm.doctorId),
          departmentId: docObj?.departmentId ?? null,
          chiefComplaints: cForm.chiefComplaints,
          symptoms: cForm.symptoms,
          vitalTempC: cForm.vitalTempC,
          vitalBp: cForm.vitalBp,
          vitalPulseBpm: cForm.vitalPulseBpm ? Number(cForm.vitalPulseBpm) : null,
          vitalRespRate: cForm.vitalRespRate ? Number(cForm.vitalRespRate) : null,
          vitalSpo2: cForm.vitalSpo2 ? Number(cForm.vitalSpo2) : null,
          vitalWeightKg: cForm.vitalWeightKg,
          clinicalNotes: cForm.clinicalNotes,
          diagnosis: cForm.diagnosis,
          icdCode: cForm.icdCode,
          severity: cForm.severity,
          treatmentPlan: cForm.treatmentPlan,
          followUpDate: cForm.followUpDate,
          autoCreateInvoice: cForm.autoCreateInvoice,
          prescriptionItems: rxLines
            .filter((l) => l.medicineId)
            .map((l) => ({
              medicineId: Number(l.medicineId),
              dosage: l.dosage,
              frequency: l.frequency,
              duration: l.duration,
              quantityPrescribed: Number(l.quantityPrescribed),
            })),
          labTestIds: selectedLabIds,
        }),
      });
      notify('success', 'Clinical consultation locked into EMR.');
      setConsultOpen(false);
      setRxLines([]);
      setSelectedLabIds([]);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to record consultation.');
    }
  };

  const handleSaveVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/consultations/vitals', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(vForm.patientId),
          tempC: vForm.tempC,
          bloodPressure: vForm.bloodPressure,
          pulseBpm: vForm.pulseBpm ? Number(vForm.pulseBpm) : null,
          respiratoryRate: vForm.respiratoryRate ? Number(vForm.respiratoryRate) : null,
          spo2: vForm.spo2 ? Number(vForm.spo2) : null,
          nursingNote: vForm.nursingNote,
        }),
      });
      notify('success', 'Vital signs and nursing note saved.');
      setVitalsOpen(false);
      setVForm({ ...vForm, nursingNote: '' });
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to record vitals.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Consultations & Electronic Medical Records
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Traceable clinical notes, vital signs, diagnoses, prescriptions, and lab requests
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canVitals && (
            <button
              type="button"
              onClick={() => setVitalsOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:border-[#0D9488] text-slate-800 text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              <Activity className="w-4 h-4 text-[#0D9488]" />
              <span>Record Vitals / Nursing Note</span>
            </button>
          )}
          {canConsult && (
            <button
              type="button"
              onClick={() => setConsultOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>New Clinical Consultation</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters & Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('consultations')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'consultations' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Consultations ({consultations.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('vitals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'vitals' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Vital Signs & Nursing Notes ({observations.length})
          </button>
        </div>

        <select
          value={selectedPatientFilter}
          onChange={(e) => setSelectedPatientFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg min-w-[220px]"
        >
          <option value="">All Patients</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} ({p.patientNumber})
            </option>
          ))}
        </select>
      </div>

      {tab === 'consultations' ? (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Loading EMR consultations...
            </div>
          ) : consultations.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              No consultations recorded for this filter.
            </div>
          ) : (
            consultations.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular font-semibold text-[#0F2942]">
                        {c.consultationNumber}
                      </span>
                      <span>·</span>
                      <span>{c.departmentName || 'General OPD'}</span>
                      <span>·</span>
                      <span>{c.doctorName}</span>
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 mt-1">
                      {c.patientName}{' '}
                      <span className="text-xs font-mono-tabular font-normal text-slate-500">
                        ({c.patientNumber})
                      </span>
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {c.isLocked && (
                      <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                        <Lock className="w-3 h-3" />
                        <span>Locked EMR</span>
                      </span>
                    )}
                    <span>·</span>
                    <span className="tabular-nums">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs bg-slate-50 p-3 rounded-lg font-mono-tabular">
                  <div>Temp: <strong>{c.vitalTempC || '—'} °C</strong></div>
                  <div>BP: <strong>{c.vitalBp || '—'}</strong></div>
                  <div>Pulse: <strong>{c.vitalPulseBpm || '—'} bpm</strong></div>
                  <div>RR: <strong>{c.vitalRespRate || '—'} /min</strong></div>
                  <div>SpO2: <strong>{c.vitalSpo2 || '—'}%</strong></div>
                  <div>Weight: <strong>{c.vitalWeightKg || '—'} kg</strong></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-slate-500 mb-1">Chief Complaints & Symptoms</div>
                    <p className="text-slate-800">{c.chiefComplaints}</p>
                    {c.symptoms && <p className="text-slate-600 mt-1">{c.symptoms}</p>}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-500 mb-1">
                      Diagnosis {c.icdCode ? `(${c.icdCode})` : ''}
                    </div>
                    <p className="text-slate-900 font-semibold">{c.diagnosis}</p>
                    {c.treatmentPlan && (
                      <p className="text-slate-700 mt-1">Plan: {c.treatmentPlan}</p>
                    )}
                  </div>
                </div>

                {c.clinicalNotes && (
                  <div className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                    <strong>Clinical Notes:</strong> {c.clinicalNotes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Timestamp</th>
                  <th className="px-4 py-3 text-left font-semibold">Patient</th>
                  <th className="px-4 py-3 text-left font-semibold">Vitals</th>
                  <th className="px-4 py-3 text-left font-semibold">Nursing Observation</th>
                  <th className="px-4 py-3 text-left font-semibold">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {observations.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 text-xs">
                    <td className="px-4 py-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                      {new Date(o.observedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {o.patientName} ({o.patientNumber})
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-slate-700 whitespace-nowrap">
                      BP {o.bloodPressure || '—'} · T {o.tempC || '—'}°C · P {o.pulseBpm || '—'} · SpO2 {o.spo2 || '—'}%
                    </td>
                    <td className="px-4 py-3 text-slate-700">{o.nursingNote}</td>
                    <td className="px-4 py-3 text-slate-500">{o.recordedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Consultation Modal */}
      <Modal
        open={consultOpen}
        onClose={() => setConsultOpen(false)}
        title="Clinical Consultation & EMR Entry"
        subtitle="Creates an immutable clinical record with optional prescriptions, lab orders, and MWK invoice"
        size="xl"
      >
        <form onSubmit={handleSaveConsult} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Patient *</label>
              <select
                required
                value={cForm.patientId}
                onChange={(e) => setCForm({ ...cForm, patientId: e.target.value })}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Consulting Doctor *</label>
              <select
                required
                value={cForm.doctorId}
                onChange={(e) => setCForm({ ...cForm, doctorId: e.target.value })}
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
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">Temp (°C)</label>
              <input
                type="text"
                value={cForm.vitalTempC}
                onChange={(e) => setCForm({ ...cForm, vitalTempC: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">BP (mmHg)</label>
              <input
                type="text"
                value={cForm.vitalBp}
                onChange={(e) => setCForm({ ...cForm, vitalBp: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">Pulse (bpm)</label>
              <input
                type="number"
                value={cForm.vitalPulseBpm}
                onChange={(e) => setCForm({ ...cForm, vitalPulseBpm: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">Resp Rate</label>
              <input
                type="number"
                value={cForm.vitalRespRate}
                onChange={(e) => setCForm({ ...cForm, vitalRespRate: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">SpO2 (%)</label>
              <input
                type="number"
                value={cForm.vitalSpo2}
                onChange={(e) => setCForm({ ...cForm, vitalSpo2: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">Weight (kg)</label>
              <input
                type="text"
                value={cForm.vitalWeightKg}
                onChange={(e) => setCForm({ ...cForm, vitalWeightKg: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Chief Complaints *</label>
              <textarea
                required
                rows={2}
                value={cForm.chiefComplaints}
                onChange={(e) => setCForm({ ...cForm, chiefComplaints: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Symptoms & History</label>
              <textarea
                rows={2}
                value={cForm.symptoms}
                onChange={(e) => setCForm({ ...cForm, symptoms: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Diagnosis *</label>
              <input
                type="text"
                required
                value={cForm.diagnosis}
                onChange={(e) => setCForm({ ...cForm, diagnosis: e.target.value })}
                placeholder="e.g. Uncomplicated Malaria"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ICD-10 Code</label>
                <input
                  type="text"
                  value={cForm.icdCode}
                  onChange={(e) => setCForm({ ...cForm, icdCode: e.target.value })}
                  placeholder="e.g. B50.9"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
                <select
                  value={cForm.severity}
                  onChange={(e) => setCForm({ ...cForm, severity: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option>Mild</option>
                  <option>Moderate</option>
                  <option>Severe</option>
                  <option>Critical</option>
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Notes & Treatment Plan</label>
              <textarea
                rows={2}
                value={cForm.treatmentPlan}
                onChange={(e) => setCForm({ ...cForm, treatmentPlan: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Inline Prescriptions */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">Prescribe Medication (Optional)</span>
              <button
                type="button"
                onClick={() =>
                  setRxLines([
                    ...rxLines,
                    {
                      medicineId: '',
                      dosage: '1 tab',
                      frequency: 'BD (Twice daily)',
                      duration: '5 days',
                      quantityPrescribed: 10,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D9488]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Medicine</span>
              </button>
            </div>
            {rxLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
                <select
                  value={line.medicineId}
                  onChange={(e) => {
                    const copy = [...rxLines];
                    copy[idx].medicineId = e.target.value;
                    setRxLines(copy);
                  }}
                  className="sm:col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                >
                  <option value="">Select medicine...</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.medicineName} (Stock: {m.totalStock})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Dosage"
                  value={line.dosage}
                  onChange={(e) => {
                    const copy = [...rxLines];
                    copy[idx].dosage = e.target.value;
                    setRxLines(copy);
                  }}
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded"
                />
                <input
                  type="text"
                  placeholder="Frequency"
                  value={line.frequency}
                  onChange={(e) => {
                    const copy = [...rxLines];
                    copy[idx].frequency = e.target.value;
                    setRxLines(copy);
                  }}
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded"
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={line.quantityPrescribed}
                  onChange={(e) => {
                    const copy = [...rxLines];
                    copy[idx].quantityPrescribed = Number(e.target.value);
                    setRxLines(copy);
                  }}
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded font-mono-tabular"
                />
                <button
                  type="button"
                  onClick={() => setRxLines(rxLines.filter((_, i) => i !== idx))}
                  className="text-red-600 hover:text-red-800 justify-self-end"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Inline Lab Tests */}
          {labTests.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-800 mb-2">
                Request Laboratory Investigations (Optional)
              </div>
              <div className="flex flex-wrap gap-2">
                {labTests.map((t) => {
                  const checked = selectedLabIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border cursor-pointer ${
                        checked
                          ? 'bg-teal-50 border-[#0D9488] text-slate-900 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedLabIds([...selectedLabIds, t.id]);
                          else setSelectedLabIds(selectedLabIds.filter((id) => id !== t.id));
                        }}
                      />
                      <span>{t.testName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={cForm.autoCreateInvoice}
              onChange={(e) => setCForm({ ...cForm, autoCreateInvoice: e.target.checked })}
            />
            <span>Automatically generate consultation & laboratory invoice in MWK</span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setConsultOpen(false)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg"
            >
              Save & Lock Consultation
            </button>
          </div>
        </form>
      </Modal>

      {/* Nurse Vitals Modal */}
      <Modal
        open={vitalsOpen}
        onClose={() => setVitalsOpen(false)}
        title="Record Vital Signs & Nursing Note"
        subtitle="Appends directly to the patient's chronological medical record"
        size="md"
      >
        <form onSubmit={handleSaveVitals} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Patient *</label>
            <select
              required
              value={vForm.patientId}
              onChange={(e) => setVForm({ ...vForm, patientId: e.target.value })}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Temp (°C)</label>
              <input
                type="text"
                value={vForm.tempC}
                onChange={(e) => setVForm({ ...vForm, tempC: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">BP</label>
              <input
                type="text"
                value={vForm.bloodPressure}
                onChange={(e) => setVForm({ ...vForm, bloodPressure: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pulse (bpm)</label>
              <input
                type="number"
                value={vForm.pulseBpm}
                onChange={(e) => setVForm({ ...vForm, pulseBpm: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Resp Rate</label>
              <input
                type="number"
                value={vForm.respiratoryRate}
                onChange={(e) => setVForm({ ...vForm, respiratoryRate: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SpO2 (%)</label>
              <input
                type="number"
                value={vForm.spo2}
                onChange={(e) => setVForm({ ...vForm, spo2: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nursing Observation Note *</label>
            <textarea
              required
              rows={3}
              value={vForm.nursingNote}
              onChange={(e) => setVForm({ ...vForm, nursingNote: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setVitalsOpen(false)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg"
            >
              Save Vitals
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
