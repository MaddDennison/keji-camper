import { legRouteSet, optionCarryMeters } from '../data/legRoutes';
import { portageMeters } from './mapdata';
import { altRouteGeometry, legCarries, legGeometry, type LegCarry, type LegSegment } from './routegeo';
import { legHours, route } from './routing';
import type { TravelMode } from '../types';

/**
 * One leg, fully resolved for display: distance, time, the line to draw, and the
 * carries — accounting for the user's chosen portage routing where a leg branches.
 *
 *  - A leg with no branch: distance/geometry/carries come from the charts +
 *    corridor exactly as before (`options` is undefined, no picker shown).
 *  - A branching leg, default option: keeps the exact chart distance; carries are
 *    pinned from the option (the corridor can under-detect a carry it only grazes).
 *  - A branching leg, alternative option: an estimated distance (≈) over a stitched
 *    portage route, with that option's carries.
 */
export interface LegPlan {
  km: number;
  exact: boolean;
  hours: number;
  segments: LegSegment[];
  carries: LegCarry[];
  /** Present only when the leg branches; label the picker options. null entry = unroutable. */
  options?: { label: string }[];
  optionIndex: number;
}

export function planLeg(
  mode: TravelMode,
  from: string,
  to: string,
  optionIndex = 0,
  kmh?: number,
): LegPlan | null {
  const r = route(mode, from, to);
  if (!r) return null;

  const set = mode === 'paddle' ? legRouteSet(from, to) : undefined;
  const options = set?.options.map((o) => ({ label: o.label }));
  const idx = set ? Math.min(Math.max(0, optionIndex), set.options.length - 1) : 0;

  // alternative (non-default) branch: estimated distance + stitched geometry
  if (set && idx > 0) {
    const opt = set.options[idx];
    const alt = altRouteGeometry(from, to, opt.portages);
    return {
      km: alt.km,
      exact: false,
      hours: legHours(alt.km, mode, kmh),
      segments: alt.segments,
      carries: opt.portages.map((id) => ({ id, carryM: portageMeters[id] ?? 0 })),
      options,
      optionIndex: idx,
    };
  }

  // default routing: chart distance + the real water corridor. On a branching
  // leg we pin the carries (and ask the corridor to highlight them) so the list
  // and the red segments match even where the corridor only grazes a carry.
  const carries = set
    ? set.options[0].portages.map((id) => ({ id, carryM: portageMeters[id] ?? 0 }))
    : legCarries(mode, r.path);
  return {
    km: r.km,
    exact: r.exact,
    hours: legHours(r.km, mode, kmh),
    segments: legGeometry(mode, r.path, set ? set.options[0].portages : undefined),
    carries,
    options,
    optionIndex: 0,
  };
}

export { optionCarryMeters };
