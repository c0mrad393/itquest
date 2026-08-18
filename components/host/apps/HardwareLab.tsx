"use client";

/**
 * HardwareLab (v2) — Hardware Provisioning Lab & Field Dispatch
 * =============================================================
 * Two views: Active Deployment Tickets (list + dispatch console) and the
 * Interactive Workshop, a stage pipeline (assembly → BIOS → imaging) driven by
 * each ticket's HardwareJob. Provisioning unlocks the field dispatch; the
 * countdown flips the node online + healthy and the reconciler resolves it.
 */

import { useEffect, useState } from "react";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useInfraStore } from "@/lib/infra/store";
import { useHostStore } from "@/lib/host/store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useFieldOpsStore } from "@/lib/hardware/store";
import { isHardwareTicket, jobForTicket, STAGE_LABEL, type HardwareJob, type WorkshopStage } from "@/lib/hardware/types";
import AdvancedAssembly from "./hardware/AdvancedAssembly";
import DesktopSimulator from "./desktop-sim/DesktopSimulator";
import BiosSim from "./hardware/BiosSim";
import ImagingSuite, { type NetExpectation } from "./hardware/ImagingSuite";
import type { Ticket } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import { AppHeader, CountPill, Segmented } from "./AppChrome";
import EmptyState from "@/components/ui/EmptyState";
import { IconAlert, IconWrench } from "@/components/ui/icons";

const DISPATCH_SECONDS = 14;

export default function HardwareLab() {
  const tickets = useTicketStore((s) => s.tickets);
  const steps = useFieldOpsStore((s) => s.steps);
  const dispatches = useFieldOpsStore((s) => s.dispatches);
  const startDispatch = useFieldOpsStore((s) => s.startDispatch);

  /*
   * THE QUEUE, DERIVED FROM WHAT TICKETS NEED (QA2).
   *
   * `isHardwareTicket` now reads TAGS as well as the id prefix, so the
   * thirty-two procedural families that ask for a part swap appear here
   * alongside the nine hand-authored ones. Before, a procedurally generated
   * RAM upgrade left this app completely empty — the ticket asked for work
   * the app responsible for that work did not believe existed.
   */
  const hardware = tickets.filter(
    (t) =>
      isHardwareTicket(t.templateId, t.tags) &&
      t.status !== "resolved" &&
      t.status !== "closed" &&
      // A ticket with no derivable job has nothing to do at the bench, and
      // listing it would be a row that opens an empty workshop.
      jobForTicket(t) !== null,
  );

  /*
   * "bench" is the new interactive rig (Phase 1). It is a THIRD view rather
   * than a replacement for the workshop: the workshop's assembly stage is
   * wired into ticket grading, and swapping it out before the bench can grade
   * would have broken every hardware ticket in flight to gain a nicer screen.
   */
  const [view, setView] = useState<"tickets" | "workshop" | "sim">("tickets");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /*
   * DEEP LINK. A ticket's "Open in Hardware Lab" sets a focus intent; this
   * consumes it once and clears it, so re-opening the app later does not
   * silently jump to a device the operator has moved on from.
   */
  const focusTarget = useHostStore((s) => s.focusTarget);
  const clearFocusTarget = useHostStore((s) => s.clearFocusTarget);
  useEffect(() => {
    if (focusTarget?.app !== "hardwarelab") return;
    const match = hardware.find(
      (t) => jobForTicket(t)?.targetNodeId === focusTarget.nodeId,
    );
    if (match) {
      setSelectedId(match.id);
      // Straight to the bench: the operator asked to work this device, not to
      // look at a list with it highlighted.
      setView("workshop");
    }
    clearFocusTarget();
  }, [focusTarget, hardware, clearFocusTarget]);
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
      <AppHeader iconId="wrench" title="Hardware Lab" subtitle="Provisioning &amp; field dispatch">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "tickets" as const, label: "Deployment tickets" },
            { value: "workshop" as const, label: "Workshop" },
            { value: "sim" as const, label: "PC Simulator" },
          ]}
        />
        <CountPill value={hardware.length} label="open" />
      </AppHeader>

      {view === "sim" ? (
        <div className="min-h-0 flex-1">
          <DesktopSimulator />
        </div>
      ) : view === "tickets" ? (
        <div className="flex min-h-0 flex-1">
          <div data-tutorial-target="lab-queue" className="w-64 shrink-0 overflow-y-auto border-r border-edge">
            {hardware.length === 0 && (
              <EmptyState
                compact
                icon={<IconWrench size={16} />}
                title="No devices need maintenance"
                body="Hardware jobs appear here when a ticket asks for a part swap, a BIOS change or a re-image. Nothing on the estate is waiting on the bench right now."
              />
            )}
            {hardware.map((t) => {
              const j = jobForTicket(t);
              const d = dispatches[t.id];
              const prov = j ? j.stages.every((r) => (steps[t.id] ?? {})[r]) : false;
              return (
                <button key={t.id} onClick={() => setSelectedId(t.id)} className={`block w-full border-b border-edge/50 px-3 py-2.5 text-left ${selectedId === t.id ? "bg-info/10" : "hover:bg-panelalt"}`}>
                  <div className="flex items-center gap-1.5">
                    <AppIcon size={14} id={j?.assembly?.archetype === "server" ? "server" : j?.assembly?.archetype === "laptop" ? "laptop" : t.templateId.startsWith("sw-") ? "key" : "monitor"} />
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
          {!selected || !job ? (
            /*
             * Two DIFFERENT empties, because they mean different things and a
             * shared one would mislead. Nothing in the queue at all is a calm
             * "no work today"; work exists but none is selected is an
             * instruction. Both used to be the same line of grey text on an
             * otherwise blank pane.
             */
            hardware.length === 0 ? (
              <EmptyState
                icon={<IconWrench size={22} />}
                title="No devices currently require maintenance"
                body="Hardware jobs appear here when a ticket asks for a part swap, a BIOS change or a re-image. Nothing on the estate is waiting on the bench."
              />
            ) : (
              <EmptyState
                icon={<IconWrench size={22} />}
                title="Pick a device to work on"
                body={`${hardware.length} device${hardware.length === 1 ? "" : "s"} ${hardware.length === 1 ? "is" : "are"} waiting in Deployment tickets. Choose one there, or use the "Open in Hardware Lab" button on its ticket to come straight here.`}
                action={
                  <button className="btn-secondary btn-sm" onClick={() => setView("tickets")}>
                    Go to deployment tickets
                  </button>
                }
              />
            )
          ) : (
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
  const replacePart = useInfraStore((s) => s.cascadeReplacePart);
  const [benchError, setBenchError] = useState<string | null>(null);
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
          <div className="flex items-center gap-1.5 text-xs text-emerald-300"><AppIcon id="check" size={13} /> {dispatch?.note} — {job.targetHostname} is online at 100% health.</div>
        ) : dispatch?.status === "in_progress" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-200"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />{dispatch.note}</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-500/25"><div className="h-full rounded-full bg-info transition-all duration-1000 ease-linear" style={{ width: `${((dispatch.total - dispatch.timeLeft) / dispatch.total) * 100}%` }} /></div>
            <div className="text-right font-mono text-[10px] text-gray-500">ETA {dispatch.timeLeft}s · rack 4B</div>
          </div>
        ) : (
          <button onClick={onDispatch} disabled={!provisioned} className="w-full rounded-md bg-brand-fill px-3 py-2 text-xs font-semibold text-brand-on transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500"><span className="inline-flex items-center justify-center gap-1.5"><AppIcon id="truck" size={14} /> Dispatch Field Team for Physical Swap</span></button>
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
  const replacePart = useInfraStore((s) => s.cascadeReplacePart);
  const [benchError, setBenchError] = useState<string | null>(null);

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

    /*
     * BENCH WORK HAS TO REACH THE ESTATE (QA2).
     *
     * `completeStep` writes to the field-ops store, which the reconciler does
     * not subscribe to — it watches INFRA. So a cascade repaired at the bench
     * would have left its ticket open forever: the operator finishes the swap,
     * and nothing anywhere notices.
     *
     * Recording the replacement on the infra slice is what closes that gap.
     * The reconciler is already subscribed to infra, so the ticket re-grades
     * on the same tick — no refresh, no polling, no event plumbing.
     */
    if (stage === "assembly") {
      const err = replacePart(job.targetNodeId);
      // A refusal is real information — the thermal cascade will not let a
      // running host be opened — so it is surfaced rather than swallowed.
      if (err) setBenchError(err);
      else setBenchError(null);
    }

    const remaining = job.stages.filter((s) => s !== stage && !done[s]);
    if (remaining.length) setActive(remaining[0]);
  }
  const allDone = job.stages.every((s) => done[s]);
  const idxOf = (s: WorkshopStage) => job.stages.indexOf(s);
  const firstUndoneIdx = firstUndone ? idxOf(firstUndone) : job.stages.length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {benchError && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/[0.08] px-3 py-2 text-[11px] leading-relaxed text-warn-strong">
          <IconAlert size={12} className="mt-px shrink-0" />
          <span className="flex-1">{benchError}</span>
          <button onClick={() => setBenchError(null)} className="shrink-0 text-gray-500 hover:text-gray-200">
            dismiss
          </button>
        </div>
      )}
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
          <span className="inline-flex items-center gap-1.5"><AppIcon id="check" size={13} /> Device fully provisioned.</span>
          <button onClick={onProvisioned} className="ml-auto rounded-md bg-brand-fill px-3 py-1.5 font-semibold text-brand-on hover:bg-brand-hover">Go to dispatch →</button>
        </div>
      )}
    </div>
  );
}

// ── atoms ────────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-md px-3 py-1 ${active ? "bg-brand-fill text-brand-on font-semibold" : "text-gray-300 hover:bg-panel"}`}>{children}</button>;
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
