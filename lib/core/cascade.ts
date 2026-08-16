/**
 * ITQuest — Cascade failures (QA phase 2)
 * ========================================
 * One root cause; several symptoms; a fix that has to happen in a particular
 * order across several apps.
 *
 * ── WHY THE EXISTING TICKETS FELT MONOTONOUS ────────────────────────────────
 *
 * Nearly every template was one fault with one fix in one app. Find the locked
 * account, unlock it. Find the stopped service, start it. Perfectly good
 * teaching for a Tier 1 operator and completely flat after the twentieth one,
 * because the SHAPE never changed: read symptom, open app, click thing.
 *
 * A cascade changes the shape. The symptom the ticket reports is not the
 * fault — it is two steps downstream of it — so the work is diagnosis before
 * action, and the action is a sequence rather than a click.
 *
 * ── WHAT IS STORED AND WHAT IS DERIVED ──────────────────────────────────────
 *
 * STORED: the ROOT CAUSE and the operator's progress through the repair.
 * A cooling module is failed or it is not; the host is powered down or it is
 * not; the part has been replaced or it has not.
 *
 * DERIVED: every symptom. Latency inflation, the health drop, the failed
 * service, whether the ticket can close. That is what makes a cascade behave
 * like one: fix the root and the symptoms disappear together, without a single
 * line of code cleaning them up, because they were never written down.
 *
 * The alternative — storing "latencyMs: 340" on the node when cooling fails —
 * would need unwinding on repair, and the first path that forgot would leave a
 * permanently slow server that no amount of fixing could cure. This codebase
 * has that bug in its history and does not want it back.
 *
 * ── WHY THE STAGES ARE ORDERED ──────────────────────────────────────────────
 *
 * Because the real ones are. You do not hot-swap a cooling module on a running
 * server; you drain it, power it down, swap, boot. Each stage is a QUESTION
 * asked of the world, so doing them out of order does not corrupt a counter —
 * it simply means the next stage is not satisfied yet, and undoing a step
 * genuinely regresses the sequence.
 */

import type { NodeId } from "./nodes";
import type { InfrastructureState } from "./infrastructure";

// ── Persisted state ─────────────────────────────────────────────────────────

export type CascadeKind = "thermal" | "rogue-dhcp" | "storage-dependency";

export interface CascadeFault {
  id: string;
  kind: CascadeKind;
  /** The host the root cause lives on. */
  nodeId: NodeId;
  startedAt: number;
  /**
   * Repair progress. Each is a fact about what the operator DID, never a
   * derived conclusion — the stage machine reads these plus the live estate.
   */
  partReplacedAt?: number;
  /** Cleared when the operator resolves the root cause entirely. */
  clearedAt?: number;
}

export interface CascadeState {
  faults: CascadeFault[];
}

export function createCascadeState(): CascadeState {
  return { faults: [] };
}

export function activeCascades(infra: InfrastructureState): CascadeFault[] {
  return (infra.cascade?.faults ?? []).filter((f) => !f.clearedAt);
}

export function cascadeOn(infra: InfrastructureState, nodeId: NodeId): CascadeFault | undefined {
  return activeCascades(infra).find((f) => f.nodeId === nodeId);
}

// ── Derived symptoms ────────────────────────────────────────────────────────

/**
 * How badly a thermally-throttled host is degraded.
 *
 * A MULTIPLIER, reusing the shape the congestion build settled on, because
 * throttling behaves the same way: the CPU is not broken, it is running slow,
 * so everything it does takes proportionally longer. A flat "+200ms" would
 * make a 2ms local call and a 200ms query look equally sick, and they are not.
 *
 * Deliberately NOT offline. A server that vanishes is a five-second diagnosis;
 * one that is merely slow is the thing operators actually get called about and
 * the thing they are worst at recognising.
 */
export const THERMAL_LATENCY_FACTOR = 6;

/** Health cost while a cascade is unresolved, by kind. */
export const CASCADE_HEALTH_PENALTY: Record<CascadeKind, number> = {
  thermal: 14,
  "rogue-dhcp": 10,
  "storage-dependency": 20,
};

/**
 * The latency this node actually shows, given any cascade on it.
 *
 * Composed with the congestion multiplier at the call site rather than folded
 * in here: they are independent causes, and a host that is both throttled AND
 * behind a saturated uplink genuinely is worse than one with either.
 */
export function cascadeLatencyFactor(infra: InfrastructureState, nodeId: NodeId): number {
  const fault = cascadeOn(infra, nodeId);
  if (!fault) return 1;
  return fault.kind === "thermal" ? THERMAL_LATENCY_FACTOR : 1;
}

// ── The repair sequences ────────────────────────────────────────────────────

export type CascadeStage =
  | "diagnosing"
  | "drained"
  | "repaired"
  | "restored"
  | "resolved";

export interface CascadeStatus {
  fault: CascadeFault;
  stage: CascadeStage;
  /** One sentence: the next correct action. */
  nextAction: string;
  /** Where that action happens. */
  nextApp: "hardwarelab" | "serverman" | "switches" | "gateway";
  /** Ordered checklist for the ticket UI, with each step's live truth. */
  steps: { label: string; done: boolean }[];
}

/**
 * THERMAL: drain → power down → replace the module → boot.
 *
 * The order is enforced because it is real: the Hardware Lab refuses to bench
 * a running host, and booting before the part is in puts the same fault back.
 */
function thermalStatus(infra: InfrastructureState, fault: CascadeFault): CascadeStatus {
  const node = infra.nodes[fault.nodeId];
  const poweredDown = !!node && !node.connection.online;
  const replaced = !!fault.partReplacedAt;
  const backUp = !!node && node.connection.online;

  const steps = [
    { label: `Power ${fault.nodeId} down from the Server Manager`, done: poweredDown || replaced },
    { label: "Replace the cooling module at the bench", done: replaced },
    { label: "Bring it back online", done: replaced && backUp },
  ];

  if (!poweredDown && !replaced) {
    return {
      fault, stage: "diagnosing", steps,
      nextAction: `${fault.nodeId} is thermally throttled — its cooling module has failed. Power it down from the Server Manager before touching the hardware.`,
      nextApp: "serverman",
    };
  }
  if (!replaced) {
    return {
      fault, stage: "drained", steps,
      nextAction: `Replace the cooling module on ${fault.nodeId} in the Hardware Lab.`,
      nextApp: "hardwarelab",
    };
  }
  if (!backUp) {
    return {
      fault, stage: "repaired", steps,
      nextAction: `The module is fitted. Bring ${fault.nodeId} back online from the Server Manager.`,
      nextApp: "serverman",
    };
  }
  return { fault, stage: "resolved", steps, nextAction: "", nextApp: "serverman" };
}

/**
 * ROGUE DHCP: find the port → cut it → fix the address → bring it back.
 *
 * The endpoint has an address from the wrong scope, so it is on the network
 * and unreachable at the same time — the confusing failure that makes this
 * worth teaching.
 */
function dhcpStatus(infra: InfrastructureState, fault: CascadeFault): CascadeStatus {
  const port = findPort(infra, fault.nodeId);
  const isolated = !!port && !port.enabled;
  const node = infra.nodes[fault.nodeId];

  // The address is correct once it sits inside a subnet the estate defines and
  // is not still the rogue one. Derived, so fixing it in either direction —
  // static assignment or handing it back to DHCP — counts.
  const lease = infra.ipam?.leases[fault.nodeId];
  const addressed =
    !!node &&
    infra.subnets.some((s) => sameSubnet(node.connection.ip, s.cidr)) &&
    (lease?.mode !== "static" || !!lease.staticIp);

  const steps = [
    { label: "Find the endpoint's switch port", done: isolated || addressed },
    { label: "Disable the port to take it off the rogue scope", done: isolated || addressed },
    { label: "Give it a correct address", done: addressed },
    { label: "Re-enable the port", done: addressed && !!port?.enabled },
  ];

  if (!isolated && !addressed) {
    return {
      fault, stage: "diagnosing", steps,
      nextAction: `${fault.nodeId} picked up an address from a rogue DHCP server. Find its port in Network Switches and disable it so it stops renewing.`,
      nextApp: "switches",
    };
  }
  if (!addressed) {
    return {
      fault, stage: "drained", steps,
      nextAction: `Give ${fault.nodeId} a correct address on the port editor, inside one of the estate's subnets.`,
      nextApp: "switches",
    };
  }
  if (port && !port.enabled) {
    return {
      fault, stage: "repaired", steps,
      nextAction: `Address is correct. Re-enable ${fault.nodeId}'s port.`,
      nextApp: "switches",
    };
  }
  return { fault, stage: "resolved", steps, nextAction: "", nextApp: "switches" };
}

/**
 * STORAGE DEPENDENCY: the database is down because its volume is full.
 *
 * The ticket reports a dead service. Restarting it achieves nothing, which is
 * the entire lesson — the fix is upstream, and there are two legitimate routes
 * (clear the logs, or fit a bigger disk). Both count.
 */
function storageStatus(infra: InfrastructureState, fault: CascadeFault): CascadeStatus {
  const node = infra.nodes[fault.nodeId];
  const diskPct = node?.health.diskUsedPct ?? 0;
  const spaceFreed = diskPct < 90 || !!fault.partReplacedAt;
  // Mac endpoints carry no service table at all, which is correct — there is
  // no database on a design laptop. Narrowed rather than cast, so a future
  // node kind cannot silently read as "service down".
  const services =
    node && (node.os === "linux" || node.os === "windows")
      ? (Object.values(node.services ?? {}) as { status?: string }[])
      : [];
  const serviceUp = services.some((sv) => sv.status === "active" || sv.status === "Running");

  const steps = [
    { label: "Free space: clear logs, or fit a larger disk at the bench", done: spaceFreed },
    { label: "Start the database service", done: spaceFreed && serviceUp },
  ];

  if (!spaceFreed) {
    return {
      fault, stage: "diagnosing", steps,
      nextAction: `${fault.nodeId}'s volume is ${Math.round(diskPct)}% full — that is why the database will not start. Restarting it will fail again. Clear the logs over SSH, or fit a larger disk in the Hardware Lab.`,
      nextApp: "hardwarelab",
    };
  }
  if (!serviceUp) {
    return {
      fault, stage: "repaired", steps,
      nextAction: `There is space now. Start the database service on ${fault.nodeId}.`,
      nextApp: "gateway",
    };
  }
  return { fault, stage: "resolved", steps, nextAction: "", nextApp: "gateway" };
}

/** Where the operator is in this cascade's repair, derived from the world. */
export function cascadeStatus(
  infra: InfrastructureState,
  fault: CascadeFault,
): CascadeStatus {
  switch (fault.kind) {
    case "thermal":
      return thermalStatus(infra, fault);
    case "rogue-dhcp":
      return dhcpStatus(infra, fault);
    case "storage-dependency":
      return storageStatus(infra, fault);
  }
}

/** Is this cascade fully repaired? The win-condition for its ticket. */
export function cascadeResolved(infra: InfrastructureState, fault: CascadeFault): boolean {
  return cascadeStatus(infra, fault).stage === "resolved";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function findPort(infra: InfrastructureState, nodeId: NodeId) {
  for (const sw of infra.poe?.switches ?? []) {
    const p = sw.ports.find((x) => x.attachedNodeId === nodeId);
    if (p) return p;
  }
  return undefined;
}

/** Octet-wise for /24s, which is what every generated subnet is. */
function sameSubnet(ip: string, cidr: string): boolean {
  const a = ip.split(".").slice(0, 3).join(".");
  const b = cidr.split("/")[0].split(".").slice(0, 3).join(".");
  return a === b;
}
