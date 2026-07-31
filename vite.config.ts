/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCsp } from './src/lib/csp';
import { normalizeSupabaseUrl } from './src/lib/supabaseUrl';

/**
 * Inject the Content-Security-Policy as a <meta http-equiv> at build time.
 * GitHub Pages can't set response headers, so meta is the only delivery
 * mechanism; see src/lib/csp.ts for what the policy allows and why.
 *
 * Build-only (`apply: 'build'`): the dev server injects inline scripts for
 * react-refresh and needs the HMR websocket, so enforcing this in dev would
 * mean loosening it away from what actually ships. `vite preview` serves the
 * built HTML, so that's where to smoke-test it.
 *
 * The Supabase origin comes from the same env var the client reads, through
 * the same normalizer — a project URL pasted with a trailing /rest/v1 would
 * otherwise yield a CSP source that doesn't match the requests supabase-js
 * makes.
 */
function csp(): Plugin {
  return {
    name: 'keji-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const policy = buildCsp(normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL));
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

// base './' so the build works from any static host (GitHub Pages subpath included)
export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
