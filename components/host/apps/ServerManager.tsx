"use client";

/**
 * Server Manager — the logical estate (v0.4.0)
 * ============================================
 * The other side of the Datacenter Floor. Same servers, same numbers, read
 * from the same place: a row here is `infra.nodes[id]` joined to the chassis
 * that holds it through `RackDevice.nodeId`. Capacity is not reported by this
 * app, it is DERIVED from the parts fitted in the rack — so a DIMM installed
 * two clicks ago is already reflected in the memory bar.
 *
 * THE HARD MECHANIC THIS APP EXISTS FOR is zero-downtime maintenance. You
 * cannot open a live chassis. To touch hardware you must:
 *
 *   1. declare a change window        (Maintenance Mode)
 *   2. drain the host                 (Live Migration -> another host)
 *   3. cut power                      (Power down, now safe)
 *   4. do the work in the rack, then power back up and migrate home
 *
 * Skipping to step 3 is allowed — an engineer *can* yank a live box — and the
 * simulation records it as the unplanned outage it is. The rule is taught by
 * consequence rather than by a disabled button.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import {
  WORKLOAD_LABEL,
  isRackable,
  liveDeviceWatts,
  locationOf,
  migrationBlocker,
  serverCapacity,
  serverHeadroom,
  serverLiveness,
  serverUtilisation,
  shutdownBlocker,
  workloadDemand,
  type TargetNode,
  type Workload,
} from "@/lib/core";
import {
  IconAlert,
  IconBolt,
  IconCheck,
  IconLink,
  IconPower,
  IconServer,
  IconWrench,
  IconX,
} from "@/components/ui/icons";
import { AppHeader, CountPill } from "./AppChrome";

export default function ServerManager() {
  const infra = useInfraStore((s) => s.infra);
  const setMaintenance = useInfraStore((s) => s.setMaintenanceMode);
  const migrate = useInfraStore((s) => s.migrateWorkloads);
  const setPower = useInfraStore((s) => s.setNodePower);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [migrateTo, setMigrateTo] = useState<string>("");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  /**
   * A server is a node that is RACKED. An unracked infrastructure role has no
   * physical existence to manage, and the endpoint fleet is ADUC's problem.
   */
  const servers = useMemo(() => {
    return Object.values(infra.nodes)
      .filter((n) => isRackable(n.role))
      .map((node) => ({ node, at: locationOf(infra.datacenter, node.nodeId) }))
      .filter((r): r is { node: TargetNode; at: NonNullable<ReturnType<typeof locationOf>> } => !!r.at)
      .sort((a, b) => a.node.hostname.localeCompare(b.node.hostname));
  }, [infra.nodes, infra.datacenter]);

  const selected = servers.find((r) => r.node.nodeId === selectedId) ?? servers[0] ?? null;
  const inMaintenance = servers.filter((r) => r.node.maintenance?.mode).length;
  const down = servers.filter((r) => !r.node.connection.online).length;

  function act(result: string | null, okText: string) {
    setNotice(result ? { kind: "err", text: result } : { kind: "ok", text: okText });
  }

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      <AppHeader iconId="server" title="Server Manager" subtitle="Logical estate">
        <CountPill label="hosts" value={servers.length} />
        {inMaintenance > 0 && <CountPill label="in maintenance" value={inMaintenance} tone="warn" />}
        {down > 0 && <CountPill label="powered down" value={down} tone="warn" />}
      </AppHeader>

      {notice && (
        <div
          className={`flex shrink-0 items-start gap-2 border-b px-4 py-1.5 text-[11px] ${
            notice.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200"
              : "border-amber-500/40 bg-amber-500/[0.07] text-amber-200"
          }`}
        >
          {notice.kind === "ok" ? <IconCheck size={12} className="mt-0.5 shrink-0" /> : <IconAlert size={12} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-gray-400 hover:text-gray-200">
            <IconX size={11} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Estate list ──────────────────────────────────────────────── */}
        <div className="flex w-[22rem] shrink-0 flex-col border-r border-edge">
          <div className="border-b border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Hosts
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {servers.length === 0 && (
              <p className="px-1 py-3 text-[11px] leading-relaxed text-gray-500">
                No racked servers. Mount a chassis on the Datacenter Floor and connect its uplink — a server with no
                top-of-rack port has no network identity, so it cannot appear here.
              </p>
            )}
            {servers.map(({ node, at }) => {
              const util = serverUtilisation(at.device, node.workloads);
              const life = serverLiveness(at.rack, at.device, node, infra.nodes);
              const active = selected?.node.nodeId === node.nodeId;
              return (
                <button
                  key={node.nodeId}
                  onClick={() => { setSelectedId(node.nodeId); setMigrateTo(""); setNotice(null); }}
                  className={`mb-1.5 w-full rounded-md border p-2 text-left transition ${
                    active ? "border-info bg-info/10" : "border-edge hover:border-info/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      title={life.live ? "Running" : life.reason ?? "Down"}
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        !life.live ? "bg-danger" : node.maintenance?.mode ? "bg-amber-400" : "bg-emerald-400"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-100">{node.hostname}</span>
                    <span className={`shrink-0 font-mono text-[9px] ${life.live ? "text-gray-500" : "text-danger"}`}>
                      {life.live ? `${at.rack.name} · U${at.device.uStart}` : life.reason}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-gray-500">
                    <span className="text-info">{node.connection.ip}</span>
                    <span>{node.workloads.length} wl</span>
                    <span className={util.cpuPct > 100 ? "text-danger" : ""}>cpu {util.cpuPct}%</span>
                    <span className={util.memPct > 100 ? "text-danger" : ""}>mem {util.memPct}%</span>
                  </div>
                  {/* Two bars beat four numbers when you are scanning a list
                      for the one host that is in trouble. */}
                  <div className="mt-1 flex gap-1">
                    <Bar pct={util.cpuPct} />
                    <Bar pct={util.memPct} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Detail ───────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!selected ? (
            <p className="text-[11px] text-gray-500">Select a host.</p>
          ) : (
            <HostDetail
              key={selected.node.nodeId}
              node={selected.node}
              at={selected.at}
              servers={servers}
              migrateTo={migrateTo}
              setMigrateTo={setMigrateTo}
              onMaintenance={(on) => {
                setMaintenance(selected.node.nodeId, on);
                setNotice({
                  kind: "ok",
                  text: on
                    ? `${selected.node.hostname} is in a change window. Drain it before cutting power.`
                    : `${selected.node.hostname} is back in normal service.`,
                });
              }}
              onMigrate={(to, ids) =>
                act(
                  migrate(selected.node.nodeId, to, ids),
                  `Migrated ${ids ? ids.length : selected.node.workloads.length} workload${
                    (ids ? ids.length : selected.node.workloads.length) === 1 ? "" : "s"
                  } to ${to}. ${selected.node.hostname} is drained.`,
                )
              }
              onPower={(on) =>
                act(
                  setPower(selected.node.nodeId, on),
                  on ? `${selected.node.hostname} is back up.` : `${selected.node.hostname} powered down cleanly.`,
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail pane ─────────────────────────────────────────────────────────────

type Row = { node: TargetNode; at: NonNullable<ReturnType<typeof locationOf>> };

function HostDetail({
  node,
  at,
  servers,
  migrateTo,
  setMigrateTo,
  onMaintenance,
  onMigrate,
  onPower,
}: {
  node: TargetNode;
  at: Row["at"];
  servers: Row[];
  migrateTo: string;
  setMigrateTo: (v: string) => void;
  onMaintenance: (on: boolean) => void;
  onMigrate: (to: string, ids?: string[]) => void;
  onPower: (on: boolean) => void;
}) {
  const nodes = useInfraStore((s) => s.infra.nodes);
  const cap = serverCapacity(at.device);
  const util = serverUtilisation(at.device, node.workloads);
  const demand = workloadDemand(node.workloads);
  const hw = at.device.hardware;
  const drained = node.workloads.length === 0;
  const blocker = shutdownBlocker(node);
  // The rack has the final word on whether this host is actually serving.
  const life = serverLiveness(at.rack, at.device, node, nodes);

  const targets = servers.filter((r) => r.node.nodeId !== node.nodeId);
  const chosen = targets.find((r) => r.node.nodeId === migrateTo);
  const migrationIssue =
    chosen && node.workloads.length > 0
      ? migrationBlocker(
          {
            device: chosen.at.device,
            rack: chosen.at.rack,
            workloads: chosen.node.workloads,
            online: chosen.node.connection.online,
            inMaintenance: !!chosen.node.maintenance?.mode,
          },
          node.workloads,
          nodes,
        )
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {/* Identity */}
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <IconServer size={15} className="text-info" />
          <span className="text-sm font-semibold text-gray-100">{node.hostname}</span>
          <span className="font-mono text-[11px] text-info">{node.connection.ip}</span>
          {node.maintenance?.mode && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-300">
              CHANGE WINDOW
            </span>
          )}
          <span className={`ml-auto text-[11px] ${life.live ? "text-emerald-300" : "text-danger"}`}>
            {life.live ? "running" : life.reason}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 font-mono text-[10px] sm:grid-cols-4">
          <Stat label="Role" value={node.displayName} />
          <Stat label="OS" value={node.os === "linux" ? (node as { distro?: string }).distro ?? "Linux" : "Windows Server"} />
          <Stat label="Location" value={`${at.rack.name} · U${at.device.uStart}`} />
          <Stat label="Draw" value={`${liveDeviceWatts(at.device, nodes)}W`} />
        </dl>
      </section>

      {/* Capacity — physical parts answering a logical question */}
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          <IconBolt size={11} /> Capacity
          <span className="ml-auto text-[9px] font-normal normal-case tracking-normal text-gray-600">
            derived from the parts fitted in {at.rack.name}
          </span>
        </h3>
        <Meter label="CPU" pct={util.cpuPct} detail={`${Math.round(demand.cpuPct)}% of ${cap.cpuPctTotal}% (${cap.cpuCores} cores)`} />
        <Meter label="Memory" pct={util.memPct} detail={`${demand.ramGb} GB of ${cap.ramGb} GB ${hw?.ramType ?? ""}`} />
        <p className="mt-1.5 text-[10px] text-gray-500">
          {hw ? `${hw.dimmsUsed}/${hw.dimmSlots} DIMM slots populated · ${Math.round(cap.storageGb / 1024)} TB storage` : ""}
          {util.oversubscribed && (
            <span className="ml-1 text-danger">
              Oversubscribed — migrate something off, or fit more memory on the Datacenter Floor.
            </span>
          )}
        </p>
      </section>

      {/* Workloads */}
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Hosted workloads ({node.workloads.length})
        </h3>
        {node.workloads.length === 0 ? (
          <p className="text-[11px] text-emerald-300">Drained. Nothing is running on this host.</p>
        ) : (
          <ul className="space-y-1">
            {node.workloads.map((w) => (
              <WorkloadRow key={w.id} w={w} home={w.homeNodeId === node.nodeId} />
            ))}
          </ul>
        )}
      </section>

      {/* The maintenance loop */}
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          <IconWrench size={11} /> Change control
        </h3>

        <ol className="mb-3 space-y-1 text-[10px]">
          <Step n={1} done={!!node.maintenance?.mode} text="Declare a change window" />
          <Step n={2} done={drained} text="Drain the host by live-migrating its workloads" />
          <Step n={3} done={!node.connection.online} text="Cut power, then do the work in the rack" />
        </ol>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <Action
            onClick={() => onMaintenance(!node.maintenance?.mode)}
            tone={node.maintenance?.mode ? "warn" : "default"}
            icon={<IconWrench size={12} />}
          >
            {node.maintenance?.mode ? "End change window" : "Maintenance mode"}
          </Action>

          {node.workloads.length > 0 && (
            <>
              <select
                value={migrateTo}
                onChange={(e) => setMigrateTo(e.target.value)}
                className="rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-200"
              >
                <option value="">Migrate to&hellip;</option>
                {targets.map(({ node: t, at: ta }) => {
                  const room = serverHeadroom(ta.device, t.workloads);
                  return (
                    <option key={t.nodeId} value={t.nodeId}>
                      {t.hostname} — {room.ramGb} GB / {Math.round(room.cpuPct)}% free
                    </option>
                  );
                })}
              </select>
              <Action
                onClick={() => onMigrate(migrateTo)}
                disabled={!migrateTo || !!migrationIssue}
                icon={<IconLink size={12} />}
              >
                Live migrate all
              </Action>
            </>
          )}

          <Action
            onClick={() => onPower(!node.connection.online)}
            tone={node.connection.online && blocker ? "danger" : "default"}
            icon={<IconPower size={12} />}
          >
            {node.connection.online ? "Power down" : "Power on"}
          </Action>
        </div>

        {migrationIssue && <p className="mt-1.5 text-[10px] text-amber-300">{migrationIssue}</p>}

        {node.connection.online && blocker && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-amber-300">
            <IconAlert size={11} className="mt-0.5 shrink-0" />
            <span>{blocker} Powering down anyway will be recorded as an unplanned outage.</span>
          </p>
        )}
        {node.connection.online && !blocker && (
          <p className="mt-1.5 text-[10px] text-emerald-300">
            Drained and in a change window — safe to power down.
          </p>
        )}
      </section>
    </div>
  );
}

// ── atoms ───────────────────────────────────────────────────────────────────

function Bar({ pct }: { pct: number }) {
  const tone = pct > 100 ? "bg-danger" : pct > 80 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-black/50">
      <span className={`block h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
  );
}

function Meter({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  const tone = pct > 100 ? "bg-danger" : pct > 80 ? "bg-amber-400" : "bg-emerald-400";
  const text = pct > 100 ? "text-danger" : pct > 80 ? "text-amber-300" : "text-emerald-300";
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex items-baseline gap-2 text-[10px]">
        <span className="uppercase tracking-wider text-gray-500">{label}</span>
        <span className="font-mono text-gray-500">{detail}</span>
        <span className={`ml-auto font-mono ${text}`}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/50">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function WorkloadRow({ w, home }: { w: Workload; home: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded border border-edge/60 bg-panel/60 px-2 py-1 text-[10px]">
      <span className="h-1 w-1 shrink-0 rounded-full bg-info" />
      <span className="min-w-0 flex-1 truncate text-gray-100">{w.name}</span>
      <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 font-mono text-[9px] text-info">
        {WORKLOAD_LABEL[w.kind]}
      </span>
      {!home && (
        <span title={`Normally runs on ${w.homeNodeId}`} className="shrink-0 font-mono text-[9px] text-amber-300">
          migrated
        </span>
      )}
      <span className="shrink-0 font-mono text-gray-500">
        {Math.round(w.cpuPct)}% · {w.ramGb} GB
      </span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-gray-600">{label}</dt>
      <dd className="truncate text-gray-200">{value}</dd>
    </div>
  );
}

function Step({ n, done, text }: { n: number; done: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[8px] ${
          done ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300" : "border-edge text-gray-500"
        }`}
      >
        {done ? <IconCheck size={8} /> : n}
      </span>
      <span className={done ? "text-emerald-300" : "text-gray-400"}>{text}</span>
    </li>
  );
}

function Action({
  onClick,
  icon,
  tone = "default",
  disabled,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  tone?: "default" | "warn" | "danger";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const styles =
    disabled
      ? "cursor-not-allowed border-edge/50 text-gray-600"
      : tone === "danger"
        ? "border-danger/40 text-danger hover:bg-danger/10"
        : tone === "warn"
          ? "border-amber-400/50 text-amber-300 hover:bg-amber-400/10"
          : "border-edge text-gray-200 hover:bg-panel";
  return (
    <button onClick={onClick} disabled={disabled} className={`flex items-center gap-1.5 rounded border px-2 py-1 ${styles}`}>
      {icon} {children}
    </button>
  );
}
