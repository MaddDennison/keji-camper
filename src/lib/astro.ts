/**
 * Lightweight astronomy for Kejimkujik (44.40° N, 65.22° W).
 * Moon phase via mean synodic month; sun events via the NOAA solar
 * calculation. Good to a few minutes — plenty for planning a campfire.
 */

export const KEJI_LAT = 44.4;
export const KEJI_LNG = -65.22;

const SYNODIC = 29.530588853;
/** A recent new moon: 2000-01-06 18:14 UTC */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14) / 86400000;

export interface MoonInfo {
  age: number; // days since new moon
  phase: number; // 0..1 (0 = new, 0.5 = full)
  illumination: number; // 0..1
  name: string;
  emoji: string;
}

export function moonInfo(date: Date): MoonInfo {
  const days = date.getTime() / 86400000 - NEW_MOON_EPOCH;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const names: [number, string, string][] = [
    [0.0625, 'New moon', '🌑'],
    [0.1875, 'Waxing crescent', '🌒'],
    [0.3125, 'First quarter', '🌓'],
    [0.4375, 'Waxing gibbous', '🌔'],
    [0.5625, 'Full moon', '🌕'],
    [0.6875, 'Waning gibbous', '🌖'],
    [0.8125, 'Last quarter', '🌗'],
    [0.9375, 'Waning crescent', '🌘'],
    [1.01, 'New moon', '🌑'],
  ];
  const [, name, emoji] = names.find(([t]) => phase < t)!;
  return { age, phase, illumination, name, emoji };
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  darkStart: Date | null; // end of astronomical twilight (true dark)
  darkEnd: Date | null;
}

function toJulian(date: Date) {
  return date.getTime() / 86400000 + 2440587.5;
}
function fromJulian(j: number) {
  return new Date((j - 2440587.5) * 86400000);
}

/** NOAA-style sunrise equation for a given altitude of the sun's centre. */
function sunEvent(date: Date, lat: number, lng: number, altitudeDeg: number): { rise: Date | null; set: Date | null } {
  const rad = Math.PI / 180;
  const J2000 = 2451545;
  const d = Math.floor(toJulian(date) - 0.5) + 0.5 - J2000;
  const n = Math.round(d - lng / 360);
  const Jstar = n + lng / 360; // mean solar noon (note: lng west-negative → use -lng/360; chart below handles it)
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const Jtransit = J2000 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const delta = Math.asin(Math.sin(lambda * rad) * Math.sin(23.4397 * rad));
  const cosH =
    (Math.sin(altitudeDeg * rad) - Math.sin(lat * rad) * Math.sin(delta)) /
    (Math.cos(lat * rad) * Math.cos(delta));
  if (cosH < -1 || cosH > 1) return { rise: null, set: null };
  const H = Math.acos(cosH) / rad;
  return {
    rise: fromJulian(Jtransit - H / 360),
    set: fromJulian(Jtransit + H / 360),
  };
}

export function sunTimes(date: Date, lat = KEJI_LAT, lng = KEJI_LNG): SunTimes {
  // standard refraction-corrected sunrise/set: -0.833°, astronomical dark: -18°
  const lngArg = -lng; // equation expects west-positive
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  const sun = sunEvent(dayStart, lat, lngArg, -0.833);
  const dark = sunEvent(dayStart, lat, lngArg, -18);
  return {
    sunrise: sun.rise,
    sunset: sun.set,
    darkStart: dark.set, // evening: sun drops below -18°
    darkEnd: dark.rise,
  };
}

export interface MeteorShower {
  name: string;
  from: [number, number]; // [month 1-12, day]
  to: [number, number];
  peak: [number, number];
  zhr: number;
  note: string;
}

export const METEOR_SHOWERS: MeteorShower[] = [
  { name: 'Quadrantids', from: [12, 28], to: [1, 12], peak: [1, 3], zhr: 110, note: 'Sharp peak of a few hours — bundle up.' },
  { name: 'Lyrids', from: [4, 14], to: [4, 30], peak: [4, 22], zhr: 18, note: 'Spring opener; watch after midnight.' },
  { name: 'Eta Aquariids', from: [4, 19], to: [5, 28], peak: [5, 6], zhr: 50, note: 'Halley’s dust — best in the hour before dawn.' },
  { name: 'Delta Aquariids', from: [7, 12], to: [8, 23], peak: [7, 30], zhr: 25, note: 'Steady southern stream through late July.' },
  { name: 'Perseids', from: [7, 17], to: [8, 24], peak: [8, 12], zhr: 100, note: 'The big summer show — Keji’s sky was made for this.' },
  { name: 'Orionids', from: [10, 2], to: [11, 7], peak: [10, 21], zhr: 20, note: 'Halley again; fast meteors out of Orion.' },
  { name: 'Leonids', from: [11, 6], to: [11, 30], peak: [11, 17], zhr: 15, note: 'Occasional storms; usually a modest stream.' },
  { name: 'Geminids', from: [12, 4], to: [12, 17], peak: [12, 14], zhr: 150, note: 'The strongest of the year — worth the cold.' },
  { name: 'Ursids', from: [12, 17], to: [12, 26], peak: [12, 22], zhr: 10, note: 'Quiet solstice shower from the Little Dipper.' },
];

function inWindow(month: number, day: number, from: [number, number], to: [number, number]) {
  const v = month * 100 + day;
  const a = from[0] * 100 + from[1];
  const b = to[0] * 100 + to[1];
  if (a <= b) return v >= a && v <= b;
  return v >= a || v <= b; // wraps the new year
}

export function activeShowers(date: Date): { shower: MeteorShower; isPeak: boolean }[] {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return METEOR_SHOWERS.filter((s) => inWindow(m, d, s.from, s.to)).map((s) => ({
    shower: s,
    isPeak: Math.abs(s.peak[0] - m) === 0 && Math.abs(s.peak[1] - d) <= 1,
  }));
}

/**
 * 0–100 “worth getting out of the tent” score.
 * Darkness is what matters most at a Dark-Sky Preserve: moon and clouds.
 */
export function stargazingScore(date: Date, cloudCoverPct?: number): { score: number; label: string } {
  const moon = moonInfo(date);
  let score = 100 * (1 - 0.75 * moon.illumination);
  if (cloudCoverPct !== undefined) score *= 1 - Math.min(100, cloudCoverPct) / 100 * 0.9;
  const showers = activeShowers(date);
  if (showers.some((s) => s.isPeak)) score = Math.min(100, score + 12);
  score = Math.round(score);
  const label =
    score >= 75 ? 'Superb — stay up late'
    : score >= 50 ? 'Good — worth a look'
    : score >= 25 ? 'Fair — catch the bright stuff'
    : 'Poor — story night in the tent';
  return { score, label };
}
