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

  // ── Remote endpoint actions (TriageRemote environments) ──
  /** End a task / force quit — removes the process from the node's table. */
  killProcess: (nodeId: NodeId, pid: number) => void;
  /** Enable/disable a network adapter on ANY node (Windows, macOS, Linux). */
  setNodeInterfaceUp: (nodeId: NodeId, iface: string, up: boolean) => void;
  /** Change a node's resolver list (endpoint Network Settings). */
  setNodeDns: (nodeId: NodeId, dnsServers: string[]) => void;
  /** Change a node's IPv4 on an adapter. */
  setNodeIpv4: (nodeId: NodeId, iface: string, ipv4: string) => void;
  /** macOS Wi-Fi radio toggle. */
  setMacWifi: (nodeId: NodeId, on: boolean) => void;

  // ── Incident-response actions (Security & advanced NetOps tickets) ──
  /** Block an IP at the edge router (SecOps: block attacker / C2). */
  blockIp: (ip: string) => void;
  /** Isolate a node: record it + block all its links (ransomware containment). */
  isolateNode: (nodeId: NodeId) => void;
  /** Flag a phishing sender domain org-wide. */
  flagSenderDomain: (domain: string) => void;
  /** Rotate all service-account credentials (APT eviction). */
  rotateCredentials: () => void;
  /** Re-point resolvers at the correct primary DC + flush cache (DNS hijack). */
  markDnsFixed: () => void;
  /** Run log rotation / cleanup on a node (disk saturation). */
  runLogRotation: (nodeId: NodeId) => void;
  /** Complete the fixed bulk onboarding import. */
  completeOnboarding: () => void;
  /** Field dispatch complete: mark hardware replaced + bring the node online/healthy. */
  completeHardwareReplacement: (nodeId: NodeId) => void;
  /** Replace the whole infrastructure (used by factory fault injection). */
  setInfra: (infra: InfrastructureState) => void;

  reset: () => void;
}

function patchSecurity(
  s: { infra: InfrastructureState },
  patch: Partial<InfrastructureState["security"]>,
): { infra: InfrastructureState } {
  return { infra: { ...s.infra, security: { ...s.infra.security, ...patch } } };
}

function dedupe(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr : [...arr, v];
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
        // Don't let the tick heal scenario-driven degradation (502 upstream,
        // exhausted DB, disk saturation, or a contained/isolated host).
        const scenarioDegraded =
          (n.os === "linux" &&
            (n.services.app?.status === "failed" || n.services.postgresql?.status === "failed")) ||
          n.health.diskUsedPct >= 95 ||
          s.infra.security.isolatedNodeIds.includes(id);
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

  killProcess: (nodeId, pid) =>
    set((s) => {
      // All three OS node shapes carry a process table.
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const procs = node.processes.filter((p) => p.pid !== pid);
      return withNode(s, nodeId, { ...node, processes: procs } as TargetNode);
    }),

  setNodeInterfaceUp: (nodeId, iface, up) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      const nic = clone.network.interfaces.find((i) => i.name === iface);
      if (!nic) return s;
      nic.up = up;
      return withNode(s, nodeId, clone);
    }),

  setNodeDns: (nodeId, dnsServers) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      return withNode(s, nodeId, {
        ...node,
        network: { ...node.network, dnsServers },
      } as TargetNode);
    }),

  setNodeIpv4: (nodeId, iface, ipv4) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      const nic = clone.network.interfaces.find((i) => i.name === iface);
      if (!nic) return s;
      nic.ipv4 = ipv4;
      return withNode(s, nodeId, clone);
    }),

  setMacWifi: (nodeId, on) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "macos") return s;
      const clone = structuredClone(node);
      clone.wifiEnabled = on;
      // The Wi-Fi radio backs the primary adapter.
      if (clone.network.interfaces[0]) clone.network.interfaces[0].up = on;
      return withNode(s, nodeId, clone);
    }),

  blockIp: (ip) => set((s) => patchSecurity(s, { blockedIps: dedupe(s.infra.security.blockedIps, ip) })),

  isolateNode: (nodeId) =>
    set((s) => ({
      infra: {
        ...s.infra,
        security: { ...s.infra.security, isolatedNodeIds: dedupe(s.infra.security.isolatedNodeIds, nodeId) },
        links: s.infra.links.map((l) => (l.from === nodeId || l.to === nodeId ? { ...l, blocked: true } : l)),
      },
    })),

  flagSenderDomain: (domain) =>
    set((s) => patchSecurity(s, { flaggedDomains: dedupe(s.infra.security.flaggedDomains, domain) })),

  rotateCredentials: () => set((s) => patchSecurity(s, { credentialsRotated: true })),

  markDnsFixed: () => set((s) => patchSecurity(s, { dnsFixed: true })),

  runLogRotation: (nodeId) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      const next = node
        ? withNode(s, nodeId, { ...node, health: { ...node.health, diskUsedPct: 42, status: "healthy" } })
        : s;
      return {
        infra: {
          ...next.infra,
          security: { ...next.infra.security, logsRotated: dedupe(next.infra.security.logsRotated, nodeId) },
        },
      };
    }),

  completeOnboarding: () => set((s) => patchSecurity(s, { onboardingComplete: true })),

  completeHardwareReplacement: (nodeId) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      const next = node
        ? withNode(s, nodeId, {
            ...node,
            connection: { ...node.connection, online: true, reachable: true },
            health: { ...node.health, status: "healthy", cpuLoad: 8, memUsedPct: 34, diskUsedPct: 41 },
          })
        : s;
      return {
        infra: {
          ...next.infra,
          security: {
            ...next.infra.security,
            hardwareReplaced: dedupe(next.infra.security.hardwareReplaced, nodeId),
          },
        },
      };
    }),

  setInfra: (infra) => set({ infra }),

  reset: () => set({ infra: generateWorld(freshSeed()) }),
}));

/** Convenience hook: subscribe to a single node by id. */
export function useNode(nodeId: NodeId): TargetNode | undefined {
  return useInfraStore((s) => s.infra.nodes[nodeId]);
}
