/**
 * Per-device UI preferences. Pure presentation state — deliberately kept out of
 * the synced AppData so it never bumps the schema or generates sync ops, and a
 * phone and a laptop can reasonably disagree about what's collapsed.
 */

const KEY = 'keji-camper/uiprefs/v1';

export type SectionKey = 'planned' | 'dream' | 'completed' | 'classics';
export type SectionPrefs = Partial<Record<SectionKey, boolean>>;

const SECTION_KEYS: SectionKey[] = ['planned', 'dream', 'completed', 'classics'];

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Stored open/closed choices. Missing keys mean "use the section's default". */
export function readSectionPrefs(): SectionPrefs {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SectionPrefs = {};
    for (const k of SECTION_KEYS) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSectionPref(key: SectionKey, open: boolean): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify({ ...readSectionPrefs(), [key]: open }));
  } catch {
    // quota/private-browsing failures lose a toggle preference, nothing more
  }
}
