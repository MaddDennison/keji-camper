import type { Trip } from '../types';
import { uid } from './format';

/**
 * Share links (v0.2 / F6): the whole trip rides inside the URL fragment —
 * no server, no account. deflate-raw + base64url keeps even a 6-stop trip
 * well under browsers' practical URL limits; if CompressionStream is missing
 * (old browsers) we fall back to plain base64url JSON, prefixed differently.
 */

interface WireTrip {
  v: 1;
  n: string; // name
  d: string; // startDate
  s: string[]; // stops
  m: string[]; // modes ('p' | 'h')
  r?: number[]; // legRoutes (chosen portage routing per leg); omitted when all default
  t?: string; // notes (trimmed)
}

function toWire(trip: Trip): WireTrip {
  return {
    v: 1,
    n: trip.name,
    d: trip.startDate,
    s: trip.stops,
    m: trip.modes.map((m) => (m === 'paddle' ? 'p' : 'h')),
    r: trip.legRoutes?.some((x) => x) ? trip.legRoutes : undefined,
    t: trip.notes ? trip.notes.slice(0, 280) : undefined,
  };
}

function fromWire(w: WireTrip): Trip {
  return {
    id: uid(),
    name: w.n ?? '',
    startDate: w.d ?? '',
    stops: w.s ?? [],
    modes: (w.m ?? []).map((m) => (m === 'h' ? 'hike' : 'paddle')),
    modesLocked: (w.m ?? []).map(() => true),
    legRoutes: w.r,
    partyIds: [],
    notes: w.t ?? '',
    status: 'planned',
  };
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as any));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeTripPayload(trip: Trip): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toWire(trip)));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + b64urlEncode(await pipe(json, new CompressionStream('deflate-raw')));
  }
  return 'j' + b64urlEncode(json);
}

export async function encodeTripLink(trip: Trip): Promise<string> {
  const base = window.location.href.split('#')[0];
  return `${base}#/view/${await encodeTripPayload(trip)}`;
}

export async function decodeTripLink(payload: string): Promise<Trip> {
  const kind = payload[0];
  const bytes = b64urlDecode(payload.slice(1));
  let json: Uint8Array;
  if (kind === 'z') {
    json = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind === 'j') {
    json = bytes;
  } else {
    throw new Error('Unknown share-link format');
  }
  const wire = JSON.parse(new TextDecoder().decode(json));
  if (wire.v !== 1 || !Array.isArray(wire.s)) throw new Error('Not a Keji Camper trip link');
  return fromWire(wire);
}
