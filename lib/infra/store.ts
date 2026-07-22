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
import { createInfrastructure } from "./seed";
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
  infra: createInfrastructure(),

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

  reset: () => set({ infra: createInfrastructure() }),
}));

/** Convenience hook: subscribe to a single node by id. */
export function useNode(nodeId: NodeId): TargetNode | undefined {
  return useInfraStore((s) => s.infra.nodes[nodeId]);
}
