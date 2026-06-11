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

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('database error')) {
    return 'That email is not on the invite list yet — ask an admin for an invite.';
  }
  if (m.includes('rate limit') || m.includes('rate_limit')) {
    return 'Too many sign-in attempts — wait a minute and try again.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'That does not look like a valid email address.';
  }
  return 'Could not send the sign-in link — please try again.';
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
      if (error) return { error: friendlyError(error.message) };
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
