import React, { useCallback, useEffect, useState } from 'react';
import { FlaskConical, Plus, Printer } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatMwk, roleHasPermission } from '../lib/roles-config';

export const LaboratoryModule: React.FC = () => {
  const { user, notify } = useAuth();
  const canManageLab = roleHasPermission(user?.roleSlug, 'laboratory:manage');
  const canOrderLab = canManageLab || roleHasPermission(user?.roleSlug, 'laboratory:request');

  const [tests, setTests] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [tab, setTab] = useState<'requests' | 'catalog'>('requests');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const [orderOpen, setOrderOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({
    patientId: '',
    testId: '',
    priority: 'Routine',
    clinicalNotes: '',
  });

  const [resultTarget, setResultTarget] = useState<any | null>(null);
  const [resForm, setResForm] = useState({
    resultSummary: '',
    measuredValue: '',
    referenceRange: '',
    interpretation: 'Normal',
    technicianNotes: '',
    reportFileName: '',
    reportDataBase64: '',
  });

  const [printReport, setPrintReport] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [labRes, patRes] = await Promise.all([
        apiRequest<{ tests: any[]; requests: any[] }>('/api/laboratory'),
        apiRequest<{ patients: any[] }>('/api/patients'),
      ]);
      setTests(labRes.tests);
      setRequests(labRes.requests);
      setPatients(patRes.patients);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load laboratory data.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/laboratory/requests', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(orderForm.patientId),
          testId: Number(orderForm.testId),
          priority: orderForm.priority,
          clinicalNotes: orderForm.clinicalNotes,
        }),
      });
      notify('success', 'Laboratory test request submitted.');
      setOrderOpen(false);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to create lab request.');
    }
  };

  const updateReqStatus = async (id: number, status: string) => {
    try {
      await apiRequest(`/api/laboratory/requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify('success', `Lab status updated to ${status}`);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Status update failed.');
    }
  };

  const handleRecordResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultTarget) return;
    try {
      await apiRequest(`/api/laboratory/requests/${resultTarget.id}/results`, {
        method: 'POST',
        body: JSON.stringify(resForm),
      });
      notify('success', 'Lab result recorded and linked to patient EMR.');
      setResultTarget(null);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to record lab result.');
    }
  };

  const handleReportFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setResForm((prev) => ({
        ...prev,
        reportFileName: file.name,
        reportDataBase64: String(reader.result || ''),
      }));
    };
    reader.readAsDataURL(file);
  };

  const filteredRequests = requests.filter(
    (r) => statusFilter === 'All' || r.status === statusFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Laboratory Services</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Specimen workflow, diagnostic result entry, report uploads, and EMR integration
          </p>
        </div>
        {canOrderLab && (
          <button
            type="button"
            onClick={() => setOrderOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold rounded-lg whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Request Lab Test</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('requests')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'requests' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Test Requests ({requests.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('catalog')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'catalog' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Test Catalog ({tests.length})
          </button>
        </div>

        {tab === 'requests' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Statuses</option>
            <option>Requested</option>
            <option>Sample collected</option>
            <option>Processing</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
        )}
      </div>

      {tab === 'requests' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Request #</th>
                  <th className="px-4 py-3 text-left font-semibold">Patient</th>
                  <th className="px-4 py-3 text-left font-semibold">Investigation</th>
                  <th className="px-4 py-3 text-left font-semibold">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Loading lab requests...
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono-tabular font-semibold text-[#0F2942]">
                        {r.requestNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{r.patientName}</div>
                        <div className="text-slate-500 font-mono-tabular">{r.patientNumber}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{r.testName}</div>
                        <div className="text-slate-500">{r.testCategory}</div>
                      </td>
                      <td className={`px-4 py-3 font-semibold ${r.priority === 'STAT' ? 'text-red-700' : r.priority === 'Urgent' ? 'text-amber-700' : 'text-slate-600'}`}>
                        {r.priority}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0D9488]">{r.status}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        {canManageLab && r.status === 'Requested' && (
                          <button
                            type="button"
                            onClick={() => updateReqStatus(r.id, 'Sample collected')}
                            className="text-blue-700 font-semibold hover:underline"
                          >
                            Collect Sample
                          </button>
                        )}
                        {canManageLab && r.status === 'Sample collected' && (
                          <button
                            type="button"
                            onClick={() => updateReqStatus(r.id, 'Processing')}
                            className="text-amber-700 font-semibold hover:underline"
                          >
                            Start Processing
                          </button>
                        )}
                        {canManageLab && r.status !== 'Completed' && r.status !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => {
                              setResultTarget(r);
                              setResForm({
                                resultSummary: '',
                                measuredValue: '',
                                referenceRange: r.normalRange || '',
                                interpretation: 'Normal',
                                technicianNotes: '',
                                reportFileName: '',
                                reportDataBase64: '',
                              });
                            }}
                            className="inline-flex items-center gap-1 text-[#0D9488] font-semibold hover:underline"
                          >
                            <FlaskConical className="w-3.5 h-3.5" />
                            <span>Record Result</span>
                          </button>
                        )}
                        {r.result && (
                          <button
                            type="button"
                            onClick={() => setPrintReport(r)}
                            className="inline-flex items-center gap-1 text-[#0F2942] font-semibold hover:underline"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>View / Print Report</span>
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
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Test Name</th>
                <th className="px-4 py-3 text-left font-semibold">Category</th>
                <th className="px-4 py-3 text-left font-semibold">Reference Range</th>
                <th className="px-4 py-3 text-right font-semibold">Tariff (MWK)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {tests.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono-tabular font-semibold text-[#0F2942]">
                    {t.testCode}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{t.testName}</td>
                  <td className="px-4 py-3 text-slate-600">{t.category}</td>
                  <td className="px-4 py-3 text-slate-600">{t.normalRange}</td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-slate-900">
                    {formatMwk(t.priceMwk)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Printable Report Preview */}
      {printReport && (
        <div className="bg-white border border-slate-300 rounded-xl p-8 print-only-full space-y-4">
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div>
              <div className="font-display text-xl font-bold text-[#0F2942]">
                SmartCare Laboratory Diagnostic Report
              </div>
              <div className="text-xs text-slate-500">
                Request {printReport.requestNumber} · Completed{' '}
                {printReport.completedAt ? new Date(printReport.completedAt).toLocaleString() : ''}
              </div>
            </div>
            <div className="flex gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-[#0F2942] text-white text-xs font-semibold rounded-lg"
              >
                Print Report
              </button>
              <button
                type="button"
                onClick={() => setPrintReport(null)}
                className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>Patient: <strong>{printReport.patientName}</strong> ({printReport.patientNumber})</div>
            <div>Investigation: <strong>{printReport.testName}</strong></div>
            <div>Measured Value: <strong className="font-mono-tabular">{printReport.result.measuredValue || '—'}</strong></div>
            <div>Reference Range: <strong>{printReport.result.referenceRange || printReport.normalRange}</strong></div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg text-sm">
            <div className="text-xs font-semibold text-slate-500">Summary & Interpretation ({printReport.result.interpretation})</div>
            <div className="mt-1 font-semibold text-slate-900">{printReport.result.resultSummary}</div>
            {printReport.result.technicianNotes && (
              <div className="mt-2 text-xs text-slate-600">{printReport.result.technicianNotes}</div>
            )}
          </div>
        </div>
      )}

      {/* Order Lab Request Modal */}
      <Modal open={orderOpen} onClose={() => setOrderOpen(false)} title="Submit Laboratory Investigation Request" size="md">
        <form onSubmit={handleOrder} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Patient *</label>
            <select
              required
              value={orderForm.patientId}
              onChange={(e) => setOrderForm({ ...orderForm, patientId: e.target.value })}
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Laboratory Test *</label>
            <select
              required
              value={orderForm.testId}
              onChange={(e) => setOrderForm({ ...orderForm, testId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option value="">Select test...</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.testName} ({formatMwk(t.priceMwk)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
            <select
              value={orderForm.priority}
              onChange={(e) => setOrderForm({ ...orderForm, priority: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option>Routine</option>
              <option>Urgent</option>
              <option>STAT</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Notes</label>
            <textarea
              rows={2}
              value={orderForm.clinicalNotes}
              onChange={(e) => setOrderForm({ ...orderForm, clinicalNotes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setOrderOpen(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg">
              Submit Request
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Result Modal */}
      <Modal
        open={Boolean(resultTarget)}
        onClose={() => setResultTarget(null)}
        title="Record Laboratory Result"
        subtitle={resultTarget ? `${resultTarget.requestNumber} · ${resultTarget.testName}` : ''}
      >
        <form onSubmit={handleRecordResult} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Result Summary *</label>
              <input
                type="text"
                required
                value={resForm.resultSummary}
                onChange={(e) => setResForm({ ...resForm, resultSummary: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Measured Value</label>
              <input
                type="text"
                value={resForm.measuredValue}
                onChange={(e) => setResForm({ ...resForm, measuredValue: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Interpretation</label>
              <select
                value={resForm.interpretation}
                onChange={(e) => setResForm({ ...resForm, interpretation: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option>Normal</option>
                <option>Abnormal</option>
                <option>Critical</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Technician Notes</label>
              <textarea
                rows={2}
                value={resForm.technicianNotes}
                onChange={(e) => setResForm({ ...resForm, technicianNotes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Lab Report Attachment (Optional)</label>
              <input
                type="file"
                onChange={(e) => handleReportFile(e.target.files?.[0] || null)}
                className="text-xs text-slate-600"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setResultTarget(null)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg">
              Publish Result to EMR
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
