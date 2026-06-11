import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { useSyncStatus } from '../lib/useSync';
import { supabase } from '../lib/supabase';

const BASELINE_KEY = 'keji-camper/sync-baseline/v1';

export default function AuthBar() {
  const { session } = useAuth();
  if (!supabase) return null;
  return session ? <SignedIn /> : <SignInForm />;
}

function SignInForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await signIn(addr);
      if (res?.error) setMsg({ ok: false, text: res.error });
      else setMsg({ ok: true, text: 'Check your inbox for the sign-in link.' });
    } catch {
      setMsg({ ok: false, text: 'Could not send the link. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex" onSubmit={submit}>
      <div className="field" style={{ marginBottom: 0 }}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button className="btn small" type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      {msg && <span className="muted small">{msg.ok ? msg.text : `⚠ ${msg.text}`}</span>}
      {!msg && <span className="muted small">Invite-only — sign-in works for invited emails.</span>}
    </form>
  );
}

function SignedIn() {
  const { session, profile, signOut } = useAuth();
  const { pendingCount, syncNow } = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [hasBaseline, setHasBaseline] = useState(
    () => localStorage.getItem(BASELINE_KEY) != null,
  );

  async function runSync() {
    if (busy) return;
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
      setHasBaseline(localStorage.getItem(BASELINE_KEY) != null);
    }
  }

  const name = profile?.display_name || session?.user?.email || 'camper';
  const emoji = profile?.emoji || '🏕';

  return (
    <div className="flex">
      <span className="chip">{emoji} {name}</span>
      <span className="chip muted">{pendingCount === 0 ? 'synced' : `${pendingCount} pending`}</span>
      <button className="btn small ghost" onClick={runSync} disabled={busy}>
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
      {!hasBaseline && (
        <button className="btn small" onClick={runSync} disabled={busy}>
          {busy ? 'Uploading…' : 'Upload my local journal'}
        </button>
      )}
      {profile?.role === 'admin' && (
        <a className="btn small ghost" href="#/admin">Admin</a>
      )}
      <button className="btn small ghost" onClick={() => signOut()}>Sign out</button>
    </div>
  );
}

export function NoticeBanner() {
  const { session } = useAuth();
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !session) {
      setBody(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('notices')
      .select('body')
      .eq('active', true)
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setBody(data && data[0] ? (data[0].body as string) : null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!supabase || !session || !body) return null;
  return <div className="notice">{body}</div>;
}
