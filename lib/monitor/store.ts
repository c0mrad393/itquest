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
 * Why this node looks wrong, in the operator's language. Ordered by how much it
 * should dominate the card — an unreachable box outranks a busy one.
 */
export function anomalyOf(infra: InfrastructureState, node: TargetNode): string | null {
  if (!node.connection.online || !node.connection.reachable) return "Unreachable — no telemetry";
  if (infra.security.isolatedNodeIds.includes(node.nodeId)) return "Isolated (containment)";
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
  if (!node.connection.online || !node.connection.reachable) {
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
      // Only the gateway estate is monitored — the ~200-machine staff fleet is
      // deliberately out of scope, exactly as it is for NetOps.
      for (const entry of infra.gateway) {
        const node = infra.nodes[entry.nodeId];
        if (!node) continue;
        const prev = next[entry.nodeId] ?? [];
        const appended = [...prev, sampleNode(infra, node)];
        next[entry.nodeId] = appended.length > HISTORY ? appended.slice(-HISTORY) : appended;
      }
      return { series: next };
    }),

  reset: () => set({ series: {} }),
}));

/** Join the live world with its history for the Monitor UI. */
export function telemetryFor(
  infra: InfrastructureState,
  series: Record<NodeId, Sample[]>,
): NodeTelemetry[] {
  return infra.gateway
    .map((entry) => {
      const node = infra.nodes[entry.nodeId];
      if (!node) return null;
      const tele: NodeTelemetry = {
        nodeId: node.nodeId,
        hostname: node.hostname,
        role: node.role,
        status: node.health.status,
        online: node.connection.online && node.connection.reachable,
        samples: series[node.nodeId] ?? [],
        anomaly: anomalyOf(infra, node),
      };
      return tele;
    })
    .filter((n): n is NodeTelemetry => n !== null);
}
