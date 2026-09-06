"use client";

/**
 * HardwareLab (v2) — Hardware Provisioning Lab & Field Dispatch
 * =============================================================
 * Two views: Active Deployment Tickets (list + dispatch console) and the
 * the bench — the PC Simulator — which every hardware job opens, whatever the
 * machine and whether it is built or mended. Finishing there unlocks the field
 * dispatch; the countdown flips the node online + healthy and the reconciler
 * resolves the ticket.
 *
 * There used to be a third view, the Workshop: a separate teardown, BIOS and
 * imaging pipeline that was the ONLY thing wired into ticket grading, which is
 * why the far more capable simulator beside it could not answer a single
 * ticket. Two engines meant two ideas of what a machine is, and they did not
 * stay in step. There is one now.
 */

import { useEffect, useState } from "react";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useInfraStore } from "@/lib/infra/store";
import { useHostStore } from "@/lib/host/store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useFieldOpsStore, type DispatchStatus } from "@/lib/hardware/store";
import { isHardwareTicket, jobForTicket, STAGE_LABEL, type HardwareJob, type WorkshopStage } from "@/lib/hardware/types";
import DesktopSimulator, { type BenchAssignment } from "./desktop-sim/DesktopSimulator";
import type { Ticket } from "@/lib/core";
import { PART_DEFS } from "@/lib/desktop-sim/parts";
import { AppIcon } from "@/components/ui/app-icons";
import { AppHeader, CountPill, Segmented } from "./AppChrome";
import EmptyState from "@/components/ui/EmptyState";
import { IconAlert, IconWrench } from "@/components/ui/icons";

const DISPATCH_SECONDS = 14;

/**
 * What the operator is going to replace, in the bench's own words.
 *
 * Read from the bench spec rather than the swap spec's `replacementLabel`,
 * because the bench is what they are about to look at: a ticket that says
 * "a disk has failed" opens a server whose caddy is called Drive 0.
 */
function failedLabel(job: HardwareJob): string {
  const id = job.bench.faulty[0];
  return id ? PART_DEFS[id].label : "part";
}

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
      // listing it would be a row that opens an empty bench.
      jobForTicket(t) !== null,
  );

  /*
   * "bench" is the new interactive rig (Phase 1). It is a THIRD view rather
   * the one place hardware work happens.
   */
  const [view, setView] = useState<"tickets" | "sim">("tickets");
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
      setView("sim");
    }
    clearFocusTarget();
  }, [focusTarget, hardware, clearFocusTarget]);
  const selected = hardware.find((t) => t.id === selectedId) ?? null;
  const job = selected ? jobForTicket(selected) : null;

  /*
   * Which machine, and what is wrong with it.
   */
  /*
   * ONE DOOR INTO THE BENCH.
   *
   * Every hardware job — build or repair, desktop, laptop or server — opens
   * the same simulator with the same shape of instruction. The Workshop used
   * to be a second, parallel idea of what a machine is, with its own
   * teardown, its own BIOS and its own imaging screens; two engines meant two
   * sets of rules to keep in step, and they did not stay in step.
   */
  const assignment: BenchAssignment | undefined =
    selected && job
      ? job.build
        ? {
            ticketCode: selected.code,
            chassis: job.bench.chassis,
            faulty: job.bench.faulty,
            isBuild: true,
            headline: `Build a workstation for ${job.build.forWhom}`,
            requirement: `Sign-off needs ${job.build.minRamGb}GB memory, a ${job.build.minDiskGb}GB disk${
              job.build.joinDomain ? ", and the machine joined to the domain" : ""
            }.`,
            onComplete: () => recordRepair(job),
          }
        : {
            ticketCode: selected.code,
            chassis: job.bench.chassis,
            faulty: job.bench.faulty,
            isBuild: false,
            /*
             * A repair with nothing broken is a real job — a BIOS change or a
             * re-image — and calling it "replace the failed part" when there is
             * no failed part sends the operator hunting for one.
             */
            headline: job.bench.faulty.length
              ? `${job.targetHostname} — replace the failed ${failedLabel(job)}`
              : `${job.targetHostname} — bring it up and finish the job`,
            requirement: job.bench.faulty.length
              ? "Take the failed part out, fit a sound one, and close the machine up."
              : "Nothing is broken. Power it on and work through the firmware and imaging.",
            onComplete: () => recordRepair(job),
          }
      : undefined;

  const done = selectedId ? steps[selectedId] ?? {} : {};
  const provisioned = job ? job.stages.every((r) => done[r]) : false;
  const dispatch = selectedId ? dispatches[selectedId] : undefined;

  /*
   * BENCH WORK HAS TO REACH THE ESTATE.
   *
   * The reconciler watches infra and knows nothing about this app, so a
   * machine mended at the bench whose repair was only written to session
   * state would leave its ticket open forever. `cascadeReplacePart` is the
   * same call the retired Workshop made, and the reconciler re-grades on the same
   * tick. A build needs none of this: commissioning already records itself.
   */
  const replacePart = useInfraStore((s) => s.cascadeReplacePart);
  const [benchNote, setBenchNote] = useState<string | null>(null);
  function recordRepair(j: HardwareJob) {
    if (j.build || !j.targetNodeId) return;
    completeStepFor(j.ticketId);
    const err = replacePart(j.targetNodeId);
    setBenchNote(err ?? null);
  }

  const completeStep = useFieldOpsStore((s) => s.completeStep);
  function completeStepFor(ticketId: string) {
    for (const st of ["assembly", "bios", "imaging"] as const) completeStep(ticketId, st);
  }

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
            { value: "sim" as const, label: "The bench" },
          ]}
        />
        <CountPill value={hardware.length} label="open" />
      </AppHeader>

      {view === "sim" ? (
        <div className="min-h-0 flex-1">
          <DesktopSimulator assignment={assignment} />
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
              <DeploymentDetail ticket={selected} job={job} done={done} provisioned={provisioned} dispatch={dispatch} onOpenBench={() => setView("sim")} onDispatch={dispatchTeam} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Deployment detail + dispatch console ─────────────────────────────────────

function DeploymentDetail({ ticket, job, done, provisioned, dispatch, onOpenBench, onDispatch }: {
  ticket: Ticket; job: HardwareJob; done: Partial<Record<WorkshopStage, boolean>>; provisioned: boolean;
  dispatch: ReturnType<typeof useFieldOpsStore.getState>["dispatches"][string] | undefined;
  onOpenBench: () => void; onDispatch: () => void;
}) {
  const node = useInfraStore((s) => s.infra.nodes[job.targetNodeId]);
  const replacePart = useInfraStore((s) => s.cascadeReplacePart);
  const [benchError, setBenchError] = useState<string | null>(null);
  const completed = dispatch?.status === "completed";

  /*
   * A build has no swap checklist and no field dispatch. There is no failed
   * part to tick off and nobody to send to a rack — the machine is made at the
   * bench and commissioned straight onto the estate, so the panel that fits it
   * is a work order, not a repair job.
   */
  if (job.build) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <div className="text-base font-semibold text-gray-50">{ticket.title}</div>
          <div className="mt-1 font-mono text-[11px] text-gray-500">
            {ticket.code} · workstation build · for {job.build.forWhom}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-gray-400">{ticket.description}</p>

        <div className="rounded-lg border border-edge bg-panelalt/50 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Sign-off requires
          </div>
          <ul className="space-y-1.5 text-xs text-gray-300">
            <li>At least {job.build.minRamGb}GB of memory fitted</li>
            <li>At least a {job.build.minDiskGb}GB disk</li>
            {job.build.joinDomain && <li>The machine joined to the domain</li>}
          </ul>
          <div className="mt-2 text-[10px] text-gray-500">
            Graded on what is actually in the machine when it reaches the estate — not on
            reaching the end of the flow.
          </div>
          <button
            onClick={onOpenBench}
            className="mt-3 rounded-md border border-info/40 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/10"
          >
            Open the PC bench →
          </button>
        </div>
      </div>
    );
  }

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
        {!provisioned && <button onClick={onOpenBench} className="mt-3 rounded-md border border-info/40 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/10">Open the bench →</button>}
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
        {!provisioned && !dispatch && <div className="mt-2 text-[10px] text-gray-500">Finish the job at the bench to unlock dispatch.</div>}
      </div>
    </div>
  );
}

// ── Queue row helpers ───────────────────────────────────────────────────────

/** Where a job stands, at a glance, in the queue list. */
function statusChip(status: DispatchStatus | undefined, provisioned: boolean) {
  if (status === "completed") {
    return <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300 ring-1 ring-emerald-500/40">DONE</span>;
  }
  if (status === "in_progress") {
    return <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-amber-300 ring-1 ring-amber-500/40">EN ROUTE</span>;
  }
  if (provisioned) {
    return <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-info ring-1 ring-info/40">READY</span>;
  }
  return <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-gray-500 ring-1 ring-edge">BUILD</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-6 text-center text-xs text-gray-500">{text}</div>;
}
