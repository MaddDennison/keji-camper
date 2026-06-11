import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { SITE_URL, supabase } from '../lib/supabase';

type Db = NonNullable<typeof supabase>;

interface ProfileRow {
  id: string;
  display_name: string | null;
  emoji: string | null;
  role: string;
  deactivated_at: string | null;
  joined_at: string | null;
}

interface ContentRow {
  id: string;
  owner: string;
  data: unknown;
  updated_at: string | null;
  deleted_at: string | null;
}

interface InviteRow {
  code: string;
  email: string;
  created_by: string | null;
  used_by: string | null;
  used_at: string | null;
  created_at: string | null;
}

interface NoticeRow {
  id: string;
  body: string;
  active: boolean;
  created_at: string | null;
}

export default function AdminPage() {
  const { session, profile } = useAuth();

  if (!supabase) {
    return (
      <main className="page">
        <div className="empty-state card">
          <div className="big">🔌</div>
          <p><b>Sync is not configured</b></p>
          <p className="small">This deployment has no cloud backend, so there is nothing to administer.</p>
        </div>
      </main>
    );
  }

  if (!session || profile?.role !== 'admin') {
    return (
      <main className="page">
        <div className="empty-state card">
          <div className="big">🔒</div>
          <p><b>Admins only</b></p>
          <p className="small">Sign in with an admin account to manage members, invites, and content.</p>
        </div>
      </main>
    );
  }

  return <AdminInner db={supabase} me={session.user.id} />;
}

function AdminInner({ db, me }: { db: Db; me: string }) {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [trips, setTrips] = useState<ContentRow[]>([]);
  const [memories, setMemories] = useState<ContentRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [notice, setNotice] = useState<NoticeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, t, m, i, n] = await Promise.all([
        db.from('profiles').select('id, display_name, emoji, role, deactivated_at, joined_at').order('joined_at', { ascending: true }),
        db.from('trips').select('id, owner, data, updated_at, deleted_at'),
        db.from('memories').select('id, owner, data, updated_at, deleted_at'),
        db.from('invites').select('code, email, created_by, used_by, used_at, created_at').order('created_at', { ascending: false }),
        db.from('notices').select('id, body, active, created_at').eq('active', true).order('created_at', { ascending: false }).limit(1),
      ]);
      const failed = [p, t, m, i, n].find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      setProfiles((p.data ?? []) as ProfileRow[]);
      setTrips((t.data ?? []) as ContentRow[]);
      setMemories((m.data ?? []) as ContentRow[]);
      setInvites((i.data ?? []) as InviteRow[]);
      setNotice(((n.data ?? [])[0] ?? null) as NoticeRow | null);
    } catch (err) {
      setError(`Couldn’t load admin data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError('');
    try {
      const { error: err } = await fn();
      if (err) setError(err.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    await load();
    setBusy(false);
  }, [load]);

  return (
    <main className="page">
      <div className="section-head">
        <h2>Park warden</h2>
        <span className="sub">members, invites, content & notices</span>
      </div>

      {loading && <p className="small muted">Loading admin data…</p>}
      {error && <p className="small muted">⚠️ {error}</p>}

      <MembersSection profiles={profiles} trips={trips} memories={memories} me={me} busy={busy} run={run} db={db} />
      <InvitesSection invites={invites} me={me} busy={busy} run={run} db={db} />
      <ContentSection profiles={profiles} trips={trips} memories={memories} busy={busy} run={run} db={db} />
      <NoticeSection notice={notice} busy={busy} run={run} db={db} />
    </main>
  );
}

/* ---------- members ---------- */

function MembersSection({
  profiles, trips, memories, me, busy, run, db,
}: {
  profiles: ProfileRow[];
  trips: ContentRow[];
  memories: ContentRow[];
  me: string;
  busy: boolean;
  run: (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<void>;
  db: Db;
}) {
  const counts = useMemo(() => {
    const map = new Map<string, { trips: number; memories: number }>();
    const bump = (owner: string, key: 'trips' | 'memories') => {
      const c = map.get(owner) ?? { trips: 0, memories: 0 };
      c[key] += 1;
      map.set(owner, c);
    };
    for (const t of trips) if (!t.deleted_at) bump(t.owner, 'trips');
    for (const m of memories) if (!m.deleted_at) bump(m.owner, 'memories');
    return map;
  }, [trips, memories]);

  return (
    <>
      <div className="section-head"><h2>Members</h2><span className="sub">{profiles.length} signed up</span></div>
      <div className="card">
        {profiles.length === 0 && <p className="small muted">No members yet.</p>}
        {profiles.map((p) => {
          const c = counts.get(p.id) ?? { trips: 0, memories: 0 };
          const deactivated = !!p.deactivated_at;
          return (
            <div key={p.id} className="flex" style={{ padding: '6px 0', opacity: deactivated ? 0.55 : 1 }}>
              <span>{p.emoji || '🦫'} <b>{p.display_name || 'Unnamed camper'}</b></span>
              <span className="chip muted">{p.role}</span>
              {deactivated && <span className="chip muted">deactivated</span>}
              <span className="small muted">{c.trips} trips · {c.memories} memories</span>
              {p.id !== me && (
                <button
                  className={`btn small right ${deactivated ? 'secondary' : 'danger'}`}
                  disabled={busy}
                  onClick={() => run(() => db.rpc('admin_set_deactivated', { target: p.id, deact: !deactivated }))}
                >{deactivated ? 'Reactivate' : 'Deactivate'}</button>
              )}
            </div>
          );
        })}
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Counts cover trips and memories visible to admins. Crew lists are owner-private and not counted.
        </p>
      </div>
    </>
  );
}

/* ---------- invites ---------- */

function inviteNote(email: string): string {
  return `You’re invited to Keji Camper 🛶 — open ${SITE_URL}, hit “Sign in”, and use this exact email address: ${email}. A magic link will land in your inbox; no password needed.`;
}

function InvitesSection({
  invites, me, busy, run, db,
}: {
  invites: InviteRow[];
  me: string;
  busy: boolean;
  run: (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<void>;
  db: Db;
}) {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState('');

  const create = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    await run(() => db.from('invites').insert({ email: addr, created_by: me }));
    setEmail('');
  };

  const copyNote = async (inv: InviteRow) => {
    try {
      await navigator.clipboard.writeText(inviteNote(inv.email));
      setCopied(inv.code);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      window.prompt('Copy this invite note:', inviteNote(inv.email));
    }
  };

  return (
    <>
      <div className="section-head"><h2>Invites</h2><span className="sub">signups are invite-only</span></div>
      <div className="card">
        <div className="flex">
          <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label>Friend’s email</label>
            <input
              type="email" value={email} placeholder="friend@example.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
            />
          </div>
          <button className="btn" disabled={busy || !email.trim()} onClick={() => void create()}>Create invite</button>
        </div>
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          The email is the gate — they must sign in with exactly that address.
        </p>
        <hr className="hr-stitch" />
        {invites.length === 0 && <p className="small muted">No invites yet.</p>}
        {invites.map((inv) => (
          <div key={inv.code} className="flex" style={{ padding: '6px 0' }}>
            <span className="small"><b>{inv.email}</b></span>
            <span className="chip muted">{inv.code}</span>
            {inv.used_by
              ? <span className="chip muted">used{inv.used_at ? ` ${inv.used_at.slice(0, 10)}` : ''}</span>
              : <span className="chip muted">unused</span>}
            {!inv.used_by && (
              <button className="btn ghost small right" disabled={busy} onClick={() => void copyNote(inv)}>
                {copied === inv.code ? '✓ Copied' : '📋 Copy invite note'}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- content ---------- */

function rowLabel(row: ContentRow, kind: 'trip' | 'memory'): { title: string; date: string } {
  const d = (row.data && typeof row.data === 'object' ? row.data : {}) as Record<string, unknown>;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return '';
  };
  const title = kind === 'trip'
    ? (pick('name', 'title') || 'Unnamed trip')
    : (pick('title', 'name') || 'Untitled memory');
  const date = kind === 'trip' ? pick('startDate', 'date') : pick('date', 'startDate');
  return { title, date: date.slice(0, 10) };
}

function ContentSection({
  profiles, trips, memories, busy, run, db,
}: {
  profiles: ProfileRow[];
  trips: ContentRow[];
  memories: ContentRow[];
  busy: boolean;
  run: (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<void>;
  db: Db;
}) {
  const [selected, setSelected] = useState('');
  const owner = selected || profiles[0]?.id || '';

  const setDeleted = (tbl: 'trips' | 'memories', row: ContentRow, del: boolean) =>
    run(() => db.rpc('admin_set_deleted', { tbl, target_owner: row.owner, target_id: row.id, del }));

  const renderRows = (rows: ContentRow[], kind: 'trip' | 'memory', tbl: 'trips' | 'memories') => {
    const mine = rows
      .filter((r) => r.owner === owner)
      .sort((a, b) => rowLabel(b, kind).date.localeCompare(rowLabel(a, kind).date));
    if (mine.length === 0) return <p className="small muted">No {kind === 'trip' ? 'trips' : 'memories'}.</p>;
    return mine.map((r) => {
      const { title, date } = rowLabel(r, kind);
      const dead = !!r.deleted_at;
      return (
        <div key={r.id} className="flex" style={{ padding: '4px 0', opacity: dead ? 0.55 : 1 }}>
          <span className="small"><b>{title}</b>{date && <span className="muted"> · {date}</span>}</span>
          {dead && <span className="chip muted">deleted</span>}
          <button
            className={`btn small right ${dead ? 'secondary' : 'ghost'}`}
            disabled={busy}
            onClick={() => void setDeleted(tbl, r, !dead)}
          >{dead ? 'Restore' : 'Soft-delete'}</button>
        </div>
      );
    });
  };

  return (
    <>
      <div className="section-head"><h2>Content</h2><span className="sub">per-member moderation</span></div>
      <div className="card">
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Member</label>
          <select value={owner} onChange={(e) => setSelected(e.target.value)}>
            {profiles.length === 0 && <option value="">— no members —</option>}
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.emoji || '🦫'} {p.display_name || 'Unnamed camper'}</option>
            ))}
          </select>
        </div>
        {owner && (
          <>
            <p className="small" style={{ margin: '4px 0' }}><b>Trips</b></p>
            {renderRows(trips, 'trip', 'trips')}
            <hr className="hr-stitch" />
            <p className="small" style={{ margin: '4px 0' }}><b>Memories</b></p>
            {renderRows(memories, 'memory', 'memories')}
          </>
        )}
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Soft-deletes are tombstones — the owner’s device removes the entry on its next sync, and Restore brings it back.
        </p>
      </div>
    </>
  );
}

/* ---------- notice ---------- */

function NoticeSection({
  notice, busy, run, db,
}: {
  notice: NoticeRow | null;
  busy: boolean;
  run: (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<void>;
  db: Db;
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => { setDraft(notice?.body ?? ''); }, [notice]);

  const save = () =>
    run(async () => {
      const off = await db.from('notices').update({ active: false }).eq('active', true);
      if (off.error) return off;
      return db.from('notices').insert({ body: draft.trim(), active: true });
    });

  const clear = () => run(() => db.from('notices').update({ active: false }).eq('active', true));

  return (
    <>
      <div className="section-head"><h2>Notice</h2><span className="sub">banner shown to signed-in campers</span></div>
      <div className="card">
        <div className="field">
          <label>Broadcast notice</label>
          <textarea
            value={draft}
            placeholder="Fire ban lifted — see you out there 🔥"
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <div className="flex">
          <button className="btn" disabled={busy || !draft.trim()} onClick={() => void save()}>Publish notice</button>
          <button className="btn ghost" disabled={busy || !notice} onClick={() => void clear()}>Clear notice</button>
          {notice
            ? <span className="small muted right">Live since {notice.created_at?.slice(0, 10) ?? '—'}</span>
            : <span className="small muted right">No active notice.</span>}
        </div>
      </div>
    </>
  );
}
