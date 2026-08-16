"use client";

/**
 * ITQuest — Workstation sign-in
 * =============================
 * The screen between the boot sequence and the desktop.
 *
 * ── IT ADMITS WHAT IT IS ────────────────────────────────────────────────────
 *
 * The credential is printed on the card, and there is a one-click way past it.
 * A demo login that hides its own password is a puzzle nobody asked to solve —
 * the player is here to run an IT estate, not to guess. Showing it costs
 * nothing (there is no secret; see lib/host/auth.ts) and removes the single
 * most likely way for a first session to end early.
 *
 * The dev bypass is a separate, quieter control rather than the primary
 * button, so the intended path still reads as the intended path.
 *
 * ── AVATAR ──────────────────────────────────────────────────────────────────
 *
 * The existing `Avatar` component, which renders initials on a generated
 * gradient. No image is fetched — on a login screen that is the first thing
 * painted, a network round-trip for a face is a round-trip the operator waits
 * on before they can type.
 *
 * Pinned `theme-dark`: a lock screen is dark in every OS, and the neutral ramp
 * inverts in light mode — without the pin, a light-mode operator would get
 * dark ink on this dark ground, the same bug the terminals had.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { LogoMark } from "@/components/ui/Logo";
import { DEMO_PASSWORD, DEMO_USERNAME, useAuthStore } from "@/lib/host/auth";
import { savedProfile } from "@/lib/host/session";
import { IconChevronRight, IconLock, IconBolt } from "@/components/ui/icons";

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const signIn = useAuthStore((s) => s.signIn);
  const forceSignIn = useAuthStore((s) => s.forceSignIn);

  const [name, setName] = useState(DEMO_USERNAME);
  // Pre-filled on purpose: the brief asked for it, and a debugging loop that
  // stops to retype a known password twenty times a day is a tax on the work.
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState("indigo");

  useEffect(() => {
    // The saved operator's avatar, so returning to a save is recognisably
    // returning rather than starting again.
    try {
      setAvatar(savedProfile().avatar);
    } catch {
      /* no save yet — the default palette is correct */
    }
    passwordRef.current?.focus();
    passwordRef.current?.select();
  }, []);

  /*
   * No artificial "Signing in…" delay.
   *
   * `signIn` flips the store synchronously, so the shell swaps to the desktop
   * on the same tick and a busy state would never be painted — it would be
   * fake latency that nobody ever sees, which is the worst of both. If the
   * desktop's first mount ever becomes slow enough to need covering, the place
   * to cover it is the desktop, not a spinner on a form that has already
   * finished its job.
   */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const failure = signIn(name, password);
    if (failure) {
      setError(failure);
      passwordRef.current?.select();
      return;
    }
    setError(null);
    onSignedIn();
  }

  function bypass() {
    forceSignIn();
    onSignedIn();
  }

  return (
    <div className="theme-dark relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#04060d] font-sans text-slate-200">
      {/* Ambient wash — the same visual family as the boot screen it follows. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(79,87,246,0.20), transparent 60%)," +
            "radial-gradient(ellipse 60% 40% at 20% 100%, rgba(34,211,238,0.10), transparent 60%)",
        }}
      />

      <header className="absolute left-6 top-5 flex items-center gap-2.5 text-slate-300">
        <LogoMark size={20} className="text-[#67e8f9]" />
        <span className="text-[13px] font-semibold tracking-tight">
          <span className="font-bold">IT</span>
          <span className="font-normal opacity-90">Quest</span>
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-[11px] text-slate-500">DeskOS 12</span>
      </header>

      <form
        onSubmit={submit}
        className="rise-in relative w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#0a1120]/80 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <div className="flex flex-col items-center">
          <Avatar value={avatar} name={name || DEMO_USERNAME} className="h-16 w-16 text-lg" />
          <div className="mt-3 text-[15px] font-semibold text-white">{name || DEMO_USERNAME}</div>
          <div className="text-[11px] text-slate-500">IT Operations · local workstation</div>
        </div>

        <label className="mt-5 block">
          <span className="sr-only">Username</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            autoComplete="off"
            aria-label="Username"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[#67e8f9]/50 focus:bg-white/[0.06]"
            placeholder="Username"
          />
        </label>

        <label className="mt-2 block">
          <span className="sr-only">Password</span>
          <div className="relative">
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              aria-label="Password"
              aria-invalid={!!error}
              className={`w-full rounded-lg border bg-white/[0.04] px-3 py-2 pr-9 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:bg-white/[0.06] ${
                error ? "border-[#fda4af]/60" : "border-white/10 focus:border-[#67e8f9]/50"
              }`}
              placeholder="Password"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-600">
              <IconLock size={12} />
            </span>
          </div>
        </label>

        {/* Reserved height, so a wrong password does not shove the button down
            the screen mid-click. */}
        <div className="mt-1.5 min-h-[1rem] text-[11px] text-[#fda4af]" role="alert">
          {error}
        </div>

        <button
          type="submit"
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0a1120] transition hover:bg-slate-200 active:scale-[0.99]"
        >
          Sign in
          <IconChevronRight size={14} />
        </button>

        <div className="mt-4 border-t border-white/[0.07] pt-3">
          <button
            type="button"
            onClick={bypass}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition hover:border-white/25 hover:text-slate-100"
          >
            <IconBolt size={11} />
            Skip sign-in (development)
          </button>
          <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-600">
            Demo credentials — <span className="font-mono text-slate-500">{DEMO_USERNAME}</span> /{" "}
            <span className="font-mono text-slate-500">{DEMO_PASSWORD}</span>. There is no server;
            this screen is part of the simulation, not a security boundary.
          </p>
        </div>
      </form>
    </div>
  );
}
