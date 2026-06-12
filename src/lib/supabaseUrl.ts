/**
 * Normalize VITE_SUPABASE_URL to the bare project origin.
 *
 * A very common setup slip is pasting the dashboard's REST endpoint
 * (`https://<ref>.supabase.co/rest/v1`) — or leaving a trailing slash — into
 * the env var instead of the bare Project URL. supabase-js then appends its own
 * service paths and builds `…/rest/v1/auth/v1/otp`, so every auth call 404s with
 * "invalid path specified in request URL". Strip a trailing service segment and
 * any trailing slashes so either the project URL or a service URL works.
 *
 * Pure (no imports) so it's unit-tested.
 */
export function normalizeSupabaseUrl(u: string | undefined | null): string | undefined {
  if (!u) return undefined;
  const trimmed = u.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  // Drop a trailing supabase service path if one was pasted in by mistake.
  return trimmed.replace(/\/(rest|auth|realtime|storage|functions)\/v1$/i, '');
}
