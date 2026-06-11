import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { coalesceOp, diffSnapshots, planInbound, serializeEntity } from './sync';
import type { RemoteRow, SyncOp, SyncTable } from './sync';

/**
 * Thin sync adapter (M3, D1 in docs/M3-REVIEW.md). The pure semantics live
 * in `src/lib/sync.ts`; this file owns localStorage, the network, and the
 * dispatch loop. Everything is gated on `supabase && session` — logged out,
 * the provider renders children and touches nothing, so the local-only path
 * stays byte-identical.
 *
 * - Baseline + queue live under their own keys, never inside `keji-camper/v1`.
 * - On store data change: diff against the baseline, coalesce ops into the
 *   queue, flush when online. A `reset` clears baseline/queue without ops.
 * - syncNow = flush queue (per-op, sequential), then pull all three tables
 *   and apply via planInbound — baseline advances before dispatch, so an
 *   inbound apply produces zero outbound ops.
 * - Triggers: window `online`/`focus`, and sign-in. Runs never overlap
 *   (in-flight ref).
 */

export const BASELINE_KEY = 'keji-camper/sync-baseline/v1';
const QUEUE_KEY = 'keji-camper/sync-queue/v1';
const USER_KEY = 'keji-camper/sync-user/v1';
const TABLES: SyncTable[] = ['trips', 'memories', 'campers'];

export interface SyncStatus {
  syncNow: () => Promise<void>;
  pendingCount: number;
  lastSyncAt: string | null;
}

const INERT: SyncStatus = { syncNow: async () => {}, pendingCount: 0, lastSyncAt: null };

const Ctx = createContext<SyncStatus>(INERT);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('sync state not persisted', e);
  }
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { data, dispatch } = useStore();
  const { session } = useAuth();

  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const baselineRef = useRef<Record<string, string>>({});
  const queueRef = useRef<Record<string, SyncOp>>({});
  const loadedRef = useRef(false);
  const prevUserRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const dataRef = useRef(data);
  const sessionRef = useRef(session);
  dataRef.current = data;
  sessionRef.current = session;

  /**
   * Drain the queue per-op, sequentially. On confirmed success the entry is
   * removed (identity-checked, so an op coalesced mid-flight is kept and
   * resent) and the baseline advances. Stops on the first network/RLS error;
   * remaining ops wait for the next trigger.
   */
  const flushQueue = useCallback(async () => {
    if (!supabase) return;
    let progressed = true;
    while (progressed && Object.keys(queueRef.current).length > 0) {
      progressed = false;
      for (const key of Object.keys(queueRef.current)) {
        const op = queueRef.current[key];
        if (!op) continue;
        if (!sessionRef.current) return;
        const { error } =
          op.kind === 'upsert'
            ? await supabase
                .from(op.table)
                .upsert({ id: op.id, data: op.data }, { onConflict: 'owner,id' })
            : await supabase
                .from(op.table)
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', op.id);
        if (error) {
          setPendingCount(Object.keys(queueRef.current).length);
          return;
        }
        progressed = true;
        if (queueRef.current[key] === op) {
          const queue = { ...queueRef.current };
          delete queue[key];
          queueRef.current = queue;
          const baseline = { ...baselineRef.current };
          if (op.kind === 'upsert') baseline[key] = serializeEntity(op.data);
          else delete baseline[key];
          baselineRef.current = baseline;
          writeJson(QUEUE_KEY, queue);
          writeJson(BASELINE_KEY, baseline);
        }
      }
      setPendingCount(Object.keys(queueRef.current).length);
    }
  }, []);

  /**
   * Pull all three tables and apply via planInbound. Pending queue keys are
   * dirty (never clobbered); baseline updates are applied before dispatching
   * so the resulting data change diffs to zero outbound ops.
   */
  const pull = useCallback(async () => {
    if (!supabase || !sessionRef.current) return;
    const rows: RemoteRow[] = [];
    for (const table of TABLES) {
      const { data: fetched, error } = await supabase.from(table).select('id,data,deleted_at');
      if (error) return;
      for (const row of fetched ?? []) {
        rows.push({ table, id: row.id, data: row.data, deleted_at: row.deleted_at });
      }
    }
    const dirtyKeys = new Set(Object.keys(queueRef.current));
    const { actions, baselineUpdates } = planInbound(dataRef.current, rows, dirtyKeys);
    const baseline = { ...baselineRef.current };
    for (const [key, value] of Object.entries(baselineUpdates)) {
      if (value === '') delete baseline[key];
      else baseline[key] = value;
    }
    baselineRef.current = baseline;
    writeJson(BASELINE_KEY, baseline);
    for (const action of actions) dispatch(action);
    setLastSyncAt(new Date().toISOString());
  }, [dispatch]);

  /** Flush before pull, always; concurrent calls join the in-flight run. */
  const syncNow = useCallback(async () => {
    if (!supabase || !sessionRef.current) return;
    if (inFlightRef.current) {
      await inFlightRef.current;
      return;
    }
    const run = (async () => {
      await flushQueue();
      await pull();
    })();
    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  }, [flushQueue, pull]);

  // Outbound: diff the snapshot against the baseline on every data change.
  useEffect(() => {
    if (!supabase || !session) {
      prevUserRef.current = null;
      return;
    }
    if (!loadedRef.current) {
      loadedRef.current = true;
      baselineRef.current = readJson<Record<string, string>>(BASELINE_KEY, {});
      queueRef.current = readJson<Record<string, SyncOp>>(QUEUE_KEY, {});
      setPendingCount(Object.keys(queueRef.current).length);
    }
    // Sync state belongs to one account: a different user signing in on this
    // device must not diff against (or flush) the previous user's baseline —
    // that would emit spurious deletes for the old keys. Start them fresh.
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedUser !== session.user.id) {
      try {
        localStorage.setItem(USER_KEY, session.user.id);
      } catch (e) {
        console.warn('sync state not persisted', e);
      }
      if (storedUser !== null) {
        baselineRef.current = {};
        queueRef.current = {};
        writeJson(BASELINE_KEY, {});
        writeJson(QUEUE_KEY, {});
        setPendingCount(0);
      }
    }
    const justSignedIn = prevUserRef.current !== session.user.id;
    prevUserRef.current = session.user.id;

    const { ops, reset } = diffSnapshots(data, baselineRef.current);
    if (reset) {
      baselineRef.current = {};
      queueRef.current = {};
      writeJson(BASELINE_KEY, {});
      writeJson(QUEUE_KEY, {});
      setPendingCount(0);
      return;
    }
    if (ops.length > 0) {
      let queue = queueRef.current;
      for (const op of ops) queue = coalesceOp(queue, op);
      queueRef.current = queue;
      writeJson(QUEUE_KEY, queue);
      setPendingCount(Object.keys(queue).length);
    }
    // On sign-in the effect below runs the full flush-then-pull instead.
    if (
      !justSignedIn &&
      Object.keys(queueRef.current).length > 0 &&
      navigator.onLine &&
      !inFlightRef.current
    ) {
      const run = flushQueue();
      inFlightRef.current = run;
      run.finally(() => {
        inFlightRef.current = null;
      });
    }
  }, [data, session, flushQueue]);

  // Sign-in → full sync (the outbound effect above has already queued
  // anything dirty, so flush-before-pull covers the first-login upload).
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    void syncNow();
  }, [userId, syncNow]);

  // Reconnect / refocus → full sync.
  useEffect(() => {
    if (!supabase || !session) return;
    const onWake = () => {
      void syncNow();
    };
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [session, syncNow]);

  return <Ctx.Provider value={{ syncNow, pendingCount, lastSyncAt }}>{children}</Ctx.Provider>;
}

export function useSyncStatus(): SyncStatus {
  return useContext(Ctx);
}
