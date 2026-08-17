"use client";

/**
 * Windows Update (nested Windows environment)
 * ===========================================
 * Renders the update state for one machine and calls the transitions. It
 * holds NO update logic of its own — every rule lives in
 * lib/vm/windows-update.ts, and this is the face of it.
 *
 * That split is what makes the screen ticket-drivable: an injected fault
 * changes what this renders without this knowing a ticket exists.
 *
 * ── THE ERROR STATE IS THE MOST IMPORTANT ONE ───────────────────────────────
 *
 * Real Windows Update shows a hex code and a "Retry" button, and that is the
 * single least useful screen in the operating system — the code is the only
 * clue and it is presented as an opaque token. Here the code stays (a student
 * has to recognise it in the wild) but the cause and the repair sit under it.
 * The applet is a teaching surface, and hiding the answer to look authentic
 * would be authenticity bought at the price of the whole point.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect, useState } from "react";
import { useUpdateStore } from "@/lib/vm/update-store";
import { UPDATE_ERRORS, canCheck, updateSummary } from "@/lib/vm/windows-update";
import { IconCheck, IconAlert, IconClock, IconShield, IconX } from "@/components/ui/icons";

export default function WindowsUpdatePanel({ nodeId }: { nodeId: string }) {
  const state = useUpdateStore((s) => s.byNode[nodeId]) ?? useUpdateStore.getState().stateFor(nodeId);
  const check = useUpdateStore((s) => s.check);
  const install = useUpdateStore((s) => s.install);
  const restart = useUpdateStore((s) => s.restart);
  const pause = useUpdateStore((s) => s.pause);
  const resume = useUpdateStore((s) => s.resume);
  const setAutomatic = useUpdateStore((s) => s.setAutomatic);

  // A ticking clock, because "paused for 6 more days" and the busy phases are
  // both time-dependent and a stale banner reads as a frozen screen.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const now = Date.now();
  const busy = state.phase === "checking" || state.phase === "installing";
  const paused = !!state.pausedUntil && state.pausedUntil > now;
  const err = state.error ? UPDATE_ERRORS[state.error] : null;

  const tone =
    state.phase === "failed"
      ? { ring: "border-danger/40 bg-danger/10", ink: "text-danger-strong", Icon: IconAlert }
      : state.phase === "restart-required"
        ? { ring: "border-warn/40 bg-warn/10", ink: "text-warn-strong", Icon: IconClock }
        : paused
          ? { ring: "border-warn/40 bg-warn/10", ink: "text-warn-strong", Icon: IconClock }
          : state.phase === "up-to-date"
            ? { ring: "border-accent/40 bg-accent/10", ink: "text-accent-strong", Icon: IconCheck }
            : { ring: "border-info/40 bg-info/10", ink: "text-info-strong", Icon: IconShield };

  return (
    <div className="flex h-full flex-col overflow-y-auto term-scroll bg-panel p-4 text-[12px] text-gray-200">
      {/* ── Status ───────────────────────────────────────────────────── */}
      <section className={`rounded-md border p-3.5 ${tone.ring}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${tone.ring} ${tone.ink}`}>
            <tone.Icon size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={`text-[14px] font-semibold ${tone.ink}`}>{updateSummary(state, now)}</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {state.lastCheckedAt
                ? `Last checked ${relative(state.lastCheckedAt, now)}`
                : "Never checked on this machine"}
              {state.source === "wsus" && (
                <>
                  {" · "}
                  <span className="font-mono">
                    {state.wsusServer ?? "WSUS server not configured"}
                  </span>
                </>
              )}
            </p>

            {busy && (
              <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                <div className="rdp-progress h-full w-1/3 rounded-full bg-info" />
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {state.phase === "restart-required" ? (
                <button onClick={() => restart(nodeId)} className="btn-primary btn-sm">
                  Restart now
                </button>
              ) : state.phase === "available" ? (
                <button onClick={() => install(nodeId)} className="btn-primary btn-sm">
                  Download and install
                </button>
              ) : (
                <button
                  onClick={() => check(nodeId)}
                  disabled={!canCheck(state, now)}
                  className="btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-45"
                  title={paused ? "Updates are paused on this machine" : undefined}
                >
                  {busy ? "Checking…" : "Check for updates"}
                </button>
              )}
              {paused ? (
                <button onClick={() => resume(nodeId)} className="btn-secondary btn-sm">
                  Resume updates
                </button>
              ) : (
                <button onClick={() => pause(nodeId)} className="btn-secondary btn-sm">
                  Pause for 7 days
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── The failure, explained ───────────────────────────────────── */}
      {err && (
        <section className="mt-3 rounded-md border border-edge bg-panelalt p-3.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[13px] font-semibold text-danger-strong">{err.code}</span>
            <span className="font-mono text-[10px] text-gray-500">{err.label}</span>
          </div>
          <dl className="mt-2 space-y-1.5">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                What this means
              </dt>
              <dd className="mt-0.5 text-[11.5px] leading-relaxed text-gray-300">{err.cause}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                How it is fixed
              </dt>
              <dd className="mt-0.5 text-[11.5px] leading-relaxed text-gray-300">{err.remedy}</dd>
            </div>
          </dl>
        </section>
      )}

      {/* ── Pending ──────────────────────────────────────────────────── */}
      {state.pending.length > 0 && (
        <section className="mt-3">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Available ({state.pending.length})
          </h3>
          <ul className="divide-y divide-edge/70 rounded-md border border-edge">
            {state.pending.map((p) => (
              <li key={p.kb} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-gray-200">{p.title}</span>
                  <span className="block font-mono text-[10px] text-gray-500">{p.kb}</span>
                </span>
                {p.category === "security" && (
                  <span className="shrink-0 rounded bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold text-danger-strong">
                    Security
                  </span>
                )}
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-gray-500">
                  {p.sizeMb} MB
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Settings ─────────────────────────────────────────────────── */}
      <section className="mt-3 rounded-md border border-edge bg-panelalt p-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Update settings
        </h3>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={state.automaticUpdates}
            disabled={state.managedByPolicy}
            onChange={(e) => setAutomatic(nodeId, e.target.checked)}
            className="mt-0.5 accent-info disabled:opacity-40"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] text-gray-200">
              Install updates automatically
            </span>
            {state.managedByPolicy && (
              /* The line that turns a dead-end into a diagnosis: the control
                 is disabled ON PURPOSE and the screen says which layer owns
                 it, so the operator goes to Group Policy instead of retrying. */
              <span className="mt-0.5 block text-[10px] leading-relaxed text-warn-strong">
                Some settings are managed by your organisation. This machine takes updates from{" "}
                <span className="font-mono">{state.wsusServer ?? "an unconfigured WSUS server"}</span>,
                set by Group Policy — it cannot be changed here.
              </span>
            )}
          </span>
        </label>
      </section>

      {/* ── History ──────────────────────────────────────────────────── */}
      <section className="mt-3">
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Update history
        </h3>
        <ul className="divide-y divide-edge/70 rounded-md border border-edge">
          {state.history.slice(0, 8).map((h, i) => (
            <li key={`${h.kb}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
              <span className={`shrink-0 ${h.outcome === "failed" ? "text-danger-strong" : "text-accent-strong"}`}>
                {h.outcome === "failed" ? <IconX size={11} /> : <IconCheck size={11} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-gray-300">{h.title}</span>
                <span className="block font-mono text-[9.5px] text-gray-600">
                  {h.kb}
                  {h.errorCode && ` · ${h.errorCode}`}
                </span>
              </span>
              <span className="shrink-0 text-[10px] text-gray-600">
                {new Date(h.installedAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function relative(at: number, now: number): string {
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}
