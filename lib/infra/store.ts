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
import { availableOf, canMount, pingCheck, sizeSpec, ADMIN_PORTS, PUBLIC_CIDR, CLOUD_AUDIT_CAP } from "@/lib/core";
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

  // ── Rack simulator ──
  /** Mount an inventory asset into the rack at `uStart` (consumes 1 unit). */
  rackMountDevice: (assetItemId: string, uStart: number) => void;
  /** Unmount a device, returning it (and its cables) to stock. */
  rackRemoveDevice: (deviceId: string) => void;
  /** Patch or power a cable between two device ports (consumes a cable). */
  rackConnectCable: (cable: { kind: CableKind; fromDeviceId: string; fromPort: string; toDeviceId: string; toPort: string }) => void;
  rackDisconnectCable: (cableId: string) => void;
  /** Apply switch CLI results (VLAN db + per-interface access VLAN / shutdown). */
  rackUpdateSwitch: (deviceId: string, patch: Partial<SwitchConfig>) => void;
  /** Apply the server config modal (addressing + services). */
  rackUpdateServer: (deviceId: string, patch: Partial<ServerConfig>) => void;
  /** Run the ping tool and record the result. */
  rackRunPing: (fromId: string, toId: string) => NetworkTestResult;
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
      const items = inv.items.map((i) => (i.id === itemId ? { ...i, deployed: i.deployed + qty } : i));
      const alloc = {
        id: `al-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        itemId, itemName: item.name, qty, assignedTo,
        ticketId: ticket?.id, ticketCode: ticket?.code, at: Date.now(),
      };
      return { infra: { ...s.infra, inventory: { items, allocations: [alloc, ...inv.allocations] } } };
    }),

  returnAllocation: (allocationId) =>
    set((s) => {
      const inv = s.infra.inventory;
      const alloc = inv.allocations.find((a) => a.id === allocationId);
      if (!alloc) return s;
      const items = inv.items.map((i) =>
        i.id === alloc.itemId ? { ...i, deployed: Math.max(0, i.deployed - alloc.qty) } : i,
      );
      return {
        infra: {
          ...s.infra,
          inventory: { items, allocations: inv.allocations.filter((a) => a.id !== allocationId) },
        },
      };
    }),

  setAssetRepair: (itemId, qty) =>
    set((s) => {
      const inv = s.infra.inventory;
      const item = inv.items.find((i) => i.id === itemId);
      if (!item) return s;
      const next = Math.max(0, Math.min(qty, item.total - item.deployed));
      return {
        infra: {
          ...s.infra,
          inventory: { ...inv, items: inv.items.map((i) => (i.id === itemId ? { ...i, inRepair: next } : i)) },
        },
      };
    }),

  // ── Rack simulator ─────────────────────────────────────────────────────────

  rackMountDevice: (assetItemId, uStart) =>
    set((s) => {
      const inv = s.infra.inventory;
      const rack = s.infra.rack;
      const item = inv.items.find((i) => i.id === assetItemId);
      if (!item || !item.deviceKind || availableOf(item) < 1) return s;
      const uSize = item.uSize ?? 1;
      if (!canMount(rack, uStart, uSize)) return s;

      const seq = rack.devices.filter((d) => d.kind === item.deviceKind).length + 1;
      const shortName = (k: string) => ({ server: "SRV", switch: "SW", router: "RTR", firewall: "FW", "patch-panel": "PP", ups: "UPS", pdu: "PDU" }[k] ?? "DEV");
      const name = `${shortName(item.deviceKind)}-${String(seq).padStart(2, "0")}`;

      const device: RackDevice = {
        id: `rd-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        kind: item.deviceKind,
        name,
        assetItemId,
        uStart,
        uSize,
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

      return {
        infra: {
          ...s.infra,
          inventory: { ...inv, items: inv.items.map((i) => (i.id === assetItemId ? { ...i, deployed: i.deployed + 1 } : i)) },
          rack: { ...rack, devices: [...rack.devices, device] },
        },
      };
    }),

  rackRemoveDevice: (deviceId) =>
    set((s) => {
      const rack = s.infra.rack;
      const dev = rack.devices.find((d) => d.id === deviceId);
      if (!dev) return s;
      // Returning a device also reclaims every cable attached to it.
      const freed = rack.cables.filter((c) => c.fromDeviceId === deviceId || c.toDeviceId === deviceId);
      let items = s.infra.inventory.items.map((i) =>
        i.id === dev.assetItemId ? { ...i, deployed: Math.max(0, i.deployed - 1) } : i,
      );
      for (const c of freed) {
        const sku = c.kind === "power" ? "sku-power-c13" : "sku-rj45-3m";
        items = items.map((i) => (i.id === sku ? { ...i, deployed: Math.max(0, i.deployed - 1) } : i));
      }
      return {
        infra: {
          ...s.infra,
          inventory: { ...s.infra.inventory, items },
          rack: {
            ...rack,
            devices: rack.devices.filter((d) => d.id !== deviceId),
            cables: rack.cables.filter((c) => c.fromDeviceId !== deviceId && c.toDeviceId !== deviceId),
          },
        },
      };
    }),

  rackConnectCable: (cable) =>
    set((s) => {
      const rack = s.infra.rack;
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

      return {
        infra: {
          ...s.infra,
          inventory: { ...inv, items: inv.items.map((i) => (i.id === sku ? { ...i, deployed: i.deployed + 1 } : i)) },
          rack: {
            ...rack,
            cables: [...rack.cables, { ...cable, id: `cb-${Date.now()}-${Math.floor(Math.random() * 1000)}` }],
          },
        },
      };
    }),

  rackDisconnectCable: (cableId) =>
    set((s) => {
      const rack = s.infra.rack;
      const cable = rack.cables.find((c) => c.id === cableId);
      if (!cable) return s;
      const sku = cable.kind === "power" ? "sku-power-c13" : "sku-rj45-3m";
      return {
        infra: {
          ...s.infra,
          inventory: {
            ...s.infra.inventory,
            items: s.infra.inventory.items.map((i) =>
              i.id === sku ? { ...i, deployed: Math.max(0, i.deployed - 1) } : i,
            ),
          },
          rack: { ...rack, cables: rack.cables.filter((c) => c.id !== cableId) },
        },
      };
    }),

  rackUpdateSwitch: (deviceId, patch) =>
    set((s) => ({
      infra: {
        ...s.infra,
        rack: {
          ...s.infra.rack,
          devices: s.infra.rack.devices.map((d) =>
            d.id === deviceId && d.switchConfig ? { ...d, switchConfig: { ...d.switchConfig, ...patch } } : d,
          ),
        },
      },
    })),

  rackUpdateServer: (deviceId, patch) =>
    set((s) => ({
      infra: {
        ...s.infra,
        rack: {
          ...s.infra.rack,
          devices: s.infra.rack.devices.map((d) =>
            d.id === deviceId && d.serverConfig ? { ...d, serverConfig: { ...d.serverConfig, ...patch } } : d,
          ),
        },
      },
    })),

  rackRunPing: (fromId, toId) => {
    const rack = get().infra.rack;
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
      infra: { ...s.infra, rack: { ...s.infra.rack, tests: [entry, ...s.infra.rack.tests].slice(0, 25) } },
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
