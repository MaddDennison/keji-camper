import { describe, expect, it } from 'vitest';
import {
  INVITE_CAP,
  alreadyForked,
  cabinStampCounts,
  invitesRemaining,
  planAcceptBundle,
  planForkMemory,
  planForkTrip,
  planInbox,
  planLogbook,
  planShareBatch,
  reconcileEmailShares,
} from '../src/lib/social';
import type { ShareRow, SharedRow } from '../src/lib/social';
import type { AppData, Memory, Trip } from '../src/types';

const SAM = 'profile-sam';
const ME = 'profile-me';

const trip = (id: string, over: Partial<Trip> = {}): Trip => ({
  id, name: 'Frozen Ocean loop', startDate: '2026-08-12',
  stops: ['bigdam', '4', '7', 'bigdam'], modes: ['paddle', 'paddle', 'paddle'],
  partyIds: ['local-camper-1'], notes: 'bring the cribbage board', status: 'completed', ...over,
});

const memory = (id: string, over: Partial<Memory> = {}): Memory => ({
  id, placeId: '7', date: '2026-08-13', title: 'Loon chorus', text: 'all night',
  rating: 5, tags: [], photos: [], ...over,
});

const appData = (over: Partial<AppData> = {}): AppData => ({
  version: 1, campers: [], trips: [], memories: [],
  settings: { paddleKmh: 4, hikeKmh: 3.5, userName: '' },
  ...over,
});

const sharedTrip = (id: string, owner = SAM, over: Partial<Trip> = {}): SharedRow => ({
  kind: 'trip', owner, id, data: trip(id, over), updated_at: '2026-06-01T00:00:00Z',
});

const sharedMemory = (id: string, owner = SAM, over: Partial<Memory> = {}): SharedRow => ({
  kind: 'memory', owner, id, data: memory(id, over), updated_at: '2026-06-01T00:00:00Z',
});

const share = (id: string, over: Partial<ShareRow> = {}): ShareRow => ({
  id, kind: 'trip', from_owner: SAM, ref_id: 't1', to_profile: ME, to_email: null,
  bundle_id: null, accepted_at: null, dismissed_at: null, ...over,
});

function idGen(...ids: string[]) {
  const queue = [...ids];
  return () => queue.shift() ?? 'overflow';
}

const ctx = (...ids: string[]) => ({ selfProfileId: ME, sharerProfileId: SAM, newId: idGen(...ids) });

describe('planForkTrip', () => {
  it('produces a trip/save under a fresh id with origin stamped and partyIds reset', () => {
    const { action, localId } = planForkTrip(sharedTrip('t1'), appData(), ctx('fresh1'));
    expect(localId).toBe('fresh1');
    if (action.type !== 'trip/save') throw new Error('expected trip/save');
    expect(action.trip.id).toBe('fresh1');
    expect(action.trip.origin).toEqual({ owner: SAM, id: 't1' });
    expect(action.trip.partyIds).toEqual([]);
    expect(action.trip.stops).toEqual(['bigdam', '4', '7', 'bigdam']);
  });

  it('merges attendees: source ∪ sharer ∪ self, de-duped', () => {
    const src = sharedTrip('t1', SAM, { attendees: ['profile-other', SAM] });
    const { action } = planForkTrip(src, appData(), ctx('fresh1'));
    if (action.type !== 'trip/save') throw new Error('expected trip/save');
    expect(action.trip.attendees).toEqual(['profile-other', SAM, ME]);
  });

  it('reconciles by provenance: an existing copy keeps its LOCAL id (no duplicate)', () => {
    const existing = trip('local-9', { origin: { owner: SAM, id: 't1' }, name: 'old name' });
    const data = appData({ trips: [existing] });
    const { action, localId } = planForkTrip(sharedTrip('t1', SAM, { name: 'new name' }), data, ctx('unused'));
    expect(localId).toBe('local-9');
    if (action.type !== 'trip/save') throw new Error('expected trip/save');
    expect(action.trip.id).toBe('local-9');
    expect(action.trip.name).toBe('new name'); // explicit re-accept refreshes in place
  });

  it('does NOT match a same-id trip from a different owner', () => {
    const existing = trip('local-9', { origin: { owner: 'profile-other', id: 't1' } });
    const { localId } = planForkTrip(sharedTrip('t1'), appData({ trips: [existing] }), ctx('fresh2'));
    expect(localId).toBe('fresh2');
  });
});

describe('planForkMemory / planAcceptBundle', () => {
  it('remaps tripId onto the local fork and drops authorId', () => {
    const t = sharedTrip('t1');
    const m = sharedMemory('m1', SAM, { tripId: 't1', authorId: 'sams-camper' });
    const actions = planAcceptBundle(t, [m], appData(), ctx('localT', 'localM'));
    expect(actions).toHaveLength(2);
    const [ta, ma] = actions;
    if (ta.type !== 'trip/save' || ma.type !== 'memory/save') throw new Error('wrong shapes');
    expect(ma.memory.tripId).toBe(ta.trip.id);
    expect(ma.memory.authorId).toBeUndefined();
    expect(ma.memory.origin).toEqual({ owner: SAM, id: 'm1' });
  });

  it('remaps tripId onto a RECONCILED local trip, and re-accept duplicates nothing', () => {
    const existingTrip = trip('local-t', { origin: { owner: SAM, id: 't1' } });
    const existingMem = memory('local-m', { origin: { owner: SAM, id: 'm1' }, tripId: 'local-t' });
    const data = appData({ trips: [existingTrip], memories: [existingMem] });
    const actions = planAcceptBundle(
      sharedTrip('t1'), [sharedMemory('m1', SAM, { tripId: 't1' })], data, ctx('x1', 'x2'),
    );
    const [ta, ma] = actions;
    if (ta.type !== 'trip/save' || ma.type !== 'memory/save') throw new Error('wrong shapes');
    expect(ta.trip.id).toBe('local-t');
    expect(ma.memory.id).toBe('local-m');
    expect(ma.memory.tripId).toBe('local-t');
  });

  it('drops a tripId that has no local mapping (memory shared without its trip)', () => {
    const { action } = planForkMemory(sharedMemory('m1', SAM, { tripId: 't1' }), appData(), ctx('localM'));
    if (action.type !== 'memory/save') throw new Error('expected memory/save');
    expect(action.memory.tripId).toBeUndefined();
  });

  it('alreadyForked spots an existing copy by origin', () => {
    const data = appData({ trips: [trip('x', { origin: { owner: SAM, id: 't1' } })] });
    expect(alreadyForked(sharedTrip('t1'), data)).toBe(true);
    expect(alreadyForked(sharedTrip('t2'), data)).toBe(false);
  });
});

describe('planInbox (addressed offers)', () => {
  it('keeps only pending shares and drops offers whose ref is missing', () => {
    const shares = [
      share('s1'),
      share('s2', { ref_id: 't-gone' }), // ref not in rows (tombstoned/revoked)
      share('s3', { accepted_at: '2026-06-01' }),
      share('s4', { dismissed_at: '2026-06-01' }),
    ];
    const items = planInbox(shares, [sharedTrip('t1')]);
    expect(items).toHaveLength(1);
    expect(items[0].shareIds).toEqual(['s1']);
    expect(items[0].trip?.id).toBe('t1');
  });

  it('groups a bundle under its trip head with its memories', () => {
    const shares = [
      share('s1', { bundle_id: 'b1' }),
      share('s2', { kind: 'memory', ref_id: 'm1', bundle_id: 'b1' }),
      share('s3', { kind: 'memory', ref_id: 'm2', bundle_id: 'b1' }),
    ];
    const items = planInbox(shares, [sharedTrip('t1'), sharedMemory('m1'), sharedMemory('m2')]);
    expect(items).toHaveLength(1);
    expect(items[0].shareIds.sort()).toEqual(['s1', 's2', 's3']);
    expect(items[0].trip?.id).toBe('t1');
    expect(items[0].memories.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('falls back to per-memory items when the bundle head is gone', () => {
    const shares = [
      share('s1', { bundle_id: 'b1', ref_id: 't-gone' }),
      share('s2', { kind: 'memory', ref_id: 'm1', bundle_id: 'b1' }),
    ];
    const items = planInbox(shares, [sharedMemory('m1')]);
    expect(items).toHaveLength(1);
    expect(items[0].trip).toBeNull();
    expect(items[0].memories[0].id).toBe('m1');
  });
});

describe('planLogbook (broadcast)', () => {
  it('sorts newest-first and flags own and already-saved rows', () => {
    const mine = { ...sharedTrip('t-mine', ME), updated_at: '2026-06-03T00:00:00Z' };
    const saved = { ...sharedTrip('t1'), updated_at: '2026-06-02T00:00:00Z' };
    const fresh = { ...sharedTrip('t2'), updated_at: '2026-06-04T00:00:00Z' };
    const data = appData({ trips: [trip('local', { origin: { owner: SAM, id: 't1' } })] });
    const cards = planLogbook([saved, mine, fresh], data, ME);
    expect(cards.map((c) => c.row.id)).toEqual(['t2', 't-mine', 't1']);
    expect(cards.map((c) => c.own)).toEqual([false, true, false]);
    expect(cards.map((c) => c.saved)).toEqual([false, false, true]);
  });
});

describe('cabinStampCounts (passport overlay)', () => {
  it('counts distinct OTHER owners per place from completed trips + memories', () => {
    const rows: SharedRow[] = [
      sharedTrip('t1', SAM), // completed: stamps bigdam, 4, 7
      sharedTrip('t2', 'profile-other', { stops: ['bigdam', '7'], modes: ['paddle'] }),
      sharedTrip('t3', 'profile-other', { status: 'planned' }), // planned: no stamps
      sharedMemory('m1', 'profile-other', { placeId: '7' }), // same owner as t2: still 1
      sharedTrip('t-mine', ME), // mine: never counted
    ];
    const counts = cabinStampCounts(rows, ME);
    expect(counts.get('7')).toBe(2); // SAM + profile-other
    expect(counts.get('4')).toBe(1); // SAM only
    expect(counts.get('bigdam')).toBe(2);
    expect(counts.has('13')).toBe(false);
  });
});

describe('planShareBatch', () => {
  const base = {
    kind: 'trip' as const,
    refId: 't1',
    bundleMemoryIds: [] as string[],
    recipients: [],
    existingShares: [] as ShareRow[],
    existingInviteEmails: [] as string[],
    myProfileId: ME,
    newId: idGen('b1', 'b2'),
  };

  it('plans a member share with no invite, and an email share WITH an invite', () => {
    const plan = planShareBatch({
      ...base,
      recipients: [{ profileId: SAM }, { email: ' Friend@Example.com ' }],
    });
    expect(plan.shares).toEqual([
      { kind: 'trip', ref_id: 't1', bundle_id: null, to_profile: SAM, to_email: null },
      { kind: 'trip', ref_id: 't1', bundle_id: null, to_profile: null, to_email: 'friend@example.com' },
    ]);
    expect(plan.inviteEmails).toEqual(['friend@example.com']);
    expect(plan.skipped).toEqual([]);
  });

  it('bundles linked memories under one bundle_id per recipient', () => {
    const plan = planShareBatch({
      ...base,
      bundleMemoryIds: ['m1', 'm2'],
      recipients: [{ profileId: SAM }],
      newId: idGen('bundle-1'),
    });
    expect(plan.shares.map((s) => [s.kind, s.ref_id, s.bundle_id])).toEqual([
      ['trip', 't1', 'bundle-1'],
      ['memory', 'm1', 'bundle-1'],
      ['memory', 'm2', 'bundle-1'],
    ]);
  });

  it('skips self-shares, duplicate offers, and already-invited emails', () => {
    const plan = planShareBatch({
      ...base,
      recipients: [{ profileId: ME }, { profileId: SAM }, { email: 'already@x.ca' }],
      existingShares: [share('old', { from_owner: ME, to_profile: SAM })],
      existingInviteEmails: ['Already@x.ca'],
    });
    expect(plan.shares).toEqual([
      { kind: 'trip', ref_id: 't1', bundle_id: null, to_profile: null, to_email: 'already@x.ca' },
    ]);
    expect(plan.inviteEmails).toEqual([]); // share goes out; invite already outstanding
    expect(plan.skipped).toHaveLength(2);
  });
});

describe('invitesRemaining (cap boundary)', () => {
  it('walks the boundary: 9 → 1 left, 10 → 0, 11 → 0; admins unlimited', () => {
    expect(INVITE_CAP).toBe(10);
    expect(invitesRemaining(0, false)).toBe(10);
    expect(invitesRemaining(9, false)).toBe(1);
    expect(invitesRemaining(10, false)).toBe(0);
    expect(invitesRemaining(11, false)).toBe(0);
    expect(invitesRemaining(99, true)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('reconcileEmailShares (pins the D2 SQL semantics)', () => {
  it('binds case-insensitively, sets to_profile and CLEARS to_email', () => {
    const rows = [
      share('s1', { to_profile: null, to_email: 'friend@example.com' }),
      share('s2', { to_profile: null, to_email: 'other@example.com' }),
      share('s3'), // already bound to a profile: untouched
    ];
    const out = reconcileEmailShares(rows, 'profile-new', 'Friend@Example.COM');
    expect(out[0]).toMatchObject({ to_profile: 'profile-new', to_email: null });
    expect(out[1]).toMatchObject({ to_profile: null, to_email: 'other@example.com' });
    expect(out[2]).toEqual(rows[2]);
  });
});
