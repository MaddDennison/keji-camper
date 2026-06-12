import type { AppData, Memory, Trip } from '../types';
import type { SyncAction } from './sync';

/**
 * Pure social core (M4, docs/M4-REVIEW.md). Like `sync.ts`, everything here
 * is a plain function over plain data — zero imports of React, supabase, or
 * browser globals — so every branch is reachable from pure-node tests. The
 * thin adapter (`src/lib/useLogbook.tsx`) owns the network; this module owns
 * the semantics:
 *
 * - fork planning: a remote shared row becomes a `trip/save` / `memory/save`
 *   action under the recipient's own identity (the reducer is the single
 *   write path; consent-by-schema means the fork is the recipient's write)
 * - provenance de-dupe: a copy carries `origin {owner, id}`; re-accepting
 *   reconciles in place by REUSING the existing local id (D6), so the
 *   journal and trip-quantified badges never see duplicates
 * - bundle forks remap `Memory.tripId` to the local trip id (D6)
 * - inbox/logbook planning: pending addressed offers grouped by bundle,
 *   broadcast rows sorted and flagged (D5)
 * - share-batch planning: share rows (+ invite rows for emails) for the
 *   "share with campers" control, deduped against what already exists (D5)
 * - the invite-cap boundary for the UI meter (D1/P4 — the cap itself is
 *   enforced server-side by `can_create_invite()`)
 */

/** Per-member cap on outstanding unused invites (P4). Mirrors 0002_social.sql. */
export const INVITE_CAP = 10;

export type ShareKind = 'trip' | 'memory';

/** One row of `shares` as pulled from Supabase. */
export interface ShareRow {
  id: string;
  kind: ShareKind;
  from_owner: string;
  ref_id: string;
  to_profile: string | null;
  to_email: string | null;
  bundle_id: string | null;
  created_at?: string | null;
  accepted_at: string | null;
  dismissed_at: string | null;
}

/** A shared entity row (trip or memory) read by the ephemeral social query. */
export interface SharedRow {
  kind: ShareKind;
  owner: string;
  id: string;
  data: unknown; // Trip | Memory (the owner's whole entity)
  updated_at?: string | null;
}

/** A share row to INSERT (id/created_at are server defaults). */
export interface NewShareRow {
  kind: ShareKind;
  ref_id: string;
  to_profile: string | null;
  to_email: string | null;
  bundle_id: string | null;
}

function rowKey(kind: ShareKind, owner: string, id: string): string {
  return `${kind}:${owner}:${id}`;
}

function mergeAttendees(...groups: (string[] | undefined)[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    for (const id of g ?? []) {
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

function findByOrigin<T extends { origin?: { owner: string; id: string } }>(
  list: T[],
  owner: string,
  id: string,
): T | undefined {
  return list.find((e) => e.origin?.owner === owner && e.origin?.id === id);
}

export interface ForkContext {
  /** The accepting user's own profile id (goes into attendees). */
  selfProfileId: string;
  /** The sharer's profile id (goes into attendees alongside theirs). */
  sharerProfileId: string;
  /** Injected id generator (kept out of the pure core for testability). */
  newId: () => string;
}

/**
 * Plan the fork of one shared trip into the recipient's journal.
 *
 * - `origin` is stamped from the source row's (owner, id).
 * - De-dupe: if a copy with the same origin already exists locally, its id is
 *   REUSED (in-place update) — re-accepting is an explicit refresh, never a
 *   duplicate (D6).
 * - `partyIds` is reset: it references the sharer's local campers, which mean
 *   nothing in the recipient's journal. `attendees` (profile ids) carries the
 *   "who I was with" attribution instead.
 */
export function planForkTrip(
  source: SharedRow,
  data: AppData,
  ctx: ForkContext,
): { action: SyncAction; localId: string } {
  const remote = source.data as Trip;
  const existing = findByOrigin(data.trips, source.owner, source.id);
  const localId = existing ? existing.id : ctx.newId();
  const trip: Trip = {
    ...remote,
    id: localId,
    partyIds: [],
    attendees: mergeAttendees(remote.attendees, [ctx.sharerProfileId], [ctx.selfProfileId]),
    origin: { owner: source.owner, id: source.id },
  };
  return { action: { type: 'trip/save', trip }, localId };
}

/**
 * Plan the fork of one shared memory. `tripIdMap` remaps the sharer's trip id
 * to the recipient's local copy when the memory rides in a trip bundle; a
 * `tripId` with no mapping is dropped (the recipient has no such trip).
 * `authorId` is dropped for the same reason as `partyIds` above.
 */
export function planForkMemory(
  source: SharedRow,
  data: AppData,
  ctx: ForkContext,
  tripIdMap: Record<string, string> = {},
): { action: SyncAction; localId: string } {
  const remote = source.data as Memory;
  const existing = findByOrigin(data.memories, source.owner, source.id);
  const localId = existing ? existing.id : ctx.newId();
  const memory: Memory = {
    ...remote,
    id: localId,
    tripId: remote.tripId ? tripIdMap[remote.tripId] : undefined,
    authorId: undefined,
    attendees: mergeAttendees(remote.attendees, [ctx.sharerProfileId], [ctx.selfProfileId]),
    origin: { owner: source.owner, id: source.id },
  };
  return { action: { type: 'memory/save', memory }, localId };
}

/**
 * Plan accepting an offer: the trip (if any) forks first so its memories can
 * remap onto the local trip id — whether that id is fresh or reconciled to an
 * existing copy. Returns reducer actions in dispatch order. Idempotent by
 * construction: accept again and every action reconciles to the same ids.
 */
export function planAcceptBundle(
  trip: SharedRow | null,
  memories: SharedRow[],
  data: AppData,
  ctx: ForkContext,
): SyncAction[] {
  const actions: SyncAction[] = [];
  const tripIdMap: Record<string, string> = {};
  if (trip) {
    const fork = planForkTrip(trip, data, ctx);
    actions.push(fork.action);
    tripIdMap[trip.id] = fork.localId;
  }
  for (const m of memories) {
    actions.push(planForkMemory(m, data, ctx, tripIdMap).action);
  }
  return actions;
}

/** True when a copy of this shared row already exists in the local journal. */
export function alreadyForked(source: SharedRow, data: AppData): boolean {
  const list = source.kind === 'trip' ? data.trips : data.memories;
  return findByOrigin(list, source.owner, source.id) !== undefined;
}

/* ---------------------------------------------------------------- inbox -- */

/** A pending offer, grouped: a trip head with its bundled memories, or a lone memory. */
export interface InboxItem {
  /** The share rows this item resolves (all are accepted/dismissed together). */
  shareIds: string[];
  fromOwner: string;
  trip: SharedRow | null;
  memories: SharedRow[];
}

/**
 * Group my pending shares (not accepted, not dismissed) into inbox items,
 * resolving each against the fetched entity rows. Shares whose ref did not
 * resolve (tombstoned or revoked between queries) are dropped. Bundled
 * memory shares attach to their bundle's trip head; a bundle with no
 * resolvable trip falls back to per-memory items.
 */
export function planInbox(shares: ShareRow[], rows: SharedRow[]): InboxItem[] {
  const byKey = new Map<string, SharedRow>();
  for (const r of rows) byKey.set(rowKey(r.kind, r.owner, r.id), r);

  const pending = shares.filter((s) => s.accepted_at === null && s.dismissed_at === null);
  const resolved = pending
    .map((s) => ({ share: s, row: byKey.get(rowKey(s.kind, s.from_owner, s.ref_id)) }))
    .filter((x): x is { share: ShareRow; row: SharedRow } => x.row !== undefined);

  const items: InboxItem[] = [];
  const bundles = new Map<string, { share: ShareRow; row: SharedRow }[]>();
  for (const x of resolved) {
    if (x.share.bundle_id) {
      const list = bundles.get(x.share.bundle_id) ?? [];
      list.push(x);
      bundles.set(x.share.bundle_id, list);
    } else {
      items.push({
        shareIds: [x.share.id],
        fromOwner: x.share.from_owner,
        trip: x.row.kind === 'trip' ? x.row : null,
        memories: x.row.kind === 'memory' ? [x.row] : [],
      });
    }
  }
  for (const group of bundles.values()) {
    const trip = group.find((x) => x.row.kind === 'trip');
    const memories = group.filter((x) => x.row.kind === 'memory');
    if (trip) {
      items.push({
        shareIds: group.map((x) => x.share.id),
        fromOwner: trip.share.from_owner,
        trip: trip.row,
        memories: memories.map((x) => x.row),
      });
    } else {
      // bundle head missing (e.g. trip tombstoned): offer the memories alone
      for (const x of memories) {
        items.push({ shareIds: [x.share.id], fromOwner: x.share.from_owner, trip: null, memories: [x.row] });
      }
    }
  }
  return items;
}

/* -------------------------------------------------------------- logbook -- */

export interface LogbookCard {
  row: SharedRow;
  /** My own broadcast row — rendered without "save a copy". */
  own: boolean;
  /** A copy already exists in my journal (origin match). */
  saved: boolean;
}

/** Sort broadcast rows newest-first and flag own/already-saved per card. */
export function planLogbook(rows: SharedRow[], data: AppData, myProfileId: string): LogbookCard[] {
  return [...rows]
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    .map((row) => ({
      row,
      own: row.owner === myProfileId,
      saved: alreadyForked(row, data),
    }));
}

/**
 * Passport overlay (M4-SOCIAL "you + N others"): per place id, how many
 * OTHER members' broadcast rows stamp it — completed shared trips' stops and
 * shared memories' places, distinct owners, never counting my own rows.
 */
export function cabinStampCounts(rows: SharedRow[], myProfileId: string): Map<string, number> {
  const owners = new Map<string, Set<string>>();
  const add = (placeId: string, owner: string) => {
    if (!placeId) return;
    const s = owners.get(placeId) ?? new Set<string>();
    s.add(owner);
    owners.set(placeId, s);
  };
  for (const r of rows) {
    if (r.owner === myProfileId) continue;
    if (r.kind === 'trip') {
      const t = r.data as Trip;
      if (t.status === 'completed') for (const stop of t.stops ?? []) add(stop, r.owner);
    } else {
      const m = r.data as Memory;
      add(m.placeId, r.owner);
    }
  }
  return new Map([...owners.entries()].map(([k, v]) => [k, v.size]));
}

/* ------------------------------------------------------- share planning -- */

export interface ShareRecipient {
  profileId?: string;
  email?: string;
}

export interface ShareBatchInput {
  kind: ShareKind;
  /** The entity being offered (already synced under my ownership). */
  refId: string;
  /** Linked memories to bundle (trips only, when the sharer opted in — P2). */
  bundleMemoryIds: string[];
  recipients: ShareRecipient[];
  /** My already-existing shares for de-dupe (sender can SELECT own sent rows). */
  existingShares: ShareRow[];
  /** Emails of my outstanding unused invites, for invite de-dupe. */
  existingInviteEmails: string[];
  myProfileId: string;
  /** Injected generator for bundle ids. */
  newId: () => string;
}

export interface ShareBatchPlan {
  shares: NewShareRow[];
  /** Emails needing an `invites` row (the M3 signup gate) minted alongside. */
  inviteEmails: string[];
  /** Recipients skipped because an identical offer already exists. */
  skipped: ShareRecipient[];
}

/**
 * Plan the rows behind one "Share" click: per recipient, a share for the
 * entity (plus one per bundled memory, all under one bundle_id), and for
 * email recipients an invite row unless one is already outstanding. Emails
 * are normalized (lowercase/trim) here AND by the DB trigger; self-shares
 * and duplicate offers (same kind/ref/recipient pending or accepted) are
 * skipped client-side — the DB unique indexes are the real boundary.
 */
export function planShareBatch(input: ShareBatchInput): ShareBatchPlan {
  const shares: NewShareRow[] = [];
  const inviteEmails: string[] = [];
  const skipped: ShareRecipient[] = [];
  const invitedAlready = new Set(input.existingInviteEmails.map((e) => e.toLowerCase().trim()));

  const dupe = (to: { profileId?: string; email?: string }) =>
    input.existingShares.some(
      (s) =>
        s.kind === input.kind &&
        s.ref_id === input.refId &&
        (to.profileId ? s.to_profile === to.profileId : s.to_email === to.email),
    );

  for (const r of input.recipients) {
    const email = r.email?.toLowerCase().trim();
    const target: ShareRecipient = r.profileId ? { profileId: r.profileId } : { email };
    if (r.profileId === input.myProfileId || (!r.profileId && !email)) {
      skipped.push(r);
      continue;
    }
    if (dupe(target)) {
      skipped.push(r);
      continue;
    }
    const bundleId = input.bundleMemoryIds.length > 0 ? input.newId() : null;
    const to = {
      to_profile: r.profileId ?? null,
      to_email: r.profileId ? null : email!,
    };
    shares.push({ kind: input.kind, ref_id: input.refId, bundle_id: bundleId, ...to });
    for (const mid of input.bundleMemoryIds) {
      shares.push({ kind: 'memory', ref_id: mid, bundle_id: bundleId, ...to });
    }
    if (!r.profileId && email && !invitedAlready.has(email)) {
      inviteEmails.push(email);
      invitedAlready.add(email);
    }
  }
  return { shares, inviteEmails, skipped };
}

/* ----------------------------------------------------------- invite cap -- */

/**
 * How many invites this member may still mint (UI meter only — the real
 * boundary is `can_create_invite()` in 0002_social.sql). Admins are exempt.
 */
export function invitesRemaining(
  unusedCount: number,
  isAdmin: boolean,
  cap: number = INVITE_CAP,
): number {
  if (isAdmin) return Number.POSITIVE_INFINITY;
  return Math.max(0, cap - unusedCount);
}

/* ------------------------------------------------------ email reconcile -- */

/**
 * Pure model of the DB-side share reconcile (D2): binding a profile to every
 * share addressed to their email — case-insensitively — sets `to_profile`
 * and CLEARS `to_email` (the exactly-one-recipient invariant at rest). The
 * SQL lives in `shares_before_insert()` + `handle_new_user()`; this mirror
 * exists so the semantics are pinned by a pure test.
 */
export function reconcileEmailShares(
  shares: ShareRow[],
  profileId: string,
  email: string,
): ShareRow[] {
  const needle = email.toLowerCase().trim();
  return shares.map((s) =>
    s.to_profile === null && s.to_email !== null && s.to_email.toLowerCase().trim() === needle
      ? { ...s, to_profile: profileId, to_email: null }
      : s,
  );
}
