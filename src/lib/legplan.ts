import { portageMeters } from './mapdata';
import { portageRoutes } from './portagegraph';
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
 *    pinned from the graph route that matches the corridor (which can under-detect
 *    a carry it only grazes — e.g. 30→31 grazes G, the graph completes it to G+H).
 *  - A branching leg, alternative option: an estimated distance (≈) over a stitched
 *    portage route, with that option's carries.
 *
 * Branch options are GENERATED from the paddle connectivity graph (portagegraph.ts)
 * for any pair, replacing the old hand-listed legRoutes.ts. We only surface a picker
 * for genuine LEG-scale choices (a short leg, few carries, a comparable alternative)
 * so whole-park reroutes don't flood every leg with a picker.
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

// A picker is shown only for a plausible single leg with a genuine local alternative.
const MAX_DEFAULT_CARRIES = 2; // longer carry chains => a multi-leg traverse, not one leg
const MAX_LEG_KM = 7; // the default leg must be short enough to be one paddle
const MAX_ALT_RATIO = 1.3; // an alternative no more than 30% longer …
const MAX_ALT_EXTRA_KM = 2; // … and within 2 km absolute

interface LegOption {
  carries: string[]; // ordered carry ids
  label: string;
}

function carryLabel(ids: string[]): string {
  return ids.length === 0 ? 'direct' : ids.map((id) => id.replace(/^P-/, '')).join(' + ');
}

/**
 * Ordered route options for a paddle leg (default first), or null when the leg has
 * no genuine local branch worth a picker. The default is the graph route that best
 * matches the chart corridor, so it keeps the exact chart distance.
 */
function paddleLegOptions(
  from: string,
  to: string,
  chartKm: number,
  corridorIds: string[],
): LegOption[] | null {
  const routes = portageRoutes(from, to);
  if (routes.length < 2) return null;

  const overlap = (r: (typeof routes)[number]) =>
    r.carries.filter((c) => corridorIds.includes(c.id)).length;
  const ranked = [...routes].sort(
    (a, b) => overlap(b) - overlap(a) || a.carries.length - b.carries.length,
  );
  const def = ranked[0];
  if (def.carries.length > MAX_DEFAULT_CARRIES || chartKm > MAX_LEG_KM) return null;

  const alts: LegOption[] = [];
  for (const r of ranked.slice(1)) {
    const ids = r.carries.map((c) => c.id);
    const g = altRouteGeometry(from, to, ids);
    if (g.km <= chartKm * MAX_ALT_RATIO && g.km - chartKm <= MAX_ALT_EXTRA_KM) {
      alts.push({ carries: ids, label: carryLabel(ids) });
    }
  }
  if (alts.length === 0) return null;

  const defIds = def.carries.map((c) => c.id);
  return [{ carries: defIds, label: carryLabel(defIds) }, ...alts];
}

function pinnedCarries(ids: string[]): LegCarry[] {
  return ids.map((id) => ({ id, carryM: portageMeters[id] ?? 0 }));
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

  const corridor = legCarries(mode, r.path);
  const opts =
    mode === 'paddle' ? paddleLegOptions(from, to, r.km, corridor.map((c) => c.id)) : null;

  // no branch: chart distance + the real water corridor, exactly as before
  if (!opts) {
    return {
      km: r.km,
      exact: r.exact,
      hours: legHours(r.km, mode, kmh),
      segments: legGeometry(mode, r.path),
      carries: corridor,
      optionIndex: 0,
    };
  }

  const idx = Math.min(Math.max(0, optionIndex), opts.length - 1);
  const options = opts.map((o) => ({ label: o.label }));

  // alternative (non-default) branch: estimated distance + stitched geometry
  if (idx > 0) {
    const opt = opts[idx];
    const alt = altRouteGeometry(from, to, opt.carries);
    return {
      km: alt.km,
      exact: false,
      hours: legHours(alt.km, mode, kmh),
      segments: alt.segments,
      carries: pinnedCarries(opt.carries),
      options,
      optionIndex: idx,
    };
  }

  // default routing: chart distance + the real water corridor, with the carries
  // pinned from the graph (so the list and the red segments match even where the
  // corridor only grazes a carry).
  const defIds = opts[0].carries;
  return {
    km: r.km,
    exact: r.exact,
    hours: legHours(r.km, mode, kmh),
    segments: legGeometry(mode, r.path, defIds),
    carries: pinnedCarries(defIds),
    options,
    optionIndex: 0,
  };
}
