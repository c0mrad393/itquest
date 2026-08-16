"use client";

/**
 * ITQuest — Enterprise Gateway (paywall mock-up)
 * ==============================================
 * A locked surface for the B2B tier that does not exist yet.
 *
 * ── IT IS HONEST ABOUT BEING A MOCK-UP ──────────────────────────────────────
 *
 * A paywall for an unbuilt product has one failure mode that matters: looking
 * buyable. A card with a price and a live-looking "Upgrade" button collects
 * clicks that go nowhere, and the operator learns that buttons in this product
 * cannot be trusted — which is a much more expensive lesson than a missing
 * feature.
 *
 * So there is no price, no card field, and no button that pretends to
 * transact. The primary action registers INTEREST, which is a thing that can
 * genuinely happen today, and the locked features are listed plainly as
 * planned rather than dressed as almost-available.
 *
 * ── THE LOCK IS COSMETIC AND SAYS SO ────────────────────────────────────────
 *
 * Nothing here gates real functionality, because none exists to gate. When it
 * does, the check cannot live in this component — a paywall enforced in the
 * client is a paywall enforced by whoever has not opened devtools. See the
 * note in lib/host/auth.ts, which has the same shape.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useState } from "react";
import { AppHeader } from "./AppChrome";
import {
  IconBank,
  IconBolt,
  IconCheck,
  IconLock,
  IconPolicy,
  IconShield,
  IconUsers,
} from "@/components/ui/icons";

/** What the tier is intended to cover. Planned, and labelled as such. */
const PLANNED = [
  {
    icon: IconUsers,
    title: "Multi-seat teams",
    body: "Shared estates with several operators on shift at once, handovers between them, and per-seat progression.",
  },
  {
    icon: IconPolicy,
    title: "Custom scenario authoring",
    body: "Write your own incidents, cascades and win conditions against the same engine the built-in ones use.",
  },
  {
    icon: IconBank,
    title: "Cohort reporting",
    body: "Completion, time-to-resolve and SLA performance across a training group, exportable for assessment.",
  },
  {
    icon: IconShield,
    title: "SSO and audit",
    body: "SAML sign-in, retained activity logs, and a real server-side account model rather than this workstation's local save.",
  },
];

export default function EnterpriseGateway() {
  const [registered, setRegistered] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-y-auto term-scroll bg-panel text-sm text-gray-200">
      <AppHeader iconId="building" title="Enterprise Gateway" subtitle="Team and organisation features" />

      <div className="flex flex-col gap-4 p-5">
        {/* ── The banner ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-wm border border-brand-fill/30 bg-brand-soft/[0.07] p-5">
          {/* A single soft wash rather than a gold-plated "premium" gradient:
              this is a tier that does not exist, and overselling it is how a
              placeholder becomes a broken promise. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse 60% 80% at 85% 0%, rgb(var(--brand-fill) / 0.16), transparent 65%)",
            }}
          />
          <div className="relative flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-wm border border-brand-fill/40 bg-brand-soft/15 text-brand-text">
              <IconLock size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-gray-50">Enterprise Subscription Required</h2>
                <span className="rounded-full border border-brand-fill/40 bg-brand-soft/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-text">
                  Coming soon
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-gray-400">
                Everything on this screen is a preview of a tier we have not built yet. Nothing here
                is purchasable, and no feature below is available on any plan today — including
                yours. Your single-operator estate is unaffected and always will be.
              </p>
            </div>
          </div>
        </section>

        {/* ── Planned features, visibly inert ────────────────────────── */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Planned for the tier
          </h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {PLANNED.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  // `cursor-not-allowed` and a dimmed body, because a card that
                  // looks clickable and is not is worse than one that looks off.
                  className="flex cursor-not-allowed items-start gap-3 rounded-wm border border-dashed border-edge bg-surface/40 p-3.5"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-wm bg-surface-3/60 text-gray-600">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-gray-400">{f.title}</span>
                      <IconLock size={10} className="shrink-0 text-gray-600" />
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-600">{f.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── The one real action ────────────────────────────────────── */}
        <section className="rounded-wm border border-edge bg-panelalt p-4">
          <h3 className="text-[12px] font-semibold text-gray-100">Interested for your team?</h3>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-gray-500">
            There is nothing to buy yet. Registering interest records it locally on this
            workstation — it does not send anything anywhere, because there is no server to send it
            to. It is here so the button does something true.
          </p>
          <button
            onClick={() => setRegistered(true)}
            disabled={registered}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-brand-fill bg-brand-soft/15 px-3 py-1.5 text-[12px] font-semibold text-brand-text transition hover:bg-brand-soft/25 disabled:cursor-default disabled:border-accent/40 disabled:bg-accent/10 disabled:text-accent-strong"
          >
            {registered ? <IconCheck size={12} /> : <IconBolt size={12} />}
            {registered ? "Interest noted on this workstation" : "Register interest"}
          </button>
        </section>
      </div>
    </div>
  );
}
