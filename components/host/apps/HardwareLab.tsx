"use client";

/**
 * HardwareLab (v2) — Hardware Provisioning Lab & Field Dispatch
 * =============================================================
 * Two views: Active Deployment Tickets (list + dispatch console) and the
 * Interactive Workshop, a stage pipeline (assembly → BIOS → imaging) driven by
 * each ticket's HardwareJob. Provisioning unlocks the field dispatch; the
 * countdown flips the node online + healthy and the reconciler resolves it.
 */

import { useState } from "react";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useInfraStore } from "@/lib/infra/store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useFieldOpsStore } from "@/lib/hardware/store";
import { isHardwareTicket, jobForTicket, STAGE_LABEL, type HardwareJob, type WorkshopStage } from "@/lib/hardware/types";
import AdvancedAssembly from "./hardware/AdvancedAssembly";
import BiosSim from "./hardware/BiosSim";
import ImagingSuite, { type NetExpectation } from "./hardware/ImagingSuite";
import type { Ticket } from "@/lib/core";

const DISPATCH_SECONDS = 14;

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
  const provisioned = job ? job.stages.every((r) => done[r]) : false;
  const dispatch = selectedId ? dispatches[selectedId] : undefined;

  function dispatchTeam() {
    if (!job) return;
    startDispatch(job.ticketId, job.targetNodeId, DISPATCH_SECONDS);
    useDialogueStore.getState().note(job.ticketId, "Field technician is moving the unit to rack 4B…");
  }

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      <div className="flex items-center gap-3 border-b border-edge bg-panelalt px-4 py-2.5">
        <span className="text-lg">🔧</span>
        <span className="text-sm font-semibold">Hardware Lab &amp; Deployment</span>
        <div className="ml-4 flex rounded-lg border border-edge p-0.5 text-xs">
          <TabBtn active={view === "tickets"} onClick={() => setView("tickets")}>Active Deployment Tickets</TabBtn>
          <TabBtn active={view === "workshop"} onClick={() => setView("workshop")}>Interactive Workshop</TabBtn>
        </div>
        <span className="ml-auto rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">{hardware.length} open</span>
      </div>

      {view === "tickets" ? (
        <div className="flex min-h-0 flex-1">
          <div className="w-64 shrink-0 overflow-y-auto border-r border-edge">
            {hardware.length === 0 && <Empty text="No hardware deployments in the queue." />}
            {hardware.map((t) => {
              const j = jobForTicket(t);
              const d = dispatches[t.id];
              const prov = j ? j.stages.every((r) => (steps[t.id] ?? {})[r]) : false;
              return (
                <button key={t.id} onClick={() => setSelectedId(t.id)} className={`block w-full border-b border-edge/50 px-3 py-2.5 text-left ${selectedId === t.id ? "bg-info/10" : "hover:bg-panelalt"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{j?.assembly?.archetype === "server" ? "🗄️" : j?.assembly?.archetype === "laptop" ? "💻" : t.templateId.startsWith("sw-") ? "🔑" : "🖥️"}</span>
                    <span className="truncate text-xs text-gray-100">{j?.targetHostname ?? "—"}</span>
                    <span className="ml-auto">{statusChip(d?.status, prov)}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-gray-500">{t.code} · {t.difficulty.replace(/_/g, " ")}</div>
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!selected || !job ? <Empty text="Select a deployment ticket." /> : (
              <DeploymentDetail ticket={selected} job={job} done={done} provisioned={provisioned} dispatch={dispatch} onGoToWorkshop={() => setView("workshop")} onDispatch={dispatchTeam} />
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!selected || !job ? <Empty text="Pick a deployment ticket in Active Deployment Tickets, then return here to build it." /> : (
            <Workshop ticket={selected} job={job} done={done} onProvisioned={() => setView("tickets")} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Deployment detail + dispatch console ─────────────────────────────────────

function DeploymentDetail({ ticket, job, done, provisioned, dispatch, onGoToWorkshop, onDispatch }: {
  ticket: Ticket; job: HardwareJob; done: Partial<Record<WorkshopStage, boolean>>; provisioned: boolean;
  dispatch: ReturnType<typeof useFieldOpsStore.getState>["dispatches"][string] | undefined;
  onGoToWorkshop: () => void; onDispatch: () => void;
}) {
  const node = useInfraStore((s) => s.infra.nodes[job.targetNodeId]);
  const completed = dispatch?.status === "completed";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <div className="text-base font-semibold text-gray-50">{ticket.title}</div>
        <div className="mt-1 font-mono text-[11px] text-gray-500">{ticket.code} · target {job.targetHostname} · {node ? `health ${node.health.status}` : "—"}</div>
      </div>
      <p className="text-xs leading-relaxed text-gray-400">{ticket.description}</p>

      <div className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Provisioning checklist</div>
        <div className="space-y-1.5">
          {job.stages.map((s) => (
            <div key={s} className="flex items-center gap-2 text-xs"><span className={done[s] ? "text-emerald-400" : "text-gray-600"}>{done[s] ? "✓" : "○"}</span><span className={done[s] ? "text-gray-200" : "text-gray-400"}>{STAGE_LABEL[s]}</span></div>
          ))}
        </div>
        {!provisioned && <button onClick={onGoToWorkshop} className="mt-3 rounded-md border border-info/40 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/10">Open Interactive Workshop →</button>}
      </div>

      <div className={`rounded-lg border p-3 ${completed ? "border-emerald-500/40 bg-emerald-500/5" : provisioned ? "border-info/40 bg-info/5" : "border-edge bg-panelalt/50"}`}>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Field dispatch</div>
        {completed ? (
          <div className="text-xs text-emerald-300">✅ {dispatch?.note} — {job.targetHostname} is online at 100% health.</div>
        ) : dispatch?.status === "in_progress" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-200"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />{dispatch.note}</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-info transition-all duration-1000 ease-linear" style={{ width: `${((dispatch.total - dispatch.timeLeft) / dispatch.total) * 100}%` }} /></div>
            <div className="text-right font-mono text-[10px] text-gray-500">ETA {dispatch.timeLeft}s · rack 4B</div>
          </div>
        ) : (
          <button onClick={onDispatch} disabled={!provisioned} className="w-full rounded-md bg-info px-3 py-2 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500">🚚 Dispatch Field Team for Physical Swap</button>
        )}
        {!provisioned && !dispatch && <div className="mt-2 text-[10px] text-gray-500">Complete provisioning in the Workshop to unlock dispatch.</div>}
      </div>
    </div>
  );
}

// ── Workshop (stage pipeline) ────────────────────────────────────────────────

function Workshop({ ticket, job, done, onProvisioned }: { ticket: Ticket; job: HardwareJob; done: Partial<Record<WorkshopStage, boolean>>; onProvisioned: () => void }) {
  const completeStep = useFieldOpsStore((s) => s.completeStep);
  const setResult = useFieldOpsStore((s) => s.setResult);
  const results = useFieldOpsStore((s) => s.results[ticket.id] ?? {});
  const node = useInfraStore((s) => s.infra.nodes[job.targetNodeId]);

  const firstUndone = job.stages.find((s) => !done[s]);
  const [active, setActive] = useState<WorkshopStage>(firstUndone ?? job.stages[0]);

  const net: NetExpectation = (() => {
    const nic = node && node.os !== undefined ? node.network.interfaces[0] : undefined;
    const ip = nic?.ipv4 ?? "10.0.0.20";
    const mask = nic?.netmask ?? "255.255.255.0";
    const gateway = node?.network.routes[0]?.gateway ?? ip.replace(/\.\d+$/, ".1");
    return { ip, mask, gateway };
  })();

  function finish(stage: WorkshopStage) {
    completeStep(ticket.id, stage);
    const remaining = job.stages.filter((s) => s !== stage && !done[s]);
    if (remaining.length) setActive(remaining[0]);
  }
  const allDone = job.stages.every((s) => done[s]);
  const idxOf = (s: WorkshopStage) => job.stages.indexOf(s);
  const firstUndoneIdx = firstUndone ? idxOf(firstUndone) : job.stages.length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        {job.stages.map((s, i) => {
          const reachable = done[s] || i <= firstUndoneIdx;
          return (
            <button key={s} onClick={() => reachable && setActive(s)} disabled={!reachable} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs disabled:opacity-40 ${active === s ? "border-info bg-info/15 text-gray-100" : "border-edge text-gray-400 hover:bg-panelalt"}`}>
              <span className={done[s] ? "text-emerald-400" : "text-gray-500"}>{done[s] ? "✓" : i + 1}</span>{STAGE_LABEL[s]}
            </button>
          );
        })}
        <span className="ml-auto font-mono text-[10px] text-gray-500">{job.targetHostname}</span>
      </div>

      {active === "assembly" && job.assembly && (
        <AdvancedAssembly spec={job.assembly} onComplete={({ faulty, fault }) => { setResult(ticket.id, { assemblyFaulty: faulty, assemblyFault: fault }); finish("assembly"); }} />
      )}
      {active === "bios" && job.bios && (
        <BiosSim spec={job.bios} onComplete={() => { setResult(ticket.id, { biosOk: true }); finish("bios"); }} />
      )}
      {active === "imaging" && job.imaging && (
        <ImagingSuite
          spec={job.imaging}
          host={job.targetHostname}
          net={net}
          assemblyFaulty={!!results.assemblyFaulty}
          assemblyFault={results.assemblyFault}
          onFault={() => setActive("assembly")}
          onComplete={() => finish("imaging")}
        />
      )}

      {allDone && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-300">
          ✅ Device fully provisioned.
          <button onClick={onProvisioned} className="ml-auto rounded-md bg-emerald-500/80 px-3 py-1.5 font-semibold text-black hover:brightness-110">Go to dispatch →</button>
        </div>
      )}
    </div>
  );
}

// ── atoms ────────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-md px-3 py-1 ${active ? "bg-info text-black font-semibold" : "text-gray-300 hover:bg-panel"}`}>{children}</button>;
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
