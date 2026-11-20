import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Pencil,
  Printer,
  Search,
  Upload,
  UserPlus,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatMwk, roleHasPermission } from '../lib/roles-config';

interface PatientRow {
  id: number;
  patientNumber: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  residentialAddress: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  bloodGroup: string;
  allergies: string;
  medicalHistory: string;
  isDemoRecord: boolean;
  createdAt: string;
}

interface PatientProfile {
  patient: PatientRow;
  appointments: any[];
  consultations: any[];
  prescriptions: any[];
  labRequests: any[];
  labResults: any[];
  invoices: any[];
  admissions: any[];
  observations: any[];
  timeline: any[];
  documents: any[];
}

const EMPTY_FORM = {
  fullName: '',
  dateOfBirth: '',
  gender: 'Female' as 'Male' | 'Female' | 'Other',
  phone: '',
  residentialAddress: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  nextOfKinName: '',
  nextOfKinRelationship: 'Spouse',
  nextOfKinPhone: '',
  bloodGroup: 'Unknown',
  allergies: 'None known',
  medicalHistory: '',
};

export const PatientsModule: React.FC = () => {
  const { user, notify } = useAuth();
  const canWrite = roleHasPermission(user?.roleSlug, 'patients:write');

  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [recordFilter, setRecordFilter] = useState<'all' | 'real' | 'demo'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [selectedProfile, setSelectedProfile] = useState<PatientProfile | null>(null);
  const [profileTab, setProfileTab] = useState<
    'overview' | 'timeline' | 'consultations' | 'prescriptions' | 'labs' | 'billing' | 'documents'
  >('overview');
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState<'Referral Letter' | 'ID Copy' | 'Lab Report' | 'Imaging' | 'Consent Form' | 'Other'>('Referral Letter');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (recordFilter !== 'all') params.set('demo', recordFilter);
      const res = await apiRequest<{ patients: PatientRow[] }>(`/api/patients?${params.toString()}`);
      setPatients(res.patients);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load patients.');
    } finally {
      setLoading(false);
    }
  }, [search, recordFilter, notify]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadPatients();
    }, 200);
    return () => clearTimeout(t);
  }, [loadPatients]);

  const openProfile = async (id: number) => {
    try {
      const res = await apiRequest<PatientProfile>(`/api/patients/${id}`);
      setSelectedProfile(res);
      setProfileTab('overview');
    } catch (err: any) {
      notify('error', err.message || 'Failed to open patient profile.');
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (p: PatientRow) => {
    setEditingId(p.id);
    setForm({
      fullName: p.fullName,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      phone: p.phone,
      residentialAddress: p.residentialAddress,
      emergencyContactName: p.emergencyContactName,
      emergencyContactPhone: p.emergencyContactPhone,
      nextOfKinName: p.nextOfKinName,
      nextOfKinRelationship: p.nextOfKinRelationship || 'Relative',
      nextOfKinPhone: p.nextOfKinPhone || '',
      bloodGroup: p.bloodGroup || 'Unknown',
      allergies: p.allergies || 'None known',
      medicalHistory: p.medicalHistory || '',
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/patients/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        notify('success', 'Patient demographics updated.');
        if (selectedProfile?.patient.id === editingId) {
          openProfile(editingId);
        }
      } else {
        const res = await apiRequest<{ patient: PatientRow }>('/api/patients', {
          method: 'POST',
          body: JSON.stringify({ ...form, isDemoRecord: false }),
        });
        notify('success', `Patient registered (${res.patient.patientNumber})`);
      }
      setFormOpen(false);
      loadPatients();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save patient.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile || !docFile || !docTitle.trim()) return;
    setUploadingDoc(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed.'));
        reader.readAsDataURL(docFile);
      });
      await apiRequest(`/api/patients/${selectedProfile.patient.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          title: docTitle.trim(),
          documentType: docType,
          fileName: docFile.name,
          mimeType: docFile.type || 'application/octet-stream',
          fileDataBase64: base64,
        }),
      });
      notify('success', 'Document uploaded to patient dossier.');
      setDocTitle('');
      setDocFile(null);
      openProfile(selectedProfile.patient.id);
    } catch (err: any) {
      notify('error', err.message || 'Document upload failed.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDownloadDoc = async (patientId: number, docId: number) => {
    try {
      const res = await apiRequest<{ document: any }>(`/api/patients/${patientId}/documents/${docId}`);
      const link = document.createElement('a');
      link.href = res.document.fileDataBase64;
      link.download = res.document.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      notify('error', err.message || 'Failed to download document.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Patient Registry</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Search patients by name, Patient ID, or phone number and inspect complete medical records
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New Patient</span>
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white border border-slate-200 rounded-xl p-4 no-print">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by full name, Patient ID (MW-...), or phone..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
          />
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(
            [
              { key: 'all', label: 'All Records' },
              { key: 'real', label: 'Facility Records' },
              { key: 'demo', label: 'Demo Sample' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setRecordFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                recordFilter === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Split Layout: Table + Selected Patient Dossier */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className={`${selectedProfile ? 'xl:col-span-6' : 'xl:col-span-12'} bg-white border border-slate-200 rounded-xl overflow-hidden no-print`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Patient ID</th>
                  <th className="px-4 py-3 text-left font-semibold">Full Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Gender / DOB</th>
                  <th className="px-4 py-3 text-left font-semibold">Phone</th>
                  <th className="px-4 py-3 text-left font-semibold">Blood</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                      Loading patient records...
                    </td>
                  </tr>
                ) : patients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                      No matching patients found. Register a new patient to begin.
                    </td>
                  </tr>
                ) : (
                  patients.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => openProfile(p.id)}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                        selectedProfile?.patient.id === p.id ? 'bg-teal-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono-tabular text-xs font-semibold text-[#0F2942] whitespace-nowrap">
                        {p.patientNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{p.fullName}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">
                          {p.residentialAddress}
                          {p.isDemoRecord ? ' · Demo' : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {p.gender} · <span className="tabular-nums">{p.dateOfBirth}</span>
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                        {p.phone}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                        {p.bloodGroup || '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openProfile(p.id)}
                          className="text-xs font-semibold text-[#0D9488] hover:underline mr-3"
                        >
                          Dossier
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Patient Profile Dossier */}
        {selectedProfile && (
          <div className="xl:col-span-6 bg-white border border-slate-200 rounded-xl p-6 print-only-full">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono-tabular font-semibold text-[#0D9488]">
                    {selectedProfile.patient.patientNumber}
                  </span>
                  <span>·</span>
                  <span>{selectedProfile.patient.gender}</span>
                  <span>·</span>
                  <span className="tabular-nums">DOB: {selectedProfile.patient.dateOfBirth}</span>
                  {selectedProfile.patient.isDemoRecord && (
                    <>
                      <span>·</span>
                      <span className="text-amber-700 font-semibold">Demo Record</span>
                    </>
                  )}
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                  {selectedProfile.patient.fullName}
                </h2>
              </div>

              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProfile(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Profile Tabs */}
            <div className="flex flex-wrap gap-1 py-3 border-b border-slate-200 no-print">
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'timeline', label: 'EMR Timeline' },
                  { id: 'consultations', label: `Consultations (${selectedProfile.consultations.length})` },
                  { id: 'prescriptions', label: `Rx (${selectedProfile.prescriptions.length})` },
                  { id: 'labs', label: `Labs (${selectedProfile.labRequests.length})` },
                  { id: 'billing', label: `Billing (${selectedProfile.invoices.length})` },
                  { id: 'documents', label: `Docs (${selectedProfile.documents.length})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setProfileTab(t.id)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    profileTab === t.id
                      ? 'bg-[#0F2942] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="pt-4 space-y-4 text-sm">
              {profileTab === 'overview' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div className="text-slate-400 font-semibold">Contact & Residence</div>
                    <div>Phone: <span className="font-mono-tabular text-slate-900">{selectedProfile.patient.phone}</span></div>
                    <div>Address: <span className="text-slate-800">{selectedProfile.patient.residentialAddress}</span></div>
                    <div>Blood Group: <span className="font-semibold text-slate-900">{selectedProfile.patient.bloodGroup}</span></div>
                    <div>Allergies: <span className="font-semibold text-red-700">{selectedProfile.patient.allergies}</span></div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-slate-400 font-semibold">Emergency & Next of Kin</div>
                    <div>Emergency: <span className="text-slate-900">{selectedProfile.patient.emergencyContactName} ({selectedProfile.patient.emergencyContactPhone})</span></div>
                    <div>Next of Kin: <span className="text-slate-900">{selectedProfile.patient.nextOfKinName} · {selectedProfile.patient.nextOfKinRelationship}</span></div>
                    <div>Kin Phone: <span className="font-mono-tabular text-slate-800">{selectedProfile.patient.nextOfKinPhone || '—'}</span></div>
                  </div>
                  <div className="sm:col-span-2 pt-3 border-t border-slate-100">
                    <div className="text-slate-400 font-semibold mb-1">Medical History</div>
                    <p className="text-slate-700 leading-relaxed">
                      {selectedProfile.patient.medicalHistory || 'No prior chronic medical history recorded.'}
                    </p>
                  </div>
                </div>
              )}

              {profileTab === 'timeline' && (
                <div className="space-y-3">
                  {selectedProfile.timeline.length === 0 ? (
                    <p className="text-xs text-slate-500">No medical events recorded yet.</p>
                  ) : (
                    selectedProfile.timeline.map((ev) => (
                      <div key={ev.id} className="pb-3 border-b border-slate-100 last:border-0">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-[#0F2942]">{ev.recordType} · {ev.summary}</span>
                          <span className="text-slate-400 tabular-nums">
                            {new Date(ev.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{ev.details}</p>
                        <div className="text-[11px] text-slate-400 mt-0.5">Recorded by {ev.recordedByName}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {profileTab === 'consultations' && (
                <div className="space-y-3">
                  {selectedProfile.consultations.length === 0 ? (
                    <p className="text-xs text-slate-500">No recorded consultations.</p>
                  ) : (
                    selectedProfile.consultations.map((c) => (
                      <div key={c.id} className="p-3 border border-slate-200 rounded-lg text-xs space-y-1">
                        <div className="flex justify-between font-semibold text-slate-900">
                          <span>{c.consultationNumber} · {c.diagnosis} {c.icdCode ? `(${c.icdCode})` : ''}</span>
                          <span className="text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="text-slate-600">Doctor: {c.doctorName} · BP: {c.vitalBp || '—'} · Temp: {c.vitalTempC || '—'}°C</div>
                        <div className="text-slate-700">Plan: {c.treatmentPlan || c.clinicalNotes}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {profileTab === 'prescriptions' && (
                <div className="space-y-2">
                  {selectedProfile.prescriptions.length === 0 ? (
                    <p className="text-xs text-slate-500">No prescriptions found.</p>
                  ) : (
                    selectedProfile.prescriptions.map((rx) => (
                      <div key={rx.id} className="p-3 border border-slate-200 rounded-lg text-xs flex justify-between">
                        <div>
                          <div className="font-semibold text-slate-900">{rx.prescriptionNumber}</div>
                          <div className="text-slate-500">By {rx.doctorName} · {rx.notes}</div>
                        </div>
                        <span className="font-semibold text-[#0D9488]">{rx.status}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {profileTab === 'labs' && (
                <div className="space-y-2">
                  {selectedProfile.labRequests.length === 0 ? (
                    <p className="text-xs text-slate-500">No laboratory investigations ordered.</p>
                  ) : (
                    selectedProfile.labRequests.map((lr) => {
                      const res = selectedProfile.labResults.find((r) => r.requestId === lr.id);
                      return (
                        <div key={lr.id} className="p-3 border border-slate-200 rounded-lg text-xs space-y-1">
                          <div className="flex justify-between font-semibold text-slate-900">
                            <span>{lr.requestNumber} · {lr.testName}</span>
                            <span className="text-[#0D9488]">{lr.status}</span>
                          </div>
                          {res && (
                            <div className="text-slate-700">
                              Result: <strong>{res.resultSummary}</strong> ({res.measuredValue}) · {res.interpretation}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {profileTab === 'billing' && (
                <div className="space-y-2">
                  {selectedProfile.invoices.length === 0 ? (
                    <p className="text-xs text-slate-500">No invoices billed to this patient.</p>
                  ) : (
                    selectedProfile.invoices.map((inv) => (
                      <div key={inv.id} className="p-3 border border-slate-200 rounded-lg text-xs flex justify-between items-center">
                        <div>
                          <div className="font-mono-tabular font-semibold text-slate-900">{inv.invoiceNumber}</div>
                          <div className="text-slate-500">
                            Total {formatMwk(inv.totalAmountMwk)} · Paid {formatMwk(inv.paidAmountMwk)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono-tabular font-bold text-slate-900">
                            Bal: {formatMwk(inv.balanceMwk)}
                          </div>
                          <div className={inv.status === 'Paid' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                            {inv.status}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {profileTab === 'documents' && (
                <div className="space-y-4">
                  {canWrite && (
                    <form onSubmit={handleUploadDocument} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 no-print">
                      <div className="text-xs font-semibold text-slate-700">Upload Patient Document</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Document title (e.g. Referral Letter)"
                          value={docTitle}
                          onChange={(e) => setDocTitle(e.target.value)}
                          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                        <select
                          value={docType}
                          onChange={(e) => setDocType(e.target.value as any)}
                          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option>Referral Letter</option>
                          <option>ID Copy</option>
                          <option>Lab Report</option>
                          <option>Imaging</option>
                          <option>Consent Form</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="file"
                          required
                          onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                          className="text-xs text-slate-600"
                        />
                        <button
                          type="submit"
                          disabled={uploadingDoc}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0D9488] text-white text-xs font-semibold rounded-lg"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{uploadingDoc ? 'Uploading...' : 'Upload'}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2">
                    {selectedProfile.documents.length === 0 ? (
                      <p className="text-xs text-slate-500">No documents attached.</p>
                    ) : (
                      selectedProfile.documents.map((d) => (
                        <div key={d.id} className="p-3 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#0D9488]" />
                            <div>
                              <div className="font-semibold text-slate-900">{d.title}</div>
                              <div className="text-slate-500">{d.documentType} · {d.fileName}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDownloadDoc(selectedProfile.patient.id, d.id)}
                            className="text-[#0D9488] font-semibold hover:underline"
                          >
                            Download
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Register / Edit Patient Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Patient Information' : 'Register New Patient'}
        subtitle="A unique Malawi SmartCare Patient ID will be generated automatically"
      >
        <form onSubmit={handleSave} className="space-y-4">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth *</label>
              <input
                type="date"
                required
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gender *</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
              <input
                type="text"
                required
                placeholder="+265 999 ..."
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
              <select
                value={form.bloodGroup}
                onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option>Unknown</option>
                <option>O+</option>
                <option>O-</option>
                <option>A+</option>
                <option>A-</option>
                <option>B+</option>
                <option>B-</option>
                <option>AB+</option>
                <option>AB-</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Residential Address *</label>
              <input
                type="text"
                required
                placeholder="Area / Village / Traditional Authority / City"
                value={form.residentialAddress}
                onChange={(e) => setForm({ ...form, residentialAddress: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Contact Name *</label>
              <input
                type="text"
                required
                value={form.emergencyContactName}
                onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Contact Phone *</label>
              <input
                type="text"
                required
                value={form.emergencyContactPhone}
                onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Next of Kin *</label>
              <input
                type="text"
                required
                value={form.nextOfKinName}
                onChange={(e) => setForm({ ...form, nextOfKinName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Relationship & Phone</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Spouse"
                  value={form.nextOfKinRelationship}
                  onChange={(e) => setForm({ ...form, nextOfKinRelationship: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={form.nextOfKinPhone}
                  onChange={(e) => setForm({ ...form, nextOfKinPhone: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Known Allergies</label>
              <input
                type="text"
                value={form.allergies}
                onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Relevant Medical History</label>
              <textarea
                rows={3}
                value={form.medicalHistory}
                onChange={(e) => setForm({ ...form, medicalHistory: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#163A5C] rounded-lg"
            >
              {saving ? 'Saving...' : editingId ? 'Update Patient' : 'Register Patient'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
