import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

interface DemoAccount {
  username: string;
  email: string;
  fullName: string;
  roleName: string;
  roleSlug: string;
}

export const LoginPage: React.FC = () => {
  const { loginWithCredentials, loginWithGoogle } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [showDemoList, setShowDemoList] = useState(false);

  useEffect(() => {
    apiRequest<{ accounts: DemoAccount[] }>('/api/auth/demo-accounts')
      .then((res) => setDemoAccounts(res.accounts || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginWithCredentials(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Sign-in failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleDemoFill = async (acc: DemoAccount) => {
    setIdentifier(acc.username || acc.email);
    setPassword('SmartCare@2026');
    setError(null);
    setSubmitting(true);
    try {
      await loginWithCredentials(acc.username || acc.email, 'SmartCare@2026');
    } catch (err: any) {
      setError(err.message || 'Unable to sign in with demo account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Left Visual Column */}
      <div className="relative lg:w-1/2 min-h-[280px] lg:min-h-screen bg-[#0F2942] overflow-hidden flex flex-col justify-between">
        <img
          src="/src/assets/images/hospital_login_banner_1795158104899.jpg"
          alt="SmartCare Medical Centre Atrium"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#091A2C]/95 via-[#0F2942]/70 to-[#0F2942]/45" />

        <div className="relative z-10 p-8 lg:p-12 flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-white p-1.5 shadow-sm shrink-0">
            <img
              src="/src/assets/images/smartcare_hospital_emblem_1795158103317.jpg"
              alt="SmartCare HMS Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <span className="font-display text-lg font-bold text-white tracking-tight block">
              SmartCare HMS
            </span>
            <span className="text-xs text-teal-200">
              Malawi & Regional Healthcare Operations
            </span>
          </div>
        </div>

        <div className="relative z-10 p-8 lg:p-12 max-w-xl">
          <h1 className="font-display text-3xl lg:text-4xl font-bold text-white leading-tight">
            Centralised Clinical, Pharmacy & Hospital Financial Operations
          </h1>
          <p className="mt-4 text-sm lg:text-base text-slate-200 leading-relaxed">
            Built for hospitals, clinics, and medical centres across Malawi. Unifies patient
            registration, electronic medical records, ward bed management, laboratory diagnostics,
            pharmacy stock, and MWK billing under role-governed security.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-teal-200">
            <span>PostgreSQL Relational Storage</span>
            <span aria-hidden="true">·</span>
            <span>8 Clinical & Admin Roles</span>
            <span aria-hidden="true">·</span>
            <span>MWK Currency Ledger</span>
          </div>
        </div>
      </div>

      {/* Right Login Column */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="w-6 h-6 text-[#0D9488] shrink-0" />
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                Staff Portal Sign In
              </h2>
              <p className="text-xs text-slate-500">
                Authorised hospital & clinical personnel only
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username or Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. dr.banda or sysadmin@smartcarehms.mw"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter staff password"
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#0F2942] hover:bg-[#163A5C] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? 'Verifying Credentials...' : 'Sign In to SmartCare'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleSubmitting}
            className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4 text-[#0D9488]" />
            {googleSubmitting ? 'Connecting to Google...' : 'Continue with Google Workspace'}
          </button>

          {demoAccounts.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDemoList((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-[#0D9488] hover:text-[#0F766E]"
              >
                <span>Development & Demo Role Directory ({demoAccounts.length} Roles)</span>
                <span>{showDemoList ? 'Hide' : 'Select Role'}</span>
              </button>

              {showDemoList && (
                <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  <p className="text-[11px] text-slate-500 mb-2">
                    Demo accounts are separated from real records. Click any role below to sign in
                    for evaluation:
                  </p>
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleDemoFill(acc)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-[#0D9488] hover:bg-teal-50/40 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {acc.roleName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {acc.fullName} · {acc.username}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-[#0D9488] shrink-0">
                        Sign in
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
