
import { createClient } from '@supabase/supabase-js';

// Fix: Use process.env instead of import.meta.env for environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing from .env");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
