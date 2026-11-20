import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://rvcwuavtufabscutmwua.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2Y3d1YXZ0dWZhYnNjdXRtd3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NTM1MzgsImV4cCI6MjA4NTUyOTUzOH0.4lGc67f122ZMZ0b7FXCO6mLlIJveG82ADxB6JzSiV7E';

function sanitizeUrl(raw?: string): string {
  if (!raw) return DEFAULT_SUPABASE_URL;
  const cleaned = raw.trim().replace(/^[\[\("']+/, '').replace(/[\]\)"']+$/, '');
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    // Gunakan fallback URL
  }
  return DEFAULT_SUPABASE_URL;
}

const envObj =
  typeof import.meta !== 'undefined'
    ? (import.meta as { env?: Record<string, string> }).env
    : undefined;

const supabaseUrl = sanitizeUrl(envObj?.VITE_SUPABASE_URL);
const supabaseAnonKey =
  (envObj?.VITE_SUPABASE_ANON_KEY || '').trim() || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
