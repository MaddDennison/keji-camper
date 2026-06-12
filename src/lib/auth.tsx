import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { authErrorFromUrl, signInErrorMessage } from './authMessages';

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
  /** Step 1: email a 6-digit sign-in code (Supabase OTP). */
  requestCode: (email: string) => Promise<{ error?: string }>;
  /** Step 2: verify the code; on success the session arrives via the listener. */
  verifyCode: (email: string, token: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Set when the app loads from a failed magic-link redirect (#error=…). */
  linkError: string | null;
  clearLinkError: () => void;
}

const INERT: AuthCtx = {
  session: null,
  profile: null,
  requestCode: async () => ({ error: 'Sync is not configured' }),
  verifyCode: async () => ({ error: 'Sync is not configured' }),
  signOut: async () => {},
  linkError: null,
  clearLinkError: () => {},
};

const Ctx = createContext<AuthCtx>(INERT);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  // A clicked-but-dead magic link redirects here with the error in the URL.
  // Surface it once (so the user isn't silently dumped on the form), then scrub
  // the auth params so it doesn't persist or re-fire on the next render.
  useEffect(() => {
    if (!supabase) return;
    const err = authErrorFromUrl(window.location.hash, window.location.search);
    if (!err) return;
    setLinkError(err);
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    window.history.replaceState({}, '', url.toString());
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

  const requestCode = async (email: string): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Sync is not configured' };
    try {
      // No emailRedirectTo: the user types the emailed code, they don't follow a
      // link — sidestepping link-scanner consumption and the in-app-browser trap.
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) return { error: signInErrorMessage(error.message, (error as { code?: string }).code) };
      return {};
    } catch {
      return { error: 'Could not send the code — check your connection and try again.' };
    }
  };

  const verifyCode = async (email: string, token: string): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Sync is not configured' };
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: 'email' });
      if (error) return { error: signInErrorMessage(error.message, (error as { code?: string }).code) };
      return {}; // success: the onAuthStateChange listener flips the session
    } catch {
      return { error: 'Could not verify the code — check your connection and try again.' };
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
  };

  const clearLinkError = () => setLinkError(null);

  return (
    <Ctx.Provider
      value={{ session, profile, requestCode, verifyCode, signOut, linkError, clearLinkError }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}
