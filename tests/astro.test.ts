import { describe, expect, it } from 'vitest';
import { activeShowers, moonInfo, stargazingScore, sunTimes } from '../src/lib/astro';

describe('moonInfo', () => {
  it('finds the full moon of 2024-06-22 (illumination ≈ 1)', () => {
    const m = moonInfo(new Date('2024-06-22T01:00:00Z'));
    expect(m.illumination).toBeGreaterThan(0.97);
  });

  it('finds the new moon of 2024-07-05 (illumination ≈ 0)', () => {
    const m = moonInfo(new Date('2024-07-05T23:00:00Z'));
    expect(m.illumination).toBeLessThan(0.03);
    expect(m.name).toBe('New moon');
  });
});

describe('sunTimes', () => {
  it('Keji summer solstice: sunset around 21:00 UTC-3 (≈ 00:00 UTC next day)', () => {
    const t = sunTimes(new Date('2024-06-21T12:00:00Z'));
    expect(t.sunset).not.toBeNull();
    const utcHour = t.sunset!.getUTCHours();
    // sunset ~20:58 ADT = 23:58 UTC (allow the half-open window 23–01)
    expect([23, 0, 1]).toContain(utcHour);
  });

  it('has a real darkness window in August', () => {
    const t = sunTimes(new Date('2024-08-12T12:00:00Z'));
    expect(t.darkStart).not.toBeNull();
    expect(t.darkEnd).not.toBeNull();
  });
});

describe('meteor showers', () => {
  it('Perseids active on Aug 12', () => {
    const s = activeShowers(new Date('2025-08-12T03:00:00'));
    expect(s.some((x) => x.shower.name === 'Perseids' && x.isPeak)).toBe(true);
  });
  it('Quadrantids window wraps the new year', () => {
    const s = activeShowers(new Date('2025-01-02T03:00:00'));
    expect(s.some((x) => x.shower.name === 'Quadrantids')).toBe(true);
  });
});

describe('stargazingScore', () => {
  it('new moon + clear beats full moon + cloud', () => {
    const good = stargazingScore(new Date('2024-07-05T23:00:00Z'), 5);
    const bad = stargazingScore(new Date('2024-06-22T01:00:00Z'), 90);
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.score).toBeGreaterThan(70);
    expect(bad.score).toBeLessThan(15);
  });
});
