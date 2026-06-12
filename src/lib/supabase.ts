import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from './supabaseUrl';

/**
 * Supabase client singleton. Built from the publishable anon key only —
 * RLS is the security boundary (docs/M3-REVIEW.md). When env is unset the
 * client is null and the whole app stays local-only.
 *
 * The URL is normalized to the bare project origin: pasting the dashboard's
 * REST endpoint (…supabase.co/rest/v1) into VITE_SUPABASE_URL otherwise makes
 * supabase-js build …/rest/v1/auth/v1/otp and every auth call 404s.
 */

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

export const SITE_URL = 'https://kejicamper.ca';
