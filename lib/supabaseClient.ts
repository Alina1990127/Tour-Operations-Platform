import { createClient } from '@supabase/supabase-js';

/**
 * Safely retrieves environment variables from Vite's import.meta.env
 * and (optionally) falls back to process.env (guarded).
 *
 * Note: In a Vite front-end project, you normally only need import.meta.env.
 * Keeping the fallback is harmless and helps compatibility in edge cases.
 */
const getSafeEnv = (key: string): string => {
  // Vite style: import.meta.env
  try {
    const env = (import.meta as any)?.env as Record<string, unknown> | undefined;
    if (env && env[key] != null) return String(env[key]);
  } catch {
    // ignore
  }

  // Fallback: process.env (guarded)
  try {
    const penv = (globalThis as any)?.process?.env as Record<string, unknown> | undefined;
    if (penv && penv[key] != null) return String(penv[key]);
  } catch {
    // ignore
  }

  return '';
};

const supabaseUrl = getSafeEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getSafeEnv('VITE_SUPABASE_ANON_KEY');

/**
 * Exposed flag used by AuthGate/Login/App to decide whether Supabase is usable.
 */
export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Supabase client (null if env missing)
 */
export const supabase = supabaseReady
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!supabaseReady) {
  console.warn(
    'DMC NEXUS: Supabase environment variables missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel Environment Variables.'
  );
}
