/**
 * Pure sign-in messaging helpers — no React, no supabase, no browser globals,
 * so the fiddly string-matching is unit-tested (like src/lib/sync.ts). The auth
 * adapter (src/lib/auth.tsx) imports these.
 */

/** Map a Supabase auth error (message + optional code) to a human sentence. */
export function signInErrorMessage(message: string, code?: string): string {
  const m = (message || '').toLowerCase();
  const c = (code || '').toLowerCase();

  // Invite gate: the BEFORE INSERT trigger on auth.users rejects uninvited
  // signups as a generic "Database error saving new user" (docs/M3-SETUP.md).
  if (m.includes('database error') || c === 'unexpected_failure') {
    return 'That email is not on the invite list yet — ask an admin for an invite.';
  }
  // Wrong or expired 6-digit code (verifyOtp).
  if (
    c.includes('otp_expired') ||
    m.includes('token has expired') ||
    (m.includes('invalid') && (m.includes('token') || m.includes('otp')))
  ) {
    return 'That code is wrong or expired — double-check it, or request a new one.';
  }
  // Send cooldown / hourly cap (signInWithOtp). The wording varies and often
  // contains neither "rate limit" nor a code, so match several phrasings and
  // surface the exact wait when it's in the message.
  if (
    c.includes('over_email_send_rate_limit') ||
    c.includes('rate_limit') ||
    m.includes('rate limit') ||
    m.includes('rate_limit') ||
    m.includes('only request this') ||
    m.includes('security purposes')
  ) {
    const after = message.match(/after (\d+) seconds?/i);
    return after
      ? `Code already on its way — please wait ${after[1]}s before requesting another.`
      : 'Code already on its way — please wait a few seconds before requesting another.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'That does not look like a valid email address.';
  }
  // Unknown: surface the server's own (trimmed) message rather than a vague
  // generic, so the next surprise is at least legible.
  const detail = (message || '').trim().replace(/\s+/g, ' ').slice(0, 140);
  return detail ? `Sign-in failed — ${detail}` : 'Sign-in failed — please try again.';
}

/**
 * A failed magic-link landing arrives as URL params — implicit flow puts them
 * in the hash (`#error=…&error_code=…&error_description=…`); some paths use the
 * query string. Return a human message if an error is present, else null.
 * Pure: the caller passes the raw `location.hash` and `location.search`.
 */
export function authErrorFromUrl(hash: string, search: string): string | null {
  const params = (s: string) => new URLSearchParams(s.replace(/^[#?]/, ''));
  const h = params(hash);
  const q = params(search);
  const code = h.get('error_code') || q.get('error_code') || '';
  const err = h.get('error') || q.get('error') || '';
  if (!code && !err) return null;
  const desc = (h.get('error_description') || q.get('error_description') || '').replace(/\+/g, ' ');
  if (code.includes('otp_expired') || /expired|invalid/i.test(desc)) {
    return 'That sign-in link had already expired — enter a 6-digit code below instead, or request a new one.';
  }
  return desc || 'That sign-in link did not work — request a new code below instead.';
}
