import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatMwk, roleHasPermission } from '../lib/roles-config';

export const BillingModule: React.FC = () => {
  const { user, notify } = useAuth();
  const canManage = roleHasPermission(user?.roleSlug, 'billing:manage');

  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const [invOpen, setInvOpen] = useState(false);
  const [invForm, setInvForm] = useState({
    patientId: '',
    departmentId: '',
    notes: '',
    items: [
      { category: 'Consultation', description: 'Outpatient Consultation', quantity: 1, unitPriceMwk: 15000 },
    ],
  });

  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({
    amountMwk: 0,
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: '',
  });

  const [printInvoice, setPrintInvoice] = useState<any | null>(null);
  const [printReceipt, setPrintReceipt] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [billRes, patRes, stfRes] = await Promise.all([
        apiRequest<{ invoices: any[]; payments: any[] }>('/api/billing'),
        apiRequest<{ patients: any[] }>('/api/patients'),
        apiRequest<{ departments: any[] }>('/api/staff'),
      ]);
      setInvoices(billRes.invoices || []);
      setPayments(billRes.payments || []);
      setPatients(patRes.patients || []);
      setDepartments(stfRes.departments || []);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load billing records.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(invForm.patientId),
          departmentId: invForm.departmentId ? Number(invForm.departmentId) : null,
          notes: invForm.notes,
          items: invForm.items.map((it) => ({
            ...it,
            quantity: Number(it.quantity),
            unitPriceMwk: Number(it.unitPriceMwk),
          })),
        }),
      });
      notify('success', 'Patient invoice generated in MWK.');
      setInvOpen(false);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to generate invoice.');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    try {
      const res = await apiRequest<{ payment: any }>('/api/billing/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: payTarget.id,
          amountMwk: Number(payForm.amountMwk),
          paymentMethod: payForm.paymentMethod,
          referenceNumber: payForm.referenceNumber,
          notes: payForm.notes,
        }),
      });
      notify('success', `Payment recorded (${res.payment.receiptNumber}).`);
      setPayTarget(null);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Payment recording failed.');
    }
  };

  const totalBilled = invoices.reduce((s, i) => s + Number(i.totalAmountMwk || 0), 0);
  const totalCollected = invoices.reduce((s, i) => s + Number(i.paidAmountMwk || 0), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + Number(i.balanceMwk || 0), 0);

  const visibleInvoices = invoices.filter(
    (i) => statusFilter === 'All' || i.status === statusFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Billing & Financial Ledger (MWK)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Invoicing, partial & full payment settlements, official receipts, and balance tracking
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setInvOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold rounded-lg whitespace-nowrap self-start sm:self-auto"
          >
            <FileText className="w-4 h-4" />
            <span>Generate Invoice</span>
          </button>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 font-medium">Total Billed</div>
          <div className="mt-1 font-display text-xl font-bold text-slate-900 font-mono-tabular">
            {formatMwk(totalBilled)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 font-medium">Total Collected</div>
          <div className="mt-1 font-display text-xl font-bold text-emerald-700 font-mono-tabular">
            {formatMwk(totalCollected)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 font-medium">Outstanding Patient Balances</div>
          <div className="mt-1 font-display text-xl font-bold text-amber-700 font-mono-tabular">
            {formatMwk(totalOutstanding)}
          </div>
        </div>
      </div>

      {/* Tabs & Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('invoices')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'invoices' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('payments')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'payments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Receipts & Payments ({payments.length})
          </button>
        </div>

        {tab === 'invoices' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Statuses</option>
            <option>Unpaid</option>
            <option>Partial</option>
            <option>Paid</option>
          </select>
        )}
      </div>

      {tab === 'invoices' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                  <th className="px-4 py-3 text-left font-semibold">Patient</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Loading financial ledger...
                    </td>
                  </tr>
                ) : (
                  visibleInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono-tabular font-semibold text-[#0F2942]">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{inv.patientName}</div>
                        <div className="text-slate-500">{inv.notes || inv.departmentName || 'General'}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-slate-900">
                        {formatMwk(inv.totalAmountMwk)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-emerald-700">
                        {formatMwk(inv.paidAmountMwk)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-bold text-slate-900">
                        {formatMwk(inv.balanceMwk)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        <span
                          className={
                            inv.status === 'Paid'
                              ? 'text-emerald-700'
                              : inv.status === 'Partial'
                              ? 'text-amber-700'
                              : 'text-red-700'
                          }
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                        {canManage && inv.balanceMwk > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayTarget(inv);
                              setPayForm({
                                amountMwk: inv.balanceMwk,
                                paymentMethod: 'Cash',
                                referenceNumber: '',
                                notes: '',
                              });
                            }}
                            className="inline-flex items-center gap-1 text-[#0D9488] font-semibold hover:underline"
                          >
                            <Banknote className="w-3.5 h-3.5" />
                            <span>Record Payment</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPrintReceipt(null);
                            setPrintInvoice(inv);
                          }}
                          className="inline-flex items-center gap-1 text-[#0F2942] font-semibold hover:underline"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Invoice</span>
                        </button>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Receipt #</th>
                  <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                  <th className="px-4 py-3 text-left font-semibold">Patient</th>
                  <th className="px-4 py-3 text-left font-semibold">Method & Ref</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount (MWK)</th>
                  <th className="px-4 py-3 text-right font-semibold">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono-tabular font-semibold text-[#0F2942]">
                      {p.receiptNumber}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-slate-600">
                      {p.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.patientName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.paymentMethod} {p.referenceNumber ? `· ${p.referenceNumber}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-bold text-emerald-700">
                      {formatMwk(p.amountMwk)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setPrintInvoice(null);
                          setPrintReceipt(p);
                        }}
                        className="inline-flex items-center gap-1 text-[#0D9488] font-semibold hover:underline"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Printable Invoice View */}
      {printInvoice && (
        <div className="bg-white border border-slate-300 rounded-xl p-8 print-only-full space-y-5">
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div>
              <h2 className="font-display text-xl font-bold text-[#0F2942]">
                OFFICIAL HOSPITAL INVOICE — {printInvoice.invoiceNumber}
              </h2>
              <p className="text-xs text-slate-500">
                Patient: {printInvoice.patientName} ({printInvoice.patientNumber}) · Issued{' '}
                {new Date(printInvoice.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-[#0F2942] text-white text-xs font-semibold rounded-lg"
              >
                Print Invoice
              </button>
              <button
                type="button"
                onClick={() => setPrintInvoice(null)}
                className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-left">Category</th>
                <th className="py-2 text-left">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit (MWK)</th>
                <th className="py-2 text-right">Total (MWK)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(printInvoice.items || []).map((it: any) => (
                <tr key={it.id}>
                  <td className="py-2 text-slate-600">{it.category}</td>
                  <td className="py-2 font-medium text-slate-900">{it.description}</td>
                  <td className="py-2 text-right font-mono-tabular">{it.quantity}</td>
                  <td className="py-2 text-right font-mono-tabular">{formatMwk(it.unitPriceMwk)}</td>
                  <td className="py-2 text-right font-mono-tabular font-semibold">{formatMwk(it.totalPriceMwk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-200 pt-4 flex justify-end text-sm">
            <div className="w-64 space-y-1 font-mono-tabular">
              <div className="flex justify-between"><span>Total:</span><strong>{formatMwk(printInvoice.totalAmountMwk)}</strong></div>
              <div className="flex justify-between text-emerald-700"><span>Paid:</span><strong>{formatMwk(printInvoice.paidAmountMwk)}</strong></div>
              <div className="flex justify-between text-base border-t border-slate-200 pt-1"><span>Balance Due:</span><strong>{formatMwk(printInvoice.balanceMwk)}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt View */}
      {printReceipt && (
        <div className="bg-white border border-slate-300 rounded-xl p-8 print-only-full max-w-xl mx-auto space-y-4">
          <div className="flex justify-between items-start border-b border-slate-200 pb-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0F2942]">
                PAYMENT RECEIPT — {printReceipt.receiptNumber}
              </h2>
              <p className="text-xs text-slate-500">
                Date: {new Date(printReceipt.paidAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2 no-print">
              <button type="button" onClick={() => window.print()} className="px-3 py-1.5 bg-[#0F2942] text-white text-xs font-semibold rounded-lg">
                Print
              </button>
              <button type="button" onClick={() => setPrintReceipt(null)} className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded-lg">
                Close
              </button>
            </div>
          </div>
          <div className="text-xs space-y-2">
            <div>Received From: <strong>{printReceipt.patientName}</strong></div>
            <div>Invoice Reference: <strong className="font-mono-tabular">{printReceipt.invoiceNumber}</strong></div>
            <div>Payment Method: <strong>{printReceipt.paymentMethod}</strong> {printReceipt.referenceNumber ? `(${printReceipt.referenceNumber})` : ''}</div>
            <div className="text-base font-mono-tabular font-bold text-emerald-700 pt-2">
              Amount Paid: {formatMwk(printReceipt.amountMwk)}
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      <Modal open={invOpen} onClose={() => setInvOpen(false)} title="Generate Patient Invoice (MWK)" size="lg">
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Patient *</label>
              <select
                required
                value={invForm.patientId}
                onChange={(e) => setInvForm({ ...invForm, patientId: e.target.value })}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <select
                value={invForm.departmentId}
                onChange={(e) => setInvForm({ ...invForm, departmentId: e.target.value })}
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
          </div>

          <div className="space-y-2 border border-slate-200 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-700">Charge Line Items</span>
              <button
                type="button"
                onClick={() =>
                  setInvForm({
                    ...invForm,
                    items: [
                      ...invForm.items,
                      { category: 'Procedure', description: '', quantity: 1, unitPriceMwk: 5000 },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D9488]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Line</span>
              </button>
            </div>
            {invForm.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <select
                  value={it.category}
                  onChange={(e) => {
                    const copy = [...invForm.items];
                    copy[idx].category = e.target.value;
                    setInvForm({ ...invForm, items: copy });
                  }}
                  className="sm:col-span-3 px-2 py-1.5 text-xs border border-slate-300 rounded"
                >
                  <option>Consultation</option>
                  <option>Laboratory</option>
                  <option>Pharmacy</option>
                  <option>Admission</option>
                  <option>Procedure</option>
                  <option>Imaging</option>
                  <option>Other</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder="Service description"
                  value={it.description}
                  onChange={(e) => {
                    const copy = [...invForm.items];
                    copy[idx].description = e.target.value;
                    setInvForm({ ...invForm, items: copy });
                  }}
                  className="sm:col-span-4 px-2 py-1.5 text-xs border border-slate-300 rounded"
                />
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => {
                    const copy = [...invForm.items];
                    copy[idx].quantity = Number(e.target.value);
                    setInvForm({ ...invForm, items: copy });
                  }}
                  className="sm:col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded font-mono-tabular"
                />
                <input
                  type="number"
                  min={0}
                  value={it.unitPriceMwk}
                  onChange={(e) => {
                    const copy = [...invForm.items];
                    copy[idx].unitPriceMwk = Number(e.target.value);
                    setInvForm({ ...invForm, items: copy });
                  }}
                  className="sm:col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded font-mono-tabular"
                />
                <button
                  type="button"
                  disabled={invForm.items.length === 1}
                  onClick={() =>
                    setInvForm({
                      ...invForm,
                      items: invForm.items.filter((_, i) => i !== idx),
                    })
                  }
                  className="sm:col-span-1 text-red-600 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-200">
            <div className="font-mono-tabular text-sm font-bold text-slate-900">
              Total:{' '}
              {formatMwk(invForm.items.reduce((s, i) => s + i.quantity * i.unitPriceMwk, 0))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setInvOpen(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">
                Cancel
              </button>
              <button type="submit" className="px-5 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg">
                Issue Invoice
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="Record Payment"
        subtitle={
          payTarget
            ? `${payTarget.invoiceNumber} · Outstanding Balance: ${formatMwk(payTarget.balanceMwk)}`
            : ''
        }
        size="md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Received (MWK) *</label>
            <input
              type="number"
              required
              min={1}
              max={payTarget?.balanceMwk}
              value={payForm.amountMwk}
              onChange={(e) => setPayForm({ ...payForm, amountMwk: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method *</label>
            <select
              value={payForm.paymentMethod}
              onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option>Cash</option>
              <option>Bank transfer</option>
              <option>Mobile money</option>
              <option>Card</option>
              <option>Insurance</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Transaction ID</label>
            <input
              type="text"
              placeholder="e.g. Airtel Money / TNM Mpamba / MASM Claim #"
              value={payForm.referenceNumber}
              onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg">
              Confirm & Issue Receipt
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
