
import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 selection:bg-amber-500/30">
      <div className="bg-white w-full max-w-md rounded-[3.5rem] shadow-2xl overflow-hidden animate-slideUp">
        <div className="bg-slate-900 p-16 text-center">
          <div className="w-16 h-1 bg-amber-500 mx-auto mb-8 rounded-full"></div>
          <h1 className="text-4xl font-serif font-bold text-amber-500 tracking-wider leading-none">DMC NEXUS</h1>
          <p className="text-[10px] text-slate-500 mt-5 uppercase font-black tracking-[0.4em]">Operations Management</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-14 space-y-10">
          {error && (
            <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl text-rose-600 text-xs font-bold animate-fadeIn">
              {error}
            </div>
          )}
          
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Email Address</label>
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
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Password</label>
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
            {loading ? 'Authenticating...' : 'Sign In Portal'}
          </button>

          <p className="text-center text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-4">
            Security Protected Gulf Access
          </p>
        </form>
      </div>
    </div>
  );
};
