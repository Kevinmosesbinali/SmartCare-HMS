import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiRequest, setInMemoryFirebaseToken } from '../lib/api';
import { RoleSlug } from '../lib/roles-config';

export interface AuthUser {
  id: number;
  uid: string;
  username: string | null;
  email: string;
  fullName: string;
  roleId: number | null;
  roleName: string;
  roleSlug: RoleSlug;
  departmentId: number | null;
  departmentName: string | null;
  isDemoAccount: boolean;
}

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithCredentials: (identifier: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
  confirmAction: (opts: ConfirmOptions) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const notify = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const confirmAction = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ opts, resolve });
    });
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let initialized = false;
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          setInMemoryFirebaseToken(token);
          await fetchCurrentUser();
        } catch {
          setInMemoryFirebaseToken(null);
          await fetchCurrentUser();
        }
      } else {
        setInMemoryFirebaseToken(null);
        await fetchCurrentUser();
      }
      initialized = true;
    });

    if (!initialized) {
      // fallback check if Firebase listener delays
      const timer = setTimeout(() => {
        if (!initialized) fetchCurrentUser();
      }, 800);
      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    }
    return () => unsubscribe();
  }, [fetchCurrentUser]);

  const loginWithCredentials = async (identifier: string, password: string) => {
    const data = await apiRequest<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setUser(data.user);
    notify('success', `Signed in as ${data.user.fullName} (${data.user.roleName})`);
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const token = await cred.user.getIdToken();
    setInMemoryFirebaseToken(token);
    const data = await apiRequest<{ user: AuthUser }>('/api/auth/firebase-sync', {
      method: 'POST',
    });
    setUser(data.user);
    notify('success', `Signed in via Google as ${data.user.fullName}`);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setInMemoryFirebaseToken(null);
    setUser(null);
    notify('info', 'Signed out of SmartCare HMS');
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, loginWithCredentials, loginWithGoogle, logout, notify, confirmAction }}
    >
      {children}

      {/* Global Toast Stack */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`px-4 py-3 rounded-lg border text-sm font-medium shadow-sm transition-all ${
              t.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : t.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Global Confirmation Dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">{confirmState.opts.title}</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {confirmState.opts.description}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  confirmState.opts.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#0F2942] hover:bg-[#163A5C]'
                }`}
              >
                {confirmState.opts.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
