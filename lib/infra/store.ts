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
  CableKind,
  InfrastructureState,
  NetworkTestResult,
  RackDevice,
  ServerConfig,
  SwitchConfig,
  TargetNode,
  WindowsService,
} from "@/lib/core";
import { availableOf, canMount, pingCheck, sizeSpec, shippingOption, ADMIN_PORTS, PUBLIC_CIDR, CLOUD_AUDIT_CAP } from "@/lib/core";
import { connectedLoadWatts, deviceWatts, isPowered, pduSpec, rackThermal } from "@/lib/core";
import {
  baseHardwareFor, freeTorPorts, locationOf, migrationBlocker, rackById,
  shutdownBlocker, torSwitch, uplinkBlocker, uplinkCable,
} from "@/lib/core";
import type {
  DatacenterState, InventoryState, RackNodeMap, RackState, ServerHardware, Workload,
} from "@/lib/core";
import { emptyRack, directoryReach, fileServiceReach } from "@/lib/core";
import type { ShareAccess } from "@/lib/core";
import { nextFreeIp, nextRackName, provisionNode } from "@/lib/datacenter/seed";
import type { ShippingMethod } from "@/lib/core";
import type { AetherVNode, AuditEvent, ShieldRule, VNodeSize, VNodeStatus } from "@/lib/core";
import type { CommandResult, NodeId } from "@/lib/core";
import { generateWorld } from "@/lib/org/generator";
import { freshSeed } from "@/lib/org/rng";
import { linuxInterpreter, nodeToVM, writeVMToNode } from "./terminal";

type WinServiceAction = "start" | "stop" | "restart";

/** ADUC → New User wizard payload. */
export interface NewADUserSpec {
  firstName: string;
  lastName: string;
  samAccountName: string;
  password: string;
  mustChangePassword: boolean;
  department: string;
  title: string;
  /** Groups to add on creation (beyond the implicit "Domain Users"). */
  memberOf?: string[];
}

/** ADUC → Properties editable profile fields. */
export interface ADUserProfilePatch {
  title?: string;
  department?: string;
  description?: string;
}

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
  /** ADUC → Reset Password (also clears lockout, like the real console). */
  resetADUserPassword: (nodeId: NodeId, samAccountName: string, password: string, mustChange: boolean) => void;
  /** ADUC → New User wizard. Returns nothing; no-op if the sam already exists. */
  /**
   * Group membership (v0.5.0). Addressed by DOMAIN rather than by node — the
   * operator works against "the directory", and which DC answers is the
   * simulation's problem, not theirs. Returns null on success or the reason
   * it was refused (including an unreachable domain controller).
   */
  adSetGroupMembership: (sam: string, groupName: string, member: boolean) => string | null;
  /** Create a security group in the directory. */
  adCreateGroup: (name: string, description?: string) => string | null;

  // ── File shares ──────────────────────────────────────────────────────────
  /** Grant a group an access level on a share (replaces any existing entry). */
  shareSetAce: (shareId: string, groupName: string, access: ShareAccess, deny?: boolean) => string | null;
  /** Remove a group's entry from a share's access list. */
  shareRemoveAce: (shareId: string, groupName: string) => string | null;

  createADUser: (nodeId: NodeId, spec: NewADUserSpec) => void;
  /** ADUC → Properties: edit profile fields (title / department / description). */
  updateADUserProfile: (nodeId: NodeId, samAccountName: string, patch: ADUserProfilePatch) => void;
  /** ADUC → Member Of: replace the user's group membership. */
  setADUserGroups: (nodeId: NodeId, samAccountName: string, memberOf: string[]) => void;
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

  // ── AetherCloud Engine (hybrid cloud) ──
  /** Launch a vNode into an AVN. Costs credits per hour while running. */
  cloudLaunchVNode: (spec: {
    name: string;
    avnId: string;
    size: VNodeSize;
    purpose: AetherVNode["purpose"];
    actor: string;
  }) => void;
  /** Start / stop a vNode (a stopped node bills nothing). */
  cloudSetVNodeStatus: (vnodeId: string, status: VNodeStatus, actor: string) => void;
  /** Terminate a vNode and detach it from any traffic router. */
  cloudTerminateVNode: (vnodeId: string, actor: string) => void;
  /** Add an ingress Shield rule. */
  cloudAddShieldRule: (rule: Omit<ShieldRule, "id">, actor: string) => void;
  /** Delete a Shield rule (how the security-audit ticket is resolved). */
  cloudDeleteShieldRule: (ruleId: string, actor: string) => void;
  /** Narrow a rule's source CIDR — the safe alternative to deleting it. */
  cloudRestrictShieldRule: (ruleId: string, source: string, actor: string) => void;
  /** Create an Aether Traffic Router in front of one or more vNodes. */
  cloudCreateRouter: (spec: {
    name: string;
    avnId: string;
    targets: string[];
    originNodeId: NodeId | null;
    cpuThreshold: number;
    actor: string;
  }) => void;
  cloudSetRouterEnabled: (routerId: string, enabled: boolean, actor: string) => void;
  cloudDeleteRouter: (routerId: string, actor: string) => void;
  /** Bring the IPsec site-to-site tunnel up (validated) or tear it down. */
  cloudConfigureVpn: (spec: {
    localGatewayNodeId: NodeId;
    localCidr: string;
    remoteAvnId: string;
    psk: string;
    actor: string;
  }) => void;
  cloudDisconnectVpn: (actor: string) => void;
  /** Toggle public read on a DataBucket. */
  cloudSetBucketPublic: (bucketId: string, publicAccess: boolean, actor: string) => void;

  // ── Inventory (AssetManager) ──
  /** Book stock out of the store room against a ticket / person / rack. */
  allocateAsset: (itemId: string, qty: number, assignedTo: string, ticket?: { id: string; code: string }) => void;
  /** Return a previous allocation to the shelf. */
  returnAllocation: (allocationId: string) => void;
  /** Move units between available and the repair bench. */
  setAssetRepair: (itemId: string, qty: number) => void;
  /**
   * Place a Procurement order. Express lands on the shelf immediately;
   * standard goes to `inTransit` and is released by `advanceDeliveries`.
   */
  placeOrder: (spec: {
    itemId: string;
    qty: number;
    method: ShippingMethod;
    paid: number;
  }) => void;
  /**
   * Tick every open order down by one ticket resolution and deliver those
   * that reach zero. Called by the reconciler — deliveries are paced by work
   * done, not by wall-clock, so idling never conjures parts.
   */
  advanceDeliveries: () => string[];
  /** Return a pulled-out part to the ledger as dead stock. */
  markFaulty: (skuId: string, qty?: number) => void;
  /**
   * Consume a part permanently (fitted into a machine). Returns false when
   * the shelf is empty — the Hardware Lab refuses to fit what it has not got,
   * which is what makes procurement a real constraint.
   */
  consumePart: (skuId: string, qty?: number) => boolean;

  // ── Rack simulator ──
  /** Mount an inventory asset into the rack at `uStart` (consumes 1 unit). */
  rackMountDevice: (rackId: string, assetItemId: string, uStart: number) => void;
  /** Unmount a device, returning it (and its cables) to stock. */
  rackRemoveDevice: (rackId: string, deviceId: string) => void;
  /** Patch or power a cable between two device ports (consumes a cable). */
  rackConnectCable: (rackId: string, cable: { kind: CableKind; fromDeviceId: string; fromPort: string; toDeviceId: string; toPort: string }) => void;
  rackDisconnectCable: (rackId: string, cableId: string) => void;
  /** Apply switch CLI results (VLAN db + per-interface access VLAN / shutdown). */
  rackUpdateSwitch: (rackId: string, deviceId: string, patch: Partial<SwitchConfig>) => void;
  /** Apply the server config modal (addressing + services). */
  rackUpdateServer: (rackId: string, deviceId: string, patch: Partial<ServerConfig>) => void;
  /** Run the ping tool and record the result. */
  rackRunPing: (rackId: string, fromId: string, toId: string) => NetworkTestResult;
  /**
   * Re-close the PDU breaker. Refuses while the cabled load still exceeds the
   * ceiling — you have to shed load first, exactly like the real thing.
   */
  rackResetBreaker: (rackId: string) => boolean;
  /** Swap the rack's PDU (consumes/returns nothing — it is the rack feed). */
  rackSetPdu: (rackId: string, pduId: string) => void;
  /** Fit or remove a liquid cooling loop on one device (consumes a kit). */
  rackSetLiquidCooling: (rackId: string, deviceId: string, on: boolean) => void;
  /** QA only: suspend the power/thermal physics from `sudo elevate debug`. */
  rackSetOverrides: (patch: { unlimitedPower?: boolean; unlimitedCooling?: boolean }) => void;

  // ── The datacenter floor (v0.4.0) ────────────────────────────────────────
  /** Roll a new empty rack onto the floor (consumes a rack from stock). */
  dcAddRack: () => string | null;
  /**
   * Patch a racked chassis into its rack's ToR switch and PROVISION it: this
   * is the moment a lump of metal becomes a server with an IP, a gateway entry
   * and a row in the Server Manager. Returns the new nodeId, or null with the
   * reason surfaced by `uplinkBlocker`.
   */
  dcConnectUplink: (rackId: string, deviceId: string) => NodeId | null;
  /** Pull the uplink. The node stays racked but drops off the network. */
  dcDisconnectUplink: (rackId: string, deviceId: string) => void;
  /**
   * Fit a part from stock into a racked chassis. Capacity in the Server
   * Manager moves the instant this lands — same numbers, no sync step.
   * Returns null on success, or why it was refused.
   */
  dcFitPart: (rackId: string, deviceId: string, skuId: string) => string | null;

  // ── Change control ───────────────────────────────────────────────────────
  setMaintenanceMode: (nodeId: NodeId, on: boolean) => void;
  /**
   * Live-migrate workloads between hosts. Pass `workloadIds` to move a subset,
   * or omit it to drain the source entirely. Returns null on success, or the
   * blocking reason.
   */
  migrateWorkloads: (fromNodeId: NodeId, toNodeId: NodeId, workloadIds?: string[]) => string | null;
  /**
   * Power a node on or off. Cutting power to a host that is not drained is an
   * unplanned outage: it is recorded so the reconciler can bill for it.
   */
  setNodePower: (nodeId: NodeId, on: boolean) => string | null;
  /** Field dispatch complete: mark hardware replaced + bring the node online/healthy. */
  completeHardwareReplacement: (nodeId: NodeId) => void;
  /** Replace the whole infrastructure (used by factory fault injection). */
  setInfra: (infra: InfrastructureState) => void;

  reset: () => void;
}

// ── Datacentre physics settlement (v0.3.1) ──────────────────────────────────
//
// Every rack mutation runs through `settleRack`, which is where consequence
// lives. Two things can happen that the player did not explicitly ask for:
//
//   1. OVERLOAD — cabled load passes the PDU ceiling, so the breaker latches
//      open and the whole rack goes dark until it is reset.
//   2. THERMAL RUNAWAY — the rack crosses 45C, so the hottest box in it cooks.
//      It is unracked and its unit moves to the Faulty bucket; hardware that
//      dies in a hot rack is not a warning message, it is a purchase order.
//
// Only the transition INTO critical burns a device. Staying hot is already
// punishing (everything is in thermal shutdown, `deviceOnline` is false); if
// each subsequent action also killed a box the player could never dig out.

function settleRack(
  rack: RackState,
  inventory: InventoryState,
  before: RackState,
  nodes: RackNodeMap,
): { rack: RackState; inventory: InventoryState; cookedNodeId?: string } {
  let next = rack;
  let items = inventory.items;

  // 1) Breaker.
  if (!next.overrides?.unlimitedPower && !next.breakerTripped) {
    if (connectedLoadWatts(next) > pduSpec(next.pduId).maxWatts) {
      next = { ...next, breakerTripped: true, trippedAt: Date.now() };
    }
  }

  // 2) Thermal runaway, on the transition only.
  const wasCritical = rackThermal(before, nodes).state === "critical";
  let cookedNodeId: string | undefined;
  if (!wasCritical && rackThermal(next, nodes).state === "critical") {
    // Hottest = topmost powered box that is not itself cooling gear; heat
    // rises, and killing the fan tray would be a death spiral.
    const victim = next.devices
      .filter((d) => isPowered(next, d.id) && deviceWatts(d) > 0)
      .filter((d) => d.kind !== "fan-tray" && d.kind !== "crac")
      .sort((a, b) => a.uStart - b.uStart)[0];
    if (victim) {
      // If the cooked chassis was a live server, its logical half dies with it.
      cookedNodeId = victim.nodeId;
      items = items.map((i) =>
        i.id === victim.assetItemId
          ? { ...i, deployed: Math.max(0, i.deployed - 1), faulty: i.faulty + 1 }
          : i,
      );
      next = {
        ...next,
        devices: next.devices.filter((d) => d.id !== victim.id),
        cables: next.cables.filter(
          (c) => c.fromDeviceId !== victim.id && c.toDeviceId !== victim.id,
        ),
      };
    }
  }

  return {
    rack: next,
    inventory: items === inventory.items ? inventory : { ...inventory, items },
    cookedNodeId,
  };
}

/**
 * Fold a settled rack (and its inventory) back into the floor.
 *
 * A chassis that cooked takes its logical node down with it and drops the
 * workloads it was carrying — they did not migrate, they died. That is the
 * whole argument for the maintenance loop, delivered as a consequence rather
 * than as a warning.
 */
function foldRack(
  infra: InfrastructureState,
  settled: { rack: RackState; inventory: InventoryState; cookedNodeId?: string },
): InfrastructureState {
  let nodes = infra.nodes;
  if (settled.cookedNodeId && nodes[settled.cookedNodeId]) {
    const dead = nodes[settled.cookedNodeId];
    nodes = {
      ...nodes,
      [settled.cookedNodeId]: {
        ...dead,
        workloads: [],
        health: { ...dead.health, status: "offline" },
        connection: { ...dead.connection, online: false, reachable: false, authenticated: false },
      } as typeof dead,
    };
  }
  return {
    ...infra,
    nodes,
    inventory: settled.inventory,
    datacenter: {
      ...infra.datacenter,
      racks: infra.datacenter.racks.map((r) => (r.id === settled.rack.id ? settled.rack : r)),
    },
  };
}

/** The map the physics reads. Nodes already have the shape it needs. */
function nodeView(infra: InfrastructureState): RackNodeMap {
  return infra.nodes as unknown as RackNodeMap;
}

function patchSecurity(
  s: { infra: InfrastructureState },
  patch: Partial<InfrastructureState["security"]>,
): { infra: InfrastructureState } {
  return { infra: { ...s.infra, security: { ...s.infra.security, ...patch } } };
}

/** Shallow-merge a patch into the cloud tenant. */
function withCloud(
  s: { infra: InfrastructureState },
  patch: Partial<InfrastructureState["cloud"]>,
): { infra: InfrastructureState } {
  return { infra: { ...s.infra, cloud: { ...s.infra.cloud, ...patch } } };
}

/** Prepend an AetherTrace entry, newest first, capped. */
let auditSeq = 0;
function auditPush(
  cloud: InfrastructureState["cloud"],
  e: Omit<AuditEvent, "id" | "at">,
): AuditEvent[] {
  const entry: AuditEvent = { ...e, id: `aud-${Date.now()}-${++auditSeq}`, at: Date.now() };
  return [entry, ...cloud.audit].slice(0, CLOUD_AUDIT_CAP);
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

  resetADUserPassword: (nodeId, sam, password, mustChange) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return s;
      const clone = structuredClone(node);
      const user = clone.activeDirectory!.users.find((u) => u.samAccountName === sam);
      if (!user) return s;
      user.password = password;
      user.passwordLastSet = Date.now();
      user.mustChangePassword = mustChange;
      user.passwordExpired = false;
      // Resetting a password in ADUC also clears the lockout state.
      user.locked = false;
      user.badPwdCount = 0;
      return withNode(s, nodeId, clone);
    }),

  adSetGroupMembership: (sam, groupName, member) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Domain controller unreachable.";
    const dcId = reach.node.nodeId;
    const node = infra.nodes[dcId];
    if (!node || node.os !== "windows" || !node.activeDirectory) return "That host is not a domain controller.";
    if (!node.activeDirectory.groups.some((g) => g.name === groupName)) return `No group named ${groupName}.`;
    if (!node.activeDirectory.users.some((u) => u.samAccountName === sam)) return `No account named ${sam}.`;

    set((st) => {
      const dc = st.infra.nodes[dcId];
      if (!dc || dc.os !== "windows" || !dc.activeDirectory) return st;
      const clone = structuredClone(dc);
      const ad = clone.activeDirectory!;
      const group = ad.groups.find((g) => g.name === groupName)!;
      const user = ad.users.find((u) => u.samAccountName === sam)!;

      // Membership is recorded on BOTH sides because the generator seeds it
      // on the user and the console edits it on the group; leaving one stale
      // would make `effectiveGroups` disagree with what the UI just showed.
      if (member) {
        if (!group.members.includes(sam)) group.members.push(sam);
        if (!user.memberOf.includes(groupName)) user.memberOf.push(groupName);
      } else {
        group.members = group.members.filter((m) => m !== sam);
        user.memberOf = user.memberOf.filter((g) => g !== groupName);
      }
      return withNode(st, dcId, clone);
    });
    return null;
  },

  adCreateGroup: (name, description) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Domain controller unreachable.";
    const trimmed = name.trim();
    if (!trimmed) return "A group needs a name.";
    const dcId = reach.node.nodeId;
    const dc = infra.nodes[dcId];
    if (!dc || dc.os !== "windows" || !dc.activeDirectory) return "That host is not a domain controller.";
    if (dc.activeDirectory.groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) {
      return `${trimmed} already exists.`;
    }

    set((st) => {
      const node = st.infra.nodes[dcId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return st;
      const clone = structuredClone(node);
      clone.activeDirectory!.groups.push({
        sid: `S-1-5-21-...-${2000 + clone.activeDirectory!.groups.length}`,
        name: trimmed,
        scope: "DomainLocal",
        category: "Security",
        members: [],
        description,
      });
      return withNode(st, dcId, clone);
    });
    return null;
  },

  shareSetAce: (shareId, groupName, access, deny) => {
    const infra = get().infra;
    const reach = fileServiceReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "File server unreachable.";
    const host = reach.node;
    const share = (host.shares ?? []).find((sh) => sh.id === shareId);
    if (!share) return "No such share on this server.";

    // ACLs name GROUPS, so the group has to exist in the directory. This is
    // also why the DC being down blocks share work: you cannot verify a
    // principal you cannot look up.
    const dirReach = directoryReach(infra);
    if (!dirReach.reachable) return `Cannot resolve ${groupName}: ${dirReach.reason}`;
    const ad = dirReach.node && "activeDirectory" in dirReach.node ? dirReach.node.activeDirectory : undefined;
    if (ad && !ad.groups.some((g) => g.name === groupName)) return `No group named ${groupName} in the directory.`;

    set((st) => {
      const node = st.infra.nodes[host.nodeId];
      if (!node) return st;
      const clone = structuredClone(node);
      const target = (clone.shares ?? []).find((sh) => sh.id === shareId);
      if (!target) return st;
      const existing = target.acl.find((a) => a.groupName === groupName);
      if (existing) {
        existing.access = access;
        if (deny) existing.deny = true;
        else delete existing.deny;
      } else {
        target.acl.push({ groupName, access, ...(deny ? { deny: true } : {}) });
      }
      return withNode(st, host.nodeId, clone);
    });
    return null;
  },

  shareRemoveAce: (shareId, groupName) => {
    const infra = get().infra;
    const reach = fileServiceReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "File server unreachable.";
    const hostId = reach.node.nodeId;
    set((st) => {
      const node = st.infra.nodes[hostId];
      if (!node) return st;
      const clone = structuredClone(node);
      const target = (clone.shares ?? []).find((sh) => sh.id === shareId);
      if (!target) return st;
      target.acl = target.acl.filter((a) => a.groupName !== groupName);
      return withNode(st, hostId, clone);
    });
    return null;
  },

  createADUser: (nodeId, spec) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return s;
      const sam = spec.samAccountName.trim().toLowerCase();
      if (!sam) return s;
      const clone = structuredClone(node);
      const ad = clone.activeDirectory!;
      if (ad.users.some((u) => u.samAccountName.toLowerCase() === sam)) return s; // already exists
      const ou = ad.ous.find((o) => o.name === spec.department);
      const groups = Array.from(new Set(["Domain Users", ...(spec.memberOf ?? [])]));
      ad.users.push({
        sid: `S-1-5-21-${Date.now().toString().slice(-9)}-${Math.floor(Math.random() * 9000 + 1000)}`,
        samAccountName: sam,
        upn: `${sam}@${ad.domainDns}`,
        displayName: `${spec.firstName} ${spec.lastName}`.trim(),
        title: spec.title,
        department: spec.department,
        email: `${sam}@${ad.domainDns.replace(".internal", ".com")}`,
        ou: ou?.dn ?? `OU=${spec.department},DC=${ad.domainDns.split(".").join(",DC=")}`,
        memberOf: groups,
        enabled: true,
        locked: false,
        passwordExpired: false,
        mustChangePassword: spec.mustChangePassword,
        badPwdCount: 0,
        lastLogon: null,
        passwordExpiresAt: Date.now() + 90 * 86_400_000,
        password: spec.password,
        passwordLastSet: Date.now(),
        description: spec.title,
      });
      return withNode(s, nodeId, clone);
    }),

  updateADUserProfile: (nodeId, sam, patch) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return s;
      const clone = structuredClone(node);
      const ad = clone.activeDirectory!;
      const user = ad.users.find((u) => u.samAccountName === sam);
      if (!user) return s;
      if (patch.title !== undefined) user.title = patch.title;
      if (patch.description !== undefined) user.description = patch.description;
      if (patch.department !== undefined && patch.department !== user.department) {
        user.department = patch.department;
        // Moving departments relocates the object into that department's OU.
        const ou = ad.ous.find((o) => o.name === patch.department);
        if (ou) user.ou = ou.dn;
      }
      return withNode(s, nodeId, clone);
    }),

  setADUserGroups: (nodeId, sam, memberOf) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return s;
      const clone = structuredClone(node);
      const user = clone.activeDirectory!.users.find((u) => u.samAccountName === sam);
      if (!user) return s;
      // "Domain Users" is the primary group — it can't be removed in ADUC.
      user.memberOf = Array.from(new Set(["Domain Users", ...memberOf]));
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

  // ── AetherCloud Engine ────────────────────────────────────────────────────
  // Every mutation writes an AetherTrace entry. That is not decoration: the
  // security-audit ticket is solved by READING this log, so the log has to be
  // produced by the same code path that makes the change.

  cloudLaunchVNode: ({ name, avnId, size, purpose, actor }) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const avn = cloud.avns.find((a) => a.id === avnId);
      if (!avn) return s;
      const n = cloud.vnodes.length + 1;
      const base = avn.cidr.split("/")[0].split(".").slice(0, 3).join(".");
      const vnode: AetherVNode = {
        id: `vnode-${String(n).padStart(2, "0")}`,
        name,
        avnId,
        size,
        status: "running",
        privateIp: `${base}.${30 + n}`,
        purpose,
        createdAt: Date.now(),
      };
      return withCloud(s, {
        vnodes: [...cloud.vnodes, vnode],
        audit: auditPush(cloud, {
          actor,
          action: `Launched vNode ${name} (${sizeSpec(size).label}) in ${avn.name}`,
          target: vnode.id,
          severity: size === "high-spec" ? "warning" : "info",
        }),
      });
    }),

  cloudSetVNodeStatus: (vnodeId, status, actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const v = cloud.vnodes.find((x) => x.id === vnodeId);
      if (!v) return s;
      return withCloud(s, {
        vnodes: cloud.vnodes.map((x) => (x.id === vnodeId ? { ...x, status } : x)),
        audit: auditPush(cloud, {
          actor,
          action: `${status === "running" ? "Started" : "Stopped"} vNode ${v.name}`,
          target: vnodeId,
          severity: "info",
        }),
      });
    }),

  cloudTerminateVNode: (vnodeId, actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const v = cloud.vnodes.find((x) => x.id === vnodeId);
      if (!v) return s;
      return withCloud(s, {
        vnodes: cloud.vnodes.filter((x) => x.id !== vnodeId),
        // Detach from routers too, or an ATR keeps pointing at a dead target.
        routers: cloud.routers.map((r) => ({ ...r, targets: r.targets.filter((t) => t !== vnodeId) })),
        audit: auditPush(cloud, {
          actor,
          action: `Terminated vNode ${v.name}`,
          target: vnodeId,
          severity: "warning",
        }),
      });
    }),

  cloudAddShieldRule: (rule, actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const id = `sr-${Math.floor(1000 + Math.random() * 8999)}`;
      const exposes = rule.action === "allow" && rule.source === PUBLIC_CIDR && ADMIN_PORTS.includes(rule.port);
      return withCloud(s, {
        shieldRules: [...cloud.shieldRules, { ...rule, id }],
        audit: auditPush(cloud, {
          actor,
          action: `Opened ${rule.protocol.toUpperCase()} port ${rule.port} from ${rule.source} on Shield rule ${id}`,
          target: id,
          severity: exposes ? "critical" : "info",
        }),
      });
    }),

  cloudDeleteShieldRule: (ruleId, actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const rule = cloud.shieldRules.find((r) => r.id === ruleId);
      if (!rule) return s;
      return withCloud(s, {
        shieldRules: cloud.shieldRules.filter((r) => r.id !== ruleId),
        audit: auditPush(cloud, {
          actor,
          action: `Removed Shield rule ${ruleId} (${rule.protocol.toUpperCase()} ${rule.port} from ${rule.source})`,
          target: ruleId,
          severity: "info",
        }),
      });
    }),

  cloudRestrictShieldRule: (ruleId, source, actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const rule = cloud.shieldRules.find((r) => r.id === ruleId);
      if (!rule) return s;
      return withCloud(s, {
        shieldRules: cloud.shieldRules.map((r) => (r.id === ruleId ? { ...r, source } : r)),
        audit: auditPush(cloud, {
          actor,
          action: `Restricted Shield rule ${ruleId} source ${rule.source} to ${source}`,
          target: ruleId,
          severity: "info",
        }),
      });
    }),

  cloudCreateRouter: ({ name, avnId, targets, originNodeId, cpuThreshold, actor }) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const id = `atr-${String(cloud.routers.length + 1).padStart(2, "0")}`;
      const origin = originNodeId ? s.infra.nodes[originNodeId]?.hostname : null;
      return withCloud(s, {
        routers: [
          ...cloud.routers,
          { id, name, avnId, targets, originNodeId, cpuThreshold, enabled: true },
        ],
        audit: auditPush(cloud, {
          actor,
          action:
            `Created Aether Traffic Router ${name} → ${targets.length} target(s)` +
            (origin ? `, failing over for ${origin} above ${cpuThreshold}% CPU` : ""),
          target: id,
          severity: "info",
        }),
      });
    }),

  cloudSetRouterEnabled: (routerId, enabled, actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const r = cloud.routers.find((x) => x.id === routerId);
      if (!r) return s;
      return withCloud(s, {
        routers: cloud.routers.map((x) => (x.id === routerId ? { ...x, enabled } : x)),
        audit: auditPush(cloud, {
          actor,
          action: `${enabled ? "Enabled" : "Disabled"} Traffic Router ${r.name}`,
          target: routerId,
          severity: enabled ? "info" : "warning",
        }),
      });
    }),

  cloudDeleteRouter: (routerId, actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const r = cloud.routers.find((x) => x.id === routerId);
      if (!r) return s;
      return withCloud(s, {
        routers: cloud.routers.filter((x) => x.id !== routerId),
        audit: auditPush(cloud, {
          actor,
          action: `Deleted Traffic Router ${r.name}`,
          target: routerId,
          severity: "warning",
        }),
      });
    }),

  cloudConfigureVpn: ({ localGatewayNodeId, localCidr, remoteAvnId, psk, actor }) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const gw = s.infra.nodes[localGatewayNodeId];
      const avn = cloud.avns.find((a) => a.id === remoteAvnId);

      // Validate like a real appliance would: a tunnel with a bad peer or a
      // weak PSK comes up as an ERROR, not silently half-working.
      const problem =
        !gw ? "Local gateway not found."
        : !avn ? "Remote Aether Virtual Network not found."
        : psk.trim().length < 8 ? "Pre-shared key must be at least 8 characters."
        : !/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(localCidr.trim())
          ? "Local network must be a valid CIDR (e.g. 10.60.1.0/24)."
        : null;

      if (problem) {
        return withCloud(s, {
          vpn: { ...cloud.vpn, status: "error", lastError: problem, connectedAt: null },
          audit: auditPush(cloud, {
            actor,
            action: `Site-to-site tunnel failed to establish — ${problem}`,
            target: "vpn-gw",
            severity: "warning",
          }),
        });
      }

      return withCloud(s, {
        vpn: {
          status: "connected",
          localGatewayNodeId,
          localCidr: localCidr.trim(),
          remoteAvnId,
          psk,
          lastError: null,
          connectedAt: Date.now(),
        },
        audit: auditPush(cloud, {
          actor,
          action: `IPsec tunnel established: ${gw!.hostname} (${localCidr.trim()}) ↔ ${avn!.name} (${avn!.cidr})`,
          target: "vpn-gw",
          severity: "info",
        }),
      });
    }),

  cloudDisconnectVpn: (actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      return withCloud(s, {
        vpn: { ...cloud.vpn, status: "down", connectedAt: null, lastError: null },
        audit: auditPush(cloud, {
          actor,
          action: "Site-to-site tunnel torn down",
          target: "vpn-gw",
          severity: "warning",
        }),
      });
    }),

  cloudSetBucketPublic: (bucketId, publicAccess, actor) =>
    set((s) => {
      const cloud = s.infra.cloud;
      const b = cloud.buckets.find((x) => x.id === bucketId);
      if (!b) return s;
      return withCloud(s, {
        buckets: cloud.buckets.map((x) => (x.id === bucketId ? { ...x, publicAccess } : x)),
        audit: auditPush(cloud, {
          actor,
          action: `${publicAccess ? "Enabled" : "Disabled"} public read on DataBucket ${b.name}`,
          target: bucketId,
          severity: publicAccess ? "critical" : "info",
        }),
      });
    }),

  // ── Inventory ──────────────────────────────────────────────────────────────

  allocateAsset: (itemId, qty, assignedTo, ticket) =>
    set((s) => {
      const inv = s.infra.inventory;
      const item = inv.items.find((i) => i.id === itemId);
      if (!item || qty <= 0 || availableOf(item) < qty) return s;
      const items = inv.items.map((i) =>
        i.id === itemId ? { ...i, spare: i.spare - qty, deployed: i.deployed + qty } : i,
      );
      const alloc = {
        id: `al-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        itemId, itemName: item.name, qty, assignedTo,
        ticketId: ticket?.id, ticketCode: ticket?.code, at: Date.now(),
      };
      return { infra: { ...s.infra, inventory: { ...inv, items, allocations: [alloc, ...inv.allocations] } } };
    }),

  returnAllocation: (allocationId) =>
    set((s) => {
      const inv = s.infra.inventory;
      const alloc = inv.allocations.find((a) => a.id === allocationId);
      if (!alloc) return s;
      const items = inv.items.map((i) =>
        i.id === alloc.itemId
          ? { ...i, deployed: Math.max(0, i.deployed - alloc.qty), spare: i.spare + alloc.qty }
          : i,
      );
      return {
        infra: {
          ...s.infra,
          inventory: {
            ...inv,
            items,
            allocations: inv.allocations.filter((a) => a.id !== allocationId),
          },
        },
      };
    }),

  setAssetRepair: (itemId, qty) =>
    set((s) => {
      // Move units between the shelf and the faulty pile. `qty` is the delta:
      // positive condemns spares, negative returns repaired units to stock.
      const inv = s.infra.inventory;
      const item = inv.items.find((i) => i.id === itemId);
      if (!item) return s;
      const delta = qty > 0 ? Math.min(qty, item.spare) : Math.max(qty, -item.faulty);
      if (delta === 0) return s;
      return {
        infra: {
          ...s.infra,
          inventory: {
            ...inv,
            items: inv.items.map((i) =>
              i.id === itemId ? { ...i, spare: i.spare - delta, faulty: i.faulty + delta } : i,
            ),
          },
        },
      };
    }),

  // ── Rack simulator ─────────────────────────────────────────────────────────

  rackMountDevice: (rackId, assetItemId, uStart) =>
    set((s) => {
      const inv = s.infra.inventory;
      const rack = rackById(s.infra.datacenter, rackId);
      if (!rack) return s;
      const item = inv.items.find((i) => i.id === assetItemId);
      if (!item || !item.deviceKind || availableOf(item) < 1) return s;
      const uSize = item.uSize ?? 1;
      if (!canMount(rack, uStart, uSize)) return s;

      const seq = rack.devices.filter((d) => d.kind === item.deviceKind).length + 1;
      const shortName = (k: string) => ({ server: "SRV", switch: "SW", router: "RTR", firewall: "FW", "patch-panel": "PP", ups: "UPS", pdu: "PDU", "fan-tray": "FAN", crac: "CRAC" }[k] ?? "DEV");
      const name = `${shortName(item.deviceKind)}-${String(seq).padStart(2, "0")}`;

      const device: RackDevice = {
        id: `rd-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        kind: item.deviceKind,
        name,
        assetItemId,
        uStart,
        uSize,
        // Nameplate draw comes from the SKU where the catalogue states it, so
        // a 750W storage node is heavy because of what it IS, not its class.
        watts: item.traits?.watts,
        // Data ports plus a PSU inlet; power distribution units expose outlets.
        ports:
          item.deviceKind === "ups" || item.deviceKind === "pdu"
            ? Array.from({ length: 8 }, (_, i) => `out${i + 1}`)
            : [
                ...(item.deviceKind === "switch" || item.deviceKind === "router"
                  ? Array.from({ length: 8 }, (_, i) => `gi0/${i + 1}`)
                  : item.deviceKind === "patch-panel"
                    ? Array.from({ length: 8 }, (_, i) => `p${i + 1}`)
                    : ["eth0", "eth1"]),
                "psu",
              ],
        switchConfig:
          item.deviceKind === "switch" || item.deviceKind === "router"
            ? {
                hostname: name,
                vlans: [1],
                interfaces: Array.from({ length: 8 }, (_, i) => ({ name: `gi0/${i + 1}`, accessVlan: null, up: true })),
              }
            : undefined,
        serverConfig:
          item.deviceKind === "server"
            ? { hostname: name, ipv4: "", netmask: "255.255.255.0", gateway: "", services: { web: false, dns: false } }
            : undefined,
      };

      const settled = settleRack(
        { ...rack, devices: [...rack.devices, device] },
        {
          ...inv,
          // Racking MOVES a unit from the shelf to deployed. Incrementing
          // `deployed` alone would mint hardware and quietly defeat the
          // scarcity the whole economy rests on.
          items: inv.items.map((i) =>
            i.id === assetItemId ? { ...i, spare: Math.max(0, i.spare - 1), deployed: i.deployed + 1 } : i,
          ),
        },
        rack,
        nodeView(s.infra),
      );
      return { infra: foldRack(s.infra, settled) };
    }),

  rackRemoveDevice: (rackId, deviceId) =>
    set((s) => {
      const rack = rackById(s.infra.datacenter, rackId);
      if (!rack) return s;
      const dev = rack.devices.find((d) => d.id === deviceId);
      if (!dev) return s;
      // Returning a device also reclaims every cable attached to it.
      const freed = rack.cables.filter((c) => c.fromDeviceId === deviceId || c.toDeviceId === deviceId);
      // Unracking returns the unit (and every cable on it) to the shelf.
      const toSpare = (i: typeof s.infra.inventory.items[number]) => ({
        ...i,
        spare: i.spare + 1,
        deployed: Math.max(0, i.deployed - 1),
      });
      let items = s.infra.inventory.items.map((i) => (i.id === dev.assetItemId ? toSpare(i) : i));
      for (const c of freed) {
        const sku = c.kind === "power" ? "sku-power-c13" : "sku-rj45-3m";
        items = items.map((i) => (i.id === sku ? toSpare(i) : i));
      }
      const settled = settleRack(
        {
          ...rack,
          devices: rack.devices.filter((d) => d.id !== deviceId),
          cables: rack.cables.filter((c) => c.fromDeviceId !== deviceId && c.toDeviceId !== deviceId),
        },
        { ...s.infra.inventory, items },
        rack,
        nodeView(s.infra),
      );
      return { infra: foldRack(s.infra, settled) };
    }),

  rackConnectCable: (rackId, cable) =>
    set((s) => {
      const rack = rackById(s.infra.datacenter, rackId);
      if (!rack) return s;
      const inv = s.infra.inventory;
      if (cable.fromDeviceId === cable.toDeviceId) return s;
      // A port can only carry one cable of a given kind.
      const taken = rack.cables.some(
        (c) =>
          c.kind === cable.kind &&
          ((c.fromDeviceId === cable.fromDeviceId && c.fromPort === cable.fromPort) ||
            (c.toDeviceId === cable.fromDeviceId && c.toPort === cable.fromPort) ||
            (c.fromDeviceId === cable.toDeviceId && c.fromPort === cable.toPort) ||
            (c.toDeviceId === cable.toDeviceId && c.toPort === cable.toPort)),
      );
      if (taken) return s;

      const sku = cable.kind === "power" ? "sku-power-c13" : "sku-rj45-3m";
      const stock = inv.items.find((i) => i.id === sku);
      if (!stock || availableOf(stock) < 1) return s; // out of cable

      // Patching a power lead is what puts a device on the bus — so this is
      // the moment an overload can happen.
      const settled = settleRack(
        {
          ...rack,
          cables: [...rack.cables, { ...cable, id: `cb-${Date.now()}-${Math.floor(Math.random() * 1000)}` }],
        },
        {
          ...inv,
          items: inv.items.map((i) =>
            i.id === sku ? { ...i, spare: Math.max(0, i.spare - 1), deployed: i.deployed + 1 } : i,
          ),
        },
        rack,
        nodeView(s.infra),
      );
      return { infra: foldRack(s.infra, settled) };
    }),

  rackDisconnectCable: (rackId, cableId) =>
    set((s) => {
      const rack = rackById(s.infra.datacenter, rackId);
      if (!rack) return s;
      const cable = rack.cables.find((c) => c.id === cableId);
      if (!cable) return s;
      const sku = cable.kind === "power" ? "sku-power-c13" : "sku-rj45-3m";
      const settled = settleRack(
        { ...rack, cables: rack.cables.filter((c) => c.id !== cableId) },
        {
          ...s.infra.inventory,
          items: s.infra.inventory.items.map((i) =>
            i.id === sku ? { ...i, spare: i.spare + 1, deployed: Math.max(0, i.deployed - 1) } : i,
          ),
        },
        rack,
        nodeView(s.infra),
      );
      return { infra: foldRack(s.infra, settled) };
    }),

  rackResetBreaker: (rackId) => {
    const infra = get().infra;
    const rack = rackById(infra.datacenter, rackId);
    if (!rack) return false;
    if (!rack.breakerTripped) return true;
    // Refuse while the fault is still present. Resetting into an overload is
    // how you weld a breaker shut; here it simply does nothing and the UI says
    // how many watts have to come off first.
    if (connectedLoadWatts(rack, nodeView(infra)) > pduSpec(rack.pduId).maxWatts) return false;
    set((s) => ({
      infra: {
        ...s.infra,
        datacenter: {
          ...s.infra.datacenter,
          racks: s.infra.datacenter.racks.map((r) =>
            r.id === rackId ? { ...r, breakerTripped: false, trippedAt: null } : r,
          ),
        },
      },
    }));
    return true;
  },

  rackSetPdu: (rackId, pduId) =>
    set((s) => {
      const rack = rackById(s.infra.datacenter, rackId);
      if (!rack || rack.pduId === pduId) return s;
      // The feed is a real unit off the shelf, so a capacity upgrade is a
      // procurement decision rather than a free dropdown.
      const sku = (id: string) => (id === "pdu-30a" ? "sku-pdu-30a" : "sku-pdu-1u");
      const wanted = s.infra.inventory.items.find((i) => i.id === sku(pduId));
      if (!wanted || availableOf(wanted) < 1) return s;

      const items = s.infra.inventory.items.map((i) => {
        if (i.id === sku(pduId)) return { ...i, spare: i.spare - 1, deployed: i.deployed + 1 };
        if (i.id === sku(rack.pduId)) return { ...i, spare: i.spare + 1, deployed: Math.max(0, i.deployed - 1) };
        return i;
      });
      const settled = settleRack({ ...rack, pduId }, { ...s.infra.inventory, items }, rack, nodeView(s.infra));
      return { infra: foldRack(s.infra, settled) };
    }),

  rackSetLiquidCooling: (rackId, deviceId, on) =>
    set((s) => {
      const rack = rackById(s.infra.datacenter, rackId);
      if (!rack) return s;
      const dev = rack.devices.find((d) => d.id === deviceId);
      if (!dev || !!dev.liquidCooled === on) return s;
      const kit = s.infra.inventory.items.find((i) => i.id === "sku-liquid-kit");
      if (on && (!kit || availableOf(kit) < 1)) return s;

      const items = s.infra.inventory.items.map((i) =>
        i.id === "sku-liquid-kit"
          ? on
            ? { ...i, spare: i.spare - 1, deployed: i.deployed + 1 }
            : { ...i, spare: i.spare + 1, deployed: Math.max(0, i.deployed - 1) }
          : i,
      );
      const settled = settleRack(
        { ...rack, devices: rack.devices.map((d) => (d.id === deviceId ? { ...d, liquidCooled: on } : d)) },
        { ...s.infra.inventory, items },
        rack,
        nodeView(s.infra),
      );
      return { infra: foldRack(s.infra, settled) };
    }),

  rackSetOverrides: (patch) =>
    set((s) => ({
      infra: {
        ...s.infra,
        // A QA switch is a property of the SIMULATION, not of one rack, so it
        // lands on every rack on the floor at once.
        datacenter: {
          ...s.infra.datacenter,
          racks: s.infra.datacenter.racks.map((r) => ({
            ...r,
            overrides: { ...r.overrides, ...patch },
          })),
        },
      },
    })),

  // ── The datacenter floor (v0.4.0) ────────────────────────────────────────

  dcAddRack: () => {
    const infra = get().infra;
    const stock = infra.inventory.items.find((i) => i.id === "sku-rack-24u");
    if (!stock || availableOf(stock) < 1) return null;
    const { id, name } = nextRackName(infra.datacenter);
    set((s) => ({
      infra: {
        ...s.infra,
        inventory: {
          ...s.infra.inventory,
          items: s.infra.inventory.items.map((i) =>
            i.id === "sku-rack-24u" ? { ...i, spare: i.spare - 1, deployed: i.deployed + 1 } : i,
          ),
        },
        datacenter: { ...s.infra.datacenter, racks: [...s.infra.datacenter.racks, emptyRack(id, name)] },
      },
    }));
    return id;
  },

  dcConnectUplink: (rackId, deviceId) => {
    const infra = get().infra;
    const rack = rackById(infra.datacenter, deviceId ? rackId : rackId);
    if (!rack) return null;
    if (uplinkBlocker(rack, deviceId)) return null;

    const device = rack.devices.find((d) => d.id === deviceId)!;
    const tor = torSwitch(rack)!;
    const port = freeTorPorts(rack)[0];

    // The uplink consumes a patch lead like any other cable.
    const patchStock = infra.inventory.items.find((i) => i.id === "sku-rj45-3m");
    if (!patchStock || availableOf(patchStock) < 1) return null;

    // Already bound? Then this is a re-patch, not a provision.
    let node = device.nodeId ? infra.nodes[device.nodeId] : undefined;
    let nodes = infra.nodes;
    let gateway = infra.gateway;

    if (!node) {
      const taken = new Set(Object.values(infra.nodes).map((n) => n.connection.ip));
      const subnet = infra.subnets.find((sn) => sn.label.startsWith("Core")) ?? infra.subnets[0];
      const ip = nextFreeIp(taken, subnet.cidr);
      node = provisionNode(device, rack, infra.org, ip);
      nodes = { ...nodes, [node.nodeId]: node };
      gateway = [
        ...gateway,
        { nodeId: node.nodeId, label: node.displayName, protocol: node.connection.protocol, ip, reachable: true },
      ];
    }

    const bound = node;
    set((st) => {
      const live = rackById(st.infra.datacenter, rackId);
      if (!live) return st;
      const settled = settleRack(
        {
          ...live,
          devices: live.devices.map((d) => (d.id === deviceId ? { ...d, nodeId: bound.nodeId } : d)),
          cables: [
            ...live.cables,
            {
              id: `cb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              kind: "patch" as const,
              fromDeviceId: deviceId,
              fromPort: "eth0",
              toDeviceId: tor.id,
              toPort: port,
            },
          ],
        },
        {
          ...st.infra.inventory,
          items: st.infra.inventory.items.map((i) =>
            i.id === "sku-rj45-3m" ? { ...i, spare: Math.max(0, i.spare - 1), deployed: i.deployed + 1 } : i,
          ),
        },
        live,
        nodeView(st.infra),
      );
      return { infra: foldRack({ ...st.infra, nodes, gateway }, settled) };
    });
    return bound.nodeId;
  },

  dcDisconnectUplink: (rackId, deviceId) =>
    set((s) => {
      const rack = rackById(s.infra.datacenter, rackId);
      if (!rack) return s;
      const cable = uplinkCable(rack, deviceId);
      if (!cable) return s;
      const device = rack.devices.find((d) => d.id === deviceId);

      // Pulling the uplink does NOT delete the server — the box and its data
      // are still there. It drops off the network, which is exactly the state
      // the "no port, no network" incident describes.
      let nodes = s.infra.nodes;
      if (device?.nodeId && nodes[device.nodeId]) {
        const n = nodes[device.nodeId];
        nodes = {
          ...nodes,
          [device.nodeId]: {
            ...n,
            connection: { ...n.connection, reachable: false, authenticated: false },
            health: { ...n.health, status: "offline" },
          } as typeof n,
        };
      }
      const settled = settleRack(
        { ...rack, cables: rack.cables.filter((c) => c.id !== cable.id) },
        {
          ...s.infra.inventory,
          items: s.infra.inventory.items.map((i) =>
            i.id === "sku-rj45-3m" ? { ...i, spare: i.spare + 1, deployed: Math.max(0, i.deployed - 1) } : i,
          ),
        },
        rack,
        nodeView(s.infra),
      );
      return { infra: foldRack({ ...s.infra, nodes }, settled) };
    }),

  dcFitPart: (rackId, deviceId, skuId) => {
    const infra = get().infra;
    const rack = rackById(infra.datacenter, rackId);
    const device = rack?.devices.find((d) => d.id === deviceId);
    if (!rack || !device) return "That chassis is not in this rack.";
    if (device.kind !== "server") return "Only servers take internal parts.";

    const part = infra.inventory.items.find((i) => i.id === skuId);
    if (!part || availableOf(part) < 1) return `No ${part?.name ?? "part"} on the shelf. Order one from Procurement.`;

    const node = device.nodeId ? infra.nodes[device.nodeId] : undefined;
    // THE MAINTENANCE CONTRACT. You cannot open a live chassis. This is the
    // rule that makes migration matter — without it every upgrade is free.
    if (node) {
      if (node.connection.online) return "The host is still running. Power it down before opening the chassis.";
      if (!node.maintenance?.mode) return "Declare a change window first — put the host into Maintenance Mode.";
    }

    const hw = device.hardware ?? baseHardwareFor(device.assetItemId);
    const traits = part.traits ?? {};
    const next: ServerHardware = { ...hw };

    if (part.category === "memory") {
      if (traits.memoryType && traits.memoryType !== hw.ramType) {
        return `This board takes ${hw.ramType}; that module is ${traits.memoryType}. The slots are keyed differently.`;
      }
      if (hw.dimmsUsed >= hw.dimmSlots) return "Every DIMM slot is populated. Pull a smaller module first.";
      next.ramGb = hw.ramGb + (traits.capacityGb ?? 0);
      next.dimmsUsed = hw.dimmsUsed + 1;
    } else if (part.category === "storage") {
      next.storageGb = hw.storageGb + (traits.capacityGb ?? 0);
    } else {
      return "That part does not go inside a server chassis.";
    }

    set((s) => ({
      infra: {
        ...s.infra,
        inventory: {
          ...s.infra.inventory,
          items: s.infra.inventory.items.map((i) =>
            i.id === skuId ? { ...i, spare: Math.max(0, i.spare - 1), deployed: i.deployed + 1 } : i,
          ),
        },
        datacenter: {
          ...s.infra.datacenter,
          racks: s.infra.datacenter.racks.map((r) =>
            r.id !== rackId
              ? r
              : { ...r, devices: r.devices.map((d) => (d.id === deviceId ? { ...d, hardware: next } : d)) },
          ),
        },
      },
    }));
    return null;
  },

  // ── Change control ───────────────────────────────────────────────────────

  setMaintenanceMode: (nodeId, on) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      return {
        infra: {
          ...s.infra,
          nodes: {
            ...s.infra.nodes,
            [nodeId]: {
              ...node,
              maintenance: {
                mode: on,
                drainedAt: on && node.workloads.length === 0 ? Date.now() : null,
              },
            } as typeof node,
          },
        },
      };
    }),

  migrateWorkloads: (fromNodeId, toNodeId, workloadIds) => {
    const infra = get().infra;
    const from = infra.nodes[fromNodeId];
    const to = infra.nodes[toNodeId];
    if (!from || !to) return "Unknown host.";
    if (fromNodeId === toNodeId) return "That is the same host.";

    const moving = workloadIds
      ? from.workloads.filter((w) => workloadIds.includes(w.id))
      : from.workloads;
    if (moving.length === 0) return "Nothing to migrate — the source is already drained.";

    const at = locationOf(infra.datacenter, toNodeId);
    if (!at) return `${to.hostname} is not racked, so it cannot take a workload.`;

    const blocker = migrationBlocker(
      {
        device: at.device,
        rack: at.rack,
        workloads: to.workloads,
        online: to.connection.online,
        inMaintenance: !!to.maintenance?.mode,
      },
      moving,
      nodeView(infra),
    );
    if (blocker) return blocker;

    const movingIds = new Set(moving.map((w) => w.id));
    set((s) => ({
      infra: {
        ...s.infra,
        nodes: {
          ...s.infra.nodes,
          [fromNodeId]: {
            ...s.infra.nodes[fromNodeId],
            workloads: s.infra.nodes[fromNodeId].workloads.filter((w) => !movingIds.has(w.id)),
            // Draining a host inside a change window stamps the moment it
            // became safe to touch — the Server Manager shows it as the
            // green light for pulling power.
            maintenance: s.infra.nodes[fromNodeId].maintenance
              ? {
                  mode: s.infra.nodes[fromNodeId].maintenance!.mode,
                  drainedAt:
                    s.infra.nodes[fromNodeId].workloads.filter((w) => !movingIds.has(w.id)).length === 0
                      ? Date.now()
                      : null,
                }
              : undefined,
          } as TargetNode,
          [toNodeId]: {
            ...s.infra.nodes[toNodeId],
            workloads: [...s.infra.nodes[toNodeId].workloads, ...moving],
          } as TargetNode,
        },
      },
    }));
    return null;
  },

  setNodePower: (nodeId, on) => {
    const infra = get().infra;
    const node = infra.nodes[nodeId];
    if (!node) return "Unknown host.";
    if (node.connection.online === on) return null;

    // Powering ON is always allowed. Powering OFF is the dangerous half.
    let unplanned = false;
    if (!on) {
      const blocker = shutdownBlocker(node);
      if (blocker) {
        // The operator is allowed to do it anyway — an engineer CAN yank a
        // live box. The simulation just records that they did, and the
        // reconciler turns that into the outage it really is.
        unplanned = true;
      }
    }

    set((s) => {
      const n = s.infra.nodes[nodeId];
      return {
        infra: {
          ...s.infra,
          nodes: {
            ...s.infra.nodes,
            [nodeId]: {
              ...n,
              connection: { ...n.connection, online: on, authenticated: on && n.connection.authenticated },
              health: { ...n.health, status: on ? "healthy" : "offline" },
              // Workloads on a host that is yanked do not survive it.
              workloads: on ? n.workloads : unplanned ? [] : n.workloads,
            } as TargetNode,
          },
          security: unplanned
            ? {
                ...s.infra.security,
                unplannedOutages: [
                  ...s.infra.security.unplannedOutages,
                  { nodeId, hostname: n.hostname, at: Date.now(), workloadCount: n.workloads.length },
                ],
              }
            : s.infra.security,
        },
      };
    });
    return unplanned ? shutdownBlocker(node) : null;
  },

  rackUpdateSwitch: (rackId, deviceId, patch) =>
    set((s) => ({
      infra: {
        ...s.infra,
        datacenter: {
          ...s.infra.datacenter,
          racks: s.infra.datacenter.racks.map((r) =>
            r.id !== rackId
              ? r
              : {
                  ...r,
                  devices: r.devices.map((d) =>
                    d.id === deviceId && d.switchConfig ? { ...d, switchConfig: { ...d.switchConfig, ...patch } } : d,
                  ),
                },
          ),
        },
      },
    })),

  placeOrder: ({ itemId, qty, method, paid }) =>
    set((st) => {
      const inv = st.infra.inventory;
      const item = inv.items.find((i) => i.id === itemId);
      if (!item) return st;
      const wait = shippingOption(method).ticketsToWait;

      // Express is not an order at all — it is a counter sale.
      if (wait === 0) {
        return {
          infra: {
            ...st.infra,
            inventory: {
              ...inv,
              items: inv.items.map((i) => (i.id === itemId ? { ...i, spare: i.spare + qty } : i)),
            },
          },
        };
      }

      return {
        infra: {
          ...st.infra,
          inventory: {
            ...inv,
            items: inv.items.map((i) =>
              i.id === itemId ? { ...i, inTransit: i.inTransit + qty } : i,
            ),
            orders: [
              {
                id: `po-${Date.now()}-${Math.floor(Math.random() * 999)}`,
                itemId,
                itemName: item.name,
                qty,
                method,
                paid,
                placedAt: Date.now(),
                ticketsRemaining: wait,
              },
              ...inv.orders,
            ],
          },
        },
      };
    }),

  advanceDeliveries: () => {
    const inv = get().infra.inventory;
    if (inv.orders.length === 0) return [];

    const ticked = inv.orders.map((o) => ({ ...o, ticketsRemaining: o.ticketsRemaining - 1 }));
    const arrived = ticked.filter((o) => o.ticketsRemaining <= 0);
    if (arrived.length === 0) {
      set((st) => ({ infra: { ...st.infra, inventory: { ...st.infra.inventory, orders: ticked } } }));
      return [];
    }

    set((st) => ({
      infra: {
        ...st.infra,
        inventory: {
          ...st.infra.inventory,
          items: st.infra.inventory.items.map((i) => {
            const qty = arrived.filter((o) => o.itemId === i.id).reduce((t, o) => t + o.qty, 0);
            return qty ? { ...i, inTransit: Math.max(0, i.inTransit - qty), spare: i.spare + qty } : i;
          }),
          orders: ticked.filter((o) => o.ticketsRemaining > 0),
        },
      },
    }));
    return arrived.map((o) => `${o.qty}× ${o.itemName}`);
  },

  markFaulty: (skuId, qty = 1) =>
    set((st) => ({
      infra: {
        ...st.infra,
        inventory: {
          ...st.infra.inventory,
          items: st.infra.inventory.items.map((i) =>
            i.id === skuId ? { ...i, faulty: i.faulty + qty } : i,
          ),
        },
      },
    })),

  consumePart: (skuId, qty = 1) => {
    const item = get().infra.inventory.items.find((i) => i.id === skuId);
    if (!item || availableOf(item) < qty) return false;
    // Fitted parts leave the shelf for good: count them as deployed rather
    // than shrinking `total`, so the asset register still reflects what the
    // company owns and where it went.
    set((st) => ({
      infra: {
        ...st.infra,
        inventory: {
          ...st.infra.inventory,
          items: st.infra.inventory.items.map((i) =>
            i.id === skuId ? { ...i, spare: i.spare - qty, deployed: i.deployed + qty } : i,
          ),
        },
      },
    }));
    return true;
  },

  rackUpdateServer: (rackId, deviceId, patch) =>
    set((s) => ({
      infra: {
        ...s.infra,
        datacenter: {
          ...s.infra.datacenter,
          racks: s.infra.datacenter.racks.map((r) =>
            r.id !== rackId
              ? r
              : {
                  ...r,
                  devices: r.devices.map((d) =>
                    d.id === deviceId && d.serverConfig ? { ...d, serverConfig: { ...d.serverConfig, ...patch } } : d,
                  ),
                },
          ),
        },
      },
    })),

  rackRunPing: (rackId, fromId, toId) => {
    const rack = rackById(get().infra.datacenter, rackId);
    if (!rack) {
      return { id: `t-${Date.now()}`, at: Date.now(), fromName: fromId, toName: toId, ok: false, detail: "That rack is not on the floor." };
    }
    const a = rack.devices.find((d) => d.id === fromId);
    const b = rack.devices.find((d) => d.id === toId);
    const res = pingCheck(rack, fromId, toId);
    const entry: NetworkTestResult = {
      id: `t-${Date.now()}`,
      at: Date.now(),
      fromName: a?.name ?? fromId,
      toName: b?.name ?? toId,
      ok: res.ok,
      detail: res.detail,
    };
    set((s) => ({
      infra: {
        ...s.infra,
        datacenter: {
          ...s.infra.datacenter,
          racks: s.infra.datacenter.racks.map((r) =>
            r.id === rackId ? { ...r, tests: [entry, ...r.tests].slice(0, 25) } : r,
          ),
        },
      },
    }));
    return entry;
  },

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
