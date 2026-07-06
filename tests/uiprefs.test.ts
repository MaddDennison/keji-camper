import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSectionPrefs, writeSectionPref } from '../src/lib/uiprefs';

const KEY = 'keji-camper/uiprefs/v1';

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe('uiprefs', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).localStorage = fakeStorage();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('round-trips a section preference', () => {
    writeSectionPref('completed', true);
    writeSectionPref('classics', false);
    expect(readSectionPrefs()).toEqual({ completed: true, classics: false });
  });

  it('later writes preserve earlier keys', () => {
    writeSectionPref('planned', false);
    writeSectionPref('dream', true);
    expect(readSectionPrefs()).toEqual({ planned: false, dream: true });
  });

  it('falls back to empty prefs on corrupt JSON', () => {
    (globalThis as Record<string, unknown>).localStorage = fakeStorage({ [KEY]: '{not json' });
    expect(readSectionPrefs()).toEqual({});
  });

  it('ignores non-boolean and unknown keys in the stored record', () => {
    (globalThis as Record<string, unknown>).localStorage = fakeStorage({
      [KEY]: JSON.stringify({ planned: 'yes', completed: true, mystery: false }),
    });
    expect(readSectionPrefs()).toEqual({ completed: true });
  });

  it('falls back to empty prefs when the record is not an object', () => {
    (globalThis as Record<string, unknown>).localStorage = fakeStorage({ [KEY]: JSON.stringify([true]) });
    expect(readSectionPrefs()).toEqual({});
  });

  it('does not throw when localStorage is absent', () => {
    delete (globalThis as Record<string, unknown>).localStorage;
    expect(readSectionPrefs()).toEqual({});
    expect(() => writeSectionPref('planned', true)).not.toThrow();
  });
});
