/**
 * ITQuest — Managed PoE switches (Build 1)
 * =========================================
 * Power over Ethernet, modelled the way it actually bites: a switch has a
 * power BUDGET, the devices hanging off it have a DRAW, and when the second
 * exceeds the first the switch does not politely degrade — it sheds ports, and
 * whatever was on them goes dark.
 *
 * ── WHAT IS STORED AND WHAT IS DERIVED ──────────────────────────────────────
 *
 * The same rule this codebase has followed since v0.3.1. STORED is what the
 * operator decided and what win-conditions grade:
 *
 *   - the switch itself, its port count, its budget
 *   - per port: admin state, whether PoE is enabled, priority
 *   - `attachedNodeId` — THE JOIN, and the only link between a port and the
 *     logical estate, exactly as `RackDevice.nodeId` is the only link between
 *     a chassis and a server
 *
 * DERIVED, every time, from those facts:
 *
 *   - how many watts each port is asking for
 *   - how many it is granted
 *   - which ports are shed
 *   - whether the switch is over budget
 *   - whether a given node is being powered at all
 *
 * A stored `currentWatts` would be wrong the first time a device was attached
 * through a code path that forgot to update it, and "the totals disagree with
 * the ports" is precisely the class of bug that makes a simulator untrustworthy
 * as a teaching tool. `switchPower()` is the one function that answers all of
 * it, and every screen calls it.
 *
 * ── WHY SHEDDING IS DETERMINISTIC ───────────────────────────────────────────
 *
 * Ports are granted power in a fixed order: priority first, then port number.
 * Never insertion order, never random. A player who overloads a switch must be
 * able to reason about which camera went dark and fix it by re-prioritising —
 * if the answer changed between renders, the mechanic would teach nothing.
 * Real switches behave this way for the same reason.
 *
 * SVG icons and typographic glyphs only in anything that renders this — no
 * emoji.
 */

import type { NodeId, NodeRole } from "./nodes";
import type { TargetNode } from "./infrastructure";

// ── Standards ───────────────────────────────────────────────────────────────

/**
 * The three PoE generations, by the watts a port can deliver to the device.
 * These are the powered-device figures rather than the port-source figures
 * (15.4W at the port is 12.95W at the camera); the simulation talks in what
 * the switch reserves, which is the number on the budget meter.
 */
export type PoeStandard = "af" | "at" | "bt";

export const POE_STANDARD: Record<PoeStandard, { label: string; maxPortW: number }> = {
  af: { label: "802.3af (PoE)", maxPortW: 15.4 },
  at: { label: "802.3at (PoE+)", maxPortW: 30 },
  bt: { label: "802.3bt (PoE++)", maxPortW: 60 },
};

/**
 * What each kind of powered device asks for.
 *
 * Roles rather than per-node fields: every IP camera on the estate draws about
 * the same, and a number that can be edited per node is a number that will
 * eventually be edited to something impossible.
 */
export const POE_DRAW_W: Partial<Record<NodeRole, number>> = {
  "ip-camera": 12.5,
  "access-point": 22,
  "voip-phone": 7,
};

/** Does this role take its power from the switch rather than from a wall? */
export function isPoweredDevice(role: NodeRole): boolean {
  return POE_DRAW_W[role] !== undefined;
}

// ── Persisted state ─────────────────────────────────────────────────────────

/**
 * Shedding order. `critical` survives an overload; `low` is the first thing
 * the switch drops. Door cameras and the warehouse AP are not equally
 * important and the operator is the one who knows which is which.
 */
export type PoePriority = "critical" | "high" | "low";

export const POE_PRIORITY_RANK: Record<PoePriority, number> = {
  critical: 0,
  high: 1,
  low: 2,
};

export interface PoePort {
  /** 1-based, as printed on the faceplate. */
  n: number;
  /** Admin state. A disabled port passes neither data nor power. */
  enabled: boolean;
  /** PoE can be switched off independently — the port still passes data. */
  poeEnabled: boolean;
  /**
   * THE JOIN. The logical node plugged into this port, if any. Undefined is a
   * genuinely empty port, not a placeholder.
   */
  attachedNodeId?: NodeId;
  /** Operator's own label, e.g. "Loading bay camera". */
  label?: string;
  priority: PoePriority;
}

export interface PoeSwitch {
  id: string;
  name: string;
  /** Management address. Lives on the Mgmt VLAN where one exists. */
  mgmtIp: string;
  /** Physical join to the rack, when the unit is racked. */
  rackDeviceId?: string;
  rackId?: string;
  standard: PoeStandard;
  /** Total watts the PSU can deliver across all ports at once. */
  budgetW: number;
  ports: PoePort[];
}

export interface PoeState {
  switches: PoeSwitch[];
}

export function createPoeState(): PoeState {
  return { switches: [] };
}

// ── Derivation ──────────────────────────────────────────────────────────────

export interface PortPower {
  port: number;
  /** Watts this port is asking for. Zero when empty, disabled, or PoE-off. */
  requestedW: number;
  /** Watts actually delivered. Less than requested only when shed. */
  grantedW: number;
  /** True when the port wanted power and the budget could not cover it. */
  shed: boolean;
  /** Over the per-port ceiling for this switch's standard. */
  overPortLimit: boolean;
}

export interface SwitchPower {
  budgetW: number;
  requestedW: number;
  grantedW: number;
  /** 0-100, for the meter. Capped so an overload does not draw past the bar. */
  loadPct: number;
  overBudget: boolean;
  ports: PortPower[];
  /** Ports the switch dropped, in the order it dropped them. */
  shedPorts: number[];
}

export type PoeNodeMap = Record<NodeId, TargetNode>;

/** What a port is asking for, before the budget has any say. */
function requestOf(port: PoePort, nodes: PoeNodeMap): number {
  if (!port.enabled || !port.poeEnabled || !port.attachedNodeId) return 0;
  const node: TargetNode | undefined = nodes[port.attachedNodeId];
  if (!node) return 0;
  return POE_DRAW_W[node.role] ?? 0;
}

/**
 * The whole power picture for one switch.
 *
 * Single pass, pure, no memoisation: it is a dozen additions over at most 24
 * ports, and a cache here would be one more thing that can disagree with the
 * hardware.
 */
export function switchPower(sw: PoeSwitch, nodes: PoeNodeMap): SwitchPower {
  const perPortMax = POE_STANDARD[sw.standard].maxPortW;

  const requests = sw.ports.map((p) => {
    const raw = requestOf(p, nodes);
    return {
      port: p.n,
      priority: p.priority,
      // A device that wants more than the standard allows gets clamped to the
      // ceiling and flagged — which is what a real switch does, and is why an
      // 802.3bt camera on an 802.3af switch browns out instead of failing loudly.
      requestedW: Math.min(raw, perPortMax),
      overPortLimit: raw > perPortMax,
    };
  });

  // THE SHEDDING ORDER. Priority, then port number. Fixed, so the same overload
  // always drops the same port and the player can reason about it.
  const order = [...requests].sort(
    (a, b) =>
      POE_PRIORITY_RANK[a.priority] - POE_PRIORITY_RANK[b.priority] || a.port - b.port,
  );

  const granted = new Map<number, number>();
  const shedPorts: number[] = [];
  let used = 0;
  for (const r of order) {
    if (r.requestedW === 0) {
      granted.set(r.port, 0);
      continue;
    }
    if (used + r.requestedW <= sw.budgetW) {
      granted.set(r.port, r.requestedW);
      used += r.requestedW;
    } else {
      // Not "give it what is left" — a camera on four watts is a camera that
      // does not work. PoE negotiates the full class or nothing.
      granted.set(r.port, 0);
      shedPorts.push(r.port);
    }
  }

  const requestedW = requests.reduce((n, r) => n + r.requestedW, 0);
  const ports: PortPower[] = requests
    .map((r) => ({
      port: r.port,
      requestedW: r.requestedW,
      grantedW: granted.get(r.port) ?? 0,
      shed: (granted.get(r.port) ?? 0) === 0 && r.requestedW > 0,
      overPortLimit: r.overPortLimit,
    }))
    .sort((a, b) => a.port - b.port);

  return {
    budgetW: sw.budgetW,
    requestedW: round1(requestedW),
    grantedW: round1(used),
    loadPct: sw.budgetW > 0 ? Math.min(100, (used / sw.budgetW) * 100) : 0,
    overBudget: requestedW > sw.budgetW,
    ports,
    // Ascending, so the UI lists them in faceplate order rather than in the
    // order the shedding loop happened to reach them.
    shedPorts: shedPorts.sort((a, b) => a - b),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Lookups ─────────────────────────────────────────────────────────────────

/**
 * The switch and port a node is plugged into, searched across all switches.
 *
 * Tolerates a missing state slice. `reachNode` consults PoE for EVERY node on
 * every render, and it is also called with hand-built infra objects — by the
 * spec suite, and by any future code path that assembles a partial world. A
 * reachability check that throws because an optional slice is absent is worse
 * than one that reports "no switches involved", which is the truthful answer
 * when there are no switches.
 */
export function portOfNode(
  state: PoeState | undefined,
  nodeId: NodeId,
): { sw: PoeSwitch; port: PoePort } | undefined {
  if (!state?.switches) return undefined;
  for (const sw of state.switches) {
    const port = sw.ports.find((p) => p.attachedNodeId === nodeId);
    if (port) return { sw, port };
  }
  return undefined;
}

export function switchById(state: PoeState | undefined, id: string): PoeSwitch | undefined {
  return state?.switches?.find((s) => s.id === id);
}

/** Every node currently plugged into any switch. */
export function attachedNodeIds(state: PoeState | undefined): NodeId[] {
  return (state?.switches ?? []).flatMap((s) =>
    s.ports.map((p) => p.attachedNodeId).filter((x): x is NodeId => !!x),
  );
}

export interface PoeLiveness {
  /** False only when the switch is the reason this node is down. */
  live: boolean;
  reason: string | null;
  remedy: string | null;
}

const POE_UP: PoeLiveness = { live: true, reason: null, remedy: null };

/**
 * Is the switch keeping this node alive?
 *
 * THE IMPORTANT CASE IS THE ONE THAT RETURNS TRUE. A node not plugged into any
 * switch is `live` here — a rack server draws mains power and has nothing to do
 * with PoE, and reporting it as switch-down would be a fault that cannot exist.
 * This answers one question only: "is a switch port the thing that is wrong?"
 * Everything else stays the business of reachNode.
 */
export function poeLiveness(
  state: PoeState | undefined,
  nodeId: NodeId,
  nodes: PoeNodeMap,
): PoeLiveness {
  const at = portOfNode(state, nodeId);
  if (!at) return POE_UP;

  const { sw, port } = at;
  const node = nodes[nodeId];
  const needsPower = node ? isPoweredDevice(node.role) : false;

  if (!port.enabled) {
    return {
      live: false,
      reason: `${sw.name} port ${port.n} is administratively down.`,
      remedy: `Enable port ${port.n} in Network Switches.`,
    };
  }

  // A workstation plugged into a switch takes its power from a wall socket:
  // switching PoE off on its port costs it nothing.
  if (!needsPower) return POE_UP;

  if (!port.poeEnabled) {
    return {
      live: false,
      reason: `${sw.name} port ${port.n} has PoE switched off, and this device has no other power source.`,
      remedy: `Re-enable PoE on port ${port.n}.`,
    };
  }

  const power = switchPower(sw, nodes);
  const pp = power.ports.find((p) => p.port === port.n);
  if (pp?.shed) {
    return {
      live: false,
      reason: `${sw.name} is over its ${sw.budgetW}W PoE budget and has dropped port ${port.n}.`,
      remedy: `Free up budget on ${sw.name}, or raise this port's priority above one that can wait.`,
    };
  }
  if (pp?.overPortLimit) {
    return {
      live: false,
      reason: `Port ${port.n} needs more power than ${POE_STANDARD[sw.standard].label} can deliver.`,
      remedy: `Move this device to a switch supporting a higher PoE class.`,
    };
  }

  return POE_UP;
}

/** Every port on every switch that is currently shedding, for the fault list. */
export function shedSummary(
  state: PoeState | undefined,
  nodes: PoeNodeMap,
): { sw: PoeSwitch; port: PoePort; power: SwitchPower }[] {
  const out: { sw: PoeSwitch; port: PoePort; power: SwitchPower }[] = [];
  for (const sw of state?.switches ?? []) {
    const power = switchPower(sw, nodes);
    for (const n of power.shedPorts) {
      const port = sw.ports.find((p) => p.n === n);
      if (port) out.push({ sw, port, power });
    }
  }
  return out;
}
