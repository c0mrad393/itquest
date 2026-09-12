"use client";

/**
 * The instructor console.
 *
 * ── ONE QUESTION AT THE CENTRE ──────────────────────────────────────────────
 *
 * Not "how many tickets are open" — that number is unactionable to a teacher.
 * The questions are: who is stuck right now, which exercise is my class unable
 * to do, and has anyone not started at all. Those three are the page.
 *
 * ── EVERYTHING HERE IS DERIVED FROM THE LEDGER ──────────────────────────────
 *
 * No estate is mirrored and no simulation runs on this screen. Every figure is
 * computed from the events the runs wrote down, so the summary cannot drift
 * from the work it summarises — and forty students stays kilobytes rather than
 * forty live machines.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import {
  INSTITUTION,
  LEDGER,
  SEATS,
  labelFor,
  seatIds,
} from "@/lib/cohort/mock-data";
import {
  difficultyByScenario,
  duration,
  progressOf,
  stuck,
  summarise,
  type LedgerEvent,
} from "@/lib/cohort/ledger";
import { relativeTime } from "@/lib/admin/mock-data";

const KIND_LABEL: Record<string, string> = {
  "run.started": "started",
  "step.completed": "step done",
  "hint.revealed": "took a hint",
  "fault.diagnosed": "found the cause",
  "sla.breached": "missed SLA",
  "ticket.resolved": "resolved",
  "run.abandoned": "gave up",
  "phase.advanced": "advanced a phase",
};

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-edge bg-surface">
      <div className="border-b border-edge bg-surface-2 px-4 py-2.5">
        <h2 className="text-[12.5px] font-semibold text-gray-100">{title}</h2>
        {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" | "bad" }) {
  const colour = tone === "bad" ? "text-danger-strong" : tone === "warn" ? "text-warn-strong" : "text-gray-100";
  return (
    <div className="rounded-lg border border-edge bg-surface px-3 py-2.5">
      <div className={`text-[17px] font-semibold tabular-nums ${colour}`}>{value}</div>
      <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  );
}

export default function OrgConsole() {
  const seats = useMemo(() => seatIds(), []);
  const [selected, setSelected] = useState<string>(SEATS[0].id);

  const now = Date.now();
  const summary = useMemo(() => summarise(LEDGER, seats), [seats]);
  const stalled = useMemo(() => stuck(LEDGER, seats, 900, now), [seats, now]);
  const difficulty = useMemo(() => difficultyByScenario(LEDGER).filter((d) => d.attempts > 0), []);

  const seat = SEATS.find((s) => s.id === selected) ?? SEATS[0];
  const progress = useMemo(() => progressOf(LEDGER, seat.id), [seat.id]);
  const trail: LedgerEvent[] = useMemo(
    () => LEDGER.filter((e) => e.seat === seat.id).sort((a, b) => b.at - a.at).slice(0, 14),
    [seat.id],
  );

  const neverStarted = SEATS.filter((s) => s.joinedAt === null);

  return (
    <div className="mx-auto w-full max-w-[84rem] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-semibold tracking-tight text-gray-100">{INSTITUTION.name}</h1>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {INSTITUTION.term} · {SEATS.length} of {INSTITUTION.seatsTotal} seats in use
          </p>
        </div>
        <span className="rounded-md border border-edge px-2 py-1 text-[11px] capitalize text-gray-400">
          {INSTITUTION.plan}
        </span>
      </header>

      {/*
        The instructor's own reassurance that this is a reading of their
        cohort's work, not a live window into anyone's machine.
      */}
      <div className="mb-4 rounded-md border border-info/25 bg-info/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-gray-400">
        <span className="font-semibold text-gray-200">Read from run history.</span> Simulations run on
        each student&apos;s own machine; this console reads the trail they leave — {LEDGER.length} events
        this term. Nothing here watches anyone in real time.
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Seats active" value={`${summary.active}/${summary.seats}`} />
        <Stat label="Resolved" value={summary.resolved} />
        <Stat label="Gave up" value={summary.abandoned} tone={summary.abandoned ? "warn" : undefined} />
        <Stat label="Hints taken" value={summary.hintsTaken} />
        <Stat
          label="Median resolve"
          value={summary.medianResolveSec !== null ? duration(summary.medianResolveSec) : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        {/* ── Who needs help, right now ─────────────────────────────────── */}
        <Panel
          title="Stuck right now"
          subtitle="Open runs with nothing happening for 15 minutes or more"
        >
          {stalled.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-gray-600">
              Nobody is stalled. Every open run has moved recently.
            </p>
          ) : (
            <ul className="divide-y divide-edge/60">
              {stalled.map((s) => {
                const who = SEATS.find((x) => x.id === s.seat);
                return (
                  <li key={s.seat} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <button
                      onClick={() => setSelected(s.seat)}
                      className="text-[12.5px] text-gray-100 underline-offset-2 hover:underline"
                    >
                      {who?.name ?? s.seat}
                    </button>
                    <span className="text-[11.5px] text-gray-500">on {labelFor(s.scenario)}</span>
                    {s.step && (
                      <span className="rounded bg-gray-500/15 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
                        after {s.step}
                      </span>
                    )}
                    <span className="ml-auto text-[11.5px] text-warn-strong">
                      quiet {duration(s.stalledSec)}
                    </span>
                    {s.hintsTaken > 0 && (
                      <span className="text-[11px] text-gray-500">· {s.hintsTaken} hints</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* ── What the class cannot do ──────────────────────────────────── */}
        <Panel
          title="Hardest for this cohort"
          subtitle="Worst completion first — this is the one to teach again"
        >
          <ul className="divide-y divide-edge/60">
            {difficulty.map((d) => {
              const pct = Math.round((d.completionRate ?? 0) * 100);
              return (
                <li key={d.scenario} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] text-gray-100">{labelFor(d.scenario)}</span>
                    <span className="ml-auto font-mono text-[11.5px] tabular-nums text-gray-400">
                      {d.resolved}/{d.attempts}
                    </span>
                    <span
                      className={`w-10 text-right font-mono text-[11.5px] tabular-nums ${
                        pct < 50 ? "text-danger-strong" : pct < 80 ? "text-warn-strong" : "text-gray-400"
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-500/20">
                    <div
                      className={`h-full rounded-full ${
                        pct < 50 ? "bg-danger" : pct < 80 ? "bg-warn" : "bg-accent"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[10.5px] text-gray-600">
                    {d.hintsTaken} hint{d.hintsTaken === 1 ? "" : "s"} taken
                    {d.abandoned > 0 && ` · ${d.abandoned} gave up`}
                    {d.medianResolveSec !== null && ` · median ${duration(d.medianResolveSec)}`}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {/* ── Never started ───────────────────────────────────────────────── */}
      {neverStarted.length > 0 && (
        <div className="mt-4 rounded-md border border-warn/30 bg-warn/[0.07] px-3 py-2">
          <span className="text-[11.5px] font-semibold text-warn-strong">
            {neverStarted.length} seat{neverStarted.length === 1 ? "" : "s"} never signed in.
          </span>{" "}
          <span className="text-[11.5px] text-gray-400">
            {neverStarted.map((s) => s.name).join(", ")} — provisioned, no activity. Worth catching
            before the end of term rather than after it.
          </span>
        </div>
      )}

      {/* ── Roster and one student ──────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Roster" subtitle={`${SEATS.length} seats`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2 font-semibold">Student</th>
                  <th className="px-3 py-2 font-semibold">Group</th>
                  <th className="px-3 py-2 text-right font-semibold">Resolved</th>
                  <th className="px-3 py-2 text-right font-semibold">Hints</th>
                  <th className="px-3 py-2 font-semibold">Median</th>
                  <th className="px-3 py-2 font-semibold">Last active</th>
                </tr>
              </thead>
              <tbody>
                {SEATS.map((s) => {
                  const p = progressOf(LEDGER, s.id);
                  const never = p.lastActiveAt === null;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelected(s.id)}
                      className={`cursor-pointer border-t border-edge/60 transition ${
                        selected === s.id ? "bg-info/[0.07]" : "hover:bg-panelalt/40"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="text-[12.5px] text-gray-100">{s.name}</div>
                        <div className="font-mono text-[10.5px] text-gray-500">{s.email}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-gray-400">{s.group}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-300">
                        {p.resolved}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-500">
                        {p.hintsTaken}
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-gray-400">
                        {p.medianResolveSec !== null ? duration(p.medianResolveSec) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-[11.5px] ${never ? "text-warn-strong" : "text-gray-500"}`}>
                        {never ? "never" : relativeTime(p.lastActiveAt as number)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={seat.name} subtitle={seat.group}>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Resolved" value={progress.resolved} />
              <Stat label="Gave up" value={progress.abandoned} tone={progress.abandoned ? "warn" : undefined} />
              <Stat label="Missed SLA" value={progress.breached} tone={progress.breached ? "warn" : undefined} />
            </div>

            {progress.openRun ? (
              <div className="rounded-md border border-edge bg-surface-2 p-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Working on
                </div>
                <div className="mt-1 text-[12.5px] text-gray-200">{labelFor(progress.openRun.scenario)}</div>
                <div className="text-[11px] text-gray-500">
                  {progress.openRun.step ? `last cleared ${progress.openRun.step}` : "no steps cleared yet"}
                  {" · "}
                  quiet {duration(Math.round((now - progress.openRun.sinceAt) / 1000))}
                </div>
              </div>
            ) : progress.lastActiveAt === null ? (
              <p className="rounded-md border border-warn/30 bg-warn/[0.07] px-2.5 py-2 text-[11.5px] text-warn-strong">
                This seat has never been signed in to.
              </p>
            ) : (
              <p className="text-[11.5px] text-gray-500">Nothing open. Last seen {relativeTime(progress.lastActiveAt)}.</p>
            )}

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Trail
              </div>
              {trail.length === 0 ? (
                <p className="text-[11.5px] text-gray-600">No activity recorded.</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto term-scroll pr-1">
                  {trail.map((e) => (
                    <li key={e.id} className="flex items-baseline gap-2 text-[11.5px]">
                      <span className="w-16 shrink-0 text-right font-mono text-[10px] text-gray-600">
                        {relativeTime(e.at)}
                      </span>
                      <span className="text-gray-300">{KIND_LABEL[e.kind] ?? e.kind}</span>
                      <span className="truncate text-gray-500">{labelFor(e.scenario)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
