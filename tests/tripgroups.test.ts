import { describe, expect, it } from 'vitest';
import { groupTrips } from '../src/lib/tripgroups';
import type { Trip, TripStatus } from '../src/types';

let n = 0;
function mk(status: TripStatus, startDate: string, name?: string): Trip {
  n += 1;
  return {
    id: `t${n}`,
    name: name ?? `Trip ${n}`,
    startDate,
    stops: [],
    modes: [],
    partyIds: [],
    notes: '',
    status,
  };
}

describe('groupTrips', () => {
  it('buckets trips by all three statuses', () => {
    const g = groupTrips([mk('planned', '2026-08-01'), mk('dream', ''), mk('completed', '2025-07-01')]);
    expect(g.planned).toHaveLength(1);
    expect(g.dream).toHaveLength(1);
    expect(g.completed).toHaveLength(1);
  });

  it('sorts planned ascending by date (soonest first)', () => {
    const later = mk('planned', '2026-09-10');
    const sooner = mk('planned', '2026-07-20');
    const g = groupTrips([later, sooner]);
    expect(g.planned.map((t) => t.id)).toEqual([sooner.id, later.id]);
  });

  it('puts undated planned trips last, not first', () => {
    const undated = mk('planned', '');
    const dated = mk('planned', '2026-08-01');
    const g = groupTrips([undated, dated]);
    expect(g.planned.map((t) => t.id)).toEqual([dated.id, undated.id]);
  });

  it('sorts undated planned trips among themselves by name', () => {
    const b = mk('planned', '', 'Bear brook');
    const a = mk('planned', '', 'Ash loop');
    const g = groupTrips([b, a]);
    expect(g.planned.map((t) => t.name)).toEqual(['Ash loop', 'Bear brook']);
  });

  it('sorts completed descending by date, undated last', () => {
    const older = mk('completed', '2024-06-01');
    const newer = mk('completed', '2025-08-15');
    const undated = mk('completed', '');
    const g = groupTrips([older, undated, newer]);
    expect(g.completed.map((t) => t.id)).toEqual([newer.id, older.id, undated.id]);
  });

  it('sorts dreams by name', () => {
    const z = mk('dream', '2026-01-01', 'Zephyr run');
    const a = mk('dream', '', 'Aurora loop');
    const g = groupTrips([z, a]);
    expect(g.dream.map((t) => t.name)).toEqual(['Aurora loop', 'Zephyr run']);
  });

  it('returns three empty arrays for no trips', () => {
    expect(groupTrips([])).toEqual({ planned: [], dream: [], completed: [] });
  });

  it('does not mutate the input array', () => {
    const trips = [mk('planned', '2026-09-01'), mk('planned', '2026-07-01')];
    const ids = trips.map((t) => t.id);
    groupTrips(trips);
    expect(trips.map((t) => t.id)).toEqual(ids);
  });
});
