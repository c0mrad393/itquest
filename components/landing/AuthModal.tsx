"use client";

/**
 * AuthModal — sign in / registration (Entry/Identity layer)
 * ---------------------------------------------------------
 * Email/password auth + Google OAuth as first-class actions, with a Guest
 * fallback. When Supabase env vars are absent the modal says so plainly and
 * Guest mode keeps the product usable.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setGodMode } from "@/lib/host/god-mode";
import { clearSave, setSaveScope } from "@/lib/persistence/save";
import { useAuthStore } from "@/lib/auth/store";
import { isSupabaseConfigured } from "@/lib/auth/supabase";
import { IconX } from "@/components/ui/icons";

type Mode = "signin" | "signup";

export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { signInWithPassword, signUp, signInWithGoogle, continueAsGuest, busy, error, clearError } =
    useAuthStore();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok =
      mode === "signin"
        ? await signInWithPassword(email, password)
        : await signUp(email, password, username.trim() || email.split("@")[0]);
    if (ok) router.push("/desktop");
  }

  /**
   * Both local-session entry points share one shape: flip the QA flag, wipe the
   * guest slot if the mode changed (a God Mode world and a normal world can't be
   * loaded into each other), sign in, and land on the desktop.
   */
  function localSession(godMode: boolean) {
    const changed = setGodMode(godMode);
    // Scope the wipe explicitly — continueAsGuest builds its profile from the
    // save it finds, so the slot has to be cleared before it runs.
    setSaveScope("guest");
    if (changed) clearSave();
    continueAsGuest();

    if (changed) {
      // The infra store builds its world at MODULE INIT (generateWorld runs in
      // the store initializer), which already happened on this landing page —
      // before the flag flipped. A client-side push would carry that stale
      // world over, so a mode change needs a real page load to rebuild it.
      window.location.assign("/desktop");
      return;
    }
    router.push("/desktop");
  }

  function switchMode(next: Mode) {
    setMode(next);
    clearError();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-2xl border border-edge bg-panel p-6 shadow-2xl shadow-black/60">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-edge hover:text-gray-200"
        >
          <IconX size={14} />
        </button>

        <div className="mb-5 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-info/20 text-lg text-info">
            ◈
          </div>
          <div className="text-base font-bold text-gray-100">
            {mode === "signin" ? "Sign in to TriageOS" : "Create your operator account"}
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            Your progression syncs to your account across devices.
          </div>
        </div>

        {/* Google OAuth — first-class */}
        <button
          onClick={() => void signInWithGoogle()}
          disabled={busy || !isSupabaseConfigured}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-edge bg-white/95 px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GoogleMark />
          Sign in with Google
        </button>

        <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-gray-600">
          <span className="h-px flex-1 bg-edge" /> or <span className="h-px flex-1 bg-edge" />
        </div>

        {/* Email / password */}
        <form onSubmit={submit} className="space-y-2.5">
          {mode === "signup" && (
            <Field
              label="Username"
              type="text"
              value={username}
              onChange={setUsername}
              placeholder="e.g. night-owl-ops"
              autoComplete="username"
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
          />

          {error && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              {error}
            </div>
          )}
          {!isSupabaseConfigured && (
            <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn">
              Supabase isn&apos;t configured (set NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY). Account
              auth is disabled — continue as Guest below.
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !isSupabaseConfigured}
            className="w-full rounded-lg bg-info px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {/* Mode switch + guest */}
        <div className="mt-4 space-y-2 text-center text-[11px] text-gray-500">
          {mode === "signin" ? (
            <div>
              New here?{" "}
              <button onClick={() => switchMode("signup")} className="font-semibold text-info hover:underline">
                Create an account
              </button>
            </div>
          ) : (
            <div>
              Already registered?{" "}
              <button onClick={() => switchMode("signin")} className="font-semibold text-info hover:underline">
                Sign in
              </button>
            </div>
          )}
          <div>
            <button
              onClick={() => localSession(false)}
              className="text-gray-400 hover:text-gray-200 hover:underline"
            >
              Continue as Guest (local session)
            </button>
          </div>
          {/* QA profile: every ticket unlocked, progression bypassed. */}
          <div>
            <button
              onClick={() => localSession(true)}
              title="Loads every ticket at once and bypasses XP progression"
              className="rounded border border-amber-500/40 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/10"
            >
              Continue as QA Tester (God Mode)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-lg border border-edge bg-panelalt px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-info"
      />
    </label>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.4 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.6l-7.7-6c-2.1 1.4-4.8 2.3-7.5 2.3-6.3 0-11.6-3.9-13.5-9.4l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
