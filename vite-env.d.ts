/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;

  // 如果你前端确实要用 API key，请用 VITE_ 前缀
  readonly VITE_API_KEY?: string;
}
