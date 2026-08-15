"use client";

/**
 * TriageOS — Infrastructure telemetry
 * ===================================
 * Rolling time-series behind the Monitor app.
 *
 * ARCHITECTURE NOTE — why this is NOT in InfrastructureState, unlike inventory
 * and rack state:
 *   • `save.ts` persists `infra` wholesale. A 60-sample history across a dozen
 *     monitored nodes would be written to LocalStorage every autosave for data
 *     that means nothing after a reload.
 *   • The TicketReconciler re-evaluates every win-condition whenever `infra`
 *     changes. A 2s telemetry tick would re-run the whole matrix 30 times a
 *     minute for cosmetics.
 * So samples live here, session-scoped, and are DERIVED from infra rather than
 * stored on it. Nothing here can affect a win-condition.
 *
 * Anomalies are not simulated separately — they fall out of the same state the
 * tickets create. An offline host flatlines, a runaway process pins CPU, a
 * failed upstream drives load, a saturated link drives network. Diagnosing from
 * the charts is therefore genuinely equivalent to reading the system.
 */

import { create } from "zustand";
import { attachedNodeIds, poeLiveness } from "@/lib/core";
import { SATURATION_META, computeTraffic, effectiveLatency, isCamera } from "@/lib/core";
import { trafficOverrides } from "@/lib/host/devtools";
import type { InfrastructureState, NodeId, TargetNode } from "@/lib/core";

/** How many samples to retain per node (~2 minutes at the 2s tick). */
export const HISTORY = 60;

export interface Sample {
  t: number;
  cpu: number;
  mem: number;
  /** Worst utilisation across the node's attached links, 0-100. */
  net: number;
}

export interface NodeTelemetry {
  nodeId: NodeId;
  hostname: string;
  role: string;
  status: string;
  online: boolean;
  samples: Sample[];
  /** Human-readable reason this node is anomalous, or null when nominal. */
  anomaly: string | null;
}

interface MonitorState {
  series: Record<NodeId, Sample[]>;
  /** Append one sample per monitored node, derived from the live world. */
  sample: (infra: InfrastructureState) => void;
  reset: () => void;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Small deterministic-ish wobble so a steady metric still reads as live. */
const jitter = (base: number, spread: number) => base + (Math.random() - 0.5) * spread;

/** The hottest process on a node, if the world has put one there. */
function hottestProcess(node: TargetNode): number {
  if (!node.processes?.length) return 0;
  return Math.max(...node.processes.map((p) => p.cpu ?? 0));
}

export function netFor(infra: InfrastructureState, nodeId: NodeId): number {
  const attached = infra.links.filter((l) => l.from === nodeId || l.to === nodeId);
  if (attached.length === 0) return 0;
  if (attached.every((l) => l.blocked)) return 0;
  return Math.max(...attached.filter((l) => !l.blocked).map((l) => l.utilizationPct));
}

/**
 * Is this node dark right now?
 *
 * ONE definition, used by both the anomaly label and the sampler (Build 1).
 * They previously each tested `connection.online && connection.reachable`
 * inline, which was fine while that pair was the whole truth — but a camera
 * dropped by its switch's power budget is offline without either flag moving,
 * because PoE liveness is DERIVED and nothing writes to the node. Two copies
 * of a widening rule is how a dashboard ends up charting a device it also
 * labels unreachable.
 */
function nodeDark(infra: InfrastructureState, node: TargetNode): { dark: boolean; why: string | null } {
  if (!node.connection.online || !node.connection.reachable) {
    return { dark: true, why: "Unreachable — no telemetry" };
  }
  const poe = poeLiveness(infra.poe, node.nodeId, infra.nodes);
  if (!poe.live) return { dark: true, why: poe.reason };
  return { dark: false, why: null };
}

/**
 * Why this node looks wrong, in the operator's language. Ordered by how much it
 * should dominate the card — an unreachable box outranks a busy one.
 */
export function anomalyOf(infra: InfrastructureState, node: TargetNode): string | null {
  const dark = nodeDark(infra, node);
  if (dark.dark) return dark.why;
  if (infra.security.isolatedNodeIds.includes(node.nodeId)) return "Isolated (containment)";

  /*
   * CONGESTION IS A PROPERTY OF THE PATH, NOT THE HOST (Build 3).
   *
   * It ranks just below "unreachable" and above every local symptom, because
   * a saturated link makes healthy servers LOOK ill — high latency, dropped
   * sessions, timeouts — and an operator who reads those symptoms as a server
   * fault will spend an hour on the wrong machine. Naming the network first is
   * the single most useful thing this dashboard can do during an outage.
   */
  const traffic = computeTraffic(infra, trafficOverrides());
  if (traffic.level === "saturated" || traffic.level === "congested") {
    const seg = [traffic.backbone, ...traffic.uplinks]
      .filter((x) => x.level === traffic.level)
      .map((x) => x.label)[0];
    return `Network ${SATURATION_META[traffic.level].label.toLowerCase()} — ${seg ?? "path"} at ${Math.round(
      (seg === traffic.backbone.label ? traffic.backbone : traffic.uplinks.find((u) => u.label === seg) ?? traffic.backbone).loadPct,
    )}% of capacity`;
  }
  if (node.health.diskUsedPct >= 95) return `Disk ${Math.round(node.health.diskUsedPct)}% — saturated`;

  const hot = hottestProcess(node);
  if (hot >= 80) {
    const proc = node.processes.find((p) => (p.cpu ?? 0) === hot);
    return `Runaway process — ${proc?.command ?? "unknown"} at ${Math.round(hot)}% CPU`;
  }

  if (node.os === "linux") {
    const failed = Object.entries(node.services).filter(([, sv]) => sv.status === "failed");
    if (failed.length) return `Service failed — ${failed.map(([n]) => n).join(", ")}`;
  }
  if (node.os === "windows") {
    const stopped = Object.values(node.services).filter(
      (sv) => sv.startupType === "Automatic" && sv.status !== "Running",
    );
    if (stopped.length) return `Service stopped — ${stopped.map((sv) => sv.name).join(", ")}`;
  }

  if (node.health.memUsedPct >= 92) return `Memory ${Math.round(node.health.memUsedPct)}% — exhausted`;
  if (netFor(infra, node.nodeId) >= 88) return "Link saturated";
  if (node.health.status === "critical") return "Critical";
  if (node.health.status === "degraded") return "Degraded";
  return null;
}

/** One derived sample for a node at this instant. */
function sampleNode(infra: InfrastructureState, node: TargetNode): Sample {
  const t = Date.now();

  // An unreachable host reports nothing — a flatline, not a low reading. That
  // distinction is the whole point of showing a chart.
  if (nodeDark(infra, node).dark) {
    return { t, cpu: 0, mem: 0, net: 0 };
  }

  const hot = hottestProcess(node);
  const failing =
    node.health.status === "critical" ||
    (node.os === "linux" && Object.values(node.services).some((sv) => sv.status === "failed"));

  // CPU: the node's own load, pulled up toward a runaway process if one exists,
  // and biased upward while the node is in a failing state.
  let cpu = node.health.cpuLoad;
  if (hot > cpu) cpu = Math.max(cpu, hot * 0.95);
  if (failing) cpu = Math.max(cpu, 72);
  cpu = jitter(cpu, hot >= 80 ? 3 : 7);

  // Memory moves slowly; a near-full box stays near full.
  const mem = jitter(node.health.memUsedPct, node.health.memUsedPct > 90 ? 1.5 : 4);

  const net = jitter(netFor(infra, node.nodeId), 5);

  return { t, cpu: clamp(cpu), mem: clamp(mem), net: clamp(net) };
}

export const useMonitorStore = create<MonitorState>((set) => ({
  series: {},

  sample: (infra) =>
    set((s) => {
      const next: Record<NodeId, Sample[]> = { ...s.series };
      // The gateway estate plus the access layer — the ~200-machine staff fleet
      // stays deliberately out of scope, exactly as it is for NetOps. Sampling
      // reads the SAME watch list the dashboard renders, so a device can never
      // appear as a card with no chart behind it.
      for (const nodeId of monitoredNodeIds(infra)) {
        const node = infra.nodes[nodeId];
        if (!node) continue;
        const prev = next[nodeId] ?? [];
        const appended = [...prev, sampleNode(infra, node)];
        next[nodeId] = appended.length > HISTORY ? appended.slice(-HISTORY) : appended;
      }
      return { series: next };
    }),

  reset: () => set({ series: {} }),
}));

/** Join the live world with its history for the Monitor UI. */
/**
 * Everything the dashboard watches.
 *
 * WHY THIS IS NOT JUST `infra.gateway` (Build 1). The gateway list is the set
 * of things you can REMOTE INTO, and an IP camera is not one of them — there
 * is no shell and no desktop, so adding cameras there would put unusable RDP
 * buttons in the Remote Gateway.
 *
 * But "cannot be remoted into" and "not worth watching" are different claims.
 * A camera dropped by its switch's power budget is exactly the kind of outage
 * an operator needs to see, and a monitoring dashboard that silently omits a
 * whole class of device is worse than one that shows it as offline. So the
 * watch list is the gateway PLUS anything patched into a switch.
 */
export function monitoredNodeIds(infra: InfrastructureState): NodeId[] {
  const ids = infra.gateway.map((g) => g.nodeId);
  const seen = new Set(ids);
  for (const id of attachedNodeIds(infra.poe)) {
    if (!seen.has(id) && infra.nodes[id]) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function telemetryFor(
  infra: InfrastructureState,
  series: Record<NodeId, Sample[]>,
): NodeTelemetry[] {
  return monitoredNodeIds(infra)
    .map((nodeId) => {
      const node = infra.nodes[nodeId];
      if (!node) return null;
      const tele: NodeTelemetry = {
        nodeId: node.nodeId,
        hostname: node.hostname,
        role: node.role,
        status: node.health.status,
        // Same derivation the sampler and the anomaly label use. Reading the
        // stored connection flags directly here would have shown a shed camera
        // as "up" while its own chart flatlined.
        online: !nodeDark(infra, node).dark,
        samples: series[node.nodeId] ?? [],
        anomaly: anomalyOf(infra, node),
      };
      return tele;
    })
    .filter((n): n is NodeTelemetry => n !== null);
}
