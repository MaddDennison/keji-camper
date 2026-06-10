import { moonInfo } from './astro';
import { placeById, PLACES } from '../data/sites';
import type { Memory, Trip } from '../types';

/** Derived achievements (v0.2). Pure functions over journal + trips. */

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  hint: string; // how to earn it
  earned: boolean;
}

const FROZEN_OCEAN_SITES = ['5', '6', '7', '8', '45', '46'];
const LAUNCHES = ['bigdam', 'jakes', 'eelweir', 'merrymakedge'];

function visitedIds(memories: Memory[], trips: Trip[]): Set<string> {
  const s = new Set<string>();
  for (const m of memories) s.add(m.placeId);
  for (const t of trips) if (t.status === 'completed') for (const st of t.stops) s.add(st);
  return s;
}

function memoryOnDate(memories: Memory[], test: (d: Date) => boolean): boolean {
  return memories.some((m) => m.date && test(new Date(m.date + 'T22:00:00')));
}

export function computeBadges(memories: Memory[], trips: Trip[]): Badge[] {
  const visited = visitedIds(memories, trips);
  const campVisited = [...visited].filter((id) => {
    const p = placeById.get(id);
    return p && p.kind !== 'launch';
  });
  const lakes = new Set(campVisited.map((id) => placeById.get(id)!.lake.split('(')[0].split('/')[0].trim()));
  const allCampSites = PLACES.filter((p) => p.kind !== 'launch');
  const tripStops = (t: Trip) => new Set(t.stops);

  return [
    {
      id: 'first-stamp', name: 'First Stamp', emoji: '🎫',
      hint: 'Sleep at any backcountry site', earned: campVisited.length >= 1,
    },
    {
      id: 'five-lakes', name: 'Five Lakes', emoji: '💧',
      hint: 'Stay on five different lakes or rivers', earned: lakes.size >= 5,
    },
    {
      id: 'frozen-ocean', name: 'Frozen Ocean Completionist', emoji: '🧊',
      hint: 'Stamp every Frozen Ocean site (5, 6, 7, 8, 45, 46)',
      earned: FROZEN_OCEAN_SITES.every((id) => visited.has(id)),
    },
    {
      id: 'thru-hiker', name: 'Thru-hiker', emoji: '🥾',
      hint: 'Complete a trip that sleeps at Liberty Lake (site 42)',
      earned: trips.some((t) => t.status === 'completed' && tripStops(t).has('42')),
    },
    {
      id: 'cabin-life', name: 'Cabin Life', emoji: '🏚',
      hint: 'Stay at Mason’s or Wil-Bo-Wil cabin',
      earned: visited.has('W1') || visited.has('W2'),
    },
    {
      id: 'perseid', name: 'Perseid Camper', emoji: '☄️',
      hint: 'Journal a night between August 10–14',
      earned: memoryOnDate(memories, (d) => d.getMonth() === 7 && d.getDate() >= 10 && d.getDate() <= 14),
    },
    {
      id: 'new-moon', name: 'Dark-Sky Devotee', emoji: '🌑',
      hint: 'Journal a night within a day of the new moon',
      earned: memoryOnDate(memories, (d) => moonInfo(d).illumination < 0.05),
    },
    {
      id: 'four-launches', name: 'All Four Doors', emoji: '🚪',
      hint: 'Trips that touch Big Dam, Jakes Landing, Eel Weir and Merrymakedge',
      earned: LAUNCHES.every((l) => trips.some((t) => tripStops(t).has(l))),
    },
    {
      id: 'shoulder-season', name: 'Shoulder Season', emoji: '🍁',
      hint: 'Journal a night in May or October',
      earned: memoryOnDate(memories, (d) => d.getMonth() === 4 || d.getMonth() === 9),
    },
    {
      id: 'full-passport', name: 'Full Passport', emoji: '🏆',
      hint: `Stamp all ${allCampSites.length} sites — the whole backcountry`,
      earned: allCampSites.every((p) => visited.has(p.id)),
    },
  ];
}
