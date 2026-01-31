
import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { supabase, supabaseReady } from '../../lib/supabaseClient';
import { Login } from './Login';
import { UserAccount, UserRole } from '../../types';

interface AuthContextType {
  user: UserAccount | null;
  loading: boolean;
  isMock: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  hasPerm: (perm: string) => boolean;
  loginMock: (email: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthGate");
  return context;
};

const MOCK_PROFILES: Record<string, any> = {
  'admin@dmcnexus.com': {
    id: 'mock-admin-id',
    name: 'Master Admin (Mock)',
    email: 'admin@dmcnexus.com',
    role: UserRole.ADMIN,
    status: 'Active',
    permissions: ['*'],
    isTrial: false,
    createdAt: '2023-01-01T00:00:00Z'
  },
  'ops@dmcnexus.com': {
    id: 'mock-ops-id',
    name: 'Operations Staff (Mock)',
    email: 'ops@dmcnexus.com',
    role: UserRole.SUB_ACCOUNT,
    status: 'Active',
    permissions: ['itinerary.view', 'task.view', 'task.editCost'],
    isTrial: false,
    createdAt: '2023-05-15T00:00:00Z'
  }
};

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(!supabaseReady);

  const fetchSupabaseProfile = useCallback(async (uid: string) => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
      if (data) {
        if (data.status === 'Suspended') {
          alert("Account suspended.");
          await supabase.auth.signOut();
        } else {
          setUser({
            id: data.id,
            name: data.name,
            email: data.email,
            role: data.role as any,
            status: data.status as any,
            isTrial: false,
            createdAt: data.created_at,
            permissions: data.permissions || []
          });
        }
      }
    } catch (e) {
      console.error("Profile fetch error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (supabaseReady && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) fetchSupabaseProfile(session.user.id);
        else setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) fetchSupabaseProfile(session.user.id);
        else {
          setUser(null);
          setLoading(false);
        }
      });
      return () => subscription.unsubscribe();
    } else {
      const stored = localStorage.getItem('nexus_mock_session');
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch (e) {
          localStorage.removeItem('nexus_mock_session');
        }
      }
      setLoading(false);
    }
  }, [fetchSupabaseProfile]);

  const loginMock = (email: string) => {
    const profile = MOCK_PROFILES[email.toLowerCase()];
    if (profile) {
      localStorage.setItem('nexus_mock_session', JSON.stringify(profile));
      setUser(profile);
      setIsMock(true);
    }
  };

  const signOut = async () => {
    setLoading(true);
    if (supabaseReady && supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('nexus_mock_session');
      setUser(null);
    }
    setLoading(false);
  };

  const isAdmin = user?.role === UserRole.ADMIN;
  const hasPerm = (perm: string) => isAdmin || (user?.permissions || []).includes(perm) || (user?.permissions || []).includes('*');

  const contextValue = useMemo(() => ({
    user, loading, isMock, isAdmin, signOut, hasPerm, loginMock
  }), [user, loading, isMock, isAdmin, signOut]);

  // Always wrap the entire component output in the Provider to prevent useAuth() errors
  return (
    <AuthContext.Provider value={contextValue}>
      {!supabaseReady && !user && !loading && !isMock ? (
        <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-10 text-center">
          <div className="w-20 h-1 bg-rose-500 rounded-full mb-10"></div>
          <h2 className="text-3xl font-serif font-bold text-white mb-4 italic">Environment Configuration Warning</h2>
          <p className="text-slate-400 max-w-md text-sm leading-relaxed uppercase tracking-widest font-black opacity-60">
            Supabase connection details not found. System is waiting for backend keys.
          </p>
          <button 
            onClick={() => setIsMock(true)} 
            className="mt-10 px-8 py-4 bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl hover:bg-amber-400 transition-all shadow-lg"
          >
            Enter Operations Preview Mode
          </button>
        </div>
      ) : loading ? (
        <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[10000]">
          <div className="w-16 h-1 bg-amber-500 animate-pulse rounded-full mb-6"></div>
          <div className="text-amber-500 text-[10px] font-black uppercase tracking-[0.5em] animate-pulse">Initializing Control Portal</div>
        </div>
      ) : !user ? (
        <Login isMockMode={isMock} />
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
