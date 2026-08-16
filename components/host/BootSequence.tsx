"use client";

/**
 * ITQuest — DeskOS boot sequence
 * ==============================
 * The three seconds between "start" and a working desktop.
 *
 * ── WHY THE LINES ARE REAL ──────────────────────────────────────────────────
 *
 * The temptation with a boot screen is lorem-ipsum kernel noise, which anyone
 * who has actually watched a machine boot recognises instantly as fake. Every
 * line here names something the simulation genuinely has: the PoE budget, the
 * address space, the backup tier, the ticket queue. The boot is a table of
 * contents for the product, delivered while the player is already watching.
 *
 * ── TIMING IS DATA, NOT ANIMATION ───────────────────────────────────────────
 *
 * Each line carries its own `ms`, and the total is asserted in the spec to
 * stay under the budget. Staggering by index alone gives a metronome, which is
 * the other thing that reads as fake — real boots pause on the slow probes and
 * rattle through the fast ones. The variation is the authenticity.
 *
 * ── SKIPPING ────────────────────────────────────────────────────────────────
 *
 * A returning operator should never sit through this, so the skip is not just
 * a button: `hasBooted` in session storage means the whole sequence is
 * bypassed on any load after the first in a session. The button is there for
 * the first time, and Escape or any key works too — a boot screen that traps
 * you is a boot screen that gets hated by the third viewing.
 *
 * The animation is CSS keyframes with per-line delays. No JS timer drives the
 * text; a single timeout ends the sequence.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/ui/Logo";
import { BOOT_LINES, BOOT_TOTAL_MS, bootLineDelay } from "@/lib/host/boot";

const SESSION_KEY = "itquest-booted";

/** Has this browser session already shown the boot? */
export function hasBootedThisSession(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // Storage blocked: show the boot rather than suppress it. A boot the
    // operator did not need is a smaller failure than a desktop that never
    // arrives because the flag could not be read.
    return false;
  }
}

function markBooted(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* noop */
  }
}

export default function BootSequence({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  // Guards against the timeout and a keypress both finishing the sequence,
  // which would call `onDone` twice and remount the desktop mid-fade.
  const done = useRef(false);

  useEffect(() => {
    function finish() {
      if (done.current) return;
      done.current = true;
      markBooted();
      setLeaving(true);
      // Let the fade play out before handing the screen over.
      window.setTimeout(onDone, 260);
    }

    const timer = window.setTimeout(finish, BOOT_TOTAL_MS);
    const onKey = () => finish();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone]);

  function skip() {
    if (done.current) return;
    done.current = true;
    markBooted();
    onDone();
  }

  return (
    /*
     * `theme-dark` is pinned for the same reason the landing page pins it: a
     * machine POSTing is dark in every theme, and the neutral ramp inverts in
     * light mode — without this, a light-mode operator gets dark ink on the
     * near-black boot ground.
     */
    <div
      className={`theme-dark fixed inset-0 z-[10100] flex flex-col bg-[#04060d] font-mono text-[12px] text-slate-300 ${
        leaving ? "boot-leave" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-label="System starting"
    >
      {/* Faint scanline wash. A CRT tell, kept well under the text. */}
      <div aria-hidden="true" className="boot-scan pointer-events-none absolute inset-0 opacity-[0.06]" />

      <div className="relative flex min-h-0 flex-1 flex-col px-6 py-5 sm:px-10 sm:py-8">
        <header className="boot-line flex items-center gap-2.5 text-slate-200" style={{ animationDelay: "0ms" }}>
          <LogoMark size={20} className="text-[#67e8f9]" />
          <span className="font-sans text-[13px] font-semibold tracking-tight">
            <span className="font-bold">IT</span>
            <span className="font-normal opacity-90">Quest</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] text-slate-500">DeskOS 12 · v1.2.0-core</span>
        </header>

        <div className="mt-5 min-h-0 flex-1 space-y-[3px] overflow-hidden">
          {BOOT_LINES.map((line, i) => (
            <div
              key={line.label}
              className="boot-line flex items-baseline gap-2"
              style={{ animationDelay: `${bootLineDelay(i)}ms` }}
            >
              <span className="w-[4.5rem] shrink-0 text-slate-600">
                [{(bootLineDelay(i) / 1000).toFixed(2).padStart(5, " ")}]
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-400">{line.label}</span>
              <span
                className={
                  line.tone === "warn"
                    ? "shrink-0 text-[#fcd34d]"
                    : line.tone === "info"
                      ? "shrink-0 text-[#67e8f9]"
                      : "shrink-0 text-[#6ee7b7]"
                }
              >
                {line.status}
              </span>
            </div>
          ))}
        </div>

        <footer className="mt-4 flex items-center gap-3 border-t border-white/[0.07] pt-3">
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="boot-bar h-full rounded-full bg-gradient-to-r from-[#22d3ee] to-[#6366f1]" />
          </div>
          <button
            onClick={skip}
            className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 font-sans text-[11px] font-medium text-slate-400 transition hover:border-white/25 hover:text-slate-100"
          >
            Skip boot sequence
          </button>
        </footer>
      </div>
    </div>
  );
}
