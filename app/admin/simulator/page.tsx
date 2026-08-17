"use client";

/**
 * ITQuest Admin — Simulator Controls
 * ==================================
 * Every running scenario, and the faults an admin can push into one.
 *
 * ── DESTRUCTIVE ACTIONS ARM BEFORE THEY FIRE ────────────────────────────────
 *
 * "Stop simulation" ends someone else's session. In a real build that is
 * unrecoverable for the operator on the other end, so it confirms on a second
 * click even here, where it does nothing — the muscle memory an admin builds
 * against a mock is the muscle memory they bring to production.
 *
 * ── AND THEY REPORT WHAT THEY DID ───────────────────────────────────────────
 *
 * Each action appends to a local log rather than silently mutating a row.
 * Phase 1 has no backend, so a button that visually "worked" would be lying;
 * a log line that says the call was not sent is the honest version and doubles
 * as the place real responses will land.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useState } from "react";
import { AdminPage, Card, MockBanner } from "@/components/admin/AdminShell";
import {
  ACTIVE_SCENARIOS,
  relativeTime,
  type ActiveScenario,
  type ScenarioState,
} from "@/lib/admin/mock-data";

const STATE_META: Record<ScenarioState, { label: string; className: string; dot: string }> = {
  running: { label: "Running", className: "bg-accent/15 text-accent-strong", dot: "bg-accent" },
  paused: { label: "Paused", className: "bg-warn/15 text-warn-strong", dot: "bg-warn" },
  faulted: { label: "Faulted", className: "bg-danger/15 text-danger-strong", dot: "bg-danger" },
  queued: { label: "Queued", className: "bg-gray-500/15 text-gray-400", dot: "bg-gray-500" },
};

/** The faults an admin can inject. Ids match the simulator's own cascade kinds. */
const INJECTABLE = [
  { id: "network-error", label: "Inject network error", detail: "packet loss and latency on the backbone" },
  { id: "server-crash", label: "Trigger server crash", detail: "hard-stop a random rack node" },
  { id: "thermal", label: "Thermal runaway", detail: "raise inlet temperature past the trip point" },
  { id: "rogue-dhcp", label: "Rogue DHCP", detail: "introduce a competing lease server" },
];

export default function SimulatorControls() {
  const [selected, setSelected] = useState<string | null>(ACTIVE_SCENARIOS[0]?.id ?? null);
  const [armedStop, setArmedStop] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const scenario = ACTIVE_SCENARIOS.find((s) => s.id === selected) ?? null;

  const record = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 12));

  function inject(run: ActiveScenario, faultId: string, label: string) {
    record(`${label} -> ${run.id} · not sent (no backend in Phase 1)`);
  }

  function stop(run: ActiveScenario) {
    if (armedStop !== run.id) {
      setArmedStop(run.id);
      record(`Stop requested for ${run.id} — click again to confirm`);
      window.setTimeout(() => setArmedStop((a) => (a === run.id ? null : a)), 4000);
      return;
    }
    setArmedStop(null);
    record(`Stop confirmed for ${run.id} · not sent (no backend in Phase 1)`);
  }

  return (
    <AdminPage
      title="Simulator Controls"
      blurb="Running scenarios across every estate, and the faults you can push into them."
    >
      <MockBanner />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Active scenarios" subtitle={`${ACTIVE_SCENARIOS.length} runs`} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2 font-semibold">Scenario</th>
                  <th className="px-3 py-2 font-semibold">Operator</th>
                  <th className="px-3 py-2 font-semibold">State</th>
                  <th className="px-3 py-2 font-semibold">Progress</th>
                  <th className="px-3 py-2 font-semibold">Tickets</th>
                  <th className="px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVE_SCENARIOS.map((s) => {
                  const meta = STATE_META[s.state];
                  const isSelected = s.id === selected;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelected(s.id)}
                      data-selected={isSelected}
                      className="table-row cursor-pointer"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                          <div className="min-w-0">
                            <div className="truncate text-gray-100">{s.name}</div>
                            <div className="truncate font-mono text-[10px] text-gray-400">
                              {s.id} · {s.org}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400">{s.operator}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-3">
                            <div className="h-full rounded-full bg-brand-fill" style={{ width: `${s.progressPct}%` }} />
                          </div>
                          <span className="font-mono text-[10px] tabular-nums text-gray-400">{s.progressPct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-gray-400">{s.openTickets}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              record(`${s.state === "paused" ? "Resume" : "Pause"} -> ${s.id} · not sent`);
                            }}
                            className="rounded border border-edge px-2 py-1 text-[10.5px] text-gray-300 transition hover:bg-panelalt"
                          >
                            {s.state === "paused" ? "Resume" : "Pause"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              stop(s);
                            }}
                            className={`rounded border px-2 py-1 text-[10.5px] font-medium transition ${
                              armedStop === s.id
                                ? "border-danger bg-danger/20 text-danger-strong"
                                : "border-danger/40 text-danger-strong hover:bg-danger/10"
                            }`}
                          >
                            {armedStop === s.id ? "Confirm stop" : "Stop"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card
            title="Fault injection"
            subtitle={scenario ? `${scenario.id} — ${scenario.name}` : "Select a scenario"}
          >
            {scenario ? (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {scenario.injectedFaults.length ? (
                    scenario.injectedFaults.map((f) => (
                      <span key={f} className="rounded-full bg-warn/15 px-2 py-0.5 font-mono text-[10px] text-warn-strong">
                        {f}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-gray-500">No faults injected into this run.</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {INJECTABLE.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => inject(scenario, f.id, f.label)}
                      disabled={scenario.state === "queued"}
                      className="group flex items-start gap-2.5 rounded-md border border-edge px-3 py-2 text-left transition hover:border-edge-strong hover:bg-panelalt disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-gray-200">{f.label}</span>
                        <span className="block text-[10.5px] leading-snug text-gray-500">{f.detail}</span>
                      </span>
                      <span aria-hidden="true" className="mt-0.5 shrink-0 font-mono text-[11px] text-gray-600 transition group-hover:text-brand-text">
                        &rarr;
                      </span>
                    </button>
                  ))}
                </div>
                {scenario.state === "queued" && (
                  <p className="mt-2 text-[10.5px] leading-relaxed text-gray-600">
                    A queued run has no world to fault yet. Injection unlocks once it starts.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12px] text-gray-500">Pick a run from the table to target it.</p>
            )}
          </Card>

          <Card title="Action log" subtitle="This session only" bodyClassName="p-0">
            {log.length === 0 ? (
              <p className="px-4 py-3 text-[11.5px] text-gray-500">
                Nothing yet. Actions are recorded here rather than silently applied — Phase 1 has no
                backend to send them to.
              </p>
            ) : (
              <ol className="divide-y divide-edge/70">
                {log.map((line, i) => (
                  <li
                    key={i}
                    className={`px-4 py-1.5 font-mono text-[10.5px] ${i === 0 ? "text-gray-200" : "text-gray-500"}`}
                  >
                    {line}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </AdminPage>
  );
}
