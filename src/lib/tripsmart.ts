import { placeById } from '../data/sites';
import { route } from './routing';
import type { TravelMode, Trip } from '../types';

/**
 * Smart travel-mode defaults (v0.2 / F3).
 *
 * For each leg the user has NOT explicitly set (modesLocked[i] !== true):
 *   1. either endpoint hike-only  -> hike
 *   2. else either endpoint paddle-only -> paddle
 *   3. else inherit the previous leg's mode (first leg: paddle — it's a canoe park)
 *   4. if the chosen mode has no chart route but the other one does, switch
 *
 * Returns new modes/modesLocked arrays sized to the legs; never mutates input.
 */

function accessOf(id: string): 'paddle' | 'hike' | 'both' | null {
  const p = placeById.get(id);
  return p ? p.access : null;
}

export function inferLegMode(prev: TravelMode | null, from: string, to: string): TravelMode {
  const a = accessOf(from);
  const b = accessOf(to);
  let mode: TravelMode;
  if (a === 'hike' || b === 'hike') mode = 'hike';
  else if (a === 'paddle' || b === 'paddle') mode = 'paddle';
  else mode = prev ?? 'paddle';
  // validate against the charts; switch if only the other mode is covered
  if (from && to && !route(mode, from, to)) {
    const other: TravelMode = mode === 'paddle' ? 'hike' : 'paddle';
    if (route(other, from, to)) return other;
  }
  return mode;
}

export interface SmartModes {
  modes: TravelMode[];
  modesLocked: boolean[];
}

export function applySmartModes(trip: Pick<Trip, 'stops' | 'modes' | 'modesLocked'>): SmartModes {
  const legCount = Math.max(0, trip.stops.length - 1);
  const modes: TravelMode[] = [];
  const locked: boolean[] = [];
  for (let i = 0; i < legCount; i++) {
    const isLocked = trip.modesLocked?.[i] === true && trip.modes[i] !== undefined;
    if (isLocked) {
      modes.push(trip.modes[i]);
      locked.push(true);
    } else {
      const prev = i > 0 ? modes[i - 1] : null;
      modes.push(inferLegMode(prev, trip.stops[i], trip.stops[i + 1]));
      locked.push(false);
    }
  }
  return { modes, modesLocked: locked };
}

/** Trips saved before v0.2 carry user-chosen modes with no lock flags: lock them all. */
export function migrateTripModes(trip: Trip): Trip {
  if (trip.modesLocked) return trip;
  return { ...trip, modesLocked: trip.modes.map(() => true) };
}
