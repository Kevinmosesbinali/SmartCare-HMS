export type RoleSlug =
  | 'system_admin'
  | 'hospital_admin'
  | 'receptionist'
  | 'doctor'
  | 'nurse'
  | 'pharmacist'
  | 'lab_technician'
  | 'accountant';

export type ModuleKey =
  | 'dashboard'
  | 'patients'
  | 'appointments'
  | 'consultations'
  | 'admissions'
  | 'pharmacy'
  | 'laboratory'
  | 'billing'
  | 'inventory'
  | 'staff'
  | 'reports'
  | 'settings';

export interface RoleDefinition {
  name: string;
  slug: RoleSlug;
  description: string;
  modules: ModuleKey[];
  permissions: string[];
}

export const ALL_MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'consultations', label: 'Consultations & EMR' },
  { key: 'admissions', label: 'Admissions & Wards' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'laboratory', label: 'Laboratory' },
  { key: 'billing', label: 'Billing & Payments' },
  { key: 'inventory', label: 'Inventory & Store' },
  { key: 'staff', label: 'Doctors & Staff' },
  { key: 'reports', label: 'Reports & Analytics' },
  { key: 'settings', label: 'System Settings' },
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    name: 'System Administrator',
    slug: 'system_admin',
    description: 'Full system access, user & permission governance, hospital configuration, and audit oversight.',
    modules: [
      'dashboard',
      'patients',
      'appointments',
      'consultations',
      'admissions',
      'pharmacy',
      'laboratory',
      'billing',
      'inventory',
      'staff',
      'reports',
      'settings',
    ],
    permissions: ['*'],
  },
  {
    name: 'Hospital Administrator',
    slug: 'hospital_admin',
    description: 'Manage hospital operations, departments, staff, services, and operational/financial reports.',
    modules: [
      'dashboard',
      'patients',
      'appointments',
      'admissions',
      'pharmacy',
      'laboratory',
      'billing',
      'inventory',
      'staff',
      'reports',
      'settings',
    ],
    permissions: [
      'dashboard:read',
      'patients:read',
      'appointments:read',
      'admissions:read',
      'pharmacy:read',
      'laboratory:read',
      'billing:read',
      'inventory:manage',
      'staff:manage',
      'reports:read',
      'settings:hospital',
    ],
  },
  {
    name: 'Receptionist',
    slug: 'receptionist',
    description: 'Register patients, schedule appointments, manage check-ins, and view registration info.',
    modules: ['dashboard', 'patients', 'appointments', 'staff'],
    permissions: [
      'dashboard:read',
      'patients:read',
      'patients:write',
      'appointments:manage',
      'staff:read',
    ],
  },
  {
    name: 'Doctor',
    slug: 'doctor',
    description: 'Access assigned patients, EMR history, record consultations, diagnoses, prescriptions, and lab requests.',
    modules: ['dashboard', 'patients', 'appointments', 'consultations', 'admissions', 'laboratory', 'pharmacy'],
    permissions: [
      'dashboard:read',
      'patients:read',
      'appointments:read',
      'appointments:write',
      'consultations:write',
      'admissions:read',
      'admissions:write',
      'laboratory:request',
      'laboratory:read',
      'pharmacy:prescribe',
      'pharmacy:read',
    ],
  },
  {
    name: 'Nurse',
    slug: 'nurse',
    description: 'Record vital signs, manage patient observations, monitor admitted patients, and update nursing notes.',
    modules: ['dashboard', 'patients', 'appointments', 'consultations', 'admissions'],
    permissions: [
      'dashboard:read',
      'patients:read',
      'appointments:read',
      'vitals:write',
      'admissions:manage',
      'observations:write',
    ],
  },
  {
    name: 'Pharmacist',
    slug: 'pharmacist',
    description: 'Manage medicine stock, process prescriptions, dispense medication, and monitor expiry dates.',
    modules: ['dashboard', 'patients', 'pharmacy', 'inventory', 'reports'],
    permissions: [
      'dashboard:read',
      'patients:read',
      'pharmacy:manage',
      'inventory:manage',
      'reports:read',
    ],
  },
  {
    name: 'Laboratory Technician',
    slug: 'lab_technician',
    description: 'Receive laboratory requests, record test results, upload reports, and manage lab operations.',
    modules: ['dashboard', 'patients', 'laboratory', 'inventory', 'reports'],
    permissions: [
      'dashboard:read',
      'patients:read',
      'laboratory:manage',
      'inventory:read',
      'reports:read',
    ],
  },
  {
    name: 'Accountant/Cashier',
    slug: 'accountant',
    description: 'Generate invoices, record payments in MWK, manage billing, and generate financial reports.',
    modules: ['dashboard', 'patients', 'billing', 'reports'],
    permissions: [
      'dashboard:read',
      'patients:read',
      'billing:manage',
      'reports:read',
    ],
  },
];

export function getRoleModules(slug?: string | null): ModuleKey[] {
  const found = ROLE_DEFINITIONS.find((r) => r.slug === slug);
  return found ? found.modules : ['dashboard'];
}

export function roleHasPermission(slug: string | undefined | null, permission: string): boolean {
  if (!slug) return false;
  const found = ROLE_DEFINITIONS.find((r) => r.slug === slug);
  if (!found) return false;
  if (found.permissions.includes('*')) return true;
  if (found.permissions.includes(permission)) return true;
  const [prefix] = permission.split(':');
  return found.permissions.includes(`${prefix}:manage`);
}

export function formatMwk(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  return `MWK ${Math.round(num).toLocaleString('en-US')}`;
}
