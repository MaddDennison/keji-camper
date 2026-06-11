import { describe, expect, it } from 'vitest';
import { decodeTripLink, encodeTripPayload } from '../src/lib/share';
import {
  coalesceOp,
  diffSnapshots,
  keyOf,
  planInbound,
  serializeEntity,
} from '../src/lib/sync';
import type { AppData, Trip } from '../src/types';

/**
 * Pure-logic interactions between sharing (F6, URL-fragment trips) and sync
 * (M3 D1). No React, no supabase, no browser storage — just the share codec
 * and the sync core composed the way the adapters compose them.
 */

const sourceTrip: Trip = {
  id: 'src', name: 'Frozen Ocean loop — August crew', startDate: '2026-08-12',
  stops: ['bigdam', '4', '7', '11', 'jakes'],
  modes: ['paddle', 'paddle', 'paddle', 'paddle'],
  modesLocked: [true, true, true, true],
  partyIds: ['a'], notes: 'Bring the cribbage board', status: 'planned',
};

const appData = (over: Partial<AppData> = {}): AppData => ({
  version: 1, campers: [], trips: [], memories: [],
  settings: { paddleKmh: 4, hikeKmh: 4, userName: '' },
  ...over,
});

describe('shared trips entering sync', () => {
  it('an imported shared trip becomes a dirty upsert op in diffSnapshots', async () => {
    const imported = await decodeTripLink(await encodeTripPayload(sourceTrip));

    // Import on a device with an empty journal and an empty baseline:
    const data = appData({ trips: [imported] });
    const diff = diffSnapshots(data, {});
    expect(diff.reset).toBe(false);
    expect(diff.ops).toEqual([
      { kind: 'upsert', table: 'trips', id: imported.id, data: imported },
    ]);

    // …and the op queues cleanly for the next flush.
    const queue = coalesceOp({}, diff.ops[0]);
    expect(queue[keyOf('trips', imported.id)].kind).toBe('upsert');
  });

  it('importing alongside an existing journal dirties only the shared trip', async () => {
    const existing: Trip = { ...sourceTrip, id: 'old', name: 'Last year' };
    const baseline = { [keyOf('trips', 'old')]: serializeEntity(existing) };
    const imported = await decodeTripLink(await encodeTripPayload(sourceTrip));

    const diff = diffSnapshots(appData({ trips: [existing, imported] }), baseline);
    expect(diff.ops).toEqual([
      { kind: 'upsert', table: 'trips', id: imported.id, data: imported },
    ]);
  });
});

describe('shared trips round-tripping through sync', () => {
  it('a round-tripped trip survives a planInbound save action intact', async () => {
    const imported = await decodeTripLink(await encodeTripPayload(sourceTrip));

    // Device A uploaded it; device B pulls the row and plans the apply.
    const plan = planInbound(
      appData(),
      [{ table: 'trips', id: imported.id, data: imported, deleted_at: null }],
      new Set(),
    );
    expect(plan.actions).toEqual([{ type: 'trip/save', trip: imported }]);
    const saved = plan.actions[0];
    if (saved.type !== 'trip/save') throw new Error('expected trip/save');

    // The trip the reducer will save is the shared trip, field for field.
    expect(saved.trip.name).toBe(sourceTrip.name);
    expect(saved.trip.startDate).toBe(sourceTrip.startDate);
    expect(saved.trip.stops).toEqual(sourceTrip.stops);
    expect(saved.trip.modes).toEqual(sourceTrip.modes);
    expect(saved.trip.notes).toBe(sourceTrip.notes);
    expect(saved.trip.status).toBe('planned');
    expect(saved.trip.id).not.toBe(sourceTrip.id); // fresh id on import

    // Baseline advanced to the remote serialization → applying is echo-free.
    expect(plan.baselineUpdates[keyOf('trips', imported.id)]).toBe(serializeEntity(imported));
    const after = appData({ trips: [saved.trip] });
    expect(diffSnapshots(after, { [keyOf('trips', imported.id)]: serializeEntity(imported) }).ops).toEqual([]);
  });

  it('full loop: import → upload → pull on a second device → no echo, no drift', async () => {
    // Device A imports a shared link into a clean journal.
    const imported = await decodeTripLink(await encodeTripPayload(sourceTrip));
    const dataA = appData({ trips: [imported] });
    const out = diffSnapshots(dataA, {});
    expect(out.ops).toHaveLength(1);

    // Flush: the uploaded payload is exactly the op's data.
    const uploaded = out.ops[0].data;
    const baselineA = { [keyOf('trips', imported.id)]: serializeEntity(uploaded) };
    expect(diffSnapshots(dataA, baselineA).ops).toEqual([]); // A is clean after flush

    // Device B pulls the row.
    const planB = planInbound(
      appData(),
      [{ table: 'trips', id: imported.id, data: uploaded, deleted_at: null }],
      new Set(),
    );
    expect(planB.actions).toEqual([{ type: 'trip/save', trip: uploaded }]);

    // B's copy decodes to the same shareable trip A holds.
    const reShared = await decodeTripLink(await encodeTripPayload(uploaded as Trip));
    expect(reShared.stops).toEqual(sourceTrip.stops);
    expect(reShared.modes).toEqual(sourceTrip.modes);
    expect(reShared.name).toBe(sourceTrip.name);
  });

  it('a dirty locally-imported trip is not clobbered by an inbound pull', async () => {
    const imported = await decodeTripLink(await encodeTripPayload(sourceTrip));
    const data = appData({ trips: [imported] });
    const dirty = new Set([keyOf('trips', imported.id)]);

    // Same id arrives from remote with different content (e.g. our own
    // earlier upload edited elsewhere) while the import is still queued.
    const remoteVersion = { ...imported, name: 'Renamed remotely' };
    const plan = planInbound(
      data,
      [{ table: 'trips', id: imported.id, data: remoteVersion, deleted_at: null }],
      dirty,
    );
    expect(plan.actions).toEqual([]);
    expect(plan.baselineUpdates).toEqual({});
  });
});
