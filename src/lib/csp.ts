/**
 * Content-Security-Policy for the built app.
 *
 * GitHub Pages serves static files and cannot set response headers, so the
 * policy ships as a `<meta http-equiv>` injected into index.html at build
 * time (see the `csp()` plugin in vite.config.ts). Two consequences of the
 * meta form worth knowing:
 *
 * - `frame-ancestors` is ignored in meta (header-only), so clickjacking
 *   protection isn't available on this host. Nothing here is worth framing —
 *   the app is local-first with no server-side actions — but if it ever moves
 *   to a host with headers, add `frame-ancestors 'none'` there.
 * - The policy is build-only. `vite dev` injects inline scripts for
 *   react-refresh and talks to the HMR websocket; enforcing this in dev would
 *   just mean loosening it until it no longer resembles what ships.
 *
 * Pure (no imports) so it's unit-tested, like `basemaps.ts` / `supabaseUrl.ts`.
 * Keep the source lists below in sync with what the app actually talks to:
 * a missing origin here fails at runtime as a blocked request, not a build
 * error.
 */

/** Tile and WMS image hosts — `MapView` basemaps + `MapPackPage` sheets. */
const IMAGE_HOSTS = [
  'https://maps.geogratis.gc.ca', // Toporama WMS (default basemap, map packs)
  'https://tile.openstreetmap.org', // "Streets" basemap
  'https://server.arcgisonline.com', // "Satellite" basemap
];

/** Hosts reached with fetch/XHR — weather, plus the WMS sheets MapPackPage
 *  pulls as blobs rather than <img> (it needs to detect service errors). */
const CONNECT_HOSTS = [
  'https://api.open-meteo.com',
  'https://archive-api.open-meteo.com',
  'https://maps.geogratis.gc.ca',
];

/**
 * Supabase sources for the project this bundle was built against.
 *
 * When `VITE_SUPABASE_URL` is unset the client is null and the app never
 * makes a Supabase request (see `lib/supabase.ts`) — so the policy names no
 * Supabase origin at all rather than carrying a `*.supabase.co` wildcard that
 * nothing would use. Pass the already-normalized project URL.
 */
function supabaseSources(supabaseUrl: string | undefined | null): string[] {
  if (!supabaseUrl) return [];
  let host: string;
  try {
    host = new URL(supabaseUrl).host;
  } catch {
    return [];
  }
  // wss: for the realtime socket. Nothing subscribes today (auth uses
  // onAuthStateChange, which is local), but supabase-js opens it as soon as
  // anything does, and a blocked socket is a confusing failure.
  return [`https://${host}`, `wss://${host}`];
}

export function buildCsp(supabaseUrl?: string | null): string {
  const supabase = supabaseSources(supabaseUrl);
  return [
    // Deny by default; every directive below is an explicit opening.
    "default-src 'none'",
    // The bundle and the service worker, both same-origin. Vite emits no
    // inline script in the built HTML, so no 'unsafe-inline' is needed.
    "script-src 'self'",
    "worker-src 'self'",
    // 'unsafe-inline' covers React `style={{…}}` props and the inline styles
    // Leaflet writes onto panes and markers. Dropping it would mean routing
    // every dynamic dimension through a stylesheet — not worth it, and style
    // injection is not a meaningful escalation here.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // data: for journal photos (stored as data-URLs in localStorage) and
    // blob: for the rendered share cards and map-pack sheets.
    `img-src 'self' data: blob: ${IMAGE_HOSTS.join(' ')}`,
    `connect-src 'self' ${[...CONNECT_HOSTS, ...supabase].join(' ')}`,
    "manifest-src 'self'",
    // The two auth forms submit through onSubmit handlers; 'self' keeps a
    // fallback navigation on this origin instead of blocking it outright.
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}
