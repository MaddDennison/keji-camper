import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client singleton. Built from the publishable anon key only —
 * RLS is the security boundary (docs/M3-REVIEW.md). When env is unset the
 * client is null and the whole app stays local-only.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

export const SITE_URL = 'https://kejicamper.ca';
