"use client";

/**
 * Ticketing System — the support requests operators raise mid-scenario.
 *
 * ── WHY A TICKET CARRIES ITS RUN ────────────────────────────────────────────
 *
 * This is not a generic helpdesk. Each row links back to the exercise that
 * produced it, which is the thing an instructor actually wants: not "there are
 * twenty-one open tickets" but "six of them came out of the PoE scenario, so
 * that exercise is where people are getting stuck".
 *
 * ── BREACH IS DERIVED, NOT STORED ───────────────────────────────────────────
 *
 * A ticket stores when it is DUE. Whether it has breached is a comparison with
 * the clock made at render time, so the queue cannot sit on a stale "breached"
 * flag that was true when the page loaded and wrong a minute later.
 *
 * Actions report that the call was not sent — Phase 1 has no backend.
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
  ACTIVE_SCENARIOS,
  SUPPORT_ROTA,
  SUPPORT_TICKETS,
  isBreached,
  isOpen,
  relativeTime,
  type SupportPriority,
  type SupportState,
  type SupportTicket,
} from "@/lib/admin/mock-data";

const STATES: readonly SupportState[] = ["new", "triaged", "in-progress", "waiting", "resolved"];
const PRIORITIES: readonly SupportPriority[] = ["P1", "P2", "P3"];

const STATE_TONE: Record<SupportState, Tone> = {
  new: "info",
  triaged: "neutral",
  "in-progress": "ok",
  waiting: "warn",
  resolved: "neutral",
};

const PRIORITY_TONE: Record<SupportPriority, Tone> = { P1: "bad", P2: "warn", P3: "neutral" };

/** How long is left, or how long ago it went past. */
function slaText(t: SupportTicket, now: number): string {
  if (!isOpen(t)) return "closed";
  const delta = t.dueAt - now;
  const mins = Math.round(Math.abs(delta) / 60_000);
  const label = mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`;
  return delta >= 0 ? `${label} left` : `${label} over`;
}

export default function Ticketing() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SupportState | "all">("all");
  const [priority, setPriority] = useState<SupportPriority | "all">("all");
  const [runOnly, setRunOnly] = useState<string | "all">("all");
  const [selected, setSelected] = useState<string | null>(SUPPORT_TICKETS[0]?.id ?? null);
  const { lines, record, recordCall } = useActionLog();

  // One clock for the whole render, so every row in a pass agrees about "now".
  const now = Date.now();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SUPPORT_TICKETS.filter(
      (t) =>
        (state === "all" || t.state === state) &&
        (priority === "all" || t.priority === priority) &&
        (runOnly === "all" || t.runId === runOnly) &&
        (q === "" ||
          t.subject.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.org.toLowerCase().includes(q)),
    );
  }, [query, state, priority, runOnly]);

  const ticket = SUPPORT_TICKETS.find((t) => t.id === selected) ?? null;
  const run = ticket?.runId ? ACTIVE_SCENARIOS.find((s) => s.id === ticket.runId) ?? null : null;

  const open = SUPPORT_TICKETS.filter(isOpen).length;
  const breached = SUPPORT_TICKETS.filter((t) => isBreached(t, now)).length;
  const p1 = SUPPORT_TICKETS.filter((t) => isOpen(t) && t.priority === "P1").length;
  const unassigned = SUPPORT_TICKETS.filter((t) => isOpen(t) && !t.assignee).length;

  return (
    <AdminPage title="Ticketing System" blurb="Support requests raised by operators in training.">
      <MockBanner />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" value={open} />
        <Stat label="Past SLA" value={breached} tone={breached ? "bad" : "ok"} />
        <Stat label="P1 open" value={p1} tone={p1 ? "warn" : "neutral"} />
        <Stat label="Unassigned" value={unassigned} tone={unassigned ? "warn" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card title="Triage queue" subtitle={`${rows.length} of ${SUPPORT_TICKETS.length} shown`} bodyClassName="p-0">
          <Toolbar query={query} onQuery={setQuery} placeholder="Search subject, id or org…">
            <FilterGroup label="state" value={state} options={STATES} onChange={setState} />
            <FilterGroup label="priority" value={priority} options={PRIORITIES} onChange={setPriority} />
          </Toolbar>

          <div className="flex flex-wrap items-center gap-1 border-b border-edge px-3 py-1.5">
            <span className="mr-1 text-[10.5px] uppercase tracking-wider text-gray-600">Run</span>
            <button
              onClick={() => setRunOnly("all")}
              aria-pressed={runOnly === "all"}
              className={`rounded px-1.5 py-0.5 text-[11px] transition ${
                runOnly === "all" ? "bg-info/15 text-info" : "text-gray-500 hover:bg-panelalt hover:text-gray-300"
              }`}
            >
              All
            </button>
            {ACTIVE_SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setRunOnly(s.id)}
                aria-pressed={runOnly === s.id}
                title={s.name}
                className={`rounded px-1.5 py-0.5 font-mono text-[11px] transition ${
                  runOnly === s.id ? "bg-info/15 text-info" : "text-gray-500 hover:bg-panelalt hover:text-gray-300"
                }`}
              >
                {s.id.replace("run-", "")}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[50rem] border-collapse text-left">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2 font-semibold">Ticket</th>
                  <th className="px-3 py-2 font-semibold">Pri</th>
                  <th className="px-3 py-2 font-semibold">State</th>
                  <th className="px-3 py-2 font-semibold">Assignee</th>
                  <th className="px-3 py-2 font-semibold">Run</th>
                  <th className="px-3 py-2 font-semibold">SLA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const over = isBreached(t, now);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t.id)}
                      className={`cursor-pointer border-t border-edge/60 align-middle transition ${
                        selected === t.id ? "bg-info/[0.07]" : "hover:bg-panelalt/40"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="text-[12.5px] text-gray-100">{t.subject}</div>
                        <div className="font-mono text-[10.5px] text-gray-500">
                          {t.id} · {t.org}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill>
                      </td>
                      <td className="px-3 py-2.5">
                        <Pill tone={STATE_TONE[t.state]}>{t.state.replace("-", " ")}</Pill>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-400">{t.assignee ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-gray-500">
                        {t.runId ? t.runId.replace("run-", "") : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-[11.5px] ${over ? "font-semibold text-danger-strong" : "text-gray-500"}`}>
                        {slaText(t, now)}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-gray-600">
                      No tickets match those filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Ticket" subtitle={ticket ? ticket.id : "none selected"}>
            {!ticket ? (
              <p className="py-4 text-center text-[12px] text-gray-600">Pick a row to work it.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-[13px] font-semibold text-gray-100">{ticket.subject}</div>
                  <div className="mt-0.5 text-[11.5px] text-gray-500">
                    Raised by {ticket.raisedBy} · {ticket.org} · {relativeTime(ticket.raisedAt)}
                  </div>
                </div>

                {/*
                  The link back to the exercise. This is the whole reason these
                  tickets are worth a screen of their own rather than a count.
                */}
                <div className="rounded-md border border-edge bg-surface-2 p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Came from</div>
                  {run ? (
                    <>
                      <div className="mt-1 text-[12px] text-gray-200">{run.name}</div>
                      <div className="font-mono text-[10.5px] text-gray-500">
                        {run.id} · {run.operator} · {run.progressPct}% through
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 text-[12px] text-gray-400">
                      Raised outside a scenario — the platform itself, not an exercise.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {STATES.filter((st) => st !== ticket.state).map((st) => (
                    <button
                      key={st}
                      onClick={() => recordCall(`Move ${ticket.id} to ${st}`)}
                      className="rounded border border-edge px-1.5 py-0.5 text-[11px] capitalize text-gray-300 transition hover:bg-panelalt"
                    >
                      {st.replace("-", " ")}
                    </button>
                  ))}
                </div>

                <div>
                  <label
                    htmlFor="assignee"
                    className="text-[10px] font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Assign to
                  </label>
                  <select
                    id="assignee"
                    value={ticket.assignee ?? ""}
                    onChange={(e) => recordCall(`Assign ${ticket.id} to ${e.target.value || "nobody"}`)}
                    className="mt-1 h-7 w-full rounded border border-edge bg-surface px-2 text-[12px] text-gray-200 outline-none focus:border-info/50"
                  >
                    <option value="">unassigned</option>
                    {SUPPORT_ROTA.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => record(`Opened ${ticket.id} in the operator's session — read-only view`)}
                  className="w-full rounded border border-edge px-2 py-1.5 text-[11.5px] text-gray-300 transition hover:bg-panelalt"
                >
                  View as the operator sees it
                </button>
              </div>
            )}
          </Card>

          <ActionLog lines={lines} />
        </div>
      </div>
    </AdminPage>
  );
}
