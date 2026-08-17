"use client";

/**
 * ITQuest Admin — Dashboard overview
 * ==================================
 * The page an admin lands on: what is running, what needs attention, and how
 * hard the fleet is working.
 *
 * ── ORDERED BY CONSEQUENCE ──────────────────────────────────────────────────
 *
 * KPIs first because they answer "is anything wrong" in one glance; then the
 * two-column split with load on the left and activity on the right. Activity
 * feeds are the most-scrolled and least-acted-on element of any admin panel,
 * so it gets the narrower column — a timeline given half the page pushes the
 * things an admin can actually act on below the fold.
 *
 * Every number is derived in `mock-data.ts` from the same fixtures the tables
 * read, so no card can disagree with the page under it.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import Link from "next/link";
import { AdminPage, Card, MockBanner } from "@/components/admin/AdminShell";
import ResourceChart from "@/components/admin/ResourceChart";
import AdminIcon from "@/components/admin/AdminIcon";
import {
  ACTIVITY_FEED,
  ACTIVE_SCENARIOS,
  RESOURCE_SERIES,
  activeUsers,
  faultedScenarios,
  openTickets,
  relativeTime,
  runningScenarios,
  seatsTotal,
  seatsUsed,
  systemHealth,
  totalUsers,
  type ActivityEvent,
} from "@/lib/admin/mock-data";

const TONE = {
  ok: { text: "text-accent-strong", dot: "bg-accent", ring: "border-accent/30 bg-accent/10" },
  warn: { text: "text-warn-strong", dot: "bg-warn", ring: "border-warn/30 bg-warn/10" },
  bad: { text: "text-danger-strong", dot: "bg-danger", ring: "border-danger/30 bg-danger/10" },
  neutral: { text: "text-gray-300", dot: "bg-gray-500", ring: "border-edge bg-surface-2" },
} as const;

export default function AdminDashboard() {
  const health = systemHealth();
  const faulted = faultedScenarios();

  return (
    <AdminPage
      title="Dashboard"
      blurb="Fleet health, activity and load across every running estate."
      actions={
        <Link
          href="/admin/simulator"
          className="rounded-md bg-brand-fill px-3 py-1.5 text-[12px] font-semibold text-brand-on transition hover:bg-brand-hover"
        >
          Simulator controls
        </Link>
      }
    >
      <MockBanner />

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Active users"
          value={activeUsers()}
          sub={`${totalUsers()} accounts total`}
          iconId="users"
          tone="neutral"
        />
        <Kpi
          label="Simulations running"
          value={runningScenarios()}
          sub={faulted > 0 ? `${faulted} faulted` : "none faulted"}
          iconId="simulator"
          tone={faulted > 0 ? "warn" : "ok"}
        />
        <Kpi
          label="Open tickets"
          value={openTickets()}
          sub="across all active runs"
          iconId="tickets"
          tone={openTickets() > 15 ? "warn" : "neutral"}
        />
        <Kpi
          label="System health"
          value={health.label}
          sub={health.detail}
          iconId="dashboard"
          tone={health.tone}
        />
      </div>

      {/* ── Load and activity ────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card
            title="Simulator fleet load"
            subtitle="CPU and memory across all instances, last 40 minutes"
            actions={
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONE[health.tone].ring} ${TONE[health.tone].text}`}>
                {health.label}
              </span>
            }
          >
            <ResourceChart series={RESOURCE_SERIES} />
          </Card>

          <Card
            title="Seat utilisation"
            subtitle="Enterprise and pilot accounts"
            actions={
              <span className="font-mono text-[11px] tabular-nums text-gray-400">
                {seatsUsed()} / {seatsTotal()}
              </span>
            }
          >
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-brand-fill transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round((seatsUsed() / seatsTotal()) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              {Math.round((seatsUsed() / seatsTotal()) * 100)}% of contracted seats in use.{" "}
              {seatsTotal() - seatsUsed()} available across four accounts.
            </p>
          </Card>
        </div>

        <Card title="Recent activity" subtitle="Newest first" bodyClassName="p-0">
          <ol className="divide-y divide-edge/70">
            {ACTIVITY_FEED.slice(0, 9).map((e) => (
              <ActivityRow key={e.id} event={e} />
            ))}
          </ol>
        </Card>
      </div>

      {/* ── Runs needing attention ───────────────────────────────────────── */}
      <div className="mt-4">
        <Card
          title="Runs needing attention"
          subtitle="Faulted or paused scenarios"
          actions={
            <Link href="/admin/simulator" className="text-[11px] text-brand-text transition hover:underline">
              All scenarios &rarr;
            </Link>
          }
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-edge/70">
            {ACTIVE_SCENARIOS.filter((s) => s.state === "faulted" || s.state === "paused").map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.state === "faulted" ? "bg-danger" : "bg-warn"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-gray-100">{s.name}</span>
                  <span className="block text-[11px] text-gray-500">
                    {s.org} · {s.operator} · started {relativeTime(s.startedAt)}
                  </span>
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ${s.state === "faulted" ? "bg-danger/15 text-danger-strong" : "bg-warn/15 text-warn-strong"}`}>
                  {s.state}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminPage>
  );
}

function Kpi({
  label,
  value,
  sub,
  iconId,
  tone,
}: {
  label: string;
  value: number | string;
  sub: string;
  iconId: Parameters<typeof AdminIcon>[0]["id"];
  tone: keyof typeof TONE;
}) {
  return (
    <div className="rounded-lg border border-edge bg-surface p-4 transition hover:border-edge-strong">
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${TONE[tone].ring} ${TONE[tone].text}`}>
          <AdminIcon id={iconId} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
          {/* `tabular-nums` so a counter ticking from 9 to 10 does not shift
              the label beside it. */}
          <div className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums text-gray-50">
            {value}
          </div>
          <div className="mt-1.5 truncate text-[11px] text-gray-500">{sub}</div>
        </div>
      </div>
    </div>
  );
}

const KIND_META: Record<ActivityEvent["kind"], { label: string; className: string }> = {
  login: { label: "Sign-in", className: "bg-gray-500/15 text-gray-300" },
  "scenario-start": { label: "Started", className: "bg-info/15 text-info-strong" },
  "scenario-complete": { label: "Completed", className: "bg-accent/15 text-accent-strong" },
  "ticket-raised": { label: "Ticket", className: "bg-violet/20 text-violet-strong" },
  "system-alert": { label: "Alert", className: "bg-danger/15 text-danger-strong" },
  subscription: { label: "Billing", className: "bg-warn/15 text-warn-strong" },
};

function ActivityRow({ event }: { event: ActivityEvent }) {
  const meta = KIND_META[event.kind];
  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5">
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${meta.className}`}>
        {meta.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] text-gray-200">{event.actor}</div>
        <div className="text-[11px] leading-snug text-gray-500">{event.summary}</div>
      </div>
      <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-gray-600">
        {relativeTime(event.at)}
      </span>
    </li>
  );
}
