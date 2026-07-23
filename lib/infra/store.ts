/**
 * TriageOS — Infrastructure store (global multi-node state)
 * ========================================================
 * The authoritative InfrastructureState: every target node, keyed by NodeId.
 * Both the CLI interpreter and the GUI node panels read/mutate here, so a change
 * on any node from any interface stays in sync everywhere.
 */

"use client";

import { create } from "zustand";
import type {
  InfrastructureState,
  TargetNode,
  WindowsService,
} from "@/lib/core";
import type { CommandResult, NodeId } from "@/lib/core";
import { generateWorld } from "@/lib/org/generator";
import { freshSeed } from "@/lib/org/rng";
import { linuxInterpreter, nodeToVM, writeVMToNode } from "./terminal";

type WinServiceAction = "start" | "stop" | "restart";

interface InfraStore {
  infra: InfrastructureState;

  /** Mark a node's remote session as authenticated (post-handshake). */
  authenticate: (nodeId: NodeId, value: boolean) => void;
  /** Generic node updater — a mutation entry point for node state. */
  updateNode: (nodeId: NodeId, updater: (node: TargetNode) => void) => void;

  /**
   * Run a CLI command against a Linux node, mutating its state in place.
   * This IS the Phase-1 interpreter, re-pointed at a node in the multi-node
   * store — the same engine the standalone terminal used.
   */
  runLinuxCommand: (nodeId: NodeId, line: string) => CommandResult;

  // ── Windows GUI mutations (ADUC / services.msc / Control Panel) ──
  unlockADUser: (nodeId: NodeId, samAccountName: string) => void;
  setADUserEnabled: (nodeId: NodeId, samAccountName: string, enabled: boolean) => void;
  controlWindowsService: (nodeId: NodeId, service: string, action: WinServiceAction) => void;
  setWinInterfaceUp: (nodeId: NodeId, iface: string, up: boolean) => void;
  setFirewallProfile: (nodeId: NodeId, profile: "Domain" | "Private" | "Public", enabled: boolean) => void;

  // ── NetOps topology gameplay ──
  /** Re-route a link onto a different subnet (sheds utilization, resets loss). */
  rerouteLink: (linkId: string, viaCidr: string) => void;
  /** Deploy/remove a software firewall on a link (+latency, dampens loss). */
  setLinkFirewall: (linkId: string, on: boolean) => void;
  setLinkBlocked: (linkId: string, blocked: boolean) => void;
  /** One NetworkEngine tick: random-walk utilization/loss, degrade hot nodes. */
  tickNetworkMetrics: () => void;

  reset: () => void;
}

/** Immutably replace one node in the infra state. */
function withNode(
  s: { infra: InfrastructureState },
  nodeId: NodeId,
  next: TargetNode,
): { infra: InfrastructureState } {
  return { infra: { ...s.infra, nodes: { ...s.infra.nodes, [nodeId]: next } } };
}

export const useInfraStore = create<InfraStore>((set, get) => ({
  // A brand-new world is generated from a fresh seed; hydration replaces it
  // when a per-account save exists (the org persists inside `infra`).
  infra: generateWorld(freshSeed()),

  authenticate: (nodeId, value) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      return withNode(s, nodeId, {
        ...node,
        connection: { ...node.connection, authenticated: value },
      });
    }),

  updateNode: (nodeId, updater) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      updater(clone);
      return withNode(s, nodeId, clone);
    }),

  runLinuxCommand: (nodeId, line) => {
    const node = get().infra.nodes[nodeId];
    if (!node || node.os !== "linux") {
      return { output: `bash: node ${nodeId} unavailable`, exitCode: 1, mutated: false };
    }
    const vm = nodeToVM(node);
    const { result, next } = linuxInterpreter.run(line, vm);
    if (result.mutated) {
      set((s) => {
        const cur = s.infra.nodes[nodeId];
        if (!cur || cur.os !== "linux") return s;
        return withNode(s, nodeId, writeVMToNode(cur, next));
      });
    }
    return result;
  },

  unlockADUser: (nodeId, sam) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return s;
      const clone = structuredClone(node);
      const user = clone.activeDirectory!.users.find((u) => u.samAccountName === sam);
      if (!user) return s;
      user.locked = false;
      user.badPwdCount = 0;
      return withNode(s, nodeId, clone);
    }),

  setADUserEnabled: (nodeId, sam, enabled) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return s;
      const clone = structuredClone(node);
      const user = clone.activeDirectory!.users.find((u) => u.samAccountName === sam);
      if (!user) return s;
      user.enabled = enabled;
      return withNode(s, nodeId, clone);
    }),

  controlWindowsService: (nodeId, service, action) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows") return s;
      const clone = structuredClone(node);
      const svc: WindowsService | undefined = clone.services[service];
      if (!svc) return s;
      if (action === "stop") {
        svc.status = "Stopped";
        svc.pid = null;
      } else {
        svc.status = "Running";
        svc.pid = svc.pid ?? Math.floor(1000 + Math.random() * 6000);
      }
      return withNode(s, nodeId, clone);
    }),

  setWinInterfaceUp: (nodeId, iface, up) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows") return s;
      const clone = structuredClone(node);
      const nic = clone.network.interfaces.find((i) => i.name === iface);
      if (!nic) return s;
      nic.up = up;
      return withNode(s, nodeId, clone);
    }),

  setFirewallProfile: (nodeId, profile, enabled) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows") return s;
      const clone = structuredClone(node);
      clone.firewall.profiles[profile].enabled = enabled;
      return withNode(s, nodeId, clone);
    }),

  rerouteLink: (linkId, viaCidr) =>
    set((s) => ({
      infra: {
        ...s.infra,
        links: s.infra.links.map((l) =>
          l.id === linkId
            ? {
                ...l,
                via: viaCidr,
                // Fresh path: shed most utilization, clear loss, tiny latency shift.
                utilizationPct: Math.max(10, Math.round(l.utilizationPct * 0.45)),
                packetLossPct: 0.1,
                latencyMs: Math.round((l.latencyMs + (Math.random() - 0.4)) * 10) / 10,
              }
            : l,
        ),
      },
    })),

  setLinkFirewall: (linkId, on) =>
    set((s) => ({
      infra: {
        ...s.infra,
        links: s.infra.links.map((l) =>
          l.id === linkId
            ? { ...l, softwareFirewall: on, latencyMs: Math.round((l.latencyMs + (on ? 0.8 : -0.8)) * 10) / 10 }
            : l,
        ),
      },
    })),

  setLinkBlocked: (linkId, blocked) =>
    set((s) => ({
      infra: {
        ...s.infra,
        links: s.infra.links.map((l) => (l.id === linkId ? { ...l, blocked } : l)),
      },
    })),

  tickNetworkMetrics: () =>
    set((s) => {
      const links = s.infra.links.map((l) => {
        if (l.blocked) return { ...l, utilizationPct: 0, packetLossPct: 0 };
        // Utilization random-walks; congestion breeds loss, firewalls dampen it.
        const drift = (Math.random() - 0.48) * 6;
        const utilizationPct = Math.min(99, Math.max(5, l.utilizationPct + drift));
        const congestion = Math.max(0, utilizationPct - 85);
        const targetLoss = congestion * (l.softwareFirewall ? 0.25 : 0.55) + Math.random() * 0.3;
        const packetLossPct = Math.round((l.packetLossPct * 0.6 + targetLoss * 0.4) * 10) / 10;
        return { ...l, utilizationPct: Math.round(utilizationPct), packetLossPct };
      });

      // Node health follows its worst attached link.
      const nodes = { ...s.infra.nodes };
      for (const id of Object.keys(nodes)) {
        const n = nodes[id];
        const attached = links.filter((l) => l.from === id || l.to === id);
        if (attached.length === 0) continue;
        const worstLoss = Math.max(...attached.map((l) => l.packetLossPct));
        // Don't mask scenario-driven degradation (e.g. the 502 web node).
        const scenarioDegraded = n.os === "linux" && n.services.app?.status === "failed";
        const status = scenarioDegraded
          ? n.health.status
          : worstLoss > 4
            ? "critical"
            : worstLoss > 1.5
              ? "degraded"
              : "healthy";
        if (status !== n.health.status) {
          nodes[id] = { ...n, health: { ...n.health, status } } as TargetNode;
        }
      }

      return { infra: { ...s.infra, links, nodes } };
    }),

  reset: () => set({ infra: generateWorld(freshSeed()) }),
}));

/** Convenience hook: subscribe to a single node by id. */
export function useNode(nodeId: NodeId): TargetNode | undefined {
  return useInfraStore((s) => s.infra.nodes[nodeId]);
}
