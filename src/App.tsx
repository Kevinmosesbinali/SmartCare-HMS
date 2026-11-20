import React, { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { LoginPage } from './components/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiRequest } from './lib/api';
import { ModuleKey, getRoleModules } from './lib/roles-config';
import { AdmissionsModule } from './modules/AdmissionsModule';
import { AppointmentsModule } from './modules/AppointmentsModule';
import { BillingModule } from './modules/BillingModule';
import { ConsultationsModule } from './modules/ConsultationsModule';
import { DashboardModule } from './modules/DashboardModule';
import { InventoryModule } from './modules/InventoryModule';
import { LaboratoryModule } from './modules/LaboratoryModule';
import { PatientsModule } from './modules/PatientsModule';
import { PharmacyModule } from './modules/PharmacyModule';
import { ReportsModule } from './modules/ReportsModule';
import { SettingsModule } from './modules/SettingsModule';
import { StaffModule } from './modules/StaffModule';

const SmartCareShell: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [hospitalName, setHospitalName] = useState('Kamuzu-SmartCare Medical Centre');

  useEffect(() => {
    if (!user) return;
    const allowed = getRoleModules(user.roleSlug);
    if (!allowed.includes(activeModule)) {
      setActiveModule(allowed[0] || 'dashboard');
    }
    apiRequest<{ settings: { hospitalName: string } }>('/api/settings/hospital')
      .then((res) => {
        if (res.settings?.hospitalName) setHospitalName(res.settings.hospitalName);
      })
      .catch(() => {});
  }, [user, activeModule]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 border-2 border-[#0D9488] border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs font-medium text-slate-500">Loading SmartCare HMS...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const allowed = getRoleModules(user.roleSlug);
  const effectiveModule = allowed.includes(activeModule) ? activeModule : 'dashboard';

  return (
    <Layout
      activeModule={effectiveModule}
      onSelectModule={setActiveModule}
      hospitalName={hospitalName}
    >
      {effectiveModule === 'dashboard' && <DashboardModule onNavigate={setActiveModule} />}
      {effectiveModule === 'patients' && <PatientsModule />}
      {effectiveModule === 'appointments' && <AppointmentsModule />}
      {effectiveModule === 'consultations' && <ConsultationsModule />}
      {effectiveModule === 'admissions' && <AdmissionsModule />}
      {effectiveModule === 'pharmacy' && <PharmacyModule />}
      {effectiveModule === 'laboratory' && <LaboratoryModule />}
      {effectiveModule === 'billing' && <BillingModule />}
      {effectiveModule === 'inventory' && <InventoryModule />}
      {effectiveModule === 'staff' && <StaffModule />}
      {effectiveModule === 'reports' && <ReportsModule />}
      {effectiveModule === 'settings' && <SettingsModule onHospitalUpdated={setHospitalName} />}
    </Layout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <SmartCareShell />
    </AuthProvider>
  );
}
