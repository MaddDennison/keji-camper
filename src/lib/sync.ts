import type { AppData, Camper, Memory, Trip } from '../types';

/**
 * Pure sync core (M3, D1 in docs/M3-REVIEW.md).
 *
 * Everything here is a plain function over plain data — zero imports of
 * React, supabase, or browser globals — so every branch is reachable from
 * unit tests. The thin adapter (`src/lib/useSync.tsx`) owns localStorage,
 * the network, and the dispatch loop; this module owns the semantics:
 *
 * - outbound dirty detection against a baseline map (not a render diff)
 * - coalescing per-entity queue (newest op per key wins)
 * - inbound planning that skips dirty keys and advances the baseline,
 *   so an inbound apply produces zero outbound ops
 * - `reset` safety: an emptied local snapshot never tombstones the cloud
 */

/** Synced tables. `settings` stays local-only by design. */
export type SyncTable = 'trips' | 'memories' | 'campers';

/** One outbound operation: upsert carries the entity, delete is a tombstone. */
export interface SyncOp {
  kind: 'upsert' | 'delete';
  table: SyncTable;
  id: string;
  data?: unknown;
}

/** One row pulled from Supabase; `deleted_at` non-null marks a tombstone. */
export interface RemoteRow {
  table: SyncTable;
  id: string;
  data: unknown;
  deleted_at: string | null;
  /**
   * Row owner. The sync pull is owner-scoped, so in normal operation every
   * row's owner is the caller. It is carried here so `planInbound` can refuse
   * foreign rows as a second line of defense (see `expectedOwner`).
   */
  owner?: string;
}

/**
 * Reducer actions sync may dispatch — exact shapes from `src/lib/store.tsx`
 * (mirrored here so this module stays free of non-type imports).
 */
export type SyncAction =
  | { type: 'trip/save'; trip: Trip }
  | { type: 'trip/delete'; id: string }
  | { type: 'memory/save'; memory: Memory }
  | { type: 'memory/delete'; id: string }
  | { type: 'camper/save'; camper: Camper }
  | { type: 'camper/delete'; id: string };

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Stable JSON serialization: object keys sorted recursively, `undefined`
 * properties dropped. Equal content always yields the same string, so
 * baseline comparison is insensitive to key order and object identity.
 */
export function serializeEntity(entity: unknown): string {
  return JSON.stringify(sortValue(entity));
}

/** Baseline/queue key for an entity: `"{table}:{id}"`. */
export function keyOf(table: SyncTable, id: string): string {
  return `${table}:${id}`;
}

const TABLES: { table: SyncTable; list: (d: AppData) => { id: string }[] }[] = [
  { table: 'trips', list: (d) => d.trips },
  { table: 'memories', list: (d) => d.memories },
  { table: 'campers', list: (d) => d.campers },
];

/**
 * Diff the current snapshot against the baseline map (`keyOf(table, id)` →
 * serialized entity).
 *
 * - upsert op when an entity's serialization differs from `baseline[key]`
 *   (including entities absent from the baseline);
 * - delete op when a baseline key's entity is absent from the snapshot;
 * - `reset: true` (with `ops: []`) when the baseline is non-empty but the
 *   snapshot has zero trips, memories, and campers — the caller clears its
 *   baseline/queue instead of tombstoning the cloud journal (D1).
 */
export function diffSnapshots(
  data: AppData,
  baseline: Record<string, string>,
): { ops: SyncOp[]; reset: boolean } {
  const empty = TABLES.every(({ list }) => list(data).length === 0);
  if (empty && Object.keys(baseline).length > 0) return { ops: [], reset: true };

  const ops: SyncOp[] = [];
  const present = new Set<string>();
  for (const { table, list } of TABLES) {
    for (const entity of list(data)) {
      const key = keyOf(table, entity.id);
      present.add(key);
      if (serializeEntity(entity) !== baseline[key]) {
        ops.push({ kind: 'upsert', table, id: entity.id, data: entity });
      }
    }
  }
  for (const key of Object.keys(baseline)) {
    if (present.has(key)) continue;
    const sep = key.indexOf(':');
    const table = key.slice(0, sep) as SyncTable;
    if (!TABLES.some((t) => t.table === table)) continue;
    ops.push({ kind: 'delete', table, id: key.slice(sep + 1) });
  }
  return { ops, reset: false };
}

/**
 * Coalesce an op into the pending queue (a per-entity map, not a log): the
 * newest op for a key replaces any pending one, so save-then-delete collapses
 * to a tombstone and delete-then-save to an upsert. Returns a new queue
 * object; the input is not mutated.
 */
export function coalesceOp(
  queue: Record<string, SyncOp>,
  op: SyncOp,
): Record<string, SyncOp> {
  return { ...queue, [keyOf(op.table, op.id)]: op };
}

const LOCAL: Record<SyncTable, (d: AppData, id: string) => Trip | Memory | Camper | undefined> = {
  trips: (d, id) => d.trips.find((t) => t.id === id),
  memories: (d, id) => d.memories.find((m) => m.id === id),
  campers: (d, id) => d.campers.find((c) => c.id === id),
};

function saveAction(table: SyncTable, data: unknown): SyncAction {
  if (table === 'trips') return { type: 'trip/save', trip: data as Trip };
  if (table === 'memories') return { type: 'memory/save', memory: data as Memory };
  return { type: 'camper/save', camper: data as Camper };
}

function deleteAction(table: SyncTable, id: string): SyncAction {
  if (table === 'trips') return { type: 'trip/delete', id };
  if (table === 'memories') return { type: 'memory/delete', id };
  return { type: 'camper/delete', id };
}

/**
 * Plan the application of pulled rows against local state.
 *
 * - Keys in `dirtyKeys` (pending queued ops) are skipped entirely — offline
 *   edits are never clobbered by a pull (D1).
 * - Tombstones (`deleted_at` set) yield a delete action only when the entity
 *   exists locally, and always a baseline removal.
 * - Live rows yield a save action only when remote content differs from the
 *   local entity (compared via stable serialization), and always set
 *   `baselineUpdates[key]` to the remote serialization — advancing the
 *   baseline first means applying these actions produces zero outbound ops.
 *
 * Baseline-removal sentinel: a `baselineUpdates` value of `''` (empty string)
 * means "remove this key from the baseline"; any other value means "set the
 * baseline for this key to this serialization". `serializeEntity` never
 * returns an empty string, so the sentinel is unambiguous.
 *
 * `expectedOwner` (optional) is a second line of defense for the owner-scoped
 * pull: the admin SELECT policy returns every member's rows, so if the
 * adapter's `.eq('owner', …)` filter ever regressed, an admin's pull would try
 * to merge foreign journals into their own. When `expectedOwner` is given, any
 * row whose `owner` differs is dropped here — no action, no baseline update —
 * so the pollution cannot reach the reducer regardless of the query.
 */
export function planInbound(
  data: AppData,
  remote: RemoteRow[],
  dirtyKeys: Set<string>,
  expectedOwner?: string,
): { actions: SyncAction[]; baselineUpdates: Record<string, string> } {
  const actions: SyncAction[] = [];
  const baselineUpdates: Record<string, string> = {};
  for (const row of remote) {
    if (expectedOwner !== undefined && row.owner !== undefined && row.owner !== expectedOwner) {
      continue;
    }
    const key = keyOf(row.table, row.id);
    if (dirtyKeys.has(key)) continue;
    const local = LOCAL[row.table](data, row.id);
    if (row.deleted_at !== null) {
      if (local) actions.push(deleteAction(row.table, row.id));
      baselineUpdates[key] = '';
    } else {
      const serialized = serializeEntity(row.data);
      if (!local || serializeEntity(local) !== serialized) {
        actions.push(saveAction(row.table, row.data));
      }
      baselineUpdates[key] = serialized;
    }
  }
  return { actions, baselineUpdates };
}
