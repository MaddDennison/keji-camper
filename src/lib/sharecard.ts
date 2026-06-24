import { placeById } from '../data/sites';
import { moonInfo } from './astro';
import { fmtDate } from './format';
import { GEO } from './mapdata';
import { planLeg } from './legplan';
import { legGeometry } from './routegeo';
import { fmtHours, legHours } from './routing';
import { addDaysIso } from './format';
import type { Memory, Trip } from '../types';

/**
 * Share-card rendering (v0.2 / F6). Everything is drawn from our own vector
 * data on a canvas — no map tiles, so no CORS or licensing issues, and the
 * result looks designed rather than screenshotted.
 */

const C = {
  parchment: '#f4ecd8', card: '#faf4e4', ink: '#2e2a22', inkSoft: '#5c5546',
  pine: '#2f5d46', pineDeep: '#1d3d2f', rust: '#c2562b', rustDeep: '#9c4220',
  gold: '#d9a13b', water: '#7ba6a0', waterDeep: '#3f6f6a',
};

async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load('900 60px Bitter'),
      document.fonts.load('700 34px "Work Sans"'),
      document.fonts.load('600 26px "Work Sans"'),
    ]);
  } catch {
    /* system fallbacks are fine */
  }
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = 'rgba(46,42,34,0.05)';
  for (let i = 0; i < 1400; i++) {
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, rnd() * 1.6 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function header(ctx: CanvasRenderingContext2D, w: number) {
  ctx.fillStyle = C.pineDeep;
  ctx.fillRect(0, 0, w, 150);
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, 150, w, 6);
  // crest
  ctx.save();
  ctx.translate(86, 75);
  ctx.fillStyle = C.pineDeep; ctx.strokeStyle = C.parchment; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = C.pine; ctx.strokeStyle = C.parchment; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-22, 12); ctx.lineTo(-12, -12); ctx.lineTo(-2, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, 12); ctx.lineTo(12, -12); ctx.lineTo(22, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.rust;
  ctx.beginPath(); ctx.moveTo(-28, 22); ctx.quadraticCurveTo(0, 34, 28, 22);
  ctx.quadraticCurveTo(14, 33, 0, 33); ctx.quadraticCurveTo(-14, 33, -28, 22); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.gold;
  ctx.beginPath(); ctx.arc(0, -28, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = C.parchment;
  ctx.font = '900 52px Bitter, serif';
  ctx.fillText('Keji Camper', 156, 88);
  ctx.fillStyle = C.gold;
  ctx.font = '600 20px "Work Sans", sans-serif';
  ctx.fillText('B A C K C O U N T R Y   P A S S P O R T   ·   K E J I M K U J I K', 158, 120);
}

function footer(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = C.inkSoft;
  ctx.font = '600 20px "Work Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('unofficial fan project — not Parks Canada · distances: Friends of Keji charts', w / 2, h - 28);
  ctx.textAlign = 'left';
}

interface Bounds { minLat: number; maxLat: number; minLng: number; maxLng: number }

function project(b: Bounds, px: { x: number; y: number; w: number; h: number }) {
  const kx = Math.cos(((b.minLat + b.maxLat) / 2) * Math.PI / 180);
  const spanLat = Math.max(1e-4, b.maxLat - b.minLat);
  const spanLng = Math.max(1e-4, (b.maxLng - b.minLng) * kx);
  const scale = Math.min(px.w / spanLng, px.h / spanLat) * 0.92;
  const cx = px.x + px.w / 2;
  const cy = px.y + px.h / 2;
  const mLat = (b.minLat + b.maxLat) / 2;
  const mLng = (b.minLng + b.maxLng) / 2;
  return (lat: number, lng: number): [number, number] => [
    cx + (lng - mLng) * kx * scale,
    cy - (lat - mLat) * scale,
  ];
}

function drawMiniMap(ctx: CanvasRenderingContext2D, trip: Trip, x: number, y: number, w: number, h: number) {
  // panel
  ctx.fillStyle = '#e9efe3';
  ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
  roundRect(ctx, x, y, w, h, 18); ctx.fill(); ctx.stroke();
  ctx.save();
  roundRect(ctx, x, y, w, h, 18); ctx.clip();

  const legs = legsOf(trip);
  const pts: [number, number][] = legs.flatMap((l) => l.segs.flatMap((s) => s.points));
  const stopPts = trip.stops.filter(Boolean).map((id) => placeById.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof placeById.get>>[];
  for (const p of stopPts) pts.push([p.lat, p.lng]);
  if (pts.length < 2) { ctx.restore(); return; }
  const b: Bounds = {
    minLat: Math.min(...pts.map((p) => p[0])), maxLat: Math.max(...pts.map((p) => p[0])),
    minLng: Math.min(...pts.map((p) => p[1])), maxLng: Math.max(...pts.map((p) => p[1])),
  };
  const pr = project(b, { x: x + 30, y: y + 30, w: w - 60, h: h - 60 });

  // park boundary for context
  ctx.strokeStyle = 'rgba(29,61,47,0.45)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  for (const ring of GEO.boundary) {
    ctx.beginPath();
    ring.forEach(([lat, lng], i) => {
      const [px, py] = pr(lat, lng);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // legs
  for (const leg of legs) {
    ctx.strokeStyle = leg.mode === 'paddle' ? C.waterDeep : C.rust;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const seg of leg.segs) {
      ctx.setLineDash(seg.schematic ? [4, 14] : leg.mode === 'hike' ? [16, 12] : []);
      ctx.beginPath();
      seg.points.forEach(([lat, lng], i) => {
        const [px, py] = pr(lat, lng);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // stops
  trip.stops.filter(Boolean).forEach((id, i) => {
    const p = placeById.get(id);
    if (!p) return;
    const [px, py] = pr(p.lat, p.lng);
    ctx.fillStyle = i === 0 || i === trip.stops.length - 1 ? C.rust : C.pine;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 17px "Work Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.label.slice(0, 2), px, py + 1);
  });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function legsOf(trip: Trip) {
  const legs: { mode: 'paddle' | 'hike'; segs: ReturnType<typeof legGeometry>; km: number; exact: boolean }[] = [];
  for (let i = 0; i < trip.stops.length - 1; i++) {
    if (!trip.stops[i] || !trip.stops[i + 1]) continue;
    const mode = trip.modes[i] ?? 'paddle';
    const plan = planLeg(mode, trip.stops[i], trip.stops[i + 1], trip.legRoutes?.[i] ?? 0);
    legs.push({
      mode,
      segs: plan?.segments ?? legGeometry(mode, [trip.stops[i], trip.stops[i + 1]]),
      km: plan?.km ?? 0,
      exact: plan?.exact ?? false,
    });
  }
  return legs;
}

export async function renderTripCard(trip: Trip, paddleKmh = 4, hikeKmh = 3.5, partyEmojis: string[] = []): Promise<Blob> {
  await ensureFonts();
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = C.parchment;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H);
  header(ctx, W);

  // title
  ctx.fillStyle = C.ink;
  ctx.font = '900 58px Bitter, serif';
  wrapText(ctx, trip.name || 'A Keji backcountry trip', 60, 240, W - 120, 62, 2);
  const nights = Math.max(0, trip.stops.length - 2);
  ctx.fillStyle = C.inkSoft;
  ctx.font = '600 30px "Work Sans", sans-serif';
  const dateStr = trip.startDate ? fmtDate(trip.startDate) : 'someday';
  ctx.fillText(`${dateStr} · ${nights} night${nights === 1 ? '' : 's'}${partyEmojis.length ? ' · ' + partyEmojis.join(' ') : ''}`, 60, 330);

  drawMiniMap(ctx, trip, 60, 370, W - 120, 560);

  // stats band
  const legs = legsOf(trip);
  const totalKm = legs.reduce((a, l) => a + l.km, 0);
  const totalH = legs.reduce((a, l) => a + legHours(l.km, l.mode, l.mode === 'paddle' ? paddleKmh : hikeKmh), 0);
  const paddleKm = legs.filter((l) => l.mode === 'paddle').reduce((a, l) => a + l.km, 0);
  const hikeKm = totalKm - paddleKm;

  ctx.fillStyle = C.card;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
  roundRect(ctx, 60, 965, W - 120, 150, 18); ctx.fill(); ctx.stroke();
  const stats: [string, string][] = [
    [`${totalKm.toFixed(totalKm < 10 ? 1 : 0)} km`, 'total'],
    [`~${fmtHours(totalH)}`, 'travel'],
    [paddleKm > 0 ? `${paddleKm.toFixed(0)} km` : '—', '🛶 paddle'],
    [hikeKm > 0 ? `${hikeKm.toFixed(0)} km` : '—', '🥾 hike'],
  ];
  stats.forEach(([big, small], i) => {
    const cx = 60 + ((W - 120) / 4) * (i + 0.5);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.rustDeep;
    ctx.font = '900 44px Bitter, serif';
    ctx.fillText(big, cx, 1030);
    ctx.fillStyle = C.inkSoft;
    ctx.font = '600 24px "Work Sans", sans-serif';
    ctx.fillText(small, cx, 1075);
  });
  ctx.textAlign = 'left';

  // nights strip: moon per night
  if (trip.startDate && nights > 0) {
    ctx.font = '600 26px "Work Sans", sans-serif';
    ctx.fillStyle = C.ink;
    let xx = 60;
    for (let n = 0; n < Math.min(nights, 5); n++) {
      const dateIso = addDaysIso(trip.startDate, n);
      const moon = moonInfo(new Date(dateIso + 'T22:00:00'));
      const stop = placeById.get(trip.stops[n + 1] ?? '');
      ctx.font = '46px serif';
      ctx.fillText(moon.emoji, xx, 1195);
      ctx.font = '600 22px "Work Sans", sans-serif';
      ctx.fillStyle = C.inkSoft;
      ctx.fillText(`N${n + 1} · ${stop ? stop.label : '?'}`, xx + 58, 1172);
      ctx.fillText(`${Math.round(moon.illumination * 100)}% moon`, xx + 58, 1198);
      ctx.fillStyle = C.ink;
      xx += 200;
    }
  }

  footer(ctx, W, H);
  return canvasBlob(canvas);
}

export async function renderMemoryCard(memory: Memory): Promise<Blob> {
  await ensureFonts();
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const place = placeById.get(memory.placeId);

  ctx.fillStyle = C.parchment;
  ctx.fillRect(0, 0, W, H);

  if (memory.photos[0]) {
    try {
      const img = await loadImage(memory.photos[0]);
      const s = Math.max(W / img.width, H / img.height);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
      g.addColorStop(0, 'rgba(244,236,216,0)');
      g.addColorStop(1, 'rgba(244,236,216,0.97)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } catch { /* keep parchment */ }
  } else {
    grain(ctx, W, H);
  }
  header(ctx, W);

  // stamp (simplified canvas version)
  if (place) {
    ctx.save();
    ctx.translate(W - 170, 320);
    ctx.rotate(-0.1);
    ctx.strokeStyle = C.rustDeep; ctx.fillStyle = C.rustDeep;
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 105, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '900 64px Bitter, serif';
    ctx.fillText(place.label, 0, 14);
    ctx.font = '700 18px "Work Sans", sans-serif';
    ctx.fillText(place.lake.split('/')[0].trim().toUpperCase().slice(0, 22), 0, 52);
    ctx.fillText(`EST’D ${memory.date.slice(0, 4)}`, 0, -42);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = C.ink;
  ctx.font = '900 54px Bitter, serif';
  wrapText(ctx, memory.title || place?.name || 'A night out there', 60, 700, W - 120, 60, 2);
  ctx.fillStyle = C.inkSoft;
  ctx.font = '600 28px "Work Sans", sans-serif';
  ctx.fillText(`${fmtDate(memory.date)}${place ? ' · ' + place.name : ''}`, 60, 760);
  ctx.fillStyle = C.rust;
  ctx.font = '40px serif';
  ctx.fillText('🛶'.repeat(Math.max(1, Math.min(5, memory.rating))), 60, 818);
  ctx.fillStyle = C.ink;
  ctx.font = '400 30px "Work Sans", sans-serif';
  wrapText(ctx, memory.text, 60, 880, W - 120, 42, 3, true);

  footer(ctx, W, H);
  return canvasBlob(canvas);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number, ellipsis = false) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines++;
      if (lines >= maxLines) {
        ctx.fillText(ellipsis ? line.replace(/\s+\S*$/, '') + '…' : line, x, y);
        return;
      }
      ctx.fillText(line, x, y);
      y += lineH;
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'),
  );
}

/** Web Share API with file when available; otherwise download. */
export async function shareBlob(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch {
      /* user cancelled — fall through to download */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
