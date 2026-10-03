"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  Session,
  User,
} from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;

  signIn: (
    email: string,
    password: string
  ) => Promise<{
    error: string | null;
  }>;

  signUp: (
    email: string,
    password: string
  ) => Promise<{
    error: string | null;
    needsEmailConfirmation: boolean;
  }>;

  signOut: () => Promise<{
    error: string | null;
  }>;

  sendPasswordReset: (
    email: string
  ) => Promise<{
    error: string | null;
  }>;
};

const AuthContext =
  createContext<AuthContextType | null>(
    null
  );

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [
    session,
    setSession,
  ] =
    useState<Session | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data,
      } =
        await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      setSession(
        data.session
      );

      setLoading(false);
    }

    loadSession();

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (event, newSession) => {
          if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
            // Handle recovery links sent before the dedicated page existed.
            window.setTimeout(() => window.location.assign("/reset-password"), 0);
          }
          setSession(
            newSession
          );

          setLoading(false);
        }
      );

    return () => {
      mounted = false;

      subscription.unsubscribe();
    };
  }, []);

  async function signIn(
    email: string,
    password: string
  ) {
    const {
      error,
    } =
      await supabase.auth.signInWithPassword(
        {
          email,
          password,
        }
      );

    return {
      error:
        error?.message ??
        null,
    };
  }

  async function signUp(
    email: string,
    password: string
  ) {
    const {
      data,
      error,
    } =
      await supabase.auth.signUp(
        {
          email,
          password,

          options: {
            emailRedirectTo:
              typeof window !==
              "undefined"
                ? `${window.location.origin}/user`
                : undefined,
          },
        }
      );

    return {
      error:
        error?.message ??
        null,

      needsEmailConfirmation:
        !error &&
        !data.session,
    };
  }

  async function signOut() {
    const {
      error,
    } =
      await supabase.auth.signOut();

    return {
      error:
        error?.message ??
        null,
    };
  }

  async function sendPasswordReset(
    email: string
  ) {
    const {
      error,
    } =
      await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo:
            typeof window !==
            "undefined"
              ? `${window.location.origin}/reset-password`
              : undefined,
        }
      );

    return {
      error:
        error?.message ??
        null,
    };
  }

  const value = useMemo(
    () => ({
      user:
        session?.user ??
        null,

      session,

      loading,

      signIn,
      signUp,
      signOut,
      sendPasswordReset,
    }),
    [
      session,
      loading,
    ]
  );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(
      AuthContext
    );

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}