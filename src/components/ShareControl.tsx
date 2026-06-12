import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useSyncStatus } from '../lib/useSync';
import { SITE_URL, supabase } from '../lib/supabase';
import { uid } from '../lib/format';
import { invitesRemaining, planShareBatch } from '../lib/social';
import type { ShareKind, ShareRecipient } from '../lib/social';
import {
  fetchShareContext, inviteNote, setBroadcast, submitShareBatch,
} from '../lib/useLogbook';
import type { ShareContext } from '../lib/useLogbook';

/**
 * "Share with campers" (M4): addressed offers to members, invite-a-friend by
 * email, and the cabin-logbook broadcast toggle — all on a thing the caller
 * owns. Renders nothing when logged out (the logged-out app is unchanged).
 *
 * The share references the CLOUD row, so we flush sync before offering —
 * an unsynced entity can't be offered (RLS checks the live row exists).
 */
export default function ShareControl({
  kind, entityId, entityName, memoryIds = [],
}: {
  kind: ShareKind;
  entityId: string;
  entityName: string;
  /** Linked memory ids (trips only) — offered as an opt-in bundle (P2). */
  memoryIds?: string[];
}) {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);
  if (!supabase || !session) return null;
  return (
    <>
      <button className="btn ghost small" onClick={() => setOpen(true)}>👥 Share with campers</button>
      {open && (
        <ShareDialog
          kind={kind} entityId={entityId} entityName={entityName} memoryIds={memoryIds}
          me={session.user.id} myName={profile?.display_name || session.user.email || 'A friend'}
          role={profile?.role} onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShareDialog({
  kind, entityId, entityName, memoryIds, me, myName, role, onClose,
}: {
  kind: ShareKind;
  entityId: string;
  entityName: string;
  memoryIds: string[];
  me: string;
  myName: string;
  role?: string;
  onClose: () => void;
}) {
  const { syncNow } = useSyncStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ctx, setCtx] = useState<ShareContext | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [emails, setEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [includeMemories, setIncludeMemories] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [copied, setCopied] = useState('');

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await syncNow(); // the offer references the cloud row — flush first
        const c = await fetchShareContext(kind, entityId, me, role);
        if (!cancelled) {
          setCtx(c);
          if (c.shared === null) {
            setError('This entry hasn’t synced yet — check your connection, then try again.');
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [kind, entityId, me, role, syncNow]);

  const addEmail = () => {
    const e = emailDraft.trim().toLowerCase();
    if (!e || !e.includes('@') || emails.includes(e)) return;
    setEmails([...emails, e]);
    setEmailDraft('');
  };

  const remaining = ctx ? invitesRemaining(ctx.unusedInviteEmails.length, ctx.isAdmin) : 0;
  const inviteBlocked = ctx ? (!ctx.openInvites && !ctx.isAdmin) : true;

  const share = async () => {
    if (!ctx || busy) return;
    setBusy(true);
    setError('');
    try {
      const recipients: ShareRecipient[] = [
        ...[...picked].map((profileId) => ({ profileId })),
        ...emails.map((email) => ({ email })),
      ];
      const plan = planShareBatch({
        kind, refId: entityId,
        bundleMemoryIds: includeMemories ? memoryIds : [],
        recipients,
        existingShares: ctx.myShares,
        existingInviteEmails: ctx.unusedInviteEmails,
        myProfileId: me,
        newId: uid,
      });
      await submitShareBatch(me, plan.shares, plan.inviteEmails);
      const sent = emails.length > 0 ? emails.map((e) => inviteNote(e, SITE_URL, myName)) : [];
      setNotes(sent);
      setPicked(new Set());
      setEmails([]);
      const c = await fetchShareContext(kind, entityId, me, role);
      setCtx(c);
      if (sent.length === 0) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleBroadcast = async () => {
    if (!ctx || ctx.shared === null || busy) return;
    setBusy(true);
    setError('');
    try {
      await setBroadcast(kind, entityId, me, !ctx.shared);
      setCtx({ ...ctx, shared: !ctx.shared });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (note: string, key: string) => {
    try {
      await navigator.clipboard.writeText(note);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      window.prompt('Copy this invite note:', note);
    }
  };

  const pendingShares = ctx?.myShares.filter((s) => s.kind === kind && !s.accepted_at && !s.dismissed_at) ?? [];

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <h3>Share “{entityName || (kind === 'trip' ? 'this trip' : 'this memory')}”</h3>
      <p className="tiny muted">
        Campers you share with get a read-only offer they can save a copy of — nothing is ever
        written into anyone’s journal but their own.
      </p>

      {!ctx && !error && <p className="small muted">Loading…</p>}
      {error && <p className="small muted">⚠️ {error}</p>}

      {ctx && ctx.shared !== null && (
        <>
          <div className="field">
            <label>Cabin logbook</label>
            <button className={`btn small ${ctx.shared ? 'secondary' : 'ghost'}`} disabled={busy} onClick={() => void toggleBroadcast()}>
              {ctx.shared ? '📖 In the logbook — tap to remove' : '📖 Show in the cabin logbook'}
            </button>
            <p className="tiny muted" style={{ marginTop: 4 }}>
              The logbook is visible to every signed-in member{kind === 'memory' ? ', photos included' : ''}.
            </p>
          </div>

          <div className="field">
            <label>Tag members</label>
            <div className="flex">
              {ctx.profiles.length === 0 && <span className="small muted">No other members yet.</span>}
              {ctx.profiles.map((p) => {
                const on = picked.has(p.id);
                return (
                  <button
                    key={p.id}
                    className={`btn small ${on ? 'secondary' : 'ghost'}`}
                    onClick={() => {
                      const next = new Set(picked);
                      if (on) next.delete(p.id); else next.add(p.id);
                      setPicked(next);
                    }}
                  >
                    {p.emoji || '🦫'} {p.display_name || 'Unnamed camper'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Invite a friend by email</label>
            {inviteBlocked ? (
              <p className="small muted">Member invites are switched off right now — ask the admin.</p>
            ) : (
              <>
                <div className="flex">
                  <input
                    type="email" value={emailDraft} placeholder="friend@example.com"
                    style={{ flex: 1, minWidth: 180 }}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                  />
                  <button className="btn small ghost" onClick={addEmail} disabled={!emailDraft.trim()}>+ Add</button>
                </div>
                <div className="flex" style={{ marginTop: 4 }}>
                  {emails.map((e) => (
                    <span key={e} className="chip muted" style={{ textTransform: 'none' }}>
                      {e}
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                        onClick={() => setEmails(emails.filter((x) => x !== e))} aria-label={`Remove ${e}`}
                      >✕</button>
                    </span>
                  ))}
                </div>
                <p className="tiny muted" style={{ marginTop: 4 }}>
                  {Number.isFinite(remaining)
                    ? `They’ll be able to sign in with this exact email. ${remaining} of your invites left.`
                    : 'They’ll be able to sign in with this exact email.'}
                </p>
              </>
            )}
          </div>

          {kind === 'trip' && memoryIds.length > 0 && (
            <div className="field">
              <label className="flex" style={{ gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={includeMemories}
                  onChange={(e) => setIncludeMemories(e.target.checked)}
                />
                <span className="small">
                  Include my {memoryIds.length} linked memor{memoryIds.length === 1 ? 'y' : 'ies'} (photos & stories travel too)
                </span>
              </label>
            </div>
          )}

          {pendingShares.length > 0 && (
            <p className="tiny muted">
              {pendingShares.length} offer{pendingShares.length === 1 ? '' : 's'} for this {kind} still pending.
            </p>
          )}

          {notes.length > 0 && (
            <div className="notice" style={{ marginBottom: 10 }}>
              <b>Invites created — send each friend their note:</b>
              {notes.map((n, i) => (
                <div key={i} className="flex" style={{ marginTop: 6 }}>
                  <span className="tiny" style={{ flex: 1 }}>{n}</span>
                  <button className="btn small ghost" onClick={() => void copy(n, String(i))}>
                    {copied === String(i) ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex" style={{ marginTop: 6 }}>
            <button
              className="btn" disabled={busy || (picked.size === 0 && emails.length === 0)}
              onClick={() => void share()}
            >
              {busy ? 'Sharing…' : 'Share'}
            </button>
            <button className="btn ghost" onClick={onClose}>Close</button>
          </div>
        </>
      )}
      {ctx && ctx.shared === null && (
        <div className="flex" style={{ marginTop: 6 }}>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      )}
    </dialog>
  );
}
