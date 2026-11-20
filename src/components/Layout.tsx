import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Pill,
  Settings,
  Stethoscope,
  Users,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ModuleKey, getRoleModules } from '../lib/roles-config';

interface LayoutProps {
  activeModule: ModuleKey;
  onSelectModule: (m: ModuleKey) => void;
  hospitalName: string;
  children: React.ReactNode;
}

const NAV_ITEMS: { key: ModuleKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'patients', label: 'Patients', icon: Users },
  { key: 'appointments', label: 'Appointments', icon: CalendarDays },
  { key: 'consultations', label: 'Consultations & EMR', icon: Stethoscope },
  { key: 'admissions', label: 'Wards & Admissions', icon: BedDouble },
  { key: 'pharmacy', label: 'Pharmacy', icon: Pill },
  { key: 'laboratory', label: 'Laboratory', icon: FlaskConical },
  { key: 'billing', label: 'Billing (MWK)', icon: CreditCard },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'staff', label: 'Doctors & Staff', icon: UserCheck },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'System Settings', icon: Settings },
];

export const Layout: React.FC<LayoutProps> = ({
  activeModule,
  onSelectModule,
  hospitalName,
  children,
}) => {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowedModules = getRoleModules(user?.roleSlug);
  const visibleNav = NAV_ITEMS.filter((item) => allowedModules.includes(item.key));
  const currentNav = NAV_ITEMS.find((n) => n.key === activeModule);

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#0F2942] text-slate-100 select-none">
      <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-white p-1 shrink-0">
            <img
              src="/src/assets/images/smartcare_hospital_emblem_1795158103317.jpg"
              alt="SmartCare HMS"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-white truncate">
                SmartCare HMS
              </div>
              <div className="text-[11px] text-teal-300 truncate">{hospitalName}</div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-md text-slate-300 hover:text-white"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeModule;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onSelectModule(item.key);
                setMobileOpen(false);
              }}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#0D9488] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 shrink-0">
        {!collapsed && user && (
          <div className="mb-2 px-2 py-1.5">
            <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
            <div className="text-[11px] text-teal-300 truncate">{user.roleName}</div>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 no-print ${
          collapsed ? 'w-[72px]' : 'w-[250px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{SidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] h-full z-10">{SidebarContent}</div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-20 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline truncate">{hospitalName}</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-slate-900 truncate">
                {currentNav?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {user?.isDemoAccount && (
              <span className="hidden md:inline text-xs font-medium text-amber-700">
                Demo Role Session
              </span>
            )}
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-slate-900">{user?.fullName}</div>
              <div className="text-[11px] text-slate-500">
                {user?.roleName}
                {user?.departmentName ? ` · ${user.departmentName}` : ''}
              </div>
            </div>
            <Activity className="w-4 h-4 text-[#0D9488] shrink-0 hidden sm:block" />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
