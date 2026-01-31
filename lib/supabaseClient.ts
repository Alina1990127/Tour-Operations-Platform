
import { createClient } from '@supabase/supabase-js';

/**
 * Safely retrieves environment variables from Vite's import.meta.env 
 * or falls back to process.env for broader compatibility.
 */
const getSafeEnv = (key: string): string => {
  try {
    // Vite style
    if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env[key] !== 'undefined') {
      return import.meta.env[key] as string;
    }
  } catch (e) {}

  try {
    // Traditional process.env style
    if (typeof process !== 'undefined' && process.env && typeof process.env[key] !== 'undefined') {
      return process.env[key] as string;
    }
  } catch (e) {}

  return "";
};

const supabaseUrl = getSafeEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getSafeEnv('VITE_SUPABASE_ANON_KEY');

export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey);

// Exporting as a safe constant that won't kill the app if variables are missing
export const supabase = supabaseReady 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (!supabaseReady) {
  console.warn("DMC NEXUS: Supabase environment variables missing. Environment check failed.");
}
v
