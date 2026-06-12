import { describe, expect, it } from 'vitest';
import { authErrorFromUrl, signInErrorMessage } from '../src/lib/authMessages';

describe('signInErrorMessage', () => {
  it('maps the invite-gate rejection (generic DB error) to an invite hint', () => {
    expect(signInErrorMessage('Database error saving new user')).toMatch(/invite list/i);
    expect(signInErrorMessage('', 'unexpected_failure')).toMatch(/invite list/i);
  });

  it('maps the send cooldown and surfaces the exact wait, despite odd wording', () => {
    // The real message contains neither "rate limit" nor "rate_limit".
    const msg = signInErrorMessage('For security purposes, you can only request this after 24 seconds.');
    expect(msg).toMatch(/wait 24s/i);
    // …and by error code alone.
    expect(signInErrorMessage('whatever', 'over_email_send_rate_limit')).toMatch(/wait a few seconds/i);
  });

  it('maps a wrong/expired 6-digit code', () => {
    expect(signInErrorMessage('Token has expired or is invalid')).toMatch(/wrong or expired/i);
    expect(signInErrorMessage('nope', 'otp_expired')).toMatch(/wrong or expired/i);
  });

  it('does not confuse the cooldown for an expired code (no false "wrong code")', () => {
    expect(signInErrorMessage('you can only request this after 9 seconds')).toMatch(/wait 9s/i);
  });

  it('flags an invalid email address', () => {
    expect(signInErrorMessage('Unable to validate email address: invalid format')).toMatch(/valid email/i);
  });

  it('surfaces an unknown server message instead of a vague generic', () => {
    expect(signInErrorMessage('Signups not allowed for this instance')).toMatch(/Signups not allowed/);
    expect(signInErrorMessage('')).toMatch(/please try again/i);
  });
});

describe('authErrorFromUrl', () => {
  it('returns null for a clean URL or a normal route hash', () => {
    expect(authErrorFromUrl('', '')).toBeNull();
    expect(authErrorFromUrl('#/admin', '')).toBeNull();
    expect(authErrorFromUrl('#/view/abc123', '')).toBeNull();
  });

  it('detects an expired magic-link landing in the hash and steers to codes', () => {
    const out = authErrorFromUrl(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      '',
    );
    expect(out).toMatch(/expired/i);
    expect(out).toMatch(/code/i);
  });

  it('also reads errors from the query string and decodes the description', () => {
    const out = authErrorFromUrl('', '?error=server_error&error_description=Something+broke');
    expect(out).toBe('Something broke');
  });
});
