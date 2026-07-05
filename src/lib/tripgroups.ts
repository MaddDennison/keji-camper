import type { Trip } from '../types';

export interface TripGroups {
  planned: Trip[];
  dream: Trip[];
  completed: Trip[];
}

/**
 * Buckets trips by status with per-section sort orders:
 * - planned: soonest first; undated trips last (ascending localeCompare would
 *   put '' first, so they're forced to the end explicitly)
 * - dream: by name (dreams rarely have dates)
 * - completed: most recent first; undated last
 */
export function groupTrips(trips: Trip[]): TripGroups {
  const planned = trips
    .filter((t) => t.status === 'planned')
    .sort((a, b) => {
      if (!a.startDate && !b.startDate) return a.name.localeCompare(b.name);
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.localeCompare(b.startDate);
    });
  const dream = trips
    .filter((t) => t.status === 'dream')
    .sort((a, b) => a.name.localeCompare(b.name));
  const completed = trips
    .filter((t) => t.status === 'completed')
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  return { planned, dream, completed };
}
