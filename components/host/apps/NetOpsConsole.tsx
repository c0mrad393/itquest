"use client";

/**
 * NetOps Console (Level-0 host app)
 * ---------------------------------
 * Live view of the org's network graph. Metrics (latency / utilization /
 * packet loss) evolve in real time via the NetworkEngine tick. The player
 * optimizes stability by re-routing links onto less-congested subnets,
 * deploying software firewalls (dampen loss at a latency cost), or blocking
 * links (containment). Node health follows its worst attached link.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useNow } from "@/lib/sla/store";
import { SCALE_META, SECTOR_META, type NetworkLink } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import type { HostAppIconId } from "@/lib/core";

export default function NetOpsConsole() {
  useNow(); // subscribe to the 1s tick so metrics re-render live
  const infra = useInfraStore((s) => s.infra);
  const reroute = useInfraStore((s) => s.rerouteLink);
  const setFirewall = useInfraStore((s) => s.setLinkFirewall);
  const setBlocked = useInfraStore((s) => s.setLinkBlocked);

  const nodeName = (id: string) => (id === "internet" ? "Internet" : infra.nodes[id]?.hostname ?? id);
  const avgLoss = infra.links.length
    ? infra.links.reduce((a, l) => a + l.packetLossPct, 0) / infra.links.length
    : 0;
  const congested = infra.links.filter((l) => l.utilizationPct >= 85 && !l.blocked).length;

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      {/* Header / org summary */}
      <div className="flex flex-wrap items-center gap-3 border-b border-edge bg-panelalt px-4 py-3">
        <span className="text-info"><AppIcon id={SECTOR_META[infra.org.sector].iconId} size={18} /></span>
        <div>
          <div className="text-sm font-semibold text-gray-100">{infra.org.name}</div>
          <div className="text-[11px] text-gray-500">
            {SCALE_META[infra.org.scale].label} · {infra.org.topologyKind.replace("-", " ")} ·{" "}
            {Object.keys(infra.nodes).length} nodes
          </div>
        </div>
        <div className="ml-auto flex gap-2 text-center text-[11px]">
          <Kpi label="Links" value={String(infra.links.length)} />
          <Kpi label="Congested" value={String(congested)} tone={congested > 0 ? "warn" : "ok"} />
          <Kpi label="Avg loss" value={`${avgLoss.toFixed(1)}%`} tone={avgLoss > 2 ? "bad" : "ok"} />
        </div>
      </div>

      {/* Link table */}
      <div className="flex-1 overflow-y-auto term-scroll p-3">
        <div className="grid grid-cols-[1fr_110px_150px_90px_1fr] gap-2 border-b border-edge px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          <span>Link</span>
          <span>Latency</span>
          <span>Utilization</span>
          <span>Loss</span>
          <span className="text-right">Optimize</span>
        </div>
        {infra.links.map((l) => (
          <LinkRow
            key={l.id}
            link={l}
            fromName={nodeName(l.from)}
            toName={nodeName(l.to)}
            subnets={infra.subnets}
            onReroute={(cidr) => reroute(l.id, cidr)}
            onFirewall={(on) => setFirewall(l.id, on)}
            onBlock={(b) => setBlocked(l.id, b)}
          />
        ))}
      </div>

      <IncidentActions />

      <div className="border-t border-edge px-4 py-2 text-[10px] leading-relaxed text-gray-600">
        Re-routing sheds utilization and clears loss. Software firewalls add latency but dampen
        loss spikes on congested links. Blocking is containment (used for SecOps isolation).
        Node health tracks its worst attached link.
      </div>
    </div>
  );
}

function LinkRow({
  link,
  fromName,
  toName,
  subnets,
  onReroute,
  onFirewall,
  onBlock,
}: {
  link: NetworkLink;
  fromName: string;
  toName: string;
  subnets: { cidr: string; label: string }[];
  onReroute: (cidr: string) => void;
  onFirewall: (on: boolean) => void;
  onBlock: (b: boolean) => void;
}) {
  const lossTone =
    link.packetLossPct > 4 ? "text-danger" : link.packetLossPct > 1.5 ? "text-amber-300" : "text-emerald-300";
  const utilTone = link.utilizationPct >= 85 ? "bg-danger" : link.utilizationPct >= 65 ? "bg-warn" : "bg-accent";

  return (
    <div className="grid grid-cols-[1fr_110px_150px_90px_1fr] items-center gap-2 border-b border-edge/60 px-2 py-2.5">
      <div className="min-w-0">
        <div className="truncate font-mono text-[12px] text-gray-200">
          {fromName} <span className="text-gray-600">→</span> {toName}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-gray-500">
          {link.via}
          {link.softwareFirewall && <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1 text-sky-300"><AppIcon id="shield" size={10} /> fw</span>}
          {link.blocked && <span className="rounded bg-danger/20 px-1 text-danger">blocked</span>}
        </div>
      </div>

      <span className="font-mono text-xs text-gray-300">{link.latencyMs.toFixed(1)} ms</span>

      <div>
        <div className="mb-0.5 flex justify-between font-mono text-[10px] text-gray-400">
          <span>{link.blocked ? 0 : link.utilizationPct}%</span>
          <span>{(link.bandwidthMbps / 1000).toFixed(link.bandwidthMbps >= 1000 ? 0 : 1)}G</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
          <div className={`h-full rounded-full ${utilTone}`} style={{ width: `${link.blocked ? 0 : link.utilizationPct}%` }} />
        </div>
      </div>

      <span className={`font-mono text-xs ${lossTone}`}>{link.blocked ? "—" : `${link.packetLossPct.toFixed(1)}%`}</span>

      <div className="flex items-center justify-end gap-1">
        <select
          value=""
          onChange={(e) => e.target.value && onReroute(e.target.value)}
          disabled={link.blocked}
          className="rounded border border-edge bg-panelalt px-1.5 py-1 text-[10px] text-gray-300 outline-none disabled:opacity-40"
          title="Re-route onto subnet"
        >
          <option value="">Re-route…</option>
          {subnets.filter((s) => s.cidr !== link.via).map((s) => (
            <option key={s.cidr} value={s.cidr}>
              {s.label}
            </option>
          ))}
        </select>
        <IconBtn active={link.softwareFirewall} onClick={() => onFirewall(!link.softwareFirewall)} title="Software firewall">
          <AppIcon id="shield" size={14} />
        </IconBtn>
        <IconBtn active={link.blocked} danger onClick={() => onBlock(!link.blocked)} title="Block link">
          <AppIcon id="ban" size={14} />
        </IconBtn>
      </div>
    </div>
  );
}

/**
 * Incident Response — the SecOps/NetOps action surface that satisfies the
 * Tier 2/3 win-conditions: edge-router IP blocks, host isolation, credential
 * rotation, DNS re-point, and log rotation.
 */
function IncidentActions() {
  const infra = useInfraStore((s) => s.infra);
  const blockIp = useInfraStore((s) => s.blockIp);
  const isolateNode = useInfraStore((s) => s.isolateNode);
  const rotateCredentials = useInfraStore((s) => s.rotateCredentials);
  const markDnsFixed = useInfraStore((s) => s.markDnsFixed);
  const runLogRotation = useInfraStore((s) => s.runLogRotation);
  const completeOnboarding = useInfraStore((s) => s.completeOnboarding);

  const [ip, setIp] = useState("");
  const [nodeId, setNodeId] = useState("");
  const sec = infra.security;
  const nodes = Object.values(infra.nodes);

  return (
    <div className="border-t border-edge bg-panelalt/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Incident Response
        </span>
        {sec.blockedIps.length > 0 && (
          <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[9px] text-danger">
            {sec.blockedIps.length} IP blocked
          </span>
        )}
        {sec.isolatedNodeIds.length > 0 && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300">
            {sec.isolatedNodeIds.length} isolated
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Block attacker IP at the edge router */}
        <div className="flex items-center gap-1">
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="attacker IP…"
            className="w-36 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none placeholder:text-gray-600 focus:border-info"
          />
          <button
            onClick={() => { if (ip.trim()) { blockIp(ip.trim()); setIp(""); } }}
            className="rounded border border-danger/40 px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/10"
          >
            <span className="inline-flex items-center gap-1.5"><AppIcon id="ban" size={12} /> Block at edge</span>
          </button>
        </div>

        {/* Node-scoped containment / cleanup */}
        <div className="flex items-center gap-1">
          <select
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            className="rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-300 outline-none"
          >
            <option value="">select host…</option>
            {nodes.map((n) => (
              <option key={n.nodeId} value={n.nodeId}>{n.hostname}</option>
            ))}
          </select>
          <button
            onClick={() => nodeId && isolateNode(nodeId)}
            disabled={!nodeId}
            className="rounded border border-amber-500/40 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-1.5"><AppIcon id="lock" size={12} /> Isolate</span>
          </button>
          <button
            onClick={() => nodeId && runLogRotation(nodeId)}
            disabled={!nodeId}
            className="rounded border border-edge px-2 py-1 text-[11px] text-gray-200 hover:bg-edge disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-1.5"><AppIcon id="book" size={12} /> Rotate logs</span>
          </button>
        </div>

        {/* One-shot remediations */}
        <ActionToggle done={sec.credentialsRotated} onClick={rotateCredentials} iconId="key" label="Rotate service credentials" doneLabel="Credentials rotated" />
        <ActionToggle done={sec.dnsFixed} onClick={markDnsFixed} iconId="globe" label="Flush DNS + re-point resolvers" doneLabel="Resolvers corrected" />
        <ActionToggle done={sec.onboardingComplete} onClick={completeOnboarding} iconId="users" label="Re-run onboarding import" doneLabel="Onboarding imported" />
      </div>
    </div>
  );
}

function ActionToggle({
  done,
  onClick,
  iconId,
  label,
  doneLabel,
}: {
  done: boolean;
  onClick: () => void;
  iconId: HostAppIconId;
  label: string;
  doneLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className={`rounded border px-2 py-1 text-[11px] font-semibold transition ${
        done
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-edge text-gray-200 hover:bg-edge"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <AppIcon id={done ? "check" : iconId} size={12} />
        {done ? doneLabel : label}
      </span>
    </button>
  );
}

function Kpi({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const c = tone === "bad" ? "text-danger" : tone === "warn" ? "text-warn" : "text-gray-200";
  return (
    <div className="rounded-md bg-black/20 px-2.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`font-mono text-sm font-bold ${c}`}>{value}</div>
    </div>
  );
}

function IconBtn({
  children,
  active,
  danger,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded border text-xs transition ${
        active
          ? danger
            ? "border-danger bg-danger/20"
            : "border-info bg-info/20"
          : "border-edge hover:bg-edge"
      }`}
    >
      {children}
    </button>
  );
}
