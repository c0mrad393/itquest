"use client";

/**
 * HardwareLab — Hardware Provisioning Lab & Field Dispatch
 * ========================================================
 * A Level-0 host app with two views:
 *   • Active Deployment Tickets — hardware tickets + the dispatch console.
 *   • Interactive Workshop      — the assembly + OS-install mini-simulators.
 * Provisioning a device unlocks [Dispatch Field Team]; the countdown flips the
 * physical node online + healthy, and the reconciler resolves the ticket.
 */

import { useEffect, useState } from "react";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useInfraStore } from "@/lib/infra/store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useFieldOpsStore } from "@/lib/hardware/store";
import {
  isHardwareTicket,
  jobForTicket,
  STOCK_INVENTORY,
  componentLabel,
  type HardwareJob,
  type StockItem,
  type WorkshopStep,
} from "@/lib/hardware/types";
import type { Ticket } from "@/lib/core";

const DISPATCH_SECONDS = 14;
const STEP_LABEL: Record<WorkshopStep, string> = { assembly: "Bench assembly", "os-install": "OS imaging" };

export default function HardwareLab() {
  const tickets = useTicketStore((s) => s.tickets);
  const steps = useFieldOpsStore((s) => s.steps);
  const dispatches = useFieldOpsStore((s) => s.dispatches);
  const startDispatch = useFieldOpsStore((s) => s.startDispatch);

  const hardware = tickets.filter(
    (t) => isHardwareTicket(t.templateId) && t.status !== "resolved" && t.status !== "closed",
  );

  const [view, setView] = useState<"tickets" | "workshop">("tickets");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = hardware.find((t) => t.id === selectedId) ?? null;
  const job = selected ? jobForTicket(selected) : null;

  const done = selectedId ? steps[selectedId] ?? {} : {};
  const provisioned = job ? job.requiredSteps.every((r) => done[r]) : false;
  const dispatch = selectedId ? dispatches[selectedId] : undefined;

  function dispatchTeam() {
    if (!job) return;
    startDispatch(job.ticketId, job.targetNodeId, DISPATCH_SECONDS);
    useDialogueStore.getState().note(job.ticketId, "Field technician is moving the unit to rack 4B…");
  }

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      {/* Header + view tabs */}
      <div className="flex items-center gap-3 border-b border-edge bg-panelalt px-4 py-2.5">
        <span className="text-lg">🔧</span>
        <span className="text-sm font-semibold">Hardware Lab &amp; Deployment</span>
        <div className="ml-4 flex rounded-lg border border-edge p-0.5 text-xs">
          <TabBtn active={view === "tickets"} onClick={() => setView("tickets")}>Active Deployment Tickets</TabBtn>
          <TabBtn active={view === "workshop"} onClick={() => setView("workshop")}>Interactive Workshop</TabBtn>
        </div>
        <span className="ml-auto rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">
          {hardware.length} open
        </span>
      </div>

      {view === "tickets" ? (
        <div className="flex min-h-0 flex-1">
          {/* Ticket list */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-edge">
            {hardware.length === 0 && <Empty text="No hardware deployments in the queue." />}
            {hardware.map((t) => {
              const j = jobForTicket(t);
              const d = dispatches[t.id];
              const prov = j ? j.requiredSteps.every((r) => (steps[t.id] ?? {})[r]) : false;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`block w-full border-b border-edge/50 px-3 py-2.5 text-left ${selectedId === t.id ? "bg-info/10" : "hover:bg-panelalt"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{j?.chassis === "rack" ? "🗄️" : "🖥️"}</span>
                    <span className="truncate text-xs text-gray-100">{j?.targetHostname ?? "—"}</span>
                    <span className="ml-auto">{statusChip(d?.status, prov)}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-gray-500">{t.code} · {t.difficulty.replace(/_/g, " ")}</div>
                </button>
              );
            })}
          </div>

          {/* Detail + dispatch console */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!selected || !job ? (
              <Empty text="Select a deployment ticket." />
            ) : (
              <DeploymentDetail
                ticket={selected}
                job={job}
                done={done}
                provisioned={provisioned}
                dispatch={dispatch}
                onGoToWorkshop={() => setView("workshop")}
                onDispatch={dispatchTeam}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!selected || !job ? (
            <Empty text="Pick a deployment ticket in Active Deployment Tickets, then return here to build it." />
          ) : (
            <Workshop ticketId={selected.id} job={job} done={done} onProvisioned={() => setView("tickets")} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Deployment detail + dispatch console ─────────────────────────────────────

function DeploymentDetail({
  ticket, job, done, provisioned, dispatch, onGoToWorkshop, onDispatch,
}: {
  ticket: Ticket;
  job: HardwareJob;
  done: Partial<Record<WorkshopStep, boolean>>;
  provisioned: boolean;
  dispatch: ReturnType<typeof useFieldOpsStore.getState>["dispatches"][string] | undefined;
  onGoToWorkshop: () => void;
  onDispatch: () => void;
}) {
  const node = useInfraStore((s) => s.infra.nodes[job.targetNodeId]);
  const completed = dispatch?.status === "completed";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <div className="text-base font-semibold text-gray-50">{ticket.title}</div>
        <div className="mt-1 font-mono text-[11px] text-gray-500">
          {ticket.code} · target {job.targetHostname} · {node ? `health ${node.health.status}` : "—"}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-gray-400">{ticket.description}</p>

      {/* Provisioning checklist */}
      <div className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Provisioning checklist</div>
        <div className="space-y-1.5">
          {job.requiredSteps.map((s) => (
            <div key={s} className="flex items-center gap-2 text-xs">
              <span className={done[s] ? "text-emerald-400" : "text-gray-600"}>{done[s] ? "✓" : "○"}</span>
              <span className={done[s] ? "text-gray-200" : "text-gray-400"}>{STEP_LABEL[s]}</span>
            </div>
          ))}
        </div>
        {!provisioned && (
          <button onClick={onGoToWorkshop} className="mt-3 rounded-md border border-info/40 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/10">
            Open Interactive Workshop →
          </button>
        )}
      </div>

      {/* Dispatch console */}
      <div className={`rounded-lg border p-3 ${completed ? "border-emerald-500/40 bg-emerald-500/5" : provisioned ? "border-info/40 bg-info/5" : "border-edge bg-panelalt/50"}`}>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Field dispatch</div>
        {completed ? (
          <div className="text-xs text-emerald-300">✅ {dispatch?.note} — {job.targetHostname} is online at 100% health.</div>
        ) : dispatch?.status === "in_progress" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              {dispatch.note}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
              <div className="h-full rounded-full bg-info transition-all duration-1000 ease-linear" style={{ width: `${((dispatch.total - dispatch.timeLeft) / dispatch.total) * 100}%` }} />
            </div>
            <div className="text-right font-mono text-[10px] text-gray-500">ETA {dispatch.timeLeft}s · rack 4B</div>
          </div>
        ) : (
          <button
            onClick={onDispatch}
            disabled={!provisioned}
            className="w-full rounded-md bg-info px-3 py-2 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500"
          >
            🚚 Dispatch Field Team for Physical Swap
          </button>
        )}
        {!provisioned && !dispatch && <div className="mt-2 text-[10px] text-gray-500">Complete provisioning in the Workshop to unlock dispatch.</div>}
      </div>
    </div>
  );
}

// ── Interactive Workshop (step router) ───────────────────────────────────────

function Workshop({
  ticketId, job, done, onProvisioned,
}: {
  ticketId: string;
  job: HardwareJob;
  done: Partial<Record<WorkshopStep, boolean>>;
  onProvisioned: () => void;
}) {
  const completeStep = useFieldOpsStore((s) => s.completeStep);
  const firstUndone = job.requiredSteps.find((s) => !done[s]);
  const [active, setActive] = useState<WorkshopStep>(firstUndone ?? job.requiredSteps[0]);

  function finish(step: WorkshopStep) {
    completeStep(ticketId, step);
    const remaining = job.requiredSteps.filter((s) => s !== step && !done[s]);
    if (remaining.length) setActive(remaining[0]);
  }

  const allDone = job.requiredSteps.every((s) => done[s]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {job.requiredSteps.map((s, i) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${active === s ? "border-info bg-info/15 text-gray-100" : "border-edge text-gray-400 hover:bg-panelalt"}`}
          >
            <span className={done[s] ? "text-emerald-400" : "text-gray-500"}>{done[s] ? "✓" : i + 1}</span>
            {STEP_LABEL[s]}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-gray-500">{job.targetHostname}</span>
      </div>

      {active === "assembly" ? (
        <AssemblySim job={job} completed={!!done.assembly} onComplete={() => finish("assembly")} />
      ) : (
        <OSInstallSim job={job} completed={!!done["os-install"]} onComplete={() => finish("os-install")} />
      )}

      {allDone && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-300">
          ✅ Device fully provisioned.
          <button onClick={onProvisioned} className="ml-auto rounded-md bg-emerald-500/80 px-3 py-1.5 font-semibold text-black hover:brightness-110">
            Go to dispatch →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Assembly simulator (extract defective → snap in replacement) ─────────────

function AssemblySim({ job, completed, onComplete }: { job: HardwareJob; completed: boolean; onComplete: () => void }) {
  const [extracted, setExtracted] = useState(completed);
  const [installed, setInstalled] = useState(completed);
  const [wrong, setWrong] = useState<string | null>(null);
  const stock = STOCK_INVENTORY[job.defective] ?? [];
  const isRack = job.chassis === "rack";

  function pick(item: StockItem) {
    if (!extracted) return;
    if (item.label === job.replacementLabel) {
      setInstalled(true);
      setWrong(null);
      setTimeout(onComplete, 700);
    } else {
      setWrong(item.id);
      setTimeout(() => setWrong(null), 600);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_220px] gap-4">
      {/* Blueprint / chassis */}
      <div className="rounded-xl border border-info/20 bg-[#071018] p-4" style={{ backgroundImage: "linear-gradient(rgba(56,189,248,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,0.06) 1px,transparent 1px)", backgroundSize: "20px 20px" }}>
        <div className="mb-3 flex items-center justify-between text-[11px] text-info/80">
          <span>{isRack ? "STORAGE RACK TRAY · REAR" : "WORKSTATION MAINBOARD"}</span>
          <span className="font-mono">{job.targetHostname}</span>
        </div>

        {isRack ? (
          <div className="space-y-2">
            {[0, 1, 2].map((bay) => {
              const isTarget = bay === 1;
              return (
                <div key={bay} className="flex items-center gap-2">
                  <span className="w-10 text-[10px] text-gray-500">Bay {bay}</span>
                  {isTarget ? (
                    <Slot state={installed ? "filled" : extracted ? "empty" : "defective"} onExtract={() => setExtracted(true)} label={installed ? job.replacementLabel : "/dev/sdb"} wide />
                  ) : (
                    <div className="h-9 flex-1 rounded-md border border-white/5 bg-white/[0.03] text-[10px] leading-9 text-gray-600">&nbsp;&nbsp;/dev/sd{String.fromCharCode(97 + bay)} · OK</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex gap-4">
            {/* CPU */}
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-[10px] text-gray-500">CPU</div>
            {/* RAM slots */}
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-[10px] text-gray-500">DIMM slots</span>
              <div className="grid grid-cols-2 gap-1.5">
                <Slot state={installed ? "filled" : extracted ? "empty" : "defective"} onExtract={() => setExtracted(true)} label={installed ? job.replacementLabel : "8GB · FAULT"} />
                <div className="h-9 rounded-md border border-white/5 bg-white/[0.03] text-center text-[10px] leading-9 text-gray-600">8GB · OK</div>
                <div className="h-9 rounded-md border border-dashed border-white/10 text-center text-[10px] leading-9 text-gray-700">empty</div>
                <div className="h-9 rounded-md border border-dashed border-white/10 text-center text-[10px] leading-9 text-gray-700">empty</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 text-[11px]">
          {installed ? (
            <span className="text-emerald-400">✓ Replacement seated. Component healthy.</span>
          ) : extracted ? (
            <span className="text-amber-300">Slot empty — pick the correct replacement from Stock Inventory →</span>
          ) : (
            <span className="text-danger">⚠ Click the flashing red {componentLabel(job.defective)} to extract it.</span>
          )}
        </div>
      </div>

      {/* Stock inventory */}
      <div className="rounded-xl border border-edge bg-panelalt/40 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Stock Inventory</div>
        <div className="space-y-2">
          {stock.map((item) => (
            <button
              key={item.id}
              onClick={() => pick(item)}
              disabled={!extracted || installed}
              className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition disabled:opacity-40 ${
                wrong === item.id ? "border-danger bg-danger/10" : "border-edge hover:border-info/50 hover:bg-info/5"
              }`}
            >
              <span className="text-lg">📦</span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] text-gray-100">{item.label}</span>
                <span className="block truncate text-[9px] text-gray-500">{item.spec}</span>
              </span>
            </button>
          ))}
        </div>
        {wrong && <div className="mt-2 text-[10px] text-danger">Not the specified replacement.</div>}
        <div className="mt-3 text-[9px] text-gray-600">Required: {job.replacementLabel}</div>
      </div>
    </div>
  );
}

function Slot({ state, onExtract, label, wide }: { state: "defective" | "empty" | "filled"; onExtract: () => void; label: string; wide?: boolean }) {
  if (state === "defective") {
    return (
      <button onClick={onExtract} className={`h-9 ${wide ? "flex-1" : "w-full"} animate-pulse rounded-md border border-danger bg-danger/25 text-center text-[10px] font-semibold leading-9 text-danger`}>
        {label} · CLICK TO EXTRACT
      </button>
    );
  }
  if (state === "empty") {
    return <div className={`h-9 ${wide ? "flex-1" : "w-full"} rounded-md border-2 border-dashed border-amber-400/50 text-center text-[10px] leading-8 text-amber-300/70`}>empty slot</div>;
  }
  return <div className={`h-9 ${wide ? "flex-1" : "w-full"} rounded-md border border-emerald-500/50 bg-emerald-500/15 text-center text-[10px] font-semibold leading-9 text-emerald-300`}>{label} ✓</div>;
}

// ── OS installation simulator (BIOS/PXE → partition → hostname → install) ─────

type OsPhase = "bios" | "partition" | "hostname" | "installing" | "done";

function OSInstallSim({ job, completed, onComplete }: { job: HardwareJob; completed: boolean; onComplete: () => void }) {
  const [phase, setPhase] = useState<OsPhase>(completed ? "done" : "bios");
  const [scheme, setScheme] = useState<"GPT" | "MBR">("GPT");
  const [hostname, setHostname] = useState(job.targetHostname);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (phase !== "installing") return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { clearInterval(id); setPhase("done"); return 100; }
        return p + 4;
      });
    }, 90);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "done" && !completed) onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="mx-auto max-w-xl">
      {/* Monitor bezel */}
      <div className="rounded-2xl border-4 border-[#1a1f27] bg-[#05070a] p-1 shadow-2xl">
        <div className="min-h-[280px] rounded-lg bg-black p-5 font-mono text-[12px] text-emerald-400">
          {phase === "bios" && (
            <div>
              <div className="mb-3 text-emerald-500">TriageBIOS v2.4 — Boot Menu</div>
              <div className="mb-4 text-emerald-300/70">Select a boot device:</div>
              <div className="space-y-1.5">
                <BootRow onClick={() => setPhase("partition")} highlight>▶ Boot from Corporate Network (PXE)</BootRow>
                <BootRow>Boot from Local Disk (empty)</BootRow>
                <BootRow>Enter BIOS Setup</BootRow>
              </div>
              <div className="mt-5 text-[10px] text-emerald-600">↑↓ to move · Enter to select · PXE image: corp-win11-gold</div>
            </div>
          )}

          {phase === "partition" && (
            <div>
              <div className="mb-3 text-emerald-500">Windows Deployment · Disk Partitioning</div>
              <div className="mb-3 flex gap-2">
                {(["GPT", "MBR"] as const).map((s) => (
                  <button key={s} onClick={() => setScheme(s)} className={`rounded border px-2 py-0.5 text-[11px] ${scheme === s ? "border-emerald-400 bg-emerald-400/10 text-emerald-200" : "border-emerald-800 text-emerald-500"}`}>{s}</button>
                ))}
              </div>
              <div className="space-y-1 text-[11px] text-emerald-300/80">
                <div className="flex justify-between border-b border-emerald-900 pb-1"><span>Partition</span><span>Size</span></div>
                <div className="flex justify-between"><span>EFI System</span><span>100 MB</span></div>
                <div className="flex justify-between"><span>Windows (C:)</span><span>{scheme === "GPT" ? "460 GB" : "1.9 TB"}</span></div>
                <div className="flex justify-between"><span>Recovery</span><span>800 MB</span></div>
              </div>
              <button onClick={() => setPhase("hostname")} className="mt-4 rounded border border-emerald-400 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200 hover:bg-emerald-400/20">Apply &amp; Next →</button>
            </div>
          )}

          {phase === "hostname" && (
            <div>
              <div className="mb-3 text-emerald-500">Windows Deployment · Machine Identity</div>
              <div className="mb-1 text-[11px] text-emerald-300/70">Computer name (hostname):</div>
              <input value={hostname} onChange={(e) => setHostname(e.target.value)} className="w-full rounded border border-emerald-700 bg-black px-2 py-1 text-[12px] text-emerald-200 outline-none focus:border-emerald-400" />
              <div className="mt-2 text-[10px] text-emerald-600">Joining domain · applying corporate baseline GPO</div>
              <button onClick={() => setPhase("installing")} className="mt-4 rounded border border-emerald-400 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200 hover:bg-emerald-400/20">Begin Installation →</button>
            </div>
          )}

          {phase === "installing" && (
            <div>
              <div className="mb-3 text-emerald-500">Installing Windows onto {hostname}…</div>
              <div className="mb-2 h-3 w-full overflow-hidden rounded bg-emerald-950">
                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-[11px] text-emerald-300/80">{progress}% — copying image · expanding files · applying drivers</div>
            </div>
          )}

          {phase === "done" && (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
              <div className="text-3xl">✅</div>
              <div className="text-emerald-300">Deployment complete</div>
              <div className="text-[11px] text-emerald-600">{hostname} imaged with corp-win11-gold and domain-joined.</div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-center text-[10px] text-gray-600">Bench monitor · PXE deployment console</div>
    </div>
  );
}

function BootRow({ children, onClick, highlight }: { children: React.ReactNode; onClick?: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`block w-full rounded px-3 py-1.5 text-left text-[12px] ${highlight ? "bg-emerald-400/20 text-emerald-100" : "text-emerald-500/70"} ${onClick ? "hover:bg-emerald-400/30" : "cursor-default"}`}
    >
      {children}
    </button>
  );
}

// ── Small UI atoms ───────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1 ${active ? "bg-info text-black font-semibold" : "text-gray-300 hover:bg-panel"}`}>{children}</button>
  );
}

function statusChip(status: string | undefined, provisioned: boolean) {
  if (status === "completed") return <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-500/20 text-emerald-300">Online</span>;
  if (status === "in_progress") return <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-amber-500/20 text-amber-300">Dispatched</span>;
  if (provisioned) return <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-info/20 text-info">Ready</span>;
  return <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-gray-500/20 text-gray-400">Build</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-6 text-center text-xs text-gray-600">{text}</div>;
}
