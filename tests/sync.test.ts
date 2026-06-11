import { describe, expect, it } from 'vitest';
import {
  coalesceOp,
  diffSnapshots,
  keyOf,
  planInbound,
  serializeEntity,
} from '../src/lib/sync';
import type { RemoteRow, SyncAction, SyncOp } from '../src/lib/sync';
import type { AppData, Camper, Memory, Trip } from '../src/types';

const trip = (id: string, over: Partial<Trip> = {}): Trip => ({
  id, name: 'Frozen Ocean loop', startDate: '2026-08-12',
  stops: ['bigdam', '4', '7'], modes: ['paddle', 'paddle'],
  partyIds: [], notes: '', status: 'planned', ...over,
});

const memory = (id: string, over: Partial<Memory> = {}): Memory => ({
  id, placeId: '13', date: '2026-08-13', title: 'Loon chorus', text: '',
  rating: 5, tags: [], photos: [], ...over,
});

const camper = (id: string, over: Partial<Camper> = {}): Camper => ({
  id, name: 'Maddison', emoji: '🛶', ...over,
});

const appData = (over: Partial<AppData> = {}): AppData => ({
  version: 1, campers: [], trips: [], memories: [],
  settings: { paddleKmh: 4, hikeKmh: 4, userName: '' },
  ...over,
});

/** Apply planInbound output the way the adapter does: actions to data, updates to baseline. */
function applyInbound(
  data: AppData,
  baseline: Record<string, string>,
  plan: { actions: SyncAction[]; baselineUpdates: Record<string, string> },
): { data: AppData; baseline: Record<string, string> } {
  let next = { ...data, trips: [...data.trips], memories: [...data.memories], campers: [...data.campers] };
  for (const a of plan.actions) {
    if (a.type === 'trip/save') next.trips = [...next.trips.filter((t) => t.id !== a.trip.id), a.trip];
    if (a.type === 'trip/delete') next.trips = next.trips.filter((t) => t.id !== a.id);
    if (a.type === 'memory/save') next.memories = [...next.memories.filter((m) => m.id !== a.memory.id), a.memory];
    if (a.type === 'memory/delete') next.memories = next.memories.filter((m) => m.id !== a.id);
    if (a.type === 'camper/save') next.campers = [...next.campers.filter((c) => c.id !== a.camper.id), a.camper];
    if (a.type === 'camper/delete') next.campers = next.campers.filter((c) => c.id !== a.id);
  }
  const base = { ...baseline };
  for (const [key, value] of Object.entries(plan.baselineUpdates)) {
    if (value === '') delete base[key];
    else base[key] = value;
  }
  return { data: next, baseline: base };
}

describe('serializeEntity / keyOf', () => {
  it('is stable across key order and drops undefined', () => {
    expect(serializeEntity({ b: 1, a: 2 })).toBe(serializeEntity({ a: 2, b: 1 }));
    expect(serializeEntity({ a: 1, x: undefined })).toBe(serializeEntity({ a: 1 }));
  });

  it('never returns the empty-string removal sentinel', () => {
    expect(serializeEntity(trip('t1'))).not.toBe('');
    expect(serializeEntity({})).not.toBe('');
  });

  it('keys entities as table:id', () => {
    expect(keyOf('trips', 't1')).toBe('trips:t1');
  });
});

describe('echo prevention (D1)', () => {
  it('an inbound apply produces zero outbound ops', () => {
    const remote: RemoteRow[] = [
      { table: 'trips', id: 't1', data: trip('t1'), deleted_at: null },
      { table: 'memories', id: 'm1', data: memory('m1'), deleted_at: null },
      { table: 'campers', id: 'c1', data: camper('c1'), deleted_at: null },
    ];
    const plan = planInbound(appData(), remote, new Set());
    expect(plan.actions).toHaveLength(3);

    const applied = applyInbound(appData(), {}, plan);
    const diff = diffSnapshots(applied.data, applied.baseline);
    expect(diff.ops).toEqual([]);
    expect(diff.reset).toBe(false);
  });

  it('stays echo-free even when local copies are fresh object references', () => {
    // import/merge always creates new references; the baseline diff must
    // compare content, not identity.
    const remote: RemoteRow[] = [{ table: 'trips', id: 't1', data: trip('t1'), deleted_at: null }];
    const plan = planInbound(appData(), remote, new Set());
    const applied = applyInbound(appData(), {}, plan);
    const reparsed: AppData = JSON.parse(JSON.stringify(applied.data));
    expect(diffSnapshots(reparsed, applied.baseline).ops).toEqual([]);
  });

  it('an identical remote row yields no action but still advances the baseline', () => {
    const t = trip('t1');
    const data = appData({ trips: [t] });
    const plan = planInbound(data, [{ table: 'trips', id: 't1', data: t, deleted_at: null }], new Set());
    expect(plan.actions).toEqual([]);
    expect(plan.baselineUpdates[keyOf('trips', 't1')]).toBe(serializeEntity(t));
  });
});

describe('offline queue coalescing', () => {
  it('save-then-delete of the same id coalesces to a delete', () => {
    let queue: Record<string, SyncOp> = {};
    queue = coalesceOp(queue, { kind: 'upsert', table: 'trips', id: 't1', data: trip('t1') });
    queue = coalesceOp(queue, { kind: 'delete', table: 'trips', id: 't1' });
    expect(Object.keys(queue)).toEqual([keyOf('trips', 't1')]);
    expect(queue[keyOf('trips', 't1')].kind).toBe('delete');
  });

  it('delete-then-save coalesces to an upsert', () => {
    let queue: Record<string, SyncOp> = {};
    queue = coalesceOp(queue, { kind: 'delete', table: 'memories', id: 'm1' });
    queue = coalesceOp(queue, { kind: 'upsert', table: 'memories', id: 'm1', data: memory('m1') });
    expect(Object.keys(queue)).toEqual([keyOf('memories', 'm1')]);
    expect(queue[keyOf('memories', 'm1')].kind).toBe('upsert');
    expect(queue[keyOf('memories', 'm1')].data).toEqual(memory('m1'));
  });

  it('does not mutate the input queue and keeps other entities pending', () => {
    const first = coalesceOp({}, { kind: 'upsert', table: 'trips', id: 't1', data: trip('t1') });
    const second = coalesceOp(first, { kind: 'upsert', table: 'campers', id: 'c1', data: camper('c1') });
    expect(Object.keys(first)).toEqual([keyOf('trips', 't1')]);
    expect(Object.keys(second).sort()).toEqual([keyOf('campers', 'c1'), keyOf('trips', 't1')].sort());
  });
});

describe('deletes are tombstones', () => {
  it('a local delete emits a delete op when the baseline had the entity', () => {
    const t = trip('t1');
    const keep = trip('t2', { name: 'Still here' });
    const baseline = {
      [keyOf('trips', 't1')]: serializeEntity(t),
      [keyOf('trips', 't2')]: serializeEntity(keep),
    };
    const diff = diffSnapshots(appData({ trips: [keep] }), baseline);
    expect(diff.reset).toBe(false);
    expect(diff.ops).toEqual([{ kind: 'delete', table: 'trips', id: 't1' }]);
  });

  it('a remote tombstone yields a local delete action only when the entity exists locally', () => {
    const row: RemoteRow = { table: 'memories', id: 'm1', data: memory('m1'), deleted_at: '2026-06-10T00:00:00Z' };

    const present = planInbound(appData({ memories: [memory('m1')] }), [row], new Set());
    expect(present.actions).toEqual([{ type: 'memory/delete', id: 'm1' }]);
    expect(present.baselineUpdates[keyOf('memories', 'm1')]).toBe('');

    const absent = planInbound(appData(), [row], new Set());
    expect(absent.actions).toEqual([]);
    expect(absent.baselineUpdates[keyOf('memories', 'm1')]).toBe('');
  });

  it('a propagated tombstone does not echo back as an outbound delete', () => {
    const t = trip('t1');
    const baseline = { [keyOf('trips', 't1')]: serializeEntity(t) };
    const plan = planInbound(
      appData({ trips: [t] }),
      [{ table: 'trips', id: 't1', data: t, deleted_at: '2026-06-10T00:00:00Z' }],
      new Set(),
    );
    const applied = applyInbound(appData({ trips: [t] }), baseline, plan);
    expect(applied.data.trips).toEqual([]);
    expect(diffSnapshots(applied.data, applied.baseline).ops).toEqual([]);
  });
});

describe('dirty keys protect offline edits', () => {
  it('planInbound skips dirty keys entirely (no action, no baseline update)', () => {
    const local = trip('t1', { name: 'Edited offline' });
    const remoteVersion = trip('t1', { name: 'Stale cloud copy' });
    const plan = planInbound(
      appData({ trips: [local] }),
      [{ table: 'trips', id: 't1', data: remoteVersion, deleted_at: null }],
      new Set([keyOf('trips', 't1')]),
    );
    expect(plan.actions).toEqual([]);
    expect(plan.baselineUpdates).toEqual({});
  });

  it('a dirty key skips even a remote tombstone', () => {
    const local = memory('m1', { title: 'Re-created offline' });
    const plan = planInbound(
      appData({ memories: [local] }),
      [{ table: 'memories', id: 'm1', data: memory('m1'), deleted_at: '2026-06-10T00:00:00Z' }],
      new Set([keyOf('memories', 'm1')]),
    );
    expect(plan.actions).toEqual([]);
    expect(plan.baselineUpdates).toEqual({});
  });
});

describe('reset safety', () => {
  it('non-empty baseline + empty snapshot signals reset with zero ops', () => {
    const baseline = {
      [keyOf('trips', 't1')]: serializeEntity(trip('t1')),
      [keyOf('memories', 'm1')]: serializeEntity(memory('m1')),
    };
    const diff = diffSnapshots(appData(), baseline);
    expect(diff.reset).toBe(true);
    expect(diff.ops).toEqual([]);
  });

  it('empty baseline + empty snapshot is not a reset', () => {
    expect(diffSnapshots(appData(), {})).toEqual({ ops: [], reset: false });
  });

  it('a non-empty snapshot is never a reset, even with deletions pending', () => {
    const baseline = {
      [keyOf('trips', 't1')]: serializeEntity(trip('t1')),
      [keyOf('campers', 'c1')]: serializeEntity(camper('c1')),
    };
    const diff = diffSnapshots(appData({ campers: [camper('c1')] }), baseline);
    expect(diff.reset).toBe(false);
    expect(diff.ops).toEqual([{ kind: 'delete', table: 'trips', id: 't1' }]);
  });
});

describe('last-upload-wins per entity', () => {
  it('a dirty local entity wins over remote until flushed, then the flushed copy is canonical', () => {
    // 1. Local edit while offline: diff against the old baseline marks it dirty.
    const original = trip('t1', { name: 'Original' });
    const edited = trip('t1', { name: 'Edited offline' });
    let baseline = { [keyOf('trips', 't1')]: serializeEntity(original) };
    let data = appData({ trips: [edited] });

    const outbound = diffSnapshots(data, baseline);
    expect(outbound.ops).toEqual([{ kind: 'upsert', table: 'trips', id: 't1', data: edited }]);
    let queue = coalesceOp({}, outbound.ops[0]);
    const dirty = new Set(Object.keys(queue));

    // 2. A pull arrives carrying a different remote version: the dirty local
    //    copy is untouched (local wins for now).
    const remoteVersion = trip('t1', { name: 'From the other device' });
    const beforeFlush = planInbound(
      data,
      [{ table: 'trips', id: 't1', data: remoteVersion, deleted_at: null }],
      dirty,
    );
    expect(beforeFlush.actions).toEqual([]);
    expect(data.trips[0].name).toBe('Edited offline');

    // 3. Flush succeeds: queue entry removed, baseline advanced to the
    //    uploaded serialization. The upload overwrote remote (no precondition).
    baseline = { [keyOf('trips', 't1')]: serializeEntity(edited) };
    queue = {};

    // 4. Next pull echoes our upload back: no action, no new outbound op.
    const afterFlush = planInbound(
      data,
      [{ table: 'trips', id: 't1', data: edited, deleted_at: null }],
      new Set(),
    );
    expect(afterFlush.actions).toEqual([]);
    const applied = applyInbound(data, baseline, afterFlush);
    expect(diffSnapshots(applied.data, applied.baseline).ops).toEqual([]);
  });

  it('once clean, a newer remote upload wins locally on the next pull', () => {
    const mine = trip('t1', { name: 'Mine' });
    const theirs = trip('t1', { name: 'Theirs, uploaded later' });
    const baseline = { [keyOf('trips', 't1')]: serializeEntity(mine) };
    const plan = planInbound(
      appData({ trips: [mine] }),
      [{ table: 'trips', id: 't1', data: theirs, deleted_at: null }],
      new Set(),
    );
    expect(plan.actions).toEqual([{ type: 'trip/save', trip: theirs }]);
  });
});
