import React, { useCallback, useEffect, useState } from 'react';
import { Database, Shield, UserPlus } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatMwk, roleHasPermission } from '../lib/roles-config';

export const SettingsModule: React.FC<{ onHospitalUpdated: (name: string) => void }> = ({
  onHospitalUpdated,
}) => {
  const { user, notify } = useAuth();
  const isSysAdmin = roleHasPermission(user?.roleSlug, 'settings:manage');

  const [tab, setTab] = useState<'hospital' | 'departments' | 'users' | 'roles' | 'audit'>('hospital');
  const [settings, setSettings] = useState({
    hospitalName: '',
    tagline: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    country: 'Malawi',
    taxNumber: '',
    backupSchedule: '',
  });
  const [departments, setDepartments] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [rolesList, setRolesList] = useState<any[]>([]);
  const [permissionsList, setPermissionsList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [deptOpen, setDeptOpen] = useState(false);
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    headDoctorName: '',
    consultationFeeMwk: 15000,
    description: '',
  });

  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    roleId: '',
    departmentId: '',
    phone: '',
  });

  const loadData = useCallback(async () => {
    try {
      const hospRes = await apiRequest<{ settings: any; departments: any[]; services: any[] }>(
        '/api/settings/hospital'
      );
      if (hospRes.settings) {
        setSettings(hospRes.settings);
      }
      setDepartments(hospRes.departments || []);
      setServices(hospRes.services || []);

      if (isSysAdmin) {
        const admRes = await apiRequest<any>('/api/settings/users-roles');
        setUsersList(admRes.users || []);
        setRolesList(admRes.roles || []);
        setPermissionsList(admRes.permissions || []);
        setAuditLogs(admRes.auditLogs || []);
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load settings.');
    }
  }, [isSysAdmin, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ settings: any }>('/api/settings/hospital', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      notify('success', 'Hospital settings saved.');
      onHospitalUpdated(res.settings.hospitalName);
    } catch (err: any) {
      notify('error', err.message || 'Failed to save settings.');
    }
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/settings/departments', {
        method: 'POST',
        body: JSON.stringify({
          ...deptForm,
          consultationFeeMwk: Number(deptForm.consultationFeeMwk),
        }),
      });
      notify('success', 'Department created.');
      setDeptOpen(false);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to create department.');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/settings/users', {
        method: 'POST',
        body: JSON.stringify({
          ...userForm,
          roleId: Number(userForm.roleId),
          departmentId: userForm.departmentId ? Number(userForm.departmentId) : null,
        }),
      });
      notify('success', 'Staff user account provisioned with bcrypt password.');
      setUserOpen(false);
      setUserForm({
        username: '',
        email: '',
        password: '',
        fullName: '',
        roleId: '',
        departmentId: '',
        phone: '',
      });
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to create user.');
    }
  };

  const toggleUserActive = async (u: any) => {
    try {
      await apiRequest(`/api/settings/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      notify('success', `${u.fullName} ${!u.isActive ? 'activated' : 'deactivated'}.`);
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update user.');
    }
  };

  const handleBackupDownload = async () => {
    try {
      const snapshot = await apiRequest<any>('/api/settings/backup');
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartcare_hms_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('success', 'Database JSON backup exported.');
    } catch (err: any) {
      notify('error', err.message || 'Backup export failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Hospital & System Settings
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Facility profile, departments, service tariffs, RBAC user governance, and audit logs
          </p>
        </div>
        {isSysAdmin && (
          <button
            type="button"
            onClick={handleBackupDownload}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:border-[#0D9488] text-slate-800 text-xs font-semibold rounded-lg self-start sm:self-auto"
          >
            <Database className="w-4 h-4 text-[#0D9488]" />
            <span>Export Database Backup</span>
          </button>
        )}
      </div>

      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
        <button
          type="button"
          onClick={() => setTab('hospital')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
            tab === 'hospital' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Hospital Profile
        </button>
        <button
          type="button"
          onClick={() => setTab('departments')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
            tab === 'departments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Departments & Fees ({departments.length})
        </button>
        {isSysAdmin && (
          <>
            <button
              type="button"
              onClick={() => setTab('users')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                tab === 'users' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Users ({usersList.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('roles')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                tab === 'roles' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Roles & Permissions
            </button>
            <button
              type="button"
              onClick={() => setTab('audit')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                tab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Audit Logs ({auditLogs.length})
            </button>
          </>
        )}
      </div>

      {tab === 'hospital' && (
        <form onSubmit={handleSaveHospital} className="bg-white border border-slate-200 rounded-xl p-6 max-w-3xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hospital Name</label>
              <input type="text" required value={settings.hospitalName} onChange={(e) => setSettings({ ...settings, hospitalName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline</label>
              <input type="text" value={settings.tagline} onChange={(e) => setSettings({ ...settings, tagline: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input type="text" required value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email</label>
              <input type="email" required value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Address</label>
              <input type="text" required value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
              <input type="text" required value={settings.city} onChange={(e) => setSettings({ ...settings, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
              <input type="text" required value={settings.country} onChange={(e) => setSettings({ ...settings, country: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tax / TPIN</label>
              <input type="text" value={settings.taxNumber || ''} onChange={(e) => setSettings({ ...settings, taxNumber: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Backup Schedule</label>
              <input type="text" value={settings.backupSchedule || ''} onChange={(e) => setSettings({ ...settings, backupSchedule: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-200 flex justify-end">
            <button type="submit" className="px-5 py-2 bg-[#0F2942] text-white text-xs font-semibold rounded-lg">
              Save Hospital Settings
            </button>
          </div>
        </form>
      )}

      {tab === 'departments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={() => setDeptOpen(true)} className="px-4 py-2 bg-[#0F2942] text-white text-xs font-semibold rounded-lg">
              Add Department
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Department Name</th>
                  <th className="px-4 py-3 text-left">Head Doctor</th>
                  <th className="px-4 py-3 text-right">Consultation Fee (MWK)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-mono-tabular font-semibold text-[#0F2942]">{d.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 text-slate-600">{d.headDoctorName || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold">{formatMwk(d.consultationFeeMwk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-display text-xs font-bold text-slate-900">
              Configured Hospital Services & Tariffs
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {services.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{s.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{s.category}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold">{formatMwk(s.priceMwk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && isSysAdmin && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={() => setUserOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F2942] text-white text-xs font-semibold rounded-lg">
              <UserPlus className="w-4 h-4" />
              <span>Provision Staff User</span>
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Username / Email</th>
                  <th className="px-4 py-3 text-left">Assigned Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {u.fullName} {u.isDemoAccount ? '(Demo)' : ''}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-slate-600">
                      {u.username || 'Google OAuth'} · {u.email}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#0F2942]">{u.roleName}</td>
                    <td className="px-4 py-3 font-semibold">
                      <span className={u.isActive ? 'text-emerald-700' : 'text-red-700'}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleUserActive(u)}
                        className="text-[#0D9488] font-semibold hover:underline"
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'roles' && isSysAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rolesList.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-[#0F2942]">
                <Shield className="w-4 h-4 text-[#0D9488]" />
                <span>{r.name}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">{r.description}</p>
            </div>
          ))}
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="font-display text-sm font-bold text-slate-900 mb-2">
              Registered Granular Permissions ({permissionsList.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {permissionsList.map((p) => (
                <div key={p.id} className="p-2 bg-slate-50 rounded border border-slate-200">
                  <div className="font-mono-tabular font-semibold text-[#0F2942]">{p.code}</div>
                  <div className="text-slate-600">{p.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && isSysAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Actor & Role</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 font-mono-tabular text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900">{log.userName}</div>
                      <div className="text-slate-500">{log.userRole}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono-tabular font-semibold text-[#0F2942]">
                      {log.action} · {log.module}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      <Modal open={deptOpen} onClose={() => setDeptOpen(false)} title="Create Clinical Department" size="md">
        <form onSubmit={handleAddDept} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Department Name *</label>
            <input type="text" required value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code *</label>
              <input type="text" required value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })} placeholder="e.g. ENT" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Consultation Fee (MWK)</label>
              <input type="number" required value={deptForm.consultationFeeMwk} onChange={(e) => setDeptForm({ ...deptForm, consultationFeeMwk: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Head Doctor</label>
            <input type="text" value={deptForm.headDoctorName} onChange={(e) => setDeptForm({ ...deptForm, headDoctorName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setDeptOpen(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg">Save Department</button>
          </div>
        </form>
      </Modal>

      {/* Provision User Modal */}
      <Modal open={userOpen} onClose={() => setUserOpen(false)} title="Provision Hospital Staff Account" size="md">
        <form onSubmit={handleAddUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input type="text" required value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username *</label>
              <input type="text" required value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email *</label>
              <input type="email" required value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Password *</label>
              <input type="password" required minLength={6} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role *</label>
              <select required value={userForm.roleId} onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                <option value="">Select role...</option>
                {rolesList.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setUserOpen(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded-lg">Create User</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
