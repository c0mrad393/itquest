"use client";

/**
 * DevTools (v0.7.0)
 * =================
 * The testing surface, opened from the taskbar tray or Ctrl+Shift+D.
 *
 * IT USED TO BE HIDDEN, and gated on a Sandbox or God Mode session. v0.7.0
 * removed those login modes, so gating it on them would have left the tools
 * unreachable — and a shortcut nobody can discover is not a tool. It is now
 * always available and visibly labelled: this is a single-player training
 * simulator, and a player who opens the debug drawer has chosen to.
 *
 * IT ALSO ABSORBED SANDBOX MODE. "Jump to enterprise" runs the real growth
 * engine forward one milestone at a time rather than generating a second,
 * larger world — so the shortcut exercises the same code the slow path does.
 *
 * EVERY ACTION GOES THROUGH THE REAL STORE. Force Level Up awards the XP the
 * level actually costs, so the reconciler's promotion branch — unlocks, tiers
 * and the company growth milestone — runs exactly as it would in play. A
 * debug tool that bypasses the systems it exists to test is worse than none.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useEffect, useMemo, useState } from "react";
import { useHostStore } from "@/lib/host/store";
import { useInfraStore } from "@/lib/infra/store";
import { threatEvent } from "@/lib/network/edge";
import type { ThreatKind } from "@/lib/vm/types";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useNotificationStore } from "@/lib/host/notifications-store";
import { ticketLibrary } from "@/lib/tickets/factory";
import {
  GROWTH_PHASES,
  phaseForLevel,
  phaseSpec,
  rackThermal,
} from "@/lib/core";
import { xpForLevel } from "@/lib/scenario/scoring";
import { IconAlert, IconBolt, IconCheck, IconPlus, IconWrench, IconX } from "@/components/ui/icons";
import NetworkBench from "./devtools/NetworkBench";
import TicketBench from "./devtools/TicketBench";
import ShellBench from "./devtools/ShellBench";
import { useJobTitle, useStanding } from "@/lib/progression/use-standing";

type Tab = "shell" | "progress" | "tickets" | "faults" | "network";

export default function DebugPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Shell first: it is the tab an engineer opens the panel for, and the
  // world benches are the ones a designer goes looking for.
  const [tab, setTab] = useState<Tab>("shell");
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 8));

  if (!open) return null;

  return (
    <div className="fixed bottom-16 right-3 z-[60] flex max-h-[74vh] w-[30rem] flex-col overflow-hidden rounded-lg border border-amber-500/40 bg-panel/95 shadow-2xl backdrop-blur">
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/[0.07] px-3 py-2">
        <IconWrench size={13} className="text-amber-300" />
        <span className="text-[11px] font-semibold text-amber-200">DevTools</span>
        <span className="font-mono text-[9px] text-amber-200/60">Ctrl+Shift+D</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto text-gray-400 hover:text-gray-200"
        >
          <IconX size={12} />
        </button>
      </div>

      <div className="flex shrink-0 border-b border-edge">
        <TabBtn active={tab === "shell"} onClick={() => setTab("shell")}>Shell</TabBtn>
        <TabBtn active={tab === "progress"} onClick={() => setTab("progress")}>Progression</TabBtn>
        <TabBtn active={tab === "tickets"} onClick={() => setTab("tickets")}>Tickets</TabBtn>
        <TabBtn active={tab === "faults"} onClick={() => setTab("faults")}>Faults</TabBtn>
        <TabBtn active={tab === "network"} onClick={() => setTab("network")}>Network</TabBtn>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "shell" && <ShellBench say={say} />}
        {tab === "progress" && <Progression say={say} />}
        {tab === "tickets" && <TicketBench say={say} />}
        {tab === "faults" && <FaultInjector say={say} />}
        {tab === "network" && <NetworkBench say={say} />}
      </div>

      {log.length > 0 && (
        <div className="shrink-0 border-t border-edge bg-sunken/60 px-3 py-1.5">
          {log.map((line, i) => (
            <div key={i} className={`font-mono text-[9px] ${i === 0 ? "text-emerald-300" : "text-gray-600"}`}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Progression ─────────────────────────────────────────────────────────────

function Progression({ say }: { say: (s: string) => void }) {
  const user = useHostStore((s) => s.host.user);
  const standing = useStanding();
  const title = useJobTitle();
  const awardXp = useHostStore((s) => s.awardXp);
  const awardBudget = useHostStore((s) => s.awardBudget);
  const growth = useInfraStore((s) => s.infra.growth);
  const org = useInfraStore((s) => s.infra.org);
  const grow = useInfraStore((s) => s.growCompany);

  const nextLevelXp = xpForLevel(standing.level + 1);
  const spec = phaseSpec(growth.phase);

  /**
   * Force a level up by awarding the XP it actually takes.
   *
   * Deliberately NOT `setState({ level })`: the reconciler's promotion branch
   * is what unlocks apps, opens tiers and grows the company, and it only fires
   * on a real award. Setting the number directly would test nothing.
   */
  function levelUp() {
    const need = Math.max(1, nextLevelXp - user.xp);
    const promo = awardXp(need);
    say(`level ${promo.from} -> ${promo.to} (+${need} XP)`);
  }

  /**
   * What Sandbox Mode used to be, without a second world generator.
   *
   * Awards the XP for level 15 and then runs the growth engine forward one
   * milestone at a time — the same `growCompany` the promotion handler calls.
   * A shortcut that built its own enterprise would test a code path no player
   * ever walks.
   */
  function jumpToEnterprise() {
    const need = Math.max(1, xpForLevel(15) - user.xp);
    awardXp(need);
    awardBudget(500_000);
    let hired = 0;
    for (const phase of [2, 3, 4] as const) {
      const grew = grow(phase);
      if (grew) hired += grew.hired;
    }
    say(`enterprise scale: level 15, ${hired} hired`);
  }

  return (
    <div className="space-y-3">
      <section>
        <Head>Operator</Head>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
          <Stat label="Level" value={standing.held ? `${standing.level} (earned ${standing.earned})` : String(standing.level)} />
          <Stat label="XP" value={`${user.xp.toLocaleString()} / ${nextLevelXp.toLocaleString()}`} />
          <Stat label="Budget" value={`${user.budget.toLocaleString()} Cr`} />
          <Stat label="Role" value={title} />
        </dl>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Btn onClick={levelUp} icon={<IconPlus size={10} />}>Force level up</Btn>
          <Btn onClick={() => { awardXp(5000); say("+5,000 XP"); }}>+5k XP</Btn>
          <Btn onClick={() => { awardBudget(50_000); say("+50,000 Cr"); }}>+50k Cr</Btn>
          <Btn onClick={jumpToEnterprise} icon={<IconCheck size={10} />}>Jump to enterprise</Btn>
        </div>
      </section>

      <section>
        <Head>Company</Head>
        <p className="mb-1.5 text-[10px] text-gray-400">
          {org.name} · {spec.label} · {growth.employees} staff
        </p>
        {/* The milestone ladder, so a tester can see where the next jump is
            without counting levels in their head. */}
        <ol className="space-y-0.5">
          {GROWTH_PHASES.map((p) => {
            const done = growth.applied.includes(p.phase);
            const current = growth.phase === p.phase;
            return (
              <li key={p.phase} className="flex items-center gap-2 text-[10px]">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    current ? "bg-info" : done ? "bg-emerald-400" : "bg-edge"
                  }`}
                />
                <span className={current ? "text-gray-100" : done ? "text-gray-400" : "text-gray-600"}>
                  L{p.level} · {p.label}
                </span>
                <span className="ml-auto font-mono text-gray-600">{p.employees} staff</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-1.5 text-[9px] leading-relaxed text-gray-600">
          Growth fires from the promotion handler, so forcing a level up to {phaseSpec(
            phaseForLevel(standing.level + 1),
          ).level} runs the real milestone — hiring, new OUs and the project ticket.
        </p>
      </section>
    </div>
  );
}

// ── Fault injection ─────────────────────────────────────────────────────────

function FaultInjector({ say }: { say: (s: string) => void }) {
  const infra = useInfraStore((s) => s.infra);
  const setInfra = useInfraStore((s) => s.setInfra);
  const setPower = useInfraStore((s) => s.setNodePower);
  const [rackId, setRackId] = useState(infra.datacenter.racks[0]?.id ?? "");

  const rack = infra.datacenter.racks.find((r) => r.id === rackId) ?? infra.datacenter.racks[0];

  /**
   * Faults are written as STATE, not as a scripted animation: trip the
   * breaker, unpatch the cooling, mark the part faulty. The reconciler and
   * the physics then react to them exactly as they would to a player's
   * mistake — which is the only way to test that they do.
   */
  function tripBreaker() {
    if (!rack) return;
    const draft = structuredClone(infra);
    const target = draft.datacenter.racks.find((r) => r.id === rack.id)!;
    target.breakerTripped = true;
    target.trippedAt = Date.now();
    setInfra(draft);
    say(`${rack.name}: breaker tripped`);
  }

  function thermalSpike() {
    if (!rack) return;
    const draft = structuredClone(infra);
    const target = draft.datacenter.racks.find((r) => r.id === rack.id)!;
    // Pull the power leads off every cooling unit. The rack heats up because
    // the physics says it should, not because a temperature was set.
    const coolingIds = new Set(
      target.devices.filter((d) => d.kind === "crac" || d.kind === "fan-tray").map((d) => d.id),
    );
    target.cables = target.cables.filter(
      (c) => !(c.kind === "power" && (coolingIds.has(c.fromDeviceId) || coolingIds.has(c.toDeviceId))),
    );
    setInfra(draft);
    const after = rackThermal(
      draft.datacenter.racks.find((r) => r.id === rack.id)!,
      draft.nodes,
    );
    say(`${rack.name}: cooling unpatched, now ${after.tempC.toFixed(1)}C`);
  }

  function driveFailure() {
    const fs = Object.values(infra.nodes).find((n) => n.role === "file-server");
    if (!fs) { say("no file server in this estate"); return; }
    const draft = structuredClone(infra);
    // Condemn a spare disk and take the host down — a dead array in the one
    // chassis that everybody's home drive lives on.
    draft.inventory.items = draft.inventory.items.map((i) =>
      i.category === "storage" && i.spare > 0
        ? { ...i, spare: i.spare - 1, faulty: i.faulty + 1 }
        : i,
    );
    setInfra(draft);
    setPower(fs.nodeId, false);
    say(`${fs.hostname}: array failed, host down`);
  }

  return (
    <div className="space-y-2">
      <Head>Hardware faults</Head>
      <select
        value={rack?.id ?? ""}
        onChange={(e) => setRackId(e.target.value)}
        className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[10px] text-gray-200"
      >
        {infra.datacenter.racks.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} — {rackThermal(r, infra.nodes).tempC.toFixed(1)}C
            {r.breakerTripped ? " · breaker open" : ""}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={tripBreaker} icon={<IconBolt size={10} />} tone="danger">Trip PDU</Btn>
        <Btn onClick={thermalSpike} icon={<IconAlert size={10} />} tone="danger">Thermal spike</Btn>
        <Btn onClick={driveFailure} icon={<IconAlert size={10} />} tone="danger">Drive failure</Btn>
      </div>
      <p className="text-[9px] leading-relaxed text-gray-600">
        Each fault is written as state and left for the simulation to react to — the reconciler raises the
        incident, the Gateway drops the host, and the consoles that depend on it fail with the real diagnosis.
      </p>

      <EdgeFaults say={say} />
    </div>
  );
}

// ── atoms ───────────────────────────────────────────────────────────────────

function Head({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500">{children}</h3>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-gray-600">{label}</dt>
      <dd className="truncate text-gray-200">{value}</dd>
    </>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 text-[10px] ${
        active ? "border-b-2 border-amber-400 text-amber-200" : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function Btn({
  onClick,
  icon,
  tone,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${
        tone === "danger"
          ? "border-danger/40 text-danger hover:bg-danger/10"
          : "border-edge text-gray-200 hover:bg-panelalt"
      }`}
    >
      {icon} {children}
    </button>
  );
}


// ── Edge appliance faults ───────────────────────────────────────────────────

/**
 * The perimeter's ticket-injection door.
 *
 * Each button writes ONE piece of state and leaves the appliance to tell the
 * story — a misconfigured forward shows up as a health warning on the NAT page,
 * a pool collision surfaces as a conflicting lease, and a threat burst fills
 * the Threat Intelligence dashboard. None of them print a message saying what
 * is wrong, because finding that out is the exercise.
 */
function EdgeFaults({ say }: { say: (s: string) => void }) {
  const infra = useInfraStore((s) => s.infra);
  const ensure = useInfraStore((s) => s.ensureEdgeGateway);
  const addNat = useInfraStore((s) => s.addNatRule);
  const setIface = useInfraStore((s) => s.setNodeInterfaceUp);
  const addRes = useInfraStore((s) => s.addDhcpReservation);
  const push = useInfraStore((s) => s.pushThreatEvents);
  const setIds = useInfraStore((s) => s.setIds);

  function badNat() {
    const id = ensure();
    // Points at an address nobody holds: the classic "we published the web
    // server and nothing happens" ticket.
    addNat(id, {
      id: `nat-broken-${Date.now().toString(36)}`,
      protocol: "tcp",
      externalPort: 80,
      internalIp: "10.255.255.40",
      internalPort: 80,
      description: "Public web server",
      enabled: true,
    });
    say("edge: published :80 to a host that does not exist");
  }

  function wanDown() {
    const id = ensure();
    setIface(id, "wan0", false);
    say("edge: WAN interface administratively down");
  }

  function dhcpConflict() {
    const id = ensure();
    const gw = infra.nodes[id];
    const lan = gw?.network.interfaces.find((i) => i.name === "lan0")?.ipv4 ?? "10.0.0.1";
    // Reserve a live host's MAC onto an address INSIDE the dynamic pool — the
    // reservation looks fine today and collides the moment the pool reaches it.
    const victim = Object.values(infra.nodes).find(
      (n) => n.nodeId !== id && n.network?.interfaces?.some((i) => i.ipv4 && i.mac),
    );
    const mac = victim?.network.interfaces.find((i) => i.ipv4)?.mac;
    if (!mac) return say("edge: no LAN host to reserve");
    addRes(id, { mac, ip: lan.replace(/\.\d+$/, ".120"), hostname: victim?.hostname });
    say(`edge: reserved ${mac} inside the dynamic pool`);
  }

  function threatBurst() {
    const id = ensure();
    const gw = infra.nodes[id];
    let ids = gw?.network.ids ?? { enabled: false, mode: "detect" as const, events: [] };
    // The engine records nothing while it is off, so an attack scenario has to
    // switch it on first — in DETECT, which is the interesting starting state:
    // the operator can see the attack and has not yet stopped it.
    if (!ids.enabled) {
      setIds(id, { enabled: true, mode: "detect" });
      ids = { ...ids, enabled: true, mode: "detect" };
    }
    const lan = gw?.network.interfaces.find((i) => i.name === "lan0")?.ipv4 ?? "10.0.0.1";
    const kinds: ThreatKind[] = ["port-scan", "ddos", "brute-force", "malware-c2", "exploit"];
    const now = Date.now();
    const events = Array.from({ length: 24 }, (_, i) =>
      threatEvent(
        ids,
        kinds[i % kinds.length],
        `203.0.113.${20 + (i % 40)}`,
        i % 3 === 0 ? lan : lan.replace(/\.\d+$/, `.${30 + (i % 20)}`),
        now - i * 4000,
        i,
      ),
    );
    push(id, events);
    say(`edge: ${events.length} threat events (engine ${ids.enabled ? ids.mode : "off"})`);
  }

  function enableIps() {
    const id = ensure();
    setIds(id, { enabled: true, mode: "prevent" });
    say("edge: inspection engine set to prevent");
  }

  return (
    <div className="space-y-2 border-t border-edge pt-2">
      <Head>Edge appliance</Head>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={badNat} icon={<IconAlert size={10} />} tone="danger">Bad NAT rule</Btn>
        <Btn onClick={wanDown} icon={<IconAlert size={10} />} tone="danger">WAN down</Btn>
        <Btn onClick={dhcpConflict} icon={<IconAlert size={10} />} tone="danger">DHCP conflict</Btn>
        <Btn onClick={threatBurst} icon={<IconAlert size={10} />} tone="danger">Threat burst</Btn>
        <Btn onClick={enableIps} icon={<IconBolt size={10} />}>Enable IPS</Btn>
      </div>
      <p className="text-[9px] leading-relaxed text-gray-600">
        A threat burst injected while the engine is OFF or in detect mode is recorded as reaching the
        estate — which is the point of the scenario.
      </p>
    </div>
  );
}
