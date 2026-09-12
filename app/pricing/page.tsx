"use client";

/**
 * Pricing.
 *
 * ── THE TABLE IS NOT WRITTEN HERE ───────────────────────────────────────────
 *
 * What each plan DOES comes from `TIERS`; what it COSTS comes from `PRICING`.
 * This page arranges them and invents nothing. A pricing page with its own
 * idea of the product is a pricing page that will one day promise something
 * the app does not do, and the customer discovers that after paying.
 *
 * ── AND IT DOES NOT OVERSELL ────────────────────────────────────────────────
 *
 * The product is in beta with no accounts and no billing yet, so the buttons
 * say what is actually true: start free now, or talk to us. A checkout that
 * is not built must not be drawn as though it were.
 *
 * theme-dark is pinned: this page paints its own dark ground, and the neutral
 * ramp INVERTS in light mode — without the pin a light-mode visitor gets dark
 * ink on a near-black background.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import Link from "next/link";
import { useState } from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { CONTACT, type LegalDoc } from "@/components/landing/brand";
import { TIERS, type Feature, type TierId } from "@/lib/platform/tiers";
import {
  PRICING,
  STUDENT_DISCOUNT,
  format,
  formatTotal,
  perMonthFromYearly,
  seatsTotal,
  yearlySaving,
} from "@/lib/platform/pricing";
import { IconCheck, IconChevronRight } from "@/components/ui/icons";

/** Said in the customer's words, not the code's. */
const FEATURE_LABEL: Record<Feature, string> = {
  leaderboard: "Global leaderboard",
  "ticket-history": "Review every ticket you have closed",
  "cloud-save": "Progress follows your account",
  certificates: "Exportable evidence of what you completed",
  "cohort-reporting": "Instructor console and cohort reporting",
  "custom-scenarios": "Author your own scenarios",
};

/** What a plan's limits mean, phrased as a capability rather than a cap. */
function limitLines(id: TierId): string[] {
  const t = TIERS[id];
  const out: string[] = [];
  out.push(
    t.levelCap === null
      ? "The whole career — intern to principal"
      : `Levels 1–${t.levelCap}, the service desk chapter`,
  );
  out.push(
    t.phaseCap === null
      ? "All four company growth phases, to a full datacentre floor"
      : "A 35-person startup on its first rack",
  );
  out.push(
    t.shiftAllowance === null
      ? "Take on as many tickets as you like"
      : `${t.shiftAllowance} tickets a shift, refreshed daily`,
  );
  return out;
}

const ORDER: TierId[] = ["free", "pro", "enterprise"];

export default function PricingPage() {
  const [yearly, setYearly] = useState(true);
  const [seats, setSeats] = useState(40);
  const [legal, setLegal] = useState<LegalDoc | null>(null);

  const proSaving = yearlySaving(PRICING.pro);

  return (
    <div className="landing-root theme-dark relative min-h-screen bg-[#04060d] font-sans text-slate-200 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#22d3ee]/10 blur-[120px]" />
        <div className="absolute -right-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-[#6366f1]/10 blur-[120px]" />
      </div>

      <Navbar saved={false} onLaunch={() => { window.location.href = "/desktop"; }} />

      <section className="relative z-10 mx-auto max-w-3xl px-5 pb-10 pt-10 text-center sm:px-8 sm:pt-14">
        <h1 className="text-balance text-[2rem] font-bold leading-[1.12] tracking-tight text-white sm:text-[2.6rem]">
          Start on the service desk. Pay when you outgrow it.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-slate-400">
          The free tier is a complete first job, not a demo — a real estate, real tickets and a
          leaderboard. Paying is what takes you past the first rack.
        </p>

        {/* Billing period. Yearly first, because it is the better deal and
            hiding that behind a toggle nobody finds helps nobody. */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {([false, true] as const).map((y) => (
            <button
              key={String(y)}
              onClick={() => setYearly(y)}
              aria-pressed={yearly === y}
              className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
                yearly === y ? "bg-white text-[#04060d]" : "text-slate-400 hover:text-white"
              }`}
            >
              {y ? "Yearly" : "Monthly"}
            </button>
          ))}
          {proSaving !== null && (
            <span className="px-2 text-[11px] font-semibold text-[#6ee7b7]">Save {proSaving}%</span>
          )}
        </div>
      </section>

      {/* ── The three plans ─────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-4 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          {ORDER.map((id) => {
            const tier = TIERS[id];
            const plan = PRICING[id];
            /*
              A plan sold on ONE cycle ignores the toggle rather than showing
              a dash. Enterprise is annual-only; "—per seat" under Monthly is
              accurate and reads like a broken price.
            */
            const price = plan.monthly === null ? plan.yearly : yearly ? plan.yearly : plan.monthly;
            const annualOnly = plan.monthly === null;
            const featured = id === "pro";

            return (
              <article
                key={id}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  featured
                    ? "border-[#22d3ee]/40 bg-[#22d3ee]/[0.05]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {featured && (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-[#22d3ee] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#04060d]">
                    Most people
                  </span>
                )}

                <h2 className="text-[15px] font-semibold text-white">{tier.label}</h2>
                <p className="mt-1 min-h-[2.5rem] text-[12.5px] leading-relaxed text-slate-400">
                  {tier.blurb}
                </p>

                <div className="mt-4">
                  {plan.contactOnly ? (
                    <>
                      <div className="text-[28px] font-bold tracking-tight text-white">
                        {price ? format(price) : "—"}
                        <span className="ml-1 text-[13px] font-normal text-slate-500">per seat</span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-slate-500">
                        {annualOnly ? "Annual only" : "Billed annually"} · minimum {plan.minimumSeats}{" "}
                        seats
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[28px] font-bold tracking-tight text-white">
                        {price ? format(price) : "—"}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-slate-500">
                        {price && price.amount > 0 && yearly
                          ? `Works out at ${perMonthFromYearly(price)}`
                          : price && price.amount === 0
                            ? "Forever, not for a trial period"
                            : "Billed monthly"}
                      </div>
                    </>
                  )}
                </div>

                {plan.note && (
                  <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">{plan.note}</p>
                )}

                {/* Limits first: they are what actually differs between plans. */}
                <ul className="mt-5 space-y-2 border-t border-white/10 pt-4">
                  {limitLines(id).map((l) => (
                    <li key={l} className="flex items-start gap-2 text-[12.5px] text-slate-300">
                      <span className="mt-0.5 shrink-0 text-[#6ee7b7]">
                        <IconCheck size={13} />
                      </span>
                      {l}
                    </li>
                  ))}
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[12.5px] text-slate-300">
                      <span className="mt-0.5 shrink-0 text-[#6ee7b7]">
                        <IconCheck size={13} />
                      </span>
                      {FEATURE_LABEL[f]}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 pt-2">
                  {/*
                    Honest buttons. There is no checkout yet, so nothing here
                    pretends to be one — free starts now, paid plans open a
                    conversation.
                  */}
                  {id === "free" ? (
                    <Link
                      href="/desktop"
                      className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-[13.5px] font-semibold text-[#04060d] transition-transform hover:scale-[1.02]"
                    >
                      Start the first shift
                      <span className="transition-transform group-hover:translate-x-0.5">
                        <IconChevronRight size={14} />
                      </span>
                    </Link>
                  ) : (
                    <a
                      href={`mailto:${CONTACT}?subject=${encodeURIComponent(
                        id === "pro" ? "ITQuest Pro" : "ITQuest pilot for our institution",
                      )}`}
                      className={`flex w-full items-center justify-center rounded-xl px-5 py-3 text-[13.5px] font-semibold transition-colors ${
                        featured
                          ? "bg-[#22d3ee] text-[#04060d] hover:bg-[#67e8f9]"
                          : "border border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10"
                      }`}
                    >
                      {id === "pro" ? "Join the waiting list" : "Book a pilot"}
                    </a>
                  )}
                  <p className="mt-2 text-center text-[10.5px] text-slate-600">
                    {id === "free"
                      ? "No account needed"
                      : id === "pro"
                        ? "Billing opens with the public release"
                        : "One cohort, one term, free"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── What a cohort costs ─────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-[15px] font-semibold text-white">What would our class cost?</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-400">
            The question every department asks first. Compare it with what one rack of teaching
            hardware costs to buy, power and replace.
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-4">
            <label className="flex-1">
              <span className="block text-[11px] uppercase tracking-wider text-slate-500">Students</span>
              <input
                type="range"
                min={5}
                max={250}
                step={5}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
                className="mt-2 w-full accent-[#22d3ee]"
                aria-label="Number of students"
              />
            </label>
            <div className="text-right">
              <div className="font-mono text-[13px] text-slate-300">{seats} seats</div>
              <div className="text-[26px] font-bold tracking-tight text-white">
                {formatTotal(seatsTotal(seats) ?? 0)}
                <span className="ml-1 text-[13px] font-normal text-slate-500">/year</span>
              </div>
            </div>
          </div>

          {seats < (PRICING.enterprise.minimumSeats ?? 0) && (
            <p className="mt-3 text-[11.5px] text-[#fcd34d]">
              Below the {PRICING.enterprise.minimumSeats}-seat minimum, so this is billed as{" "}
              {PRICING.enterprise.minimumSeats} seats.
            </p>
          )}
          <p className="mt-3 text-[11.5px] text-slate-500">
            Students at institutions on a plan get Pro at no cost to them. Individual students
            elsewhere pay {Math.round(STUDENT_DISCOUNT * 100)}% less on Pro with a verified address.
          </p>
        </div>
      </section>

      {/* ── The honest note ─────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="text-[13px] font-semibold text-white">Where the product actually is</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
            ITQuest is in public beta. The free tier is live and complete today and runs entirely in
            your browser — there is no account, and your progress is saved on your own machine. Pro
            and institutional plans are not yet billable, so nothing on this page takes a payment.
            Tell us what you need and we will come back to you before anything is charged.
          </p>
        </div>
      </section>

      <Footer onOpenLegal={setLegal} />
      {legal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setLegal(null)} role="presentation">
          <div className="rounded-2xl border border-white/10 bg-[#0a0e17] p-6 text-[13px] text-slate-300" onClick={(e) => e.stopPropagation()}>
            Legal documents are on the{" "}
            <Link href="/" className="text-[#67e8f9] hover:underline">
              home page
            </Link>
            .
          </div>
        </div>
      )}
    </div>
  );
}
