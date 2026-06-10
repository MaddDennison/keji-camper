import { KEJI_LAT, KEJI_LNG } from './astro';

/**
 * Weather via Open-Meteo (open-meteo.com) — free, keyless, CORS-friendly.
 *  - dates within the forecast horizon (≈16 days ahead): forecast API
 *  - past dates: historical archive API (real observed reanalysis)
 *  - far-future dates: same dates one year earlier, labelled as a climate hint
 */

export interface DayWeather {
  date: string; // yyyy-mm-dd
  tMax: number | null;
  tMin: number | null;
  precip: number | null; // mm
  windMax: number | null; // km/h
  gustMax: number | null; // km/h
  cloudEvening: number | null; // % mean cloud cover 21:00–24:00 (stargazing!)
  code: number | null; // WMO weather code
}

export type WeatherSource = 'forecast' | 'archive' | 'climate-hint';

export interface WeatherResult {
  source: WeatherSource;
  days: DayWeather[];
}

const WMO: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Thunderstorm + hail',
};

export function describeCode(code: number | null): string {
  if (code === null) return '—';
  return WMO[code] ?? `code ${code}`;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateIso: string, n: number): string {
  const d = new Date(dateIso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

async function fetchRange(
  base: string,
  startIso: string,
  endIso: string,
  lat: number,
  lng: number,
): Promise<DayWeather[]> {
  const url =
    `${base}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startIso}&end_date=${endIso}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max` +
    `&hourly=cloud_cover&timezone=America%2FHalifax`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const j = await res.json();
  const days: DayWeather[] = [];
  const d = j.daily ?? {};
  const hours: string[] = j.hourly?.time ?? [];
  const cloud: (number | null)[] = j.hourly?.cloud_cover ?? [];
  for (let i = 0; i < (d.time?.length ?? 0); i++) {
    const date = d.time[i];
    // mean cloud cover for the stargazing window 21:00–23:00 local
    const idx = hours
      .map((t, k) => ({ t, k }))
      .filter(({ t }) => t.startsWith(date) && ['21', '22', '23'].includes(t.slice(11, 13)));
    const vals = idx.map(({ k }) => cloud[k]).filter((v): v is number => v != null);
    days.push({
      date,
      tMax: d.temperature_2m_max?.[i] ?? null,
      tMin: d.temperature_2m_min?.[i] ?? null,
      precip: d.precipitation_sum?.[i] ?? null,
      windMax: d.wind_speed_10m_max?.[i] ?? null,
      gustMax: d.wind_gusts_10m_max?.[i] ?? null,
      cloudEvening: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
      code: d.weather_code?.[i] ?? null,
    });
  }
  return days;
}

export async function tripWeather(
  startIso: string,
  nights: number,
  lat = KEJI_LAT,
  lng = KEJI_LNG,
): Promise<WeatherResult> {
  const endIso = addDays(startIso, Math.max(0, nights - 1));
  const today = iso(new Date());
  const horizon = addDays(today, 15);

  if (endIso < today) {
    // fully in the past → archive (archive lags a few days; clamp)
    return { source: 'archive', days: await fetchRange('https://archive-api.open-meteo.com/v1/archive', startIso, endIso, lat, lng) };
  }
  if (startIso <= horizon) {
    const days = await fetchRange('https://api.open-meteo.com/v1/forecast', today > startIso ? today : startIso, endIso < horizon ? endIso : horizon, lat, lng);
    return { source: 'forecast', days };
  }
  // far future → same dates last year as a hint
  const lastYearStart = addDays(startIso, -365);
  const lastYearEnd = addDays(endIso, -365);
  const days = await fetchRange('https://archive-api.open-meteo.com/v1/archive', lastYearStart, lastYearEnd, lat, lng);
  return { source: 'climate-hint', days: days.map((dd) => ({ ...dd, date: addDays(dd.date, 365) })) };
}

/** Big-lake wind heuristics for canoes. */
export function windWarning(day: DayWeather): string | null {
  const g = day.gustMax ?? 0;
  const w = day.windMax ?? 0;
  if (g >= 50 || w >= 35) return 'Strong wind — big lakes (Keji, Peskowesk, Peskawa) likely dangerous for open canoes.';
  if (g >= 35 || w >= 25) return 'Breezy — expect whitecaps on open crossings; hug the shore, cross early.';
  return null;
}
