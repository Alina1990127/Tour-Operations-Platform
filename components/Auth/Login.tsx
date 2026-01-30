
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
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-slideUp">
        <div className="bg-slate-900 p-12 text-center">
          <h1 className="text-4xl font-serif font-bold text-amber-500 tracking-wider leading-none">DMC NEXUS</h1>
          <p className="text-[10px] text-slate-500 mt-4 uppercase font-black tracking-[0.3em]">Management Portal</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-12 space-y-8">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold animate-fadeIn">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all" 
              placeholder="admin@dmcnexus.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition-all" 
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-5 bg-slate-900 text-amber-500 font-black rounded-3xl shadow-xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em] disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
