import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpDown, Building2, Plus } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatMwk, roleHasPermission } from '../lib/roles-config';

export const InventoryModule: React.FC = () => {
  const { user, notify } = useAuth();
  const canManage = roleHasPermission(user?.roleSlug, 'inventory:manage');

  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [tab, setTab] = useState<'items' | 'suppliers' | 'movements'>('items');
  const [loading, setLoading] = useState(true);

  const [itemOpen, setItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState({
    name: '',
    category: 'Consumables',
    quantity: 50,
    unit: 'Boxes',
    reorderLevel: 20,
    unitCostMwk: 5000,
    expiryDate: '',
    supplierId: '',
    location: 'Central Medical Store',
  });

  const [supOpen, setSupOpen] = useState(false);
  const [supForm, setSupForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
  });

  const [moveTarget, setMoveTarget] = useState<any | null>(null);
  const [moveForm, setMoveForm] = useState({
    movementType: 'Purchase' as 'Purchase' | 'Issue' | 'Adjustment',
    quantity: 10,
    referenceNote: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: any[]; suppliers: any[]; movements: any[] }>(
        '/api/inventory'
      );
      setItems(res.items || []);
      setSuppliers(res.suppliers || []);
      setMovements(res.movements || []);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          ...itemForm,
          quantity: Number(itemForm.quantity),
          reorderLevel: Number(itemForm.reorderLevel),
          unitCostMwk: Number(itemForm.unitCostMwk),
          supplierId: itemForm.supplierId ? Number(itemForm.supplierId) : null,
        }),
      });
      notify('success', 'Inventory supply registered.');
      setItemOpen(false);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to add supply item.');
    }
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/inventory/suppliers', {
        method: 'POST',
        body: JSON.stringify(supForm),
      });
      notify('success', 'Supplier added.');
      setSupOpen(false);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save supplier.');
    }
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveTarget) return;
    try {
      await apiRequest('/api/inventory/movements', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: moveTarget.id,
          movementType: moveForm.movementType,
          quantity: Number(moveForm.quantity),
          referenceNote: moveForm.referenceNote,
        }),
      });
      notify('success', 'Stock movement recorded.');
      setMoveTarget(null);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Stock movement failed.');
    }
  };

  const lowStockCount = items.filter((i) => i.isLowStock).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Inventory & Procurement Store
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {items.length} supply items · {lowStockCount} low-stock alerts · {suppliers.length} active suppliers
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSupOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg"
            >
              <Building2 className="w-4 h-4 text-[#0D9488]" />
              <span>Add Supplier</span>
            </button>
            <button
              type="button"
              onClick={() => setItemOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F2942] text-white text-xs font-semibold rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Add Supply Item</span>
            </button>
          </div>
        )}
      </div>

      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
        {(
          [
            { id: 'items', label: `Medical Supplies (${items.length})` },
            { id: 'suppliers', label: `Suppliers (${suppliers.length})` },
            { id: 'movements', label: 'Stock Movements' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
              tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Code</th>
                  <th className="px-4 py-3 text-left font-semibold">Supply Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Location & Supplier</th>
                  <th className="px-4 py-3 text-right font-semibold">Stock</th>
                  <th className="px-4 py-3 text-right font-semibold">Unit Cost</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Loading inventory...
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono-tabular font-semibold text-[#0F2942]">
                        {it.itemCode}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{it.name}</div>
                        <div className="text-slate-500">{it.category}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{it.location}</div>
                        <div className="text-[11px] text-slate-400">{it.supplierName || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-bold text-slate-900">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-slate-700">
                        {formatMwk(it.unitCostMwk)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {it.isLowStock ? (
                          <span className="text-red-700">Low Stock (≤ {it.reorderLevel})</span>
                        ) : (
                          <span className="text-emerald-700">In Stock</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => {
                              setMoveTarget(it);
                              setMoveForm({ movementType: 'Purchase', quantity: 10, referenceNote: '' });
                            }}
                            className="inline-flex items-center gap-1 text-[#0D9488] font-semibold hover:underline"
                          >
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            <span>Purchase / Issue</span>
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
      )}

      {tab === 'suppliers' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold">Contact Person</th>
                <th className="px-4 py-3 text-left font-semibold">Phone / Email</th>
                <th className="px-4 py-3 text-left font-semibold">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-700">{s.contactPerson || '—'}</td>
                  <td className="px-4 py-3 font-mono-tabular text-slate-700">
                    {s.phone} {s.email ? `· ${s.email}` : ''}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'movements' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Timestamp</th>
                <th className="px-4 py-3 text-left font-semibold">Item</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-right font-semibold">Delta</th>
                <th className="px-4 py-3 text-left font-semibold">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-mono-tabular text-slate-500">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{m.itemName}</td>
                  <td className="px-4 py-3">{m.movementType}</td>
                  <td className={`px-4 py-3 text-right font-mono-tabular font-bold ${m.quantityDelta < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.referenceNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Supply Modal */}
      <Modal open={itemOpen} onClose={() => setItemOpen(false)} title="Add Medical Supply Item" size="md">
        <form onSubmit={handleAddItem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Item Name *</label>
              <input type="text" required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                <option>Consumables</option>
                <option>PPE</option>
                <option>Surgical</option>
                <option>Laboratory Reagents</option>
                <option>Ward Equipment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unit</label>
              <input type="text" required value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Quantity</label>
              <input type="number" required min={0} value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Cost (MWK)</label>
              <input type="number" min={0} value={itemForm.unitCostMwk} onChange={(e) => setItemForm({ ...itemForm, unitCostMwk: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setItemOpen(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg">Save Supply</button>
          </div>
        </form>
      </Modal>

      {/* Add Supplier Modal */}
      <Modal open={supOpen} onClose={() => setSupOpen(false)} title="Register Procurement Supplier" size="md">
        <form onSubmit={handleAddSupplier} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name *</label>
              <input type="text" required value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
              <input type="text" value={supForm.contactPerson} onChange={(e) => setSupForm({ ...supForm, contactPerson: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone *</label>
              <input type="text" required value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
              <input type="text" value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setSupOpen(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg">Save Supplier</button>
          </div>
        </form>
      </Modal>

      {/* Stock Movement Modal */}
      <Modal
        open={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        title="Record Inventory Movement"
        subtitle={moveTarget ? `${moveTarget.name} (Available: ${moveTarget.quantity} ${moveTarget.unit})` : ''}
        size="md"
      >
        <form onSubmit={handleMovement} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Movement Type</label>
            <select value={moveForm.movementType} onChange={(e) => setMoveForm({ ...moveForm, movementType: e.target.value as any })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option value="Purchase">Purchase (Stock In)</option>
              <option value="Issue">Issue to Ward/Dept (Stock Out)</option>
              <option value="Adjustment">Audit Adjustment (+)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity *</label>
            <input type="number" required min={1} value={moveForm.quantity} onChange={(e) => setMoveForm({ ...moveForm, quantity: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference Note</label>
            <input type="text" placeholder="e.g. Issued to Maternity Ward" value={moveForm.referenceNote} onChange={(e) => setMoveForm({ ...moveForm, referenceNote: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setMoveTarget(null)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0D9488] rounded-lg">Record Movement</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
