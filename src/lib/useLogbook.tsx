import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { uid } from './format';
import {
  planAcceptBundle,
  planForkMemory,
  planForkTrip,
  planInbox,
  planLogbook,
} from './social';
import type { InboxItem, LogbookCard, ShareKind, ShareRow, SharedRow } from './social';

/**
 * Thin social adapter (M4, docs/M4-REVIEW.md). The pure semantics live in
 * `src/lib/social.ts`; this file owns the network and the dispatch calls.
 *
 * This is the SEPARATE EPHEMERAL READ PATH the M4 invariants require: shared
 * and addressed rows are fetched here on focus (the AdminPage/NoticeBanner
 * pattern), held in component state only, and rendered read-only. They never
 * touch the reducer's persisted data, the sync baseline, or the queue — the
 * only writes to local state are the explicit fork actions a user dispatches
 * by accepting, and those land under their own identity like any other edit
 * (so the regular owner-scoped sync uploads them; no new write path).
 *
 * Everything is gated on `supabase && session`; logged out, every hook is
 * inert and every surface renders its gate card.
 */

export interface SocialProfile {
  id: string;
  display_name: string;
  emoji: string;
}

const ENTITY_COLS = 'owner,id,data,updated_at';

function toRows(kind: ShareKind, rows: { owner: string; id: string; data: unknown; updated_at: string | null }[] | null): SharedRow[] {
  return (rows ?? []).map((r) => ({ kind, owner: r.owner, id: r.id, data: r.data, updated_at: r.updated_at }));
}

export interface SocialState {
  loading: boolean;
  error: string;
  /** Broadcast cards, newest first (planLogbook). */
  logbook: LogbookCard[];
  /** Pending offers addressed to me, bundled (planInbox). */
  inbox: InboxItem[];
  /** id → profile, for author chips. */
  profiles: Map<string, SocialProfile>;
  /** Raw broadcast rows (for the passport overlay's cabinStampCounts). */
  broadcastRows: SharedRow[];
  refresh: () => Promise<void>;
  /** Fork an offer into my journal (fork-first, then mark accepted — D6). */
  accept: (item: InboxItem) => Promise<void>;
  dismiss: (item: InboxItem) => Promise<void>;
  /** Fork one broadcast card ("save a copy"). */
  saveCopy: (card: LogbookCard) => void;
}

const INERT: SocialState = {
  loading: false, error: '', logbook: [], inbox: [], profiles: new Map(),
  broadcastRows: [], refresh: async () => {}, accept: async () => {}, dismiss: async () => {}, saveCopy: () => {},
};

/** Full social read state for the Logbook page. Polls on focus/online. */
export function useSocial(): SocialState {
  const { data, dispatch } = useStore();
  const { session } = useAuth();
  const [state, setState] = useState<{
    loading: boolean; error: string; shares: ShareRow[]; refs: SharedRow[];
    broadcast: SharedRow[]; profiles: Map<string, SocialProfile>;
  }>({ loading: true, error: '', shares: [], refs: [], broadcast: [], profiles: new Map() });

  const dataRef = useRef(data);
  dataRef.current = data;
  const me = session?.user.id ?? null;

  const refresh = useCallback(async () => {
    if (!supabase || !me) return;
    try {
      const [profilesRes, sharesRes, tripsRes, memsRes] = await Promise.all([
        supabase.from('profiles').select('id, display_name, emoji'),
        supabase.from('shares').select('*').eq('to_profile', me),
        supabase.from('trips').select(ENTITY_COLS).eq('shared', true).is('deleted_at', null)
          .order('updated_at', { ascending: false }).limit(60),
        supabase.from('memories').select(ENTITY_COLS).eq('shared', true).is('deleted_at', null)
          .order('updated_at', { ascending: false }).limit(60),
      ]);
      const failed = [profilesRes, sharesRes, tripsRes, memsRes].find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);

      const shares = (sharesRes.data ?? []) as ShareRow[];
      const pending = shares.filter((s) => !s.accepted_at && !s.dismissed_at);

      // Resolve the rows the pending offers point at (the widened SELECT lets
      // me read rows addressed to me; match owner+id client-side).
      const tripIds = pending.filter((s) => s.kind === 'trip').map((s) => s.ref_id);
      const memIds = pending.filter((s) => s.kind === 'memory').map((s) => s.ref_id);
      const [refTrips, refMems] = await Promise.all([
        tripIds.length
          ? supabase.from('trips').select(ENTITY_COLS).in('id', tripIds).is('deleted_at', null)
          : Promise.resolve({ data: [], error: null }),
        memIds.length
          ? supabase.from('memories').select(ENTITY_COLS).in('id', memIds).is('deleted_at', null)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (refTrips.error) throw new Error(refTrips.error.message);
      if (refMems.error) throw new Error(refMems.error.message);

      const profiles = new Map<string, SocialProfile>();
      for (const p of (profilesRes.data ?? []) as SocialProfile[]) profiles.set(p.id, p);

      setState({
        loading: false,
        error: '',
        shares,
        refs: [...toRows('trip', refTrips.data), ...toRows('memory', refMems.data)],
        broadcast: [...toRows('trip', tripsRes.data), ...toRows('memory', memsRes.data)],
        profiles,
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [me]);

  useEffect(() => {
    if (!supabase || !me) return;
    void refresh();
    const onWake = () => void refresh();
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [me, refresh]);

  const accept = useCallback(async (item: InboxItem) => {
    if (!supabase || !me) return;
    // Fork locally FIRST (works offline, idempotent via provenance — D6),
    // then mark accepted; a failed mark just leaves the offer re-acceptable.
    const ctx = { selfProfileId: me, sharerProfileId: item.fromOwner, newId: uid };
    for (const action of planAcceptBundle(item.trip, item.memories, dataRef.current, ctx)) {
      dispatch(action);
    }
    const { error } = await supabase.from('shares')
      .update({ accepted_at: new Date().toISOString() })
      .in('id', item.shareIds);
    await refresh();
    if (error) {
      setState((s) => ({
        ...s,
        error: `Saved to your journal, but the offer couldn’t be marked accepted (${error.message}) — it will stay in the inbox; accepting again is safe.`,
      }));
    }
  }, [me, dispatch, refresh]);

  const dismiss = useCallback(async (item: InboxItem) => {
    if (!supabase || !me) return;
    const { error } = await supabase.from('shares')
      .update({ dismissed_at: new Date().toISOString() })
      .in('id', item.shareIds);
    await refresh();
    if (error) {
      setState((s) => ({ ...s, error: `Couldn’t dismiss the offer: ${error.message}` }));
    }
  }, [me, refresh]);

  const saveCopy = useCallback((card: LogbookCard) => {
    if (!me) return;
    const ctx = { selfProfileId: me, sharerProfileId: card.row.owner, newId: uid };
    const plan = card.row.kind === 'trip'
      ? planForkTrip(card.row, dataRef.current, ctx)
      : planForkMemory(card.row, dataRef.current, ctx);
    dispatch(plan.action);
  }, [me, dispatch]);

  const logbook = useMemo(
    () => (me ? planLogbook(state.broadcast, data, me) : []),
    [state.broadcast, data, me],
  );
  const inbox = useMemo(() => planInbox(state.shares, state.refs), [state.shares, state.refs]);

  if (!supabase || !me) return INERT;
  return {
    loading: state.loading,
    error: state.error,
    logbook,
    inbox,
    profiles: state.profiles,
    broadcastRows: state.broadcast,
    refresh,
    accept,
    dismiss,
    saveCopy,
  };
}

/** All member profiles (session-gated, one fetch) — for the crew "claim" UI. */
export function useProfiles(): SocialProfile[] {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);

  useEffect(() => {
    if (!supabase || !session) {
      setProfiles([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, display_name, emoji')
      .then(({ data: rows }) => {
        if (!cancelled) setProfiles((rows ?? []) as SocialProfile[]);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return profiles;
}

/** Lightweight pending-offer count for the AuthBar pill. Polls on focus. */
export function useInboxCount(): number {
  const { session } = useAuth();
  const [count, setCount] = useState(0);
  const me = session?.user.id ?? null;

  useEffect(() => {
    if (!supabase || !me) {
      setCount(0);
      return;
    }
    const poll = async () => {
      const { count: n } = await supabase!
        .from('shares')
        .select('id', { count: 'exact', head: true })
        .eq('to_profile', me)
        .is('accepted_at', null)
        .is('dismissed_at', null);
      setCount(n ?? 0);
    };
    void poll();
    const onWake = () => void poll();
    window.addEventListener('focus', onWake);
    return () => window.removeEventListener('focus', onWake);
  }, [me]);

  return count;
}

/* ------------------------------------------------ share-control helpers -- */

export interface ShareContext {
  profiles: SocialProfile[];
  /** My already-sent shares for this entity (de-dupe + "pending" display). */
  myShares: ShareRow[];
  /** Emails of my outstanding unused invites. */
  unusedInviteEmails: string[];
  openInvites: boolean;
  isAdmin: boolean;
  /** The entity row's broadcast flag (null = row not in the cloud yet). */
  shared: boolean | null;
}

export async function fetchShareContext(
  kind: ShareKind,
  refId: string,
  me: string,
  role: string | undefined,
): Promise<ShareContext> {
  if (!supabase) throw new Error('Sync is not configured');
  const table = kind === 'trip' ? 'trips' : 'memories';
  const [profilesRes, sharesRes, invitesRes, configRes, rowRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, emoji').is('deactivated_at', null),
    supabase.from('shares').select('*').eq('from_owner', me).eq('kind', kind).eq('ref_id', refId),
    supabase.from('invites').select('email').eq('created_by', me).is('used_at', null),
    supabase.from('app_config').select('open_invites').limit(1),
    supabase.from(table).select('shared').eq('owner', me).eq('id', refId).maybeSingle(),
  ]);
  const failed = [profilesRes, sharesRes, invitesRes, configRes, rowRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    profiles: ((profilesRes.data ?? []) as SocialProfile[]).filter((p) => p.id !== me),
    myShares: (sharesRes.data ?? []) as ShareRow[],
    unusedInviteEmails: ((invitesRes.data ?? []) as { email: string }[]).map((i) => i.email),
    openInvites: ((configRes.data ?? [])[0] as { open_invites: boolean } | undefined)?.open_invites ?? false,
    isAdmin: role === 'admin',
    shared: (rowRes.data as { shared: boolean } | null)?.shared ?? null,
  };
}

/** Insert the planned invite + share rows. Throws with a legible message. */
export async function submitShareBatch(
  me: string,
  shares: { kind: ShareKind; ref_id: string; to_profile: string | null; to_email: string | null; bundle_id: string | null }[],
  inviteEmails: string[],
): Promise<void> {
  if (!supabase) throw new Error('Sync is not configured');
  if (inviteEmails.length > 0) {
    const { error } = await supabase
      .from('invites')
      .insert(inviteEmails.map((email) => ({ email, created_by: me })));
    if (error) {
      throw new Error(
        error.message.includes('row-level security')
          ? 'Invite not allowed — you may have hit your invite limit, or member invites are switched off.'
          : error.message,
      );
    }
  }
  if (shares.length > 0) {
    const { error } = await supabase.from('shares').insert(shares);
    if (error) {
      throw new Error(
        error.code === '23505' ? 'Already shared with one of those campers.' : error.message,
      );
    }
  }
}

/** Toggle the broadcast flag — the dedicated write D3 requires. */
export async function setBroadcast(kind: ShareKind, refId: string, me: string, value: boolean): Promise<void> {
  if (!supabase) throw new Error('Sync is not configured');
  const table = kind === 'trip' ? 'trips' : 'memories';
  const { error } = await supabase.from(table).update({ shared: value }).eq('owner', me).eq('id', refId);
  if (error) throw new Error(error.message);
}

/**
 * The copyable invite note (P3) — the single source for both the AdminPage
 * and ShareControl flows. No hardcoded code length — it's configurable
 * (M3 gotcha). `fromName` adds the "something is waiting" line for invites
 * minted alongside a share.
 */
export function inviteNote(email: string, siteUrl: string, fromName?: string): string {
  return (
    `You're invited to Keji Camper 🛶 — open ${siteUrl}, hit "Sign in", and use this exact email address: ${email}. ` +
    `We'll email you a sign-in code — type it in (there's an "I have a code" button if you already got it). No password needed.` +
    (fromName ? ` ${fromName} shared a trip with you; it'll be waiting in your logbook.` : '')
  );
}
