import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, SITE_URL } from './supabase';

/**
 * Auth context: magic-link session + own profiles row. Purely additive —
 * when `supabase` is null (env unset) the provider renders children
 * unchanged and useAuth() returns inert values, so the logged-out path is
 * byte-identical (docs/M3-REVIEW.md interface contract).
 */

export interface Profile {
  id: string;
  display_name: string;
  emoji: string;
  role: 'admin' | 'member';
  bio: string;
  deactivated_at: string | null;
  joined_at: string;
}

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const INERT: AuthCtx = {
  session: null,
  profile: null,
  signIn: async () => ({ error: 'Sync is not configured' }),
  signOut: async () => {},
};

const Ctx = createContext<AuthCtx>(INERT);

function friendlyError(message: string, code?: string): string {
  const m = message.toLowerCase();
  const c = (code ?? '').toLowerCase();
  if (m.includes('database error') || c.includes('unexpected_failure')) {
    return 'That email is not on the invite list yet — ask an admin for an invite.';
  }
  // Supabase's send cooldown / hourly cap. The message wording varies
  // ("For security purposes, you can only request this after N seconds.",
  // "email rate limit exceeded"), so match the code and several phrasings —
  // and surface the exact wait if it's in the message.
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
      ? `Link already on its way — please wait ${after[1]}s before requesting another.`
      : 'Link already on its way — please wait a few seconds before requesting another.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'That does not look like a valid email address.';
  }
  // Unknown error: surface the server's own message (trimmed) rather than a
  // vague generic, so the next surprise is at least legible.
  const detail = message.trim().replace(/\s+/g, ' ').slice(0, 140);
  return detail
    ? `Could not send the sign-in link — ${detail}`
    : 'Could not send the sign-in link — please try again.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, display_name, emoji, role, bio, deactivated_at, joined_at')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as Profile | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signIn = async (email: string): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Sync is not configured' };
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: SITE_URL },
      });
      if (error) return { error: friendlyError(error.message, (error as { code?: string }).code) };
      return {};
    } catch {
      return { error: 'Could not send the sign-in link — check your connection and try again.' };
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
  };

  return <Ctx.Provider value={{ session, profile, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}
