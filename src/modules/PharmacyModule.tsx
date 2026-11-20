import React, { useCallback, useEffect, useState } from 'react';
import { PackagePlus, Pill, PlusCircle } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatMwk, roleHasPermission } from '../lib/roles-config';

export const PharmacyModule: React.FC = () => {
  const { user, notify, confirmAction } = useAuth();
  const canManage = roleHasPermission(user?.roleSlug, 'pharmacy:manage');

  const [medicines, setMedicines] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [tab, setTab] = useState<'prescriptions' | 'catalog' | 'batches' | 'movements'>('prescriptions');
  const [loading, setLoading] = useState(true);

  const [medOpen, setMedOpen] = useState(false);
  const [medForm, setMedForm] = useState({
    medicineName: '',
    genericName: '',
    category: 'Antibiotic',
    dosageForm: 'Tablet',
    strength: '',
    unitPriceMwk: 500,
    reorderLevel: 50,
  });

  const [stockOpen, setStockOpen] = useState(false);
  const [stockForm, setStockForm] = useState({
    medicineId: '',
    batchNumber: '',
    quantity: 100,
    expiryDate: '2028-06-30',
    supplierId: '',
    purchasePriceMwk: 300,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<any>('/api/pharmacy');
      setMedicines(res.medicines || []);
      setBatches(res.batches || []);
      setSuppliers(res.suppliers || []);
      setPrescriptions(res.prescriptions || []);
      setMovements(res.movements || []);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load pharmacy records.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDispense = async (rx: any) => {
    const ok = await confirmAction({
      title: 'Dispense Prescription',
      description: `Dispense ${rx.prescriptionNumber} for ${rx.patientName}? Stock will be deducted FIFO from earliest-expiring batches and billed in MWK.`,
      confirmLabel: 'Dispense Medication',
    });
    if (!ok) return;

    try {
      await apiRequest(`/api/pharmacy/prescriptions/${rx.id}/dispense`, { method: 'POST' });
      notify('success', `${rx.prescriptionNumber} dispensed and stock updated.`);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Dispensing failed.');
    }
  };

  const handleAddMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/pharmacy/medicines', {
        method: 'POST',
        body: JSON.stringify({
          ...medForm,
          unitPriceMwk: Number(medForm.unitPriceMwk),
          reorderLevel: Number(medForm.reorderLevel),
        }),
      });
      notify('success', 'Medicine registered in formulary.');
      setMedOpen(false);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to add medicine.');
    }
  };

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/pharmacy/stock', {
        method: 'POST',
        body: JSON.stringify({
          medicineId: Number(stockForm.medicineId),
          batchNumber: stockForm.batchNumber,
          quantity: Number(stockForm.quantity),
          expiryDate: stockForm.expiryDate,
          supplierId: stockForm.supplierId ? Number(stockForm.supplierId) : null,
          purchasePriceMwk: Number(stockForm.purchasePriceMwk),
        }),
      });
      notify('success', 'Medicine batch received into pharmacy stock.');
      setStockOpen(false);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to receive batch.');
    }
  };

  const lowStockCount = medicines.filter((m) => m.isLowStock).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Pharmacy & Dispensary</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {medicines.length} medicines · {lowStockCount} low-stock alerts · Automatic FIFO batch deduction
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMedOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:border-[#0D9488] text-slate-800 text-xs font-semibold rounded-lg"
            >
              <PlusCircle className="w-4 h-4 text-[#0D9488]" />
              <span>New Medicine</span>
            </button>
            <button
              type="button"
              onClick={() => setStockOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold rounded-lg"
            >
              <PackagePlus className="w-4 h-4" />
              <span>Receive Stock Batch</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
        {(
          [
            { id: 'prescriptions', label: `Prescriptions (${prescriptions.length})` },
            { id: 'catalog', label: `Medicines & Levels (${medicines.length})` },
            { id: 'batches', label: `Batches & Expiry (${batches.length})` },
            { id: 'movements', label: 'Stock Movements' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'prescriptions' && (
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Loading prescriptions...
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              No prescriptions queued.
            </div>
          ) : (
            prescriptions.map((rx) => (
              <div key={rx.id} className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular font-semibold text-[#0F2942]">
                        {rx.prescriptionNumber}
                      </span>
                      <span>·</span>
                      <span>Prescribed by {rx.doctorName}</span>
                      <span>·</span>
                      <span className="tabular-nums">{new Date(rx.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 mt-0.5">
                      {rx.patientName} ({rx.patientNumber})
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold ${
                        rx.status === 'Dispensed' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {rx.status}
                    </span>
                    {canManage && rx.status !== 'Dispensed' && (
                      <button
                        type="button"
                        onClick={() => handleDispense(rx)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg"
                      >
                        <Pill className="w-3.5 h-3.5" />
                        <span>Dispense & Bill</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {(rx.items || []).map((item: any) => (
                    <div key={item.id} className="flex flex-wrap justify-between text-xs py-1">
                      <div className="text-slate-800">
                        <strong>{item.medicineName}</strong> · {item.dosage} · {item.frequency} · {item.duration}
                      </div>
                      <div className="font-mono-tabular text-slate-600">
                        Qty: {item.quantityPrescribed} ({formatMwk(item.unitPriceMwk)}/unit)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'catalog' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Medicine & Generic</th>
                  <th className="px-4 py-3 text-left font-semibold">Category / Form</th>
                  <th className="px-4 py-3 text-right font-semibold">Unit Price (MWK)</th>
                  <th className="px-4 py-3 text-right font-semibold">Available Stock</th>
                  <th className="px-4 py-3 text-left font-semibold">Stock Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {medicines.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{m.medicineName}</div>
                      <div className="text-slate-500">{m.genericName}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {m.category} · {m.dosageForm}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-slate-900">
                      {formatMwk(m.unitPriceMwk)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-bold text-slate-900">
                      {m.totalStock}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {m.isLowStock ? (
                        <span className="text-red-700">Low Stock (Reorder ≤ {m.reorderLevel})</span>
                      ) : (
                        <span className="text-emerald-700">Nominal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'batches' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Batch #</th>
                  <th className="px-4 py-3 text-left font-semibold">Medicine</th>
                  <th className="px-4 py-3 text-left font-semibold">Supplier</th>
                  <th className="px-4 py-3 text-right font-semibold">Quantity</th>
                  <th className="px-4 py-3 text-left font-semibold">Expiry Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {batches.map((b) => {
                  const expiringSoon =
                    new Date(b.expiryDate).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 60;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono-tabular font-semibold text-[#0F2942]">
                        {b.batchNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{b.medicineName}</td>
                      <td className="px-4 py-3 text-slate-600">{b.supplierName || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-slate-900">
                        {b.quantity}
                      </td>
                      <td className={`px-4 py-3 font-mono-tabular font-semibold ${expiringSoon ? 'text-red-700' : 'text-slate-700'}`}>
                        {b.expiryDate} {expiringSoon ? '(Expiring Soon)' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'movements' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Medicine</th>
                  <th className="px-4 py-3 text-left font-semibold">Movement</th>
                  <th className="px-4 py-3 text-right font-semibold">Delta</th>
                  <th className="px-4 py-3 text-left font-semibold">Reference Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {movements.map((mv) => (
                  <tr key={mv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono-tabular text-slate-500">
                      {new Date(mv.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{mv.medicineName}</td>
                    <td className="px-4 py-3">{mv.movementType}</td>
                    <td className={`px-4 py-3 text-right font-mono-tabular font-bold ${mv.quantityDelta < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {mv.quantityDelta > 0 ? `+${mv.quantityDelta}` : mv.quantityDelta}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{mv.referenceNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Medicine Modal */}
      <Modal open={medOpen} onClose={() => setMedOpen(false)} title="Register New Medicine" size="md">
        <form onSubmit={handleAddMedicine} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Medicine Name *</label>
              <input
                type="text"
                required
                value={medForm.medicineName}
                onChange={(e) => setMedForm({ ...medForm, medicineName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Generic Name *</label>
              <input
                type="text"
                required
                value={medForm.genericName}
                onChange={(e) => setMedForm({ ...medForm, genericName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
              <input
                type="text"
                required
                value={medForm.category}
                onChange={(e) => setMedForm({ ...medForm, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Dosage Form *</label>
              <select
                value={medForm.dosageForm}
                onChange={(e) => setMedForm({ ...medForm, dosageForm: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option>Tablet</option>
                <option>Capsule</option>
                <option>Syrup</option>
                <option>Injection</option>
                <option>IV Fluid</option>
                <option>Topical</option>
                <option>Inhaler</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Price (MWK) *</label>
              <input
                type="number"
                required
                min={1}
                value={medForm.unitPriceMwk}
                onChange={(e) => setMedForm({ ...medForm, unitPriceMwk: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reorder Level</label>
              <input
                type="number"
                value={medForm.reorderLevel}
                onChange={(e) => setMedForm({ ...medForm, reorderLevel: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setMedOpen(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg">
              Save Medicine
            </button>
          </div>
        </form>
      </Modal>

      {/* Receive Stock Batch Modal */}
      <Modal open={stockOpen} onClose={() => setStockOpen(false)} title="Receive Pharmacy Stock Batch" size="md">
        <form onSubmit={handleReceiveStock} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Medicine *</label>
              <select
                required
                value={stockForm.medicineId}
                onChange={(e) => setStockForm({ ...stockForm, medicineId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select medicine...</option>
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.medicineName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Number *</label>
              <input
                type="text"
                required
                value={stockForm.batchNumber}
                onChange={(e) => setStockForm({ ...stockForm, batchNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity *</label>
              <input
                type="number"
                required
                min={1}
                value={stockForm.quantity}
                onChange={(e) => setStockForm({ ...stockForm, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date *</label>
              <input
                type="date"
                required
                value={stockForm.expiryDate}
                onChange={(e) => setStockForm({ ...stockForm, expiryDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier</label>
              <select
                value={stockForm.supplierId}
                onChange={(e) => setStockForm({ ...stockForm, supplierId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setStockOpen(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg">
              Record Purchase
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
