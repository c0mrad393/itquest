"use client";

/**
 * Your account — the plan, what it allows, and what is left of today.
 *
 * ── THIS IS THE REAL PERSON, NOT THE CHARACTER ──────────────────────────────
 *
 * The desktop is a simulated OS and "Operator" is a role someone is playing.
 * This screen is the only place in it that talks to the human at the keyboard
 * about their actual subscription, so it deliberately does not dress itself as
 * part of the fiction: no in-world framing, no company branding, no pretending
 * the estate has a billing department.
 *
 * ── IT STILL DOES NOT PRETEND TO TRANSACT ───────────────────────────────────
 *
 * The rule this file has always carried survives the tier model landing: a
 * paywall for something you cannot buy has one failure mode that matters —
 * looking buyable. A live-looking "Upgrade" button collects clicks that go
 * nowhere and teaches the operator that buttons in this product cannot be
 * trusted, which costs far more than a missing feature.
 *
 * What changed is that there is now something true to SHOW. The plan, the
 * caps and the shift counter are real and really enforced, so this screen
 * reports them rather than advertising a future.
 *
 * ── AND IT ADMITS THE CAPS ARE ADVISORY ─────────────────────────────────────
 *
 * Everything is client-side: the counter and the clock belong to whoever is
 * reading this. Saying so here — where the limits are explained — is more
 * honest than letting someone discover it and conclude the whole product is
 * careless. See lib/platform/shift.ts, which carries the same note.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { AppHeader } from "./AppChrome";
import { useEntitlements, useEntitlementStore } from "@/lib/platform/entitlements";
import { TIERS, type Feature, type TierId } from "@/lib/platform/tiers";
import { PRICING, format, perMonthFromYearly } from "@/lib/platform/pricing";
import { useHostStore } from "@/lib/host/store";
import { IconBolt, IconCheck, IconClock, IconLock, IconTrophy } from "@/components/ui/icons";
import { useStanding } from "@/lib/progression/use-standing";

const FEATURE_LABEL: Record<Feature, string> = {
  leaderboard: "Global leaderboard",
  "ticket-history": "Review every ticket you have closed",
  "cloud-save": "Progress follows your account",
  certificates: "Exportable evidence of what you completed",
  "cohort-reporting": "Instructor console and cohort reporting",
  "custom-scenarios": "Author your own scenarios",
};

const ALL_FEATURES = Object.keys(FEATURE_LABEL) as Feature[];

function Row({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12px]">
      <span className={`mt-0.5 shrink-0 ${on ? "text-accent-strong" : "text-gray-600"}`}>
        {on ? <IconCheck size={13} /> : <IconLock size={12} />}
      </span>
      <span className={on ? "text-gray-300" : "text-gray-500"}>{children}</span>
    </li>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-edge bg-surface">
      <div className="border-b border-edge bg-surface-2 px-4 py-2.5">
        <h2 className="text-[12.5px] font-semibold text-gray-100">{title}</h2>
        {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function AccountApp() {
  const { tier, spec, shift, levelCap, atLevelCap, can } = useEntitlements();
  const setTier = useEntitlementStore((s) => s.setTier);
  const standing = useStanding();
  const level = standing.level;
  const xp = useHostStore((s) => s.host.user.xp);

  const proPlan = PRICING.pro;
  const capped = atLevelCap(level);

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      <AppHeader iconId="building" title="Your account" subtitle="Plan, limits and what is left today" />

      <div className="min-h-0 flex-1 overflow-y-auto term-scroll p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {/* ── The plan you are on ──────────────────────────────────── */}
          <Card title="Current plan">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-md bg-info/15 px-2 py-1 text-[12px] font-semibold text-info">
                {spec.label}
              </span>
              <span className="text-[12px] text-gray-400">{spec.blurb}</span>
              {tier !== "free" && (
                <span className="ml-auto text-[11.5px] text-gray-500">
                  {proPlan.yearly ? `${format(proPlan.yearly)} · ${perMonthFromYearly(proPlan.yearly)}` : ""}
                </span>
              )}
            </div>
          </Card>

          {/* ── Today ────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="This shift" sub={shift.allowance === null ? "No limit on your plan" : "Tickets you can take on"}>
              {shift.allowance === null ? (
                <p className="flex items-center gap-2 text-[12.5px] text-gray-300">
                  <IconBolt size={14} className="text-accent-strong" />
                  Take on as many as you like.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[26px] font-semibold tabular-nums text-gray-100">
                      {shift.remaining}
                    </span>
                    <span className="text-[12px] text-gray-500">of {shift.allowance} left</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1" aria-hidden="true">
                    {Array.from({ length: shift.allowance }, (_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-sm ${
                          i < (shift.remaining ?? 0) ? "bg-accent" : "bg-gray-500/30"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-gray-500">
                    <IconClock size={11} />
                    {shift.open
                      ? `Next shift in ${shift.resetsIn}`
                      : `Shift over — the next one starts in ${shift.resetsIn}`}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
                    The allowance limits what you take on, never what you finish. Anything already on
                    your desk can be worked and closed.
                  </p>
                </>
              )}
            </Card>

            <Card title="Rank" sub={levelCap === null ? "Uncapped" : `Your plan reaches level ${levelCap}`}>
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-semibold tabular-nums text-gray-100">{level}</span>
                <span className="text-[12px] text-gray-500">
                  {levelCap === null ? "and climbing" : `of ${levelCap}`}
                </span>
                <span className="ml-auto flex items-center gap-1 font-mono text-[11.5px] text-gray-500">
                  <IconTrophy size={11} />
                  {xp.toLocaleString()} XP
                </span>
              </div>
              {capped ? (
                <p className="mt-2 text-[11.5px] leading-relaxed text-warn-strong">
                  You are at your plan&apos;s ceiling. Experience still counts — it is banked, so
                  carrying on later starts you where your work already put you.
                </p>
              ) : (
                <p className="mt-2 text-[11.5px] leading-relaxed text-gray-500">
                  {levelCap === null
                    ? "Nothing is holding your rank back."
                    : `${levelCap - level} level${levelCap - level === 1 ? "" : "s"} before this plan's ceiling.`}
                </p>
              )}
            </Card>
          </div>

          {/* ── What your plan includes ──────────────────────────────── */}
          <Card title="What your plan includes" sub="Locked items say which plan carries them">
            <ul className="space-y-2">
              {ALL_FEATURES.map((f) => {
                const on = can(f);
                const owner = (["free", "pro", "enterprise"] as TierId[]).find((t) =>
                  TIERS[t].features.includes(f),
                );
                return (
                  <Row key={f} on={on}>
                    {FEATURE_LABEL[f]}
                    {!on && owner && (
                      <span className="ml-1.5 rounded bg-gray-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
                        {TIERS[owner].label}
                      </span>
                    )}
                  </Row>
                );
              })}
            </ul>
          </Card>

          {/* ── Where upgrading leads ────────────────────────────────── */}
          {tier === "free" && (
            <Card title="Pro" sub="The whole career, from intern to principal">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[22px] font-semibold text-gray-100">
                  {proPlan.yearly ? format(proPlan.yearly) : ""}
                </span>
                {proPlan.yearly && (
                  <span className="text-[12px] text-gray-500">
                    works out at {perMonthFromYearly(proPlan.yearly)}
                  </span>
                )}
              </div>
              {proPlan.note && <p className="mt-1 text-[11.5px] text-gray-500">{proPlan.note}</p>}
              <p className="mt-3 rounded-md border border-info/25 bg-info/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-gray-400">
                <span className="font-semibold text-gray-200">Not billable yet.</span> ITQuest is in
                public beta and there is no checkout, so nothing here takes a payment. The pricing
                page has the full comparison and a way to be told when it opens.
              </p>
            </Card>
          )}

          {/* ── The honest footnote ──────────────────────────────────── */}
          <Card title="How these limits work">
            <p className="text-[11.5px] leading-relaxed text-gray-500">
              There is no server yet. Your plan, your shift counter and your progress all live in
              this browser, which means the limits here are a pace rather than a lock — anyone
              determined can change them, and that is an accepted property of a beta that runs
              entirely on your own machine rather than an oversight. When accounts arrive, the
              server becomes the authority.
            </p>

            {/*
              A real switch, labelled as what it is. The tier is local state
              today, so pretending it is read-only would be a smaller lie but
              still a lie — and a tester needs to see both sides of every gate
              this release ships.
            */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
              <span className="text-[11px] uppercase tracking-wider text-gray-600">Preview a plan</span>
              {(["free", "pro", "enterprise"] as TierId[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  aria-pressed={tier === t}
                  className={`rounded border px-2 py-1 text-[11px] transition ${
                    tier === t
                      ? "border-info/40 bg-info/15 text-info"
                      : "border-edge text-gray-400 hover:bg-panelalt"
                  }`}
                >
                  {TIERS[t].label}
                </button>
              ))}
              <span className="w-full text-[10.5px] text-gray-600">
                Local only, and no payment is involved. It exists so the gates can be seen from both
                sides while there is no account system.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
