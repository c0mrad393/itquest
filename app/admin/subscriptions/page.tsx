"use client";

/**
 * Enterprise Subscriptions — B2B accounts, seats and renewals.
 *
 * ── SEAT PRESSURE IS THE POINT ──────────────────────────────────────────────
 *
 * The number that matters is not how many seats an org bought, it is how close
 * they are to running out — an account at 15/15 cannot onboard the student
 * standing in front of them on Monday. So utilisation is shown as a bar with a
 * threshold, and "full" is called out rather than left to be worked out from
 * two numbers side by side.
 *
 * ── RENEWAL DATES ARE COMPARED WITH THE CLOCK ───────────────────────────────
 *
 * Whether a renewal is near is derived at render time, not stored. A fixture
 * that said "due soon" would be wrong the week after it was written.
 *
 * Actions report that the call was not sent — Phase 1 has no backend, and a
 * plan change that silently did nothing would be the worst lie on this screen.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import {
  ActionLog,
  AdminPage,
  Card,
  FilterGroup,
  MockBanner,
  Pill,
  Stat,
  Toolbar,
  useActionLog,
  type Tone,
} from "@/components/admin/AdminShell";
import {
  ADMIN_USERS,
  SUBSCRIPTIONS,
  inDays,
  seatsTotal,
  seatsUsed,
  type SubscriptionAccount,
} from "@/lib/admin/mock-data";

type Plan = SubscriptionAccount["plan"];
const PLANS: readonly Plan[] = ["trial", "pilot", "enterprise"];

const PLAN_TONE: Record<Plan, Tone> = { trial: "neutral", pilot: "info", enterprise: "ok" };

/** Days until renewal. Negative means it has already passed. */
const daysTo = (at: number, now: number) => Math.round((at - now) / 86_400_000);

/** Seat pressure, banded. The band is what the colour and the wording key off. */
function seatBand(s: SubscriptionAccount): { tone: Tone; label: string } {
  const pct = s.seats === 0 ? 0 : (s.seatsUsed / s.seats) * 100;
  if (s.seatsUsed >= s.seats) return { tone: "bad", label: "full" };
  if (pct >= 85) return { tone: "warn", label: "nearly full" };
  return { tone: "ok", label: "room" };
}

export default function Subscriptions() {
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<Plan | "all">("all");
  const [armedCancel, setArmedCancel] = useState<string | null>(null);
  const { lines, record, recordCall } = useActionLog();

  const now = Date.now();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SUBSCRIPTIONS.filter(
      (s) =>
        (plan === "all" || s.plan === plan) &&
        (q === "" || s.org.toLowerCase().includes(q) || s.contact.toLowerCase().includes(q)),
    );
  }, [query, plan]);

  const full = SUBSCRIPTIONS.filter((s) => s.seatsUsed >= s.seats).length;
  const dueSoon = SUBSCRIPTIONS.filter((s) => daysTo(s.renewsAt, now) <= 30).length;
  const utilisation = seatsTotal() === 0 ? 0 : Math.round((seatsUsed() / seatsTotal()) * 100);

  function changePlan(s: SubscriptionAccount, to: Plan) {
    if (to === s.plan) return;
    recordCall(`Move ${s.org} from ${s.plan} to ${to}`);
  }

  function addSeats(s: SubscriptionAccount, n: number) {
    recordCall(`Add ${n} seats to ${s.org} (${s.seats} -> ${s.seats + n})`);
  }

  function cancel(s: SubscriptionAccount) {
    if (armedCancel !== s.id) {
      setArmedCancel(s.id);
      record(`Cancellation requested for ${s.org} — click again to confirm`);
      window.setTimeout(() => setArmedCancel((a) => (a === s.id ? null : a)), 4000);
      return;
    }
    setArmedCancel(null);
    recordCall(`Cancellation confirmed for ${s.org} (${s.seatsUsed} active seats would lose access)`);
  }

  return (
    <AdminPage title="Enterprise Subscriptions" blurb="B2B accounts, seats and renewals.">
      <MockBanner />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accounts" value={SUBSCRIPTIONS.length} />
        <Stat label="Seats used" value={`${seatsUsed()} / ${seatsTotal()}`} />
        <Stat label="Utilisation" value={`${utilisation}%`} tone={utilisation >= 85 ? "warn" : "ok"} />
        <Stat label="Renewing ≤30d" value={dueSoon} tone={dueSoon ? "warn" : "neutral"} />
      </div>

      {full > 0 && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[11.5px] text-danger-strong">
          <span className="font-semibold">
            {full} account{full === 1 ? "" : "s"} at capacity.
          </span>{" "}
          <span className="text-gray-400">
            They cannot onboard another learner until seats are added.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.75fr_1fr]">
        <Card title="Accounts" subtitle={`${rows.length} of ${SUBSCRIPTIONS.length} shown`} bodyClassName="p-0">
          <Toolbar query={query} onQuery={setQuery} placeholder="Search org or billing contact…">
            <FilterGroup label="plan" value={plan} options={PLANS} onChange={setPlan} />
          </Toolbar>

          <div className="divide-y divide-edge/60">
            {rows.map((s) => {
              const band = seatBand(s);
              const pct = s.seats === 0 ? 0 : Math.min(100, (s.seatsUsed / s.seats) * 100);
              const days = daysTo(s.renewsAt, now);
              const learners = ADMIN_USERS.filter((u) => u.org === s.org).length;
              return (
                <div key={s.id} className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-gray-100">{s.org}</span>
                        <Pill tone={PLAN_TONE[s.plan]}>{s.plan}</Pill>
                        <Pill tone={band.tone}>{band.label}</Pill>
                      </div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-gray-500">{s.contact}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[12px] ${days <= 30 ? "text-warn-strong" : "text-gray-400"}`}>
                        Renews {inDays(s.renewsAt)}
                      </div>
                      <div className="text-[10.5px] text-gray-600">
                        {learners} account{learners === 1 ? "" : "s"} on the roster
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">Seats</span>
                      <span className="font-mono tabular-nums text-gray-300">
                        {s.seatsUsed} / {s.seats}
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-gray-500/20"
                      role="img"
                      aria-label={`${s.seatsUsed} of ${s.seats} seats used`}
                    >
                      <div
                        className={`h-full rounded-full ${
                          band.tone === "bad" ? "bg-danger" : band.tone === "warn" ? "bg-warn" : "bg-accent"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <select
                      value={s.plan}
                      onChange={(e) => changePlan(s, e.target.value as Plan)}
                      aria-label={`Plan for ${s.org}`}
                      className="h-6 rounded border border-edge bg-surface px-1 text-[11px] capitalize text-gray-300 outline-none focus:border-info/50"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    {[5, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => addSeats(s, n)}
                        className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-gray-300 transition hover:bg-panelalt"
                      >
                        +{n} seats
                      </button>
                    ))}
                    <button
                      onClick={() => record(`Drafted renewal reminder to ${s.contact}`)}
                      className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-gray-300 transition hover:bg-panelalt"
                    >
                      Renewal reminder
                    </button>
                    <button
                      onClick={() => cancel(s)}
                      className={`ml-auto rounded border px-1.5 py-0.5 text-[11px] transition ${
                        armedCancel === s.id
                          ? "border-danger/60 bg-danger/15 text-danger-strong"
                          : "border-edge text-gray-500 hover:bg-panelalt"
                      }`}
                    >
                      {armedCancel === s.id ? "Confirm cancellation" : "Cancel"}
                    </button>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="px-4 py-8 text-center text-[12px] text-gray-600">No accounts match those filters.</p>
            )}
          </div>
        </Card>

        <ActionLog lines={lines} />
      </div>
    </AdminPage>
  );
}
