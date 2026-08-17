"use client";

/**
 * ServerOS Admin Center (v0.7.0, re-skinned and extended v0.8.0)
 * =============================================================
 * One window per server, with a sidebar, replacing three things at once:
 *
 *   - the nested ServerOS DESKTOP, which put a second taskbar, a second
 *     Start menu and eight draggable sub-windows inside a window that was
 *     already inside a window;
 *   - the "Enterprise Directory Services" desktop app;
 *   - the "Shared Drives" desktop app.
 *
 * WHY THIS IS THE RIGHT SHAPE. Those consoles were always ABOUT a specific
 * server — the DC that answers, the file server that serves. Floating them on
 * the operator's own desktop made that connection invisible and left the
 * desktop carrying an app for every service in the estate. Reaching them by
 * connecting to the host says the true thing: this is that machine's console,
 * and if the machine is gone so is the console.
 *
 * The sections a host offers are DERIVED from what it actually runs. A file
 * server has no directory, so it has no Enterprise Directory Services tab — nothing is
 * greyed out or shown empty.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useEffect, useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { WindowsNodeState } from "@/lib/core";
import { locationOf, serverLiveness } from "@/lib/core";
import DirectoryConsole from "@/components/host/apps/DirectoryConsole";
import SharedDrives from "@/components/host/apps/SharedDrives";
import FleetPolicies from "./FleetPolicies";
import ServicesPanel from "../apps-windows/ServicesPanel";
import EventViewer from "../apps-windows/EventViewer";
import { ADMIN_CENTER, CFP_SHORT, EDS_SHORT, FILE_SERVICE, SERVER_OS_FULL, osLabel } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import type { HostAppIconId } from "@/lib/core";
import { Term } from "@/components/ui/Tooltip";
import type { GlossaryKey } from "@/lib/core";
import { isIsolated } from "@/lib/core";
import { IconAlert, IconCheck } from "@/components/ui/icons";

export type SectionId = "overview" | "directory" | "policies" | "shares" | "services" | "events";

interface Section {
  id: SectionId;
  label: string;
  iconId: HostAppIconId;
  /** Shown only when the host actually provides this. */
  when: (node: WindowsNodeState) => boolean;
}

const SECTIONS: Section[] = [
  { id: "overview", label: "System Status", iconId: "server", when: () => true },
  { id: "directory", label: `${EDS_SHORT} Directory`, iconId: "users", when: (n) => !!n.activeDirectory },
  // Policy is served by the domain controller, so it appears where the
  // directory does — the two are one administrative surface in practice.
  { id: "policies", label: `${CFP_SHORT} Fleet Policies`, iconId: "shield", when: (n) => !!n.activeDirectory },
  { id: "shares", label: `${FILE_SERVICE} Shares`, iconId: "folder", when: (n) => !!n.shares?.length },
  { id: "services", label: "Services", iconId: "gear", when: () => true },
  { id: "events", label: "Event Log", iconId: "list", when: () => true },
];

export default function AdminCenter({
  nodeId,
  requestedSection,
  sectionNonce = 0,
}: {
  nodeId: string;
  /**
   * Section a Start-menu shortcut asked for. The directory and policy tools are
   * separate entries on the menu (an admin looks for them by their own names)
   * but they are SECTIONS of this one console, not separate windows — the
   * v0.8.1 consolidation exists precisely so the desktop does not fill with
   * single-purpose MMC windows again.
   */
  requestedSection?: SectionId;
  /**
   * Bumped every time a shortcut fires. Without it, clicking the same shortcut
   * twice would do nothing the second time: the prop would be unchanged, so no
   * effect would re-run, and a console the operator had since navigated away
   * from would stay put.
   */
  sectionNonce?: number;
}) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const [section, setSection] = useState<SectionId>(requestedSection ?? "overview");

  useEffect(() => {
    if (requestedSection) setSection(requestedSection);
    // Keyed on the nonce alone: the section is read fresh each time it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionNonce]);

  const available = useMemo(
    () => (node ? SECTIONS.filter((s) => s.when(node)) : []),
    [node],
  );

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center bg-panel text-[11px] text-gray-600">
        This host is no longer in the estate.
      </div>
    );
  }

  const active = available.some((s) => s.id === section) ? section : "overview";

  return (
    <div className="flex h-full bg-surface text-gray-200">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <nav className="flex w-56 shrink-0 flex-col border-r border-edge bg-surface-2">
        <div className="border-b border-edge bg-surface-2 px-3 py-2">
          <div className="truncate text-[12px] font-semibold text-gray-100">{node.hostname}</div>
          <div className="truncate font-mono text-[10px] text-gray-500">{node.connection.ip}</div>
          <div className="mt-0.5 truncate text-[9px] text-gray-600">{SERVER_OS_FULL}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {available.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex w-full items-center gap-2 border-l-2 px-2 py-1.5 text-left text-[11px] transition ${
                active === s.id
                  ? "border-info bg-info/15 text-gray-100"
                  : "border-transparent text-gray-400 hover:bg-gray-500/10 hover:text-gray-200"
              }`}
            >
              <AppIcon id={s.iconId} size={13} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="border-t border-edge px-3 py-2 text-[9px] leading-relaxed text-gray-600">
          {ADMIN_CENTER} · bound to {node.hostname}
        </div>
      </nav>

      {/* ── Section ──────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        {active === "overview" && (
          <>
            <CompromiseBanner nodeId={nodeId} />
            <Overview nodeId={nodeId} />
          </>
        )}
        {active === "directory" && <DirectoryConsole embedded />}
        {active === "policies" && <FleetPolicies />}
        {active === "shares" && <SharedDrives embedded />}
        {active === "services" && <ServicesPanel nodeId={nodeId} />}
        {active === "events" && <EventViewer nodeId={nodeId} />}
      </div>
    </div>
  );
}

// ── Compromise (DR build) ───────────────────────────────────────────────────

/**
 * The wipe control, on the machine being wiped.
 *
 * DELIBERATELY NOT IN THE BACKUP PANEL. Wiping a host is something you do AT
 * the host — the operator has to open a session to the compromised server to
 * do it, which is both how it works in life and the thing that makes the
 * three steps feel like three different places rather than three buttons in a
 * row. The Backup panel tells you the step; this is where the step happens.
 *
 * The refusal when patient zero is still live comes from the store, not from a
 * disabled button, so the reason is stated rather than merely implied.
 */
function CompromiseBanner({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const wipe = useInfraStore((s) => s.incidentWipe);
  const [err, setErr] = useState<string | null>(null);

  const rec = infra.incident?.compromised.find((c) => c.nodeId === nodeId);
  if (!rec) return null;

  const zero = infra.incident.patientZero;
  const contained = !zero || isIsolated(infra, zero);

  if (rec.wipedAt && rec.restoredAt) {
    return (
      <div className="flex items-center gap-2 border-b border-accent/40 bg-accent/[0.08] px-4 py-2 text-[11px] text-accent-strong">
        <IconCheck size={12} className="shrink-0" />
        This host was wiped and restored from backup. It is clean.
      </div>
    );
  }

  return (
    <div className="border-b border-danger/50 bg-danger/[0.09] px-4 py-2.5">
      <div className="flex items-center gap-2">
        <IconAlert size={13} className="shrink-0 text-danger-strong" />
        <span className="text-[12px] font-semibold text-gray-100">
          {rec.wipedAt ? "Wiped — awaiting restore" : "This host is compromised"}
        </span>
        {!rec.wipedAt && (
          <button
            onClick={() => setErr(wipe(nodeId))}
            className="btn-danger btn-sm ml-auto"
            title={contained ? undefined : "Patient zero is still on the network"}
          >
            Wipe and rebuild
          </button>
        )}
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-gray-300">
        {rec.wipedAt
          ? "The operating system has been reinstalled and the encrypted volumes are gone. Restore it from Backup & Recovery to bring the data back."
          : `Files are encrypted and the host is not serving. Wiping reinstalls it from scratch — every byte on it goes, which is why the restore point matters.${
              contained ? "" : ` ${zero} is still on the network; wiping now just gets re-encrypted.`
            }`}
      </p>

      {err && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] leading-relaxed text-danger-strong">
          <IconAlert size={11} className="mt-px shrink-0" />
          {err}
        </p>
      )}
    </div>
  );
}

// ── System status ───────────────────────────────────────────────────────────

/**
 * What a real Server Manager landing page tells you: who this machine is, what
 * it is running, and — because v0.4.0 unified the layers — where it physically
 * sits and how hard the metal is being worked.
 */
function Overview({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const node = infra.nodes[nodeId];
  if (!node) return null;

  const at = locationOf(infra.datacenter, nodeId);
  const life = at ? serverLiveness(at.rack, at.device, node, infra.nodes) : null;
  const services = Object.values(node.os === "windows" ? node.services : {});
  const running = services.filter((s) => s.status === "Running").length;

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-2xl space-y-3">
        <section className="rounded-lg border border-edge bg-panelalt/50 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-100">{node.displayName}</span>
            <span className="font-mono text-[11px] text-info">{node.connection.ip}</span>
            <span
              className={`ml-auto flex items-center gap-1.5 text-[11px] ${
                life?.live ?? true ? "text-emerald-300" : "text-danger"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${life?.live ?? true ? "bg-emerald-400" : "bg-danger"}`}
              />
              {life?.live ?? true ? "running" : life?.reason}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1 font-mono text-[10px] sm:grid-cols-4">
            <Fact label="Hostname" value={node.hostname} />
            <Fact label="Role" value={node.role.replace(/-/g, " ")} />
            <Fact label="Operating system" value={osLabel(node.os, node.role)} />
            <Fact label="Domain" value={node.domain ?? "workgroup"} term="domainjoin" />
            <Fact label="Location" value={at ? `${at.rack.name} · U${at.device.uStart}` : "not racked"} term="rackunit" />
          </dl>
        </section>

        <section className="rounded-lg border border-edge bg-panelalt/50 p-4">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Health</h3>
          <Meter label="CPU" pct={node.health.cpuLoad} />
          <Meter label="Memory" pct={node.health.memUsedPct} />
          <Meter label="Disk" pct={node.health.diskUsedPct} />
          <p className="mt-2 font-mono text-[10px] text-gray-500">
            {running} of {services.length} <Term k="service">services</Term> running ·{" "}
            <Term k="uptime">uptime</Term>{" "}
            {Math.round(node.health.uptimeSeconds / 86_400)} days
          </p>
        </section>

        {node.workloads.length > 0 && (
          <section className="rounded-lg border border-edge bg-panelalt/50 p-4">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Hosted workloads
            </h3>
            <ul className="space-y-1">
              {node.workloads.map((w) => (
                <li key={w.id} className="flex items-center gap-2 text-[11px]">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-info" />
                  <span className="min-w-0 flex-1 truncate text-gray-200">{w.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-gray-500">
                    {Math.round(w.cpuPct)}% · {w.ramGb} GB
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * `term` turns the LABEL into a glossary term rather than adding a help icon
 * beside the value. The label is the part a newcomer does not understand;
 * "clara.internal" needs no gloss, "Domain" does.
 */
function Fact({ label, value, term }: { label: string; value: string; term?: GlossaryKey }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-wider text-gray-600">
        {term ? <Term k={term}>{label}</Term> : label}
      </dt>
      <dd className="truncate text-gray-200">{value}</dd>
    </div>
  );
}

function Meter({ label, pct }: { label: string; pct: number }) {
  const tone = pct > 90 ? "bg-danger" : pct > 75 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex items-baseline gap-2 text-[10px]">
        <span className="uppercase tracking-wider text-gray-500">{label}</span>
        <span className="ml-auto font-mono text-gray-400">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken/70">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
