
import React, { useState } from 'react';
import { supabase, supabaseReady } from '../../lib/supabaseClient';
import { useAuth } from './AuthGate';

interface LoginProps {
  isMockMode?: boolean;
}

export const Login: React.FC<LoginProps> = ({ isMockMode = false }) => {
  const { loginMock } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    if (supabaseReady && supabase && !isMockMode) {
      try {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      } catch (err: any) {
        setError(err.message || 'Authentication failed');
        setLoading(false);
      }
    } else {
      // Mock Login logic
      setTimeout(() => {
        if (password === 'password123') {
          loginMock(email);
        } else {
          setError('Invalid credentials. (Hint: password123)');
          setLoading(false);
        }
      }, 800);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 p-6">
      <div className="bg-white w-full max-w-md rounded-[3.5rem] shadow-2xl overflow-hidden animate-slideUp">
        <div className="bg-slate-900 p-16 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/20"></div>
          {isMockMode && (
            <div className="absolute top-4 right-4 bg-amber-500 text-slate-950 text-[8px] font-black px-3 py-1 rounded-full tracking-widest uppercase">
              Mock Preview
            </div>
          )}
          <div className="w-16 h-1 bg-amber-500 mx-auto mb-8 rounded-full"></div>
          <h1 className="text-4xl font-serif font-bold text-amber-500 tracking-widest leading-none">DMC NEXUS</h1>
          <p className="text-[10px] text-slate-500 mt-5 uppercase font-black tracking-[0.4em]">Operations Control Portal</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-14 space-y-10">
          {error && (
            <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl text-rose-600 text-[10px] font-black uppercase tracking-wider animate-fadeIn">
              {error}
            </div>
          )}
          
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Email Identity</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all placeholder:text-slate-300" 
              placeholder="admin@dmcnexus.com"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Security Key</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all placeholder:text-slate-300" 
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-6 bg-slate-900 text-amber-500 font-black rounded-[2.5rem] shadow-xl hover:bg-slate-800 transition-all uppercase tracking-[0.3em] disabled:opacity-50 active:scale-95"
          >
            {loading ? 'Validating...' : 'Access Portal'}
          </button>

          <p className="text-center text-[9px] text-slate-300 font-bold uppercase tracking-widest leading-relaxed">
            Protected Gulf Tour Operations System<br/>
            {isMockMode && <span className="opacity-60 text-[8px] mt-1 block tracking-normal italic">Preview Mode: Use password123</span>}
          </p>
        </form>
      </div>
    </div>
  );
};
