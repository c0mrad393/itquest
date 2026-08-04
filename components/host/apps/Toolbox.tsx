"use client";

/**
 * Tech Toolbox & Documentation Center (Level-0 host app, Phase 6)
 * ---------------------------------------------------------------
 * Searchable operator documentation, fully data-driven:
 *   - Runbooks  — generated from the scenario registry (summary + hints)
 *   - CLI Ref   — generated from the live command interpreter registry
 * Nothing here is hand-maintained; new scenarios/commands appear automatically.
 */

import { useMemo, useState } from "react";
import { TICKET_TEMPLATES } from "@/lib/tickets/matrix";
import { linuxInterpreter } from "@/lib/infra/terminal";
import { TRACK_META } from "@/lib/host/ticket-ui";
import { AppIcon } from "@/components/ui/app-icons";
import { useInfraStore } from "@/lib/infra/store";
import { connectedLoadWatts, pduSpec, rackPower, rackThermal, THERMAL_LABEL } from "@/lib/core";

type Tab = "runbooks" | "cli" | "physics";

export default function Toolbox() {
  const [tab, setTab] = useState<Tab>("runbooks");
  const [query, setQuery] = useState("");

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      {/* This app is registry-gated to God Mode; say so plainly so a QA session
          never mistakes ticket walkthroughs for something players can see. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/[0.07] px-4 py-1.5 text-[10px] text-amber-200/80">
        <AppIcon id="alert" size={12} />
        <span className="font-semibold text-amber-200">QA build only</span>
        <span>
          Per-ticket walkthroughs — hidden from normal players. Use the Company
          Wiki for in-world documentation.
        </span>
      </div>
      <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-4 py-2.5">
        <TabBtn active={tab === "runbooks"} onClick={() => setTab("runbooks")}>
          <AppIcon id="book" size={13} /> Runbooks
        </TabBtn>
        <TabBtn active={tab === "cli"} onClick={() => setTab("cli")}>
          <AppIcon id="keyboard" size={13} /> CLI Reference
        </TabBtn>
        <TabBtn active={tab === "physics"} onClick={() => setTab("physics")}>
          <AppIcon id="rack" size={13} /> Rack Physics
        </TabBtn>
        {tab !== "physics" && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "runbooks" ? "Search runbooks…" : "Search commands…"}
            className="ml-auto w-56 rounded border border-edge bg-panel px-2 py-1 text-xs outline-none placeholder:text-gray-600 focus:border-info"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto term-scroll p-4">
        {tab === "runbooks" ? (
          <Runbooks query={query} />
        ) : tab === "cli" ? (
          <CliRef query={query} />
        ) : (
          <PhysicsDebug />
        )}
      </div>
    </div>
  );
}

/**
 * QA controls for the v0.3.1 datacentre physics — the same overrides
 * `sudo elevate debug` exposes as `TriageOS.power()` / `TriageOS.cooling()`,
 * surfaced as switches so a tester does not have to leave the OS to disable
 * a mechanic that is in the way.
 */
function PhysicsDebug() {
  const rack = useInfraStore((s) => s.infra.rack);
  const setOverrides = useInfraStore((s) => s.rackSetOverrides);
  const resetBreaker = useInfraStore((s) => s.rackResetBreaker);

  const power = rackPower(rack);
  const thermal = rackThermal(rack);
  const ceiling = pduSpec(rack.pduId).maxWatts;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Live rack state</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
          <Stat label="Feed" value={pduSpec(rack.pduId).label} />
          <Stat label="Ceiling" value={`${ceiling.toLocaleString()}W`} />
          <Stat label="Cabled load" value={`${connectedLoadWatts(rack).toLocaleString()}W`} />
          <Stat label="Flowing draw" value={`${power.drawWatts.toLocaleString()}W (${power.loadPct}%)`} />
          <Stat label="Temperature" value={`${thermal.tempC.toFixed(1)}\u00b0C [${THERMAL_LABEL[thermal.state]}]`} />
          <Stat label="Cooling fitted" value={`\u2212${thermal.coolingC}\u00b0C`} />
          <Stat label="Breaker" value={rack.breakerTripped ? "OPEN (tripped)" : "closed"} />
          <Stat label="Devices" value={`${rack.devices.length} mounted`} />
        </dl>
      </section>

      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Overrides</h3>
        <Toggle
          label="Unlimited power"
          hint="PDU capacity is treated as infinite — the breaker never trips."
          on={!!rack.overrides?.unlimitedPower}
          onChange={(v) => setOverrides({ unlimitedPower: v })}
        />
        <Toggle
          label="Unlimited cooling"
          hint="Rack is pinned to ambient regardless of what is mounted."
          on={!!rack.overrides?.unlimitedCooling}
          onChange={(v) => setOverrides({ unlimitedCooling: v })}
        />
        <button
          onClick={() => resetBreaker()}
          className="mt-2 rounded border border-edge px-2 py-1 text-[11px] text-gray-200 hover:bg-panel"
        >
          Force breaker reset
        </button>
        <p className="mt-2 text-[10px] text-gray-500">
          Equivalent console API: <code className="text-info">TriageOS.power(true)</code>,{" "}
          <code className="text-info">TriageOS.cooling(true)</code>,{" "}
          <code className="text-info">TriageOS.physics(true)</code>.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-200">{value}</dd>
    </>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-2 flex cursor-pointer items-start gap-2.5">
      <span
        onClick={() => onChange(!on)}
        className={`mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${on ? "bg-info" : "bg-edge"}`}
      >
        <span className={`h-3 w-3 rounded-full bg-white transition ${on ? "translate-x-3" : ""}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-gray-100">{label}</span>
        <span className="block text-[10px] text-gray-500">{hint}</span>
      </span>
    </label>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-info/20 text-info" : "text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

const DIFF_LABEL: Record<string, string> = {
  Tier_1_Easy: "Tier 1",
  Tier_2_Medium: "Tier 2",
  Tier_3_Hard: "Tier 3",
  Tier_4_Expert: "Tier 4",
};

function Runbooks({ query }: { query: string }) {
  const q = query.trim().toLowerCase();
  const templates = useMemo(
    () =>
      Object.values(TICKET_TEMPLATES).filter(
        (s) =>
          !q ||
          `${s.category} ${s.summary} ${s.track} ${s.hints.join(" ")}`.toLowerCase().includes(q),
      ),
    [q],
  );

  if (templates.length === 0) {
    return <Empty text={`No runbooks match “${query}”.`} />;
  }

  return (
    <div className="space-y-3">
      {templates.map((s) => {
        const track = TRACK_META[s.track];
        return (
          <details
            key={s.id}
            className="group rounded-xl border border-edge bg-panelalt open:border-info/40"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
              <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${track.color}`}>
                <AppIcon id={track.iconId} size={11} /> {s.category}
              </span>
              <span className="rounded bg-gray-500/15 px-1.5 py-0.5 text-[10px] text-gray-300">
                {DIFF_LABEL[s.difficulty]}
              </span>
              <span className="font-semibold text-gray-100">{s.summary}</span>
              {!s.playable && (
                <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[9px] text-warn">guided</span>
              )}
              <span className="ml-auto text-[10px] text-gray-600 group-open:hidden">expand ▾</span>
            </summary>
            <div className="border-t border-edge/60 px-4 py-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Procedure
              </div>
              <ol className="space-y-1.5">
                {s.hints.map((h, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-300">
                    <span className="font-mono text-info">{i + 1}.</span>
                    <span className="leading-relaxed">{h}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 font-mono text-[10px] text-gray-600">
                SLA {Math.round(s.slaDuration / 60)}m · {s.xpReward} XP
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function CliRef({ query }: { query: string }) {
  const q = query.trim().toLowerCase();
  const commands = useMemo(
    () =>
      linuxInterpreter
        .list()
        .filter((c) => !q || `${c.name} ${c.summary} ${c.usage}`.toLowerCase().includes(q)),
    [q],
  );

  if (commands.length === 0) {
    return <Empty text={`No commands match “${query}”.`} />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-edge">
      <div className="grid grid-cols-[130px_1fr_1fr] gap-2 border-b border-edge bg-panelalt px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Command</span>
        <span>Description</span>
        <span>Usage</span>
      </div>
      {commands.map((c) => (
        <div
          key={c.name}
          className="grid grid-cols-[130px_1fr_1fr] gap-2 border-b border-edge/60 px-4 py-2 last:border-b-0"
        >
          <span className="font-mono text-xs text-info">{c.name}</span>
          <span className="text-xs text-gray-300">{c.summary}</span>
          <span className="font-mono text-[11px] text-gray-500">{c.usage}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-xs text-gray-600">{text}</div>;
}
