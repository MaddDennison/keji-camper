import { describe, expect, it } from 'vitest';
import { normalizeSupabaseUrl } from '../src/lib/supabaseUrl';

const PROJECT = 'https://tpmeokrahngjrakwnjio.supabase.co';

describe('normalizeSupabaseUrl', () => {
  it('passes a bare project URL through unchanged', () => {
    expect(normalizeSupabaseUrl(PROJECT)).toBe(PROJECT);
  });

  it('strips a pasted REST endpoint (the bug that 404d every auth call)', () => {
    expect(normalizeSupabaseUrl(`${PROJECT}/rest/v1`)).toBe(PROJECT);
    expect(normalizeSupabaseUrl(`${PROJECT}/rest/v1/`)).toBe(PROJECT);
  });

  it('strips other service paths and trailing slashes', () => {
    expect(normalizeSupabaseUrl(`${PROJECT}/auth/v1`)).toBe(PROJECT);
    expect(normalizeSupabaseUrl(`${PROJECT}/storage/v1`)).toBe(PROJECT);
    expect(normalizeSupabaseUrl(`${PROJECT}/`)).toBe(PROJECT);
    expect(normalizeSupabaseUrl(`  ${PROJECT}//  `)).toBe(PROJECT);
  });

  it('leaves a legitimate non-service path alone', () => {
    // self-hosted under a sub-path: only the known service suffixes are stripped
    expect(normalizeSupabaseUrl('https://db.example.com/supabase')).toBe('https://db.example.com/supabase');
  });

  it('returns undefined for empty/unset input', () => {
    expect(normalizeSupabaseUrl(undefined)).toBeUndefined();
    expect(normalizeSupabaseUrl(null)).toBeUndefined();
    expect(normalizeSupabaseUrl('   ')).toBeUndefined();
  });
});
