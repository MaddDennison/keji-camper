import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { BASELINE_KEY, useSyncStatus } from '../lib/useSync';
import { supabase } from '../lib/supabase';

export default function AuthBar() {
  const { session } = useAuth();
  if (!supabase) return null;
  return session ? <SignedIn /> : <SignInForm />;
}

function SignInForm() {
  const { requestCode, verifyCode, linkError, clearLinkError } = useAuth();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const addr = email.trim();
    if (!addr || busy) return;
    setBusy(true);
    setMsg(null);
    clearLinkError();
    try {
      const res = await requestCode(addr);
      if (res?.error) setMsg({ ok: false, text: res.error });
      else {
        setStage('code');
        setCode('');
        setMsg({ ok: true, text: `We emailed a 6-digit code to ${addr} — enter it below.` });
      }
    } catch {
      setMsg({ ok: false, text: 'Could not send the code. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await verifyCode(email.trim(), c);
      if (res?.error) setMsg({ ok: false, text: res.error });
      // success: the session flips and <SignedIn/> replaces this form.
    } catch {
      setMsg({ ok: false, text: 'Could not verify the code. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  const notice = msg ?? (linkError ? { ok: false, text: linkError } : null);

  if (stage === 'code') {
    return (
      <form className="flex" onSubmit={submitCode}>
        <div className="field" style={{ marginBottom: 0 }}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            placeholder="6-digit code"
            aria-label="6-digit sign-in code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        </div>
        <button className="btn small" type="submit" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify & sign in'}
        </button>
        <button
          type="button"
          className="btn small ghost"
          disabled={busy}
          onClick={() => sendCode()}
        >
          Resend
        </button>
        <button
          type="button"
          className="btn small ghost"
          disabled={busy}
          onClick={() => {
            setStage('email');
            setMsg(null);
          }}
        >
          Use a different email
        </button>
        {notice && <span className="muted small">{notice.ok ? notice.text : `⚠ ${notice.text}`}</span>}
      </form>
    );
  }

  return (
    <form className="flex" onSubmit={sendCode}>
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
        {busy ? 'Sending…' : 'Email me a sign-in code'}
      </button>
      <button
        type="button"
        className="btn small ghost"
        disabled={busy}
        onClick={() => {
          if (!email.trim()) {
            setMsg({ ok: false, text: 'Enter your email first, then your code.' });
            return;
          }
          // Jump straight to the code box without sending a new code — for when
          // a code already landed (a prior send, or an invite email).
          setMsg(null);
          clearLinkError();
          setCode('');
          setStage('code');
        }}
      >
        I have a code
      </button>
      {notice && <span className="muted small">{notice.ok ? notice.text : `⚠ ${notice.text}`}</span>}
      {!notice && <span className="muted small">Invite-only — sign-in works for invited emails.</span>}
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
