"use client";

/**
 * Network Switches — managed PoE console (Build 1)
 * ================================================
 * A faceplate you can read at a glance and a port editor you can act in.
 *
 * ── WHY THE FACEPLATE IS THE MAIN OBJECT ────────────────────────────────────
 *
 * The obvious build is a table: one row per port, columns for state, power and
 * address. It would be denser and it would be worse. An operator standing in
 * front of a switch reads the LEDs — position carries meaning, because port 3
 * is physically next to port 4, and a row of dark ports in the middle of a lit
 * rank is a pattern the eye catches before it reads anything. The faceplate is
 * the two-row odd-over-even layout real 8- and 16-port switches use, so what
 * the player learns here transfers to the thing in the cabinet.
 *
 * The table exists too, underneath, for the jobs a table is better at.
 *
 * ── THE BUDGET METER IS NOT DECORATION ──────────────────────────────────────
 *
 * It is the only place the shedding rule is visible before it bites. It shows
 * granted against budget, and — when the switch is over — what was requested,
 * because "you asked for 82W of a 65W budget" is the sentence that explains
 * the dark camera. Every number on it comes from `switchPower()`; nothing here
 * keeps its own running total.
 *
 * Semantic tokens throughout, so both themes come free and stay AA.
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import {
  POE_STANDARD,
  SATURATION_META,
  computeTraffic,
  detectConflicts,
  effectiveIp,
  isPoweredDevice,
  leaseMode,
  poolFor,
  subnetOf,
  suggestStatic,
  switchPower,
  type IpConflict,
  type NodeId,
  type PoePort,
  type PoePriority,
  type PoeSwitch,
  type SegmentLoad,
  type TrafficReport,
} from "@/lib/core";
import { useTrafficOverrides } from "@/lib/host/devtools";
import { AppHeader, CountPill } from "./AppChrome";
import EmptyState from "@/components/ui/EmptyState";
import { Term } from "@/components/ui/Tooltip";
import Disclosure from "@/components/ui/Disclosure";
import {
  IconActivity,
  IconAlert,
  IconBolt,
  IconCheck,
  IconSwitch,
  IconX,
} from "@/components/ui/icons";

const PRIORITIES: PoePriority[] = ["critical", "high", "low"];

export default function SwitchPanel() {
  const infra = useInfraStore((s) => s.infra);
  const overrides = useTrafficOverrides();
  const [switchId, setSwitchId] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);

  const switches = infra.poe.switches;
  const sw = switches.find((s) => s.id === switchId) ?? switches[0];

  // ONE derivation, shared by the meter, the faceplate and the port editor, so
  // the three can never disagree about which port is being shed.
  const power = useMemo(
    () => (sw ? switchPower(sw, infra.nodes) : null),
    [sw, infra.nodes],
  );
  const conflicts = useMemo(
    () => detectConflicts({ nodes: infra.nodes, subnets: infra.subnets, ipam: infra.ipam }),
    [infra.nodes, infra.subnets, infra.ipam],
  );

  // Video load on this switch's uplink (Builds 2-3). Same derivation the Dev
  // bench and the Monitor read, so the three cannot disagree.
  const traffic = useMemo(() => computeTraffic(infra, overrides), [infra, overrides]);
  const uplink = traffic.uplinks.find((u) => u.id === sw?.id) ?? null;

  const openFaults = infra.ipam.faults.filter((f) => !f.clearedAt);

  /*
   * Conflicts split by WHERE they are.
   *
   * The header badge originally reported any blocking conflict on the estate,
   * which read — in a panel titled with one switch's name — as "this switch has
   * a conflict". A conflict between two servers in a rack has nothing to do
   * with the access layer, and an alarm that points at the wrong equipment is
   * worse than one that stays quiet. Same data, honestly attributed.
   */
  const onThisSwitch = sw
    ? conflicts.filter(
        (c) => c.blocking && sw.ports.some((p) => p.attachedNodeId === c.nodeId),
      )
    : [];
  const elsewhere = conflicts.filter(
    (c) => c.blocking && !onThisSwitch.some((x) => x.nodeId === c.nodeId),
  );

  if (!sw || !power) {
    return (
      <div className="flex h-full flex-col bg-panel text-gray-200">
        <AppHeader iconId="switch" title="Network Switches" subtitle="Managed PoE access layer" />
        <EmptyState
          icon={<IconSwitch size={22} />}
          title="No managed switches on this estate"
          body="Access-layer switches appear here once the network has been built out."
        />
      </div>
    );
  }

  const port = sw.ports.find((p) => p.n === selectedPort) ?? null;

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      <AppHeader iconId="switch" title="Network Switches" subtitle="Managed PoE access layer">
        <CountPill label="ports live" value={sw.ports.filter((p) => p.enabled).length} />
        {power.overBudget && (
          <span className="chip-bad">
            <IconAlert size={10} /> Over PoE budget
          </span>
        )}
        {uplink && uplink.level !== "clear" && (
          <span className={uplink.level === "busy" ? "chip-warn" : "chip-bad"}>
            <IconActivity size={10} /> Uplink {SATURATION_META[uplink.level].label.toLowerCase()}
          </span>
        )}
        {onThisSwitch.length > 0 && (
          <span className="chip-bad">
            <IconAlert size={10} /> IP conflict detected
          </span>
        )}
        {onThisSwitch.length === 0 && elsewhere.length > 0 && (
          <span
            className="chip-warn"
            title={elsewhere.map((c) => c.detail).join(" ")}
          >
            <IconAlert size={10} /> {elsewhere.length} IP conflict
            {elsewhere.length === 1 ? "" : "s"} elsewhere on the network
          </span>
        )}
      </AppHeader>

      {switches.length > 1 && (
        <div className="flex shrink-0 gap-1 border-b border-edge bg-surface-2 px-3 py-1.5">
          {switches.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSwitchId(s.id); setSelectedPort(null); }}
              data-active={s.id === sw.id}
              className="tab"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-3">
          <Faceplate
            sw={sw}
            power={power}
            traffic={traffic}
            selected={selectedPort}
            onSelect={setSelectedPort}
            conflicts={conflicts}
          />

          <BudgetMeter sw={sw} power={power} />

          {uplink && <UplinkMeter seg={uplink} traffic={traffic} switchId={sw.id} />}

          {openFaults.length > 0 && <FaultLog faults={openFaults} />}

          <Disclosure
            label="All ports"
            summary={`${sw.ports.length} ports as a table`}
            defaultOpen={false}
          >
            <PortTable sw={sw} power={power} onSelect={setSelectedPort} conflicts={conflicts} />
          </Disclosure>
        </div>

        <aside className="flex w-[22rem] shrink-0 flex-col border-l border-edge bg-surface-2">
          {port ? (
            <PortEditor
              key={`${sw.id}-${port.n}`}
              sw={sw}
              port={port}
              conflicts={conflicts}
              onClose={() => setSelectedPort(null)}
            />
          ) : (
            <EmptyState
              compact
              icon={<IconSwitch size={16} />}
              title="No port selected"
              body="Pick a port on the faceplate to see what is plugged into it, how much power it is drawing, and how it gets its address."
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Faceplate ───────────────────────────────────────────────────────────────

/**
 * The physical layout: odd ports on the top row, even beneath, exactly as they
 * are printed on the metal. Ports read left to right in pairs (1/2, 3/4 …),
 * which is what makes "the third pair is dark" a thing the eye can find.
 */
function Faceplate({
  sw,
  power,
  traffic,
  selected,
  onSelect,
  conflicts,
}: {
  sw: PoeSwitch;
  power: ReturnType<typeof switchPower>;
  traffic: TrafficReport;
  selected: number | null;
  onSelect: (n: number) => void;
  conflicts: IpConflict[];
}) {
  const pairs = Math.ceil(sw.ports.length / 2);
  return (
    <div className="mb-3 rounded-lg border border-edge bg-sunken p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-gray-100">{sw.name}</span>
        <span className="font-mono text-[10px] text-gray-500">{sw.mgmtIp}</span>
        <span className="ml-auto font-mono text-[10px] text-gray-500">
          {POE_STANDARD[sw.standard].label}
        </span>
      </div>

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${pairs}, minmax(0, 1fr))` }}
      >
        {[0, 1].map((row) =>
          Array.from({ length: pairs }, (_, col) => {
            const n = col * 2 + row + 1;
            const port = sw.ports.find((p) => p.n === n);
            if (!port) return <div key={`${row}-${col}`} />;
            return (
              <PortJack
                key={n}
                port={port}
                power={power}
                traffic={traffic}
                selected={selected === n}
                conflicted={conflicts.some(
                  (c) => c.blocking && c.nodeId === port.attachedNodeId,
                )}
                onSelect={() => onSelect(n)}
              />
            );
          }),
        )}
      </div>

      <Legend />
    </div>
  );
}

function PortJack({
  port,
  power,
  traffic,
  selected,
  conflicted,
  onSelect,
}: {
  port: PoePort;
  power: ReturnType<typeof switchPower>;
  traffic: TrafficReport;
  selected: boolean;
  conflicted: boolean;
  onSelect: () => void;
}) {
  const pp = power.ports.find((p) => p.port === port.n);
  const occupied = !!port.attachedNodeId;
  const mbps = traffic.cameras.find((c) => c.nodeId === port.attachedNodeId)?.mbps ?? 0;

  /*
   * State decides colour, in the order a fault should dominate a healthy
   * signal. Shed outranks link-up because a port that is up but unpowered is
   * still a port whose device is dark, and that is the thing worth seeing.
   */
  const tone = !port.enabled
    ? "border-edge bg-surface-3 text-gray-600"
    : conflicted
      ? "border-danger bg-danger/15 text-danger-strong"
      : pp?.shed || pp?.overPortLimit
        ? "border-warn bg-warn/15 text-warn-strong"
        : occupied
          ? "border-accent/50 bg-accent/12 text-accent-strong"
          : "border-edge bg-surface-2 text-gray-500";

  /*
   * A mains-powered device on a switch port reads "link" rather than "0.0W".
   * Both are true, but under a legend that says green means "powered", a web
   * server showing 0.0W in green invites the reader to conclude the switch is
   * failing to power something it was never supposed to power.
   */
  const label = !port.enabled
    ? "disabled"
    : conflicted
      ? "IP conflict"
      : pp?.shed
        ? "no power"
        : pp?.overPortLimit
          ? "over class"
          : !occupied
            ? "empty"
            : mbps > 0
              // Bandwidth beats watts on the label for a streaming camera: an
              // operator hunting a saturated uplink needs the Mbps, and the
              // watts are one click away in the port editor.
              ? `${mbps.toFixed(1)}Mb`
              : (pp?.requestedW ?? 0) > 0
                ? `${(pp?.grantedW ?? 0).toFixed(1)}W`
                : "link";

  return (
    <button
      onClick={onSelect}
      title={port.label ?? `Port ${port.n}`}
      aria-label={`Port ${port.n}: ${label}`}
      className={`flex flex-col items-center gap-0.5 rounded border px-1 py-1.5 transition hover:brightness-110 ${tone} ${
        selected ? "ring-2 ring-brand-text" : ""
      }`}
    >
      <span className="font-mono text-[10px] font-semibold leading-none">{port.n}</span>
      {/* The link LED. A ring rather than a filled dot when the port is up but
          unpowered, so "connected" and "powered" stay visually distinct. */}
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          !port.enabled
            ? "bg-gray-600"
            : (pp?.grantedW ?? 0) > 0 || (occupied && (pp?.requestedW ?? 0) === 0)
              ? "bg-current"
              : occupied
                ? "border border-current"
                : "bg-gray-600/50"
        }`}
      />
      <span className="w-full truncate text-center text-[8px] leading-none opacity-80">
        {label}
      </span>
    </button>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["bg-accent/40 border-accent/60", "up"],
    ["bg-warn/40 border-warn", "no power"],
    ["bg-danger/40 border-danger", "IP conflict"],
    ["bg-surface-3 border-edge", "disabled or empty"],
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-edge pt-2">
      {items.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className={`h-2.5 w-2.5 rounded-sm border ${cls}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Budget ──────────────────────────────────────────────────────────────────

function BudgetMeter({ sw, power }: { sw: PoeSwitch; power: ReturnType<typeof switchPower> }) {
  const tone = power.overBudget ? "bg-danger" : power.loadPct > 85 ? "bg-warn" : "bg-accent";
  return (
    <div className="mb-3 rounded-lg border border-edge bg-surface p-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <IconBolt size={12} className="text-warn-strong" />
        <span className="text-[11px] font-semibold text-gray-100">PoE power budget</span>
        <span className="ml-auto font-mono text-[11px] text-gray-200">
          {power.grantedW.toFixed(1)}W
          <span className="text-gray-500"> / {power.budgetW}W</span>
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-500/20">
        <div
          className={`h-full rounded-full transition-all ${tone}`}
          style={{ width: `${Math.min(100, power.loadPct)}%` }}
        />
      </div>

      {power.overBudget ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-danger-strong">
          <IconAlert size={11} className="mt-px shrink-0" />
          <span>
            Ports are asking for {power.requestedW.toFixed(1)}W against a {power.budgetW}W budget.{" "}
            {sw.name} has dropped port{power.shedPorts.length === 1 ? "" : "s"}{" "}
            {power.shedPorts.join(", ")} — whatever was on {power.shedPorts.length === 1 ? "it is" : "them are"} dark now.
            Raise a port&apos;s priority to protect it, or switch off something that can wait.
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-gray-500">
          {(power.budgetW - power.grantedW).toFixed(1)}W spare — about{" "}
          {Math.floor((power.budgetW - power.grantedW) / 12.5)} more camera
          {Math.floor((power.budgetW - power.grantedW) / 12.5) === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}

// ── Uplink saturation ───────────────────────────────────────────────────────

/**
 * The uplink meter, sitting directly beneath the PoE budget meter.
 *
 * Two constraints, side by side, is the point of putting it here. A switch can
 * be comfortably inside its POWER budget and hopelessly over its BANDWIDTH
 * budget at the same time, and an operator who has only ever seen the watts
 * will keep adding cameras that power up perfectly and record nothing. The two
 * meters answer different questions and both have to be visible to be learned.
 */
function UplinkMeter({
  seg,
  traffic,
  switchId,
}: {
  seg: SegmentLoad;
  traffic: TrafficReport;
  switchId: string;
}) {
  const setUplink = useInfraStore((s) => s.trafficSetUplink);
  const streaming = traffic.cameras.filter((c) => c.switchId === switchId && c.streaming).length;
  const tone =
    seg.level === "saturated"
      ? "bg-danger"
      : seg.level === "congested"
        ? "bg-warn"
        : seg.level === "busy"
          ? "bg-warn-strong"
          : "bg-accent";

  return (
    <div className="mb-3 rounded-lg border border-edge bg-surface p-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <IconActivity size={12} className="text-info-strong" />
        <span className="text-[11px] font-semibold text-gray-100">
          <Term k="uplink">Uplink</Term> bandwidth
        </span>
        <span className="ml-auto font-mono text-[11px] text-gray-200">
          {seg.offeredMbps} Mbps
          <span className="text-gray-500"> / {seg.capacityMbps}</span>
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-500/20">
        <div
          className={`h-full rounded-full transition-all ${tone}`}
          style={{ width: `${Math.min(100, seg.loadPct)}%` }}
        />
      </div>

      {seg.level === "clear" || seg.level === "busy" ? (
        <p className="mt-1.5 text-[11px] text-gray-500">
          {streaming} camera{streaming === 1 ? "" : "s"} streaming ·{" "}
          {Math.max(0, Math.round(seg.capacityMbps - seg.offeredMbps))} Mbps spare.
        </p>
      ) : (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-danger-strong">
          <IconAlert size={11} className="mt-px shrink-0" />
          <span>
            {streaming} camera{streaming === 1 ? "" : "s"} are offering {seg.offeredMbps} Mbps into a{" "}
            {seg.capacityMbps} Mbps uplink. Everything sharing this link — servers included — is
            slowed by it. Lower a camera&apos;s resolution, stop recording one, move some to another
            switch, or fit a faster uplink.
          </span>
        </p>
      )}

      {/* The real remedy, available in one click: most of these outages end
          with somebody replacing a decade-old 100 Mbps run. */}
      <div className="mt-1.5 flex items-center gap-1">
        <span className="text-[10px] text-gray-500">Uplink speed</span>
        {[100, 1000, 10000].map((mbps) => (
          <button
            key={mbps}
            onClick={() => setUplink(switchId, mbps)}
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
              seg.capacityMbps === mbps
                ? "border-brand-fill bg-brand-soft/20 text-brand-text"
                : "border-edge text-gray-400 hover:border-edge-strong hover:text-gray-200"
            }`}
          >
            {mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Fault log ───────────────────────────────────────────────────────────────

function FaultLog({ faults }: { faults: { id: string; kind: string; detail: string; at: number }[] }) {
  const clear = useInfraStore((s) => s.ipamClearFault);
  return (
    <div className="mb-3 rounded-lg border border-danger/40 bg-danger/[0.07] p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <IconAlert size={12} className="text-danger-strong" />
        <span className="text-[11px] font-semibold text-gray-100">Network faults</span>
        <span className="ml-auto font-mono text-[10px] text-gray-500">{faults.length} open</span>
      </div>
      {faults.slice(0, 6).map((f) => (
        <div key={f.id} className="flex items-start gap-2 border-t border-edge/40 py-1.5 first:border-0">
          <span className="mt-px font-mono text-[9px] uppercase tracking-wider text-danger-strong">
            {f.kind.replace(/-/g, " ")}
          </span>
          <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-gray-300">{f.detail}</span>
          <button
            onClick={() => clear(f.id)}
            aria-label="Acknowledge"
            className="shrink-0 text-gray-500 transition hover:text-gray-200"
          >
            <IconCheck size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Table view ──────────────────────────────────────────────────────────────

function PortTable({
  sw,
  power,
  onSelect,
  conflicts,
}: {
  sw: PoeSwitch;
  power: ReturnType<typeof switchPower>;
  onSelect: (n: number) => void;
  conflicts: IpConflict[];
}) {
  const infra = useInfraStore((s) => s.infra);
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="table-head">
            <th className="px-2 py-1 text-left">Port</th>
            <th className="px-2 py-1 text-left">Device</th>
            <th className="px-2 py-1 text-left">Address</th>
            <th className="px-2 py-1 text-right">Power</th>
            <th className="px-2 py-1 text-left">Priority</th>
          </tr>
        </thead>
        <tbody>
          {sw.ports.map((p) => {
            const node = p.attachedNodeId ? infra.nodes[p.attachedNodeId] : undefined;
            const pp = power.ports.find((x) => x.port === p.n);
            const bad = conflicts.some((c) => c.blocking && c.nodeId === p.attachedNodeId);
            return (
              <tr
                key={p.n}
                onClick={() => onSelect(p.n)}
                className="table-row cursor-pointer"
              >
                <td className="px-2 py-1 font-mono">{p.n}</td>
                <td className="px-2 py-1">
                  {node ? node.displayName : <span className="text-gray-600">empty</span>}
                </td>
                <td className="px-2 py-1 font-mono text-[11px]">
                  {node ? (
                    <span className={bad ? "text-danger-strong" : ""}>
                      {effectiveIp(node, infra.ipam)}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {pp && pp.requestedW > 0 ? (
                    pp.shed ? (
                      <span className="text-warn-strong">shed</span>
                    ) : (
                      `${pp.grantedW.toFixed(1)}W`
                    )
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-2 py-1 capitalize">{p.priority}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Port editor ─────────────────────────────────────────────────────────────

function PortEditor({
  sw,
  port,
  conflicts,
  onClose,
}: {
  sw: PoeSwitch;
  port: PoePort;
  conflicts: IpConflict[];
  onClose: () => void;
}) {
  const infra = useInfraStore((s) => s.infra);
  const setEnabled = useInfraStore((s) => s.poeSetPortEnabled);
  const setPoe = useInfraStore((s) => s.poeSetPortPoe);
  const setPriority = useInfraStore((s) => s.poeSetPortPriority);
  const detach = useInfraStore((s) => s.poeDetach);
  const attach = useInfraStore((s) => s.poeAttach);

  const node = port.attachedNodeId ? infra.nodes[port.attachedNodeId] : undefined;
  const power = switchPower(sw, infra.nodes);
  const pp = power.ports.find((p) => p.port === port.n);
  const mine = node ? conflicts.filter((c) => c.nodeId === node.nodeId) : [];

  // Anything that could plausibly be patched in: unattached nodes only, so the
  // list cannot offer a device that is already somewhere else.
  const attachable = Object.values(infra.nodes).filter(
    (n) =>
      !sw.ports.some((p) => p.attachedNodeId === n.nodeId) &&
      !infra.poe.switches.some((s) => s.ports.some((p) => p.attachedNodeId === n.nodeId)),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="card-header shrink-0">
        <IconSwitch size={13} className="text-brand-text" />
        <h3 className="text-[12px] font-semibold text-gray-100">
          {sw.name} · port {port.n}
        </h3>
        <button onClick={onClose} aria-label="Close" className="ml-auto text-gray-500 hover:text-gray-200">
          <IconX size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* What is plugged in */}
        <div>
          <span className="field-label">Connected device</span>
          {node ? (
            <div className="rounded-md border border-edge bg-surface px-2.5 py-2">
              <div className="text-[12px] font-medium text-gray-100">{node.displayName}</div>
              <div className="font-mono text-[10px] text-gray-500">
                {node.hostname} · {node.role.replace(/-/g, " ")}
              </div>
              <button
                onClick={() => detach(sw.id, port.n)}
                className="btn-ghost btn-sm mt-1.5 text-danger hover:bg-danger/10 hover:text-danger"
              >
                Unpatch
              </button>
            </div>
          ) : (
            <select
              className="field"
              value=""
              onChange={(e) => e.target.value && attach(sw.id, port.n, e.target.value as NodeId)}
            >
              <option value="">Nothing patched in — pick a device…</option>
              {attachable.map((n) => (
                <option key={n.nodeId} value={n.nodeId}>
                  {n.displayName} ({n.hostname})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Port state */}
        <div className="space-y-1.5">
          <Toggle
            label="Port enabled"
            hint="A disabled port passes neither data nor power."
            on={port.enabled}
            onChange={(v) => setEnabled(sw.id, port.n, v)}
          />
          <Toggle
            label="PoE enabled"
            hint={
              node && !isPoweredDevice(node.role)
                ? "This device draws mains power, so PoE makes no difference to it."
                : "Supplies power over the same cable as the data."
            }
            on={port.poeEnabled}
            onChange={(v) => setPoe(sw.id, port.n, v)}
            disabled={!port.enabled}
          />
        </div>

        {/* Power */}
        {node && isPoweredDevice(node.role) && (
          <div className="rounded-md border border-edge bg-surface px-2.5 py-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-600">Power</span>
            <div className="font-mono text-[12px] text-gray-100">
              {pp?.shed ? (
                <span className="text-warn-strong">shed — 0W of {pp.requestedW.toFixed(1)}W</span>
              ) : (
                `${(pp?.grantedW ?? 0).toFixed(1)}W drawn`
              )}
            </div>
            <div className="mt-1.5">
              <span className="field-label">Shedding priority</span>
              <div className="flex gap-1">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(sw.id, port.n, p)}
                    className={`flex-1 rounded border px-2 py-1 text-[10px] capitalize transition ${
                      port.priority === p
                        ? "border-brand-fill bg-brand-soft/20 text-brand-text"
                        : "border-edge text-gray-400 hover:border-edge-strong hover:text-gray-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <span className="field-hint">
                When the switch runs out of budget it drops <em>low</em> first and never touches{" "}
                <em>critical</em>.
              </span>
            </div>
          </div>
        )}

        {/* Addressing */}
        {node && <AddressEditor nodeId={node.nodeId} conflicts={mine} />}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2.5 rounded-md border border-edge bg-surface px-2.5 py-2 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-gray-100">{label}</span>
        <span className="block text-[10px] leading-snug text-gray-500">{hint}</span>
      </span>
      <button
        onClick={() => !disabled && onChange(!on)}
        disabled={disabled}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${
          on ? "bg-accent" : "bg-edge-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow ring-1 ring-black/10 transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * DHCP or static, plus the conflict report.
 *
 * The conflicts shown here are the SAME objects the estate-wide pass produced —
 * not a second per-node check. A local re-check could disagree with the header
 * badge, and "the panel says conflict but the port says fine" is worse than
 * either message alone.
 */
function AddressEditor({ nodeId, conflicts }: { nodeId: NodeId; conflicts: IpConflict[] }) {
  const infra = useInfraStore((s) => s.infra);
  const setStatic = useInfraStore((s) => s.ipamSetStatic);
  const setDhcp = useInfraStore((s) => s.ipamSetDhcp);

  const node = infra.nodes[nodeId];
  const committed = leaseMode(nodeId, infra.ipam);
  const current = node ? effectiveIp(node, infra.ipam) : "";

  /*
   * INTENT vs COMMITTED (fixed after driving this in the browser).
   *
   * The first cut derived the whole editor from the stored lease mode, so
   * clicking "Static" had nothing to write — you cannot commit a static lease
   * before an address has been typed — and the address field it was supposed
   * to reveal never appeared. The static path was unreachable.
   *
   * Two different questions were being conflated: what the lease IS, and which
   * form the operator is filling in. `intent` answers the second. The lease
   * only changes on Apply, which is also the correct behaviour: choosing
   * "Static" should not knock a device off the network until a valid address
   * has been supplied.
   */
  const [intent, setIntent] = useState<"dhcp" | "static">(committed);
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const sub = subnetOf(current, infra.subnets);
  const pool = sub ? poolFor(sub.cidr, infra.ipam) : undefined;
  const suggestion = sub
    ? suggestStatic(sub.cidr, { nodes: infra.nodes, subnets: infra.subnets, ipam: infra.ipam })
    : null;

  if (!node) return null;

  return (
    <div className="rounded-md border border-edge bg-surface px-2.5 py-2">
      <span className="text-[10px] uppercase tracking-wider text-gray-600">Addressing</span>

      <div className="mt-1 flex gap-1">
        {/*
          Plain labels, NOT glossary <Term> components. A Term renders a real
          <button> for keyboard access, and nesting one inside these mode
          buttons produced invalid markup with two overlapping hit targets —
          the tooltip stole clicks meant for the mode. The definition moved to
          the hint line below, where it costs nothing.
        */}
        {(["dhcp", "static"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setError(null);
              setIntent(m);
              if (m === "dhcp") setDhcp(nodeId);
              else setDraft(current);
            }}
            className={`flex-1 rounded border px-2 py-1 text-[10px] uppercase transition ${
              intent === m
                ? "border-brand-fill bg-brand-soft/20 text-brand-text"
                : "border-edge text-gray-400 hover:border-edge-strong hover:text-gray-200"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {intent === "dhcp" ? (
        <p className="mt-1.5 font-mono text-[12px] text-gray-100">
          {current}
          <span className="ml-1.5 font-sans text-[10px] text-gray-500">
            leased by <Term k="dhcp">DHCP</Term>
          </span>
        </p>
      ) : (
        <div className="mt-1.5">
          <input
            className="field font-mono"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            placeholder="10.0.0.20"
            aria-label="Static IPv4 address"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                const err = setStatic(nodeId, draft);
                setError(err);
                // Stay on the static form when it was refused — bouncing the
                // operator back to DHCP would discard what they typed and hide
                // the address the error is talking about.
                if (!err) setIntent("static");
              }}
            >
              Apply
            </button>
            {suggestion && suggestion !== draft && (
              <button className="btn-ghost btn-sm" onClick={() => { setDraft(suggestion); setError(null); }}>
                Use {suggestion}
              </button>
            )}
            {committed === "static" && (
              <span className="ml-auto text-[10px] text-accent-strong">applied</span>
            )}
          </div>
        </div>
      )}

      {sub && (
        <p className="field-hint">
          <Term k="subnet">{sub.label}</Term> {sub.cidr}
          {pool && ` · DHCP hands out .${pool.start}-.${pool.end}`}
        </p>
      )}

      {error && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] leading-relaxed text-danger-strong">
          <IconAlert size={11} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {conflicts.map((c, i) => (
        <p
          key={i}
          className={`mt-1.5 flex items-start gap-1.5 rounded border px-2 py-1.5 text-[11px] leading-relaxed ${
            c.blocking
              ? "border-danger/40 bg-danger/10 text-danger-strong"
              : "border-warn/40 bg-warn/10 text-warn-strong"
          }`}
        >
          <IconAlert size={11} className="mt-px shrink-0" />
          <span>
            <span className="font-semibold">
              {c.blocking ? "IP conflict detected. " : "Worth knowing. "}
            </span>
            {c.detail} {c.remedy}
          </span>
        </p>
      ))}
    </div>
  );
}
