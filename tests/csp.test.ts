import { describe, expect, it } from 'vitest';
import mapViewSrc from '../src/components/MapView.tsx?raw';
import weatherSrc from '../src/lib/weather.ts?raw';
import { TOPORAMA_WMS } from '../src/lib/basemaps';
import { buildCsp } from '../src/lib/csp';
import { WMS_BASE } from '../src/lib/mappack';

/** Every distinct https origin appearing in a module's source. */
function origins(src: string): string[] {
  const found = [...src.matchAll(/https:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]);
  return [...new Set(found)];
}

function directive(policy: string, name: string): string {
  const found = policy.split('; ').find((d) => d.startsWith(`${name} `) || d === name);
  expect(found, `policy is missing ${name}`).toBeDefined();
  return found!;
}

describe('content security policy', () => {
  it('denies by default and opens only what the app uses', () => {
    const csp = buildCsp(undefined);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('keeps script execution same-origin only', () => {
    const script = directive(buildCsp(undefined), 'script-src');
    expect(script).toBe("script-src 'self'");
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
  });

  it('names the Supabase project it was built against, https and wss', () => {
    const connect = directive(buildCsp('https://abcdef.supabase.co'), 'connect-src');
    expect(connect).toContain('https://abcdef.supabase.co');
    expect(connect).toContain('wss://abcdef.supabase.co');
  });

  it('names no Supabase origin when the project URL is unset — the client is null and never calls out', () => {
    expect(buildCsp(undefined)).not.toContain('supabase');
    expect(buildCsp('')).not.toContain('supabase');
    expect(buildCsp('not a url')).not.toContain('supabase');
  });

  // Drift guards: a new tile host or API added to the app without a matching
  // CSP source fails here, rather than as a blocked request in someone's
  // browser three deploys later.
  it('covers every basemap and map-pack image host', () => {
    const img = directive(buildCsp(undefined), 'img-src');
    for (const origin of origins(mapViewSrc)) expect(img, mapViewSrc).toContain(origin);
    expect(img).toContain(new URL(TOPORAMA_WMS.url).origin);
    expect(img).toContain(new URL(WMS_BASE).origin);
    // Journal photos are data-URLs; share cards and map sheets are blobs.
    expect(img).toContain('data:');
    expect(img).toContain('blob:');
  });

  it('covers every host the weather and map-pack code fetches', () => {
    const connect = directive(buildCsp(undefined), 'connect-src');
    for (const origin of origins(weatherSrc)) expect(connect).toContain(origin);
    expect(connect).toContain(new URL(WMS_BASE).origin);
  });
});
