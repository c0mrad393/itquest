"use client";

/**
 * ITQuest — Landing page
 * =======================
 * The thirty seconds before anyone plays anything. Its whole job is to make
 * the DEPTH legible: this is not a clicker with server graphics, it is a
 * simulation with a power budget, an address space and a disaster-recovery
 * sequence you can get wrong.
 *
 * ── WHY THIS PAGE COMMITS TO DARK ───────────────────────────────────────────
 *
 * Every other surface in the product follows the operator's theme, and this
 * one deliberately does not. The theme is a preference belonging to a signed-in
 * operator; a visitor who has never launched the simulator has not expressed
 * one, and the landing page is a single authored composition rather than a
 * workspace. So it paints its own ground explicitly, and pins the theme on its
 * root container so nothing underneath it can flip. Both of those are wrong
 * anywhere else in this codebase and right here; the two comments below say
 * exactly why, so nobody "fixes" them later.
 *
 * ── THE BENTO GRID IS ASYMMETRIC ON PURPOSE ─────────────────────────────────
 *
 * Six equal cards read as a feature list, which is what the page had and what
 * made it feel thin. Alternating wide and narrow — 2-1, 1-2, 2-1 across three
 * columns — makes the grid say something before a word of it is read: these
 * are not six equivalent bullet points.
 *
 * The spans must total a multiple of three. They did not at first (8 cells in
 * a 3-column grid), which left a hole in the bottom-right corner that read as
 * an unfinished layout rather than a deliberate one. Anyone adding a seventh
 * card has to re-balance the whole set, not append to it.
 *
 * ── ANIMATION ───────────────────────────────────────────────────────────────
 *
 * Real keyframes in globals.css, not `animate-in`: that utility ships with
 * tailwindcss-animate, which this project does not install, so those classes
 * would have compiled to nothing at all. Everything here also collapses under
 * `prefers-reduced-motion`.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSavedGame, savedProfile, useSessionStore } from "@/lib/host/session";
import {
  IconActivity,
  IconBolt,
  IconCheck,
  IconLock,
  IconCart,
  IconChevronRight,
  IconShield,
  IconSwitch,
  IconTicket,
  IconWrench,
} from "@/components/ui/icons";

const VERSION = "v1.2.0-core";

/**
 * The bento cards.
 *
 * `span` is the grid weight; `accent` keys into ACCENT below for the icon, its
 * glow and the hairline. The keys name the SUBJECT rather than the hue, so
 * re-colouring a card never means renaming what it is about. Kept as data so
 * the grid below stays a layout rather than six hand-placed blocks.
 */
const PILLARS = [
  {
    icon: IconTicket,
    title: "Dynamic Ticketing & Tiers",
    body:
      "A live event engine raises work continuously, scaled to the size of the company. Cascade failures put the reported symptom two steps downstream of the actual fault, so the job is diagnosis before action.",
    stats: ["4 tiers", "200+ classes", "Cascade chains"],
    span: "lg:col-span-2",
    accent: "ticketing",
  },
  {
    icon: IconShield,
    title: "Disaster Recovery",
    body:
      "Ransomware that spreads on a live network. Isolate, wipe, restore — in that order, or the clean copy goes back under the same key. On-premises backups get encrypted too; offsite is the tier that survives.",
    stats: ["Isolate / Wipe / Restore", "Offsite tiers", "Permanent loss"],
    span: "",
    accent: "recovery",
  },
  {
    icon: IconWrench,
    title: "Hardware Lab",
    body:
      "Open the chassis. Pull the baffle, seat the DIMM, drive the screws, flash the BIOS, image the disk. Tickets deep-link straight to the device that needs the part.",
    stats: ["Component-level", "BIOS & imaging", "Deep-linked"],
    span: "",
    accent: "hardware",
  },
  {
    icon: IconSwitch,
    title: "Network Architecture",
    body:
      "Managed PoE switches with a real power budget that sheds ports when you overload it. Bit-exact addressing with conflict detection, rogue DHCP hunts, and video traffic that genuinely saturates an undersized uplink.",
    stats: ["PoE budgets", "IPAM & conflicts", "Congestion"],
    span: "lg:col-span-2",
    accent: "network",
  },
  {
    icon: IconActivity,
    title: "Estate Monitoring",
    body:
      "Live telemetry across the estate, with a health score that compounds faults rather than hiding them behind an average. Every reading derives from the same state the panels act on.",
    stats: ["Real-time", "Health scoring", "Topology"],
    span: "lg:col-span-2",
    accent: "telemetry",
  },
  {
    icon: IconCart,
    title: "Marketplace & Economy",
    body:
      "Every fix has a price. Buy the parts, license the tooling, size the backup tier — on a budget that has to cover the next incident too.",
    stats: ["Procurement", "Licensing", "Budget"],
    span: "",
    accent: "economy",
  },
] as const;

/**
 * The six card accents, as LITERAL hexes rather than palette utilities.
 *
 * This looks like a step backwards and is not. v0.9.1 folded the raw Tailwind
 * families onto the five semantic ones, so `cyan`, `sky`, `indigo` and `blue`
 * are now four names for `--info-*` — one single blue. Written with utilities,
 * three of the six cards below painted the identical colour and the hero's
 * three-stop gradient really had two. Measured on the live page: cyan, indigo
 * and sky all returned rgb(130, 183, 255).
 *
 * That collapse is correct everywhere else — a status colour should have one
 * meaning and one value. It is wrong here, because these are not statuses.
 * Nothing on this page reports a condition; the colours are decoration that
 * has to stay distinguishable at a glance, which is exactly the job the
 * semantic ramp refuses to do. So the marketing surface opts out and names its
 * own inks, while every operational surface keeps inheriting.
 *
 * Tailwind cannot see interpolated class names, so each string is written out
 * whole rather than assembled from the key.
 *
 * DELIBERATELY UNANNOTATED. A `Record<string, …>` here would type every string
 * as a valid key, and the lookup below would hand back `undefined` for a typo —
 * which is not a wrong colour, it is a crash on `a.ring` that takes the whole
 * page down. Inferring the literal keys instead makes a mismatch between a
 * card's `accent` and this map a compile error, which is where it belongs.
 */
const ACCENT = {
  ticketing: { text: "text-[#67e8f9]", glow: "bg-[#22d3ee]/20", ring: "group-hover:border-[#22d3ee]/40", chip: "text-[#a5f3fc]/70" },
  recovery: { text: "text-[#fda4af]", glow: "bg-[#f43f5e]/20", ring: "group-hover:border-[#fb7185]/40", chip: "text-[#fecdd3]/70" },
  hardware: { text: "text-[#fcd34d]", glow: "bg-[#f59e0b]/20", ring: "group-hover:border-[#fbbf24]/40", chip: "text-[#fde68a]/70" },
  network: { text: "text-[#a5b4fc]", glow: "bg-[#6366f1]/25", ring: "group-hover:border-[#818cf8]/40", chip: "text-[#c7d2fe]/70" },
  economy: { text: "text-[#6ee7b7]", glow: "bg-[#10b981]/20", ring: "group-hover:border-[#34d399]/40", chip: "text-[#a7f3d0]/70" },
  telemetry: { text: "text-[#c4b5fd]", glow: "bg-[#8b5cf6]/20", ring: "group-hover:border-[#a78bfa]/40", chip: "text-[#ddd6fe]/70" },
};

export default function LandingPage() {
  const router = useRouter();
  const startNewGame = useSessionStore((s) => s.startNewGame);
  const [saved, setSaved] = useState<{ level: number; username: string } | null>(null);

  // Read after mount — the save lives in localStorage, which does not exist
  // during SSR.
  useEffect(() => {
    if (!hasSavedGame()) return;
    const p = savedProfile();
    setSaved({ level: p.level, username: p.username });
  }, []);

  /**
   * A new game wipes the slot and does a REAL page load.
   *
   * `generateWorld` runs in the infra store's initializer, which already ran
   * on this landing page. A client-side push would carry that world into the
   * desktop; only a document load rebuilds it.
   */
  function startGame() {
    startNewGame();
    window.location.assign("/desktop");
  }

  function continueGame() {
    router.push("/desktop");
  }

  return (
    /*
     * `theme-dark` is stamped HERE, on the page root, and it is load-bearing.
     *
     * v0.9.1 REDEFINED the neutral ramp as CSS variables and inverts it in
     * light mode, with `slate`/`zinc`/`stone` aliased onto it. So every
     * `text-slate-400` on this page resolves through `--g-400` — and on a
     * visitor whose OS is set to light, that is a dark ink, painted onto the
     * near-black ground this page hardcodes. Confirmed live: `<html>` carried
     * `theme-light` and the body copy went to roughly the background colour.
     *
     * Stamping the dark token set on this container pins those variables for
     * everything inside it, whatever `<html>` says. Cheap, local, and it fails
     * safe — a neutral added here later inherits the pin for free rather than
     * quietly becoming the next invisible line of text.
     *
     * The card accents do not rely on this: they are literal hexes, for the
     * separate reason documented on ACCENT above.
     */
    <div className="landing-root theme-dark relative min-h-screen overflow-hidden bg-[#04060d] font-sans text-slate-200 antialiased">
      {/* ── Atmosphere ──────────────────────────────────────────────────── */}

      {/* Grid. Two layers at different scales so it reads as depth rather than
          as graph paper, and masked to fade out before it reaches the content. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, #000 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, #000 40%, transparent 100%)",
        }}
      />

      {/* Ambient orbs. `blur-3xl` at low opacity — colour without shape, which
          is what keeps them atmosphere instead of decoration. */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="orb-drift absolute -top-32 left-1/4 h-[38rem] w-[38rem] rounded-full bg-[#4f46e5]/20 blur-3xl" />
        <div className="orb-drift absolute -right-24 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#06b6d4]/[0.14] blur-3xl" style={{ animationDelay: "-6s" }} />
        <div className="orb-drift absolute -left-32 bottom-0 h-[34rem] w-[34rem] rounded-full bg-[#10b981]/[0.10] blur-3xl" style={{ animationDelay: "-12s" }} />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center gap-3 px-6 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#67e8f9] backdrop-blur-xl">
          <IconBolt size={16} />
        </span>
        <span className="text-[15px] font-bold tracking-tight text-white">ITQuest</span>
        <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-400 sm:inline">
          {VERSION}
        </span>

        <nav className="ml-auto flex items-center gap-2">
          <a
            href="#command-center"
            className="hidden rounded-lg px-3 py-2 text-[13px] text-slate-400 transition hover:text-white sm:block"
          >
            Systems
          </a>
          <button
            onClick={saved ? continueGame : startGame}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-medium text-slate-200 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            {saved ? "Continue" : "Launch"}
          </button>
        </nav>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-14 text-center sm:pt-24">
        <div className="rise-in" style={{ animationDelay: "60ms" }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-slate-300 backdrop-blur-xl">
            <span className="relative flex h-1.5 w-1.5">
              <span className="halo-pulse absolute inline-flex h-full w-full rounded-full bg-[#34d399]" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#34d399]" />
            </span>
            Tier 1 Helpdesk to Tier 4 Critical Infrastructure
          </span>
        </div>

        <h1
          className="rise-in mt-7 text-[2.75rem] font-black leading-[1.05] tracking-[-0.03em] text-white sm:text-6xl md:text-7xl"
          style={{ animationDelay: "140ms" }}
        >
          The Enterprise IT &amp;
          <br />
          <span className="bg-gradient-to-r from-[#67e8f9] via-[#a5b4fc] to-[#6ee7b7] bg-clip-text text-transparent">
            Cyber Warfare
          </span>{" "}
          Simulator
        </h1>

        <p
          className="rise-in mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-slate-400 sm:text-[17px]"
          style={{ animationDelay: "220ms" }}
        >
          Build, manage and defend the ultimate IT infrastructure. Power budgets, address
          space, backup tiers and incident response — modelled properly, so every decision
          matters.
        </p>

        {/* Primary CTA. The halo is a separate ring rather than a scale on the
            button itself: growing the button would move the label out from
            under the cursor mid-hover. */}
        <div className="rise-in mt-11 flex flex-col items-center gap-4" style={{ animationDelay: "300ms" }}>
          <div className="group relative">
            <span
              aria-hidden
              className="halo-pulse absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#06b6d4] via-[#6366f1] to-[#10b981] blur-lg"
            />
            <button
              onClick={saved ? continueGame : startGame}
              className="relative flex items-center gap-3 rounded-2xl border border-white/20 bg-[#0a0f1c] px-9 py-4 text-[15px] font-bold tracking-wide text-white transition-all duration-300 hover:scale-[1.02] hover:border-white/30 active:scale-[0.99]"
            >
              {saved ? "RESUME SESSION" : "INITIALIZE SYSTEM"}
              <IconChevronRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>

          {saved ? (
            <p className="text-[12px] text-slate-500">
              Signed in as{" "}
              <span className="font-medium text-slate-300">{saved.username}</span> · level{" "}
              {saved.level}
              {" · "}
              <button onClick={startGame} className="underline decoration-dotted underline-offset-2 transition hover:text-slate-300">
                start a new estate
              </button>
            </p>
          ) : (
            <p className="text-[12px] text-slate-500">No account needed. Runs entirely in your browser.</p>
          )}
        </div>
      </section>

      {/* ── Command centre ──────────────────────────────────────────────── */}
      <section id="command-center" className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="rise-in mb-10 text-center" style={{ animationDelay: "80ms" }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Command Center
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Six systems. One estate. Everything connected.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-slate-400">
            Pull a switch port and a camera stops recording, the backbone load drops and a
            ticket re-grades itself. Nothing here is a separate minigame.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => {
            const a = ACCENT[p.accent];
            const Icon = p.icon;
            return (
              <article
                key={p.title}
                className={`rise-in group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.07] ${a.ring} ${p.span}`}
                style={{ animationDelay: `${140 + i * 70}ms` }}
              >
                {/* The card's own glow, revealed on hover. Sits behind the
                    content and never under the text itself. */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full ${a.glow} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100`}
                />

                <span
                  className={`relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 ${a.text} transition-transform duration-300 group-hover:scale-110`}
                >
                  <Icon size={19} />
                </span>

                <h3 className="relative mt-5 text-[16px] font-semibold tracking-tight text-white">
                  {p.title}
                </h3>
                <p className="relative mt-2 text-[13px] leading-relaxed text-slate-400">{p.body}</p>

                <div className="relative mt-4 flex flex-wrap gap-1.5">
                  {p.stats.map((s) => (
                    <span
                      key={s}
                      className={`rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] ${a.chip}`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Tiers ───────────────────────────────────────────────────────── */}
      <section className="relative mx-auto w-full max-w-7xl px-6 pb-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* What exists today. Deliberately first and deliberately plain —
              the free tier IS the product right now, and framing it as the
              lesser half of a comparison would be a lie about what ships. */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold text-white">Single operator</h3>
              <span className="rounded-full border border-[#34d399]/40 bg-[#10b981]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6ee7b7]">
                Available now
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              The whole simulation. Every app, every incident class, the full progression from
              intern to running the estate. Runs in your browser, saves locally, costs nothing.
            </p>
            <ul className="mt-4 space-y-1.5 text-[12px] text-slate-400">
              {["Complete ticket, hardware and network engines", "Disaster recovery and ransomware scenarios", "Local save — no account required"].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <IconCheck size={12} className="mt-0.5 shrink-0 text-[#6ee7b7]" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* The unbuilt tier. No price, no upgrade button — a paywall for
              something that does not exist should not be able to take a click
              that goes nowhere. */}
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <IconLock size={13} className="text-slate-500" />
              <h3 className="text-[15px] font-semibold text-slate-300">Enterprise</h3>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Coming soon
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
              For teams training together. Not built yet, not purchasable, and nothing below is
              available on any plan today — this is a statement of intent, not a product page.
            </p>
            <ul className="mt-4 space-y-1.5 text-[12px] text-slate-500">
              {["Multi-seat estates and shift handover", "Custom scenario authoring", "Cohort reporting and assessment export", "SSO, audit logs and server-side accounts"].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <IconLock size={11} className="mt-0.5 shrink-0 text-slate-600" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24 text-center">
        <div className="rise-in rounded-3xl border border-white/10 bg-white/[0.04] p-10 backdrop-blur-xl">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            The queue is already filling up.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-slate-400">
            You start as an intern with five tickets and no budget. What you do with the
            estate from there is entirely yours.
          </p>
          <button
            onClick={saved ? continueGame : startGame}
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-[14px] font-bold text-[#04060d] transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100 active:scale-[0.99]"
          >
            {saved ? "Resume session" : "Initialize system"}
            <IconChevronRight size={15} />
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-6 py-7 text-[11px] text-slate-500 sm:flex-row">
          <span className="flex items-center gap-2">
            <IconBolt size={12} className="text-[#22d3ee]/70" />
            <span className="font-medium text-slate-400">ITQuest</span>
            <span className="font-mono">{VERSION}</span>
          </span>

          <span className="flex items-center gap-2 sm:ml-auto">
            <span className="relative flex h-1.5 w-1.5">
              <span className="halo-pulse absolute inline-flex h-full w-full rounded-full bg-[#34d399]" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#34d399]" />
            </span>
            System status: <span className="font-medium text-[#6ee7b7]">Online</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
