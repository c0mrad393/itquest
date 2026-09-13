/**
 * ITQuest — Infrastructure store (global multi-node state)
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
  DatacenterState, GrowthPhase, InventoryState, RackNodeMap, RackState, ServerHardware, Workload,
} from "@/lib/core";
import { emptyRack, directoryReach, fileServiceReach } from "@/lib/core";
import type { PolicyKey, PolicyLink, PolicyValue, ShareAccess } from "@/lib/core";
import { DOMAIN_ROOT } from "@/lib/core";
// Build 1: PoE switches and addressing.
import type { IpamState, NetworkFault, PoePort, PoePriority } from "@/lib/core";
import { detectConflicts, isValidIp, portOfNode, switchById } from "@/lib/core";
import type { VideoProfileId } from "@/lib/core";
import { DEFAULT_PROFILE } from "@/lib/core";
import type { BackupSchedule, CascadeKind, RestoreEvent, StorageTierId } from "@/lib/core";
import {
  backupsCompromised,
  capacityOf,
  defaultSizeGb,
  isIsolated,
  restoreAvailability,
} from "@/lib/core";
import { nextFreeIp, nextRackName, provisionNode } from "@/lib/datacenter/seed";
import type { DhcpConfig, DhcpReservation, FirewallRule, IdsState, NatRule, ThreatEvent } from "@/lib/vm/types";
import { EDGE_GATEWAY_ID, buildEdgeGateway, defaultDhcp, defaultIds, deriveGatewayIp } from "@/lib/network/edge";
import { buildBenchNode } from "@/lib/hardware/commission";

/** What the bench hands over when a freshly imaged machine is commissioned. */
type BenchBuildInput = {
  machine: "desktop" | "laptop" | "server";
  cpuModel: string;
  ramGb: number;
  diskGb: number;
};
import type { ShippingMethod } from "@/lib/core";
import type { AetherVNode, AuditEvent, ShieldRule, VNodeSize, VNodeStatus } from "@/lib/core";
import type { CommandResult, NodeId } from "@/lib/core";
import { generateWorld } from "@/lib/org/generator";
import { freshSeed, mulberry32 } from "@/lib/org/rng";
import { applyGrowth, type GrowthSummary } from "@/lib/org/growth";
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
  /** Reporting line, by samAccountName. */
  manager?: string;
  /** Moves the account into another organizational unit. */
  ou?: string;
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
  // ── Enterprise Directory Services (v0.8.0) ───────────────────────────────
  /**
   * Account lifecycle, addressed by DOMAIN. Each returns null on success or
   * the reason it was refused, including an unreachable directory.
   */
  edsCreateUser: (spec: {
    firstName: string;
    lastName: string;
    department: string;
    title: string;
    manager?: string;
    groups?: string[];
    tempPassword?: string;
  }) => string | null;
  /**
   * DISABLE, not delete. A disabled account keeps its SID, its group
   * membership and its file ownership — which is why it is the right first
   * move for a leaver and deleting is not.
   */
  edsSetEnabled: (sam: string, enabled: boolean) => string | null;
  /** Permanently remove an account. Refused while it is still enabled. */
  edsDeleteUser: (sam: string) => string | null;
  /** Reset a password, optionally forcing a change at next sign-in. */
  edsResetPassword: (sam: string, forceChange: boolean) => string | null;
  /** Clear a lockout and reset the bad-password counter. */
  edsUnlock: (sam: string) => string | null;
  /** Job title, department, manager, and the OU the account lives in. */
  edsSetAttributes: (sam: string, patch: ADUserProfilePatch) => string | null;
  /** Create an organizational unit, optionally nested under another. */
  edsCreateOu: (name: string, parentDn?: string) => string | null;

  // ── Centralized Fleet Policies (v0.8.0) ──────────────────────────────────
  cfpCreatePolicy: (name: string, description?: string) => string | null;
  cfpSetSetting: (policyId: string, key: PolicyKey, value: PolicyValue | undefined) => void;
  /** Link a policy to the domain root or an OU. Re-linking updates the flags. */
  cfpSetLink: (policyId: string, target: string, patch: Partial<Omit<PolicyLink, "target">>) => void;
  cfpUnlink: (policyId: string, target: string) => void;
  cfpSetPolicyEnabled: (policyId: string, enabled: boolean) => void;
  cfpDeletePolicy: (policyId: string) => void;
  /** Stop an OU inheriting policy from its ancestors. */
  cfpSetBlockInheritance: (ouDn: string, blocked: boolean) => void;

  // ── PoE switches and addressing (Build 1) ────────────────────────────────
  //
  // Every one of these writes ONLY the operator's decision — port state, lease
  // mode, the typed address. Watts, shedding and conflicts are derived on read
  // by switchPower() and detectConflicts(), so no action here can leave a total
  // disagreeing with the ports that produced it.

  /** Admin up/down on a port. Down passes neither data nor power. */
  poeSetPortEnabled: (switchId: string, port: number, enabled: boolean) => void;
  /** PoE on/off independently of the data link. */
  poeSetPortPoe: (switchId: string, port: number, on: boolean) => void;
  /** Shedding priority — which ports survive an overload. */
  poeSetPortPriority: (switchId: string, port: number, priority: PoePriority) => void;
  /** Plug a node into a port. Refuses if that node is already on a port. */
  poeAttach: (switchId: string, port: number, nodeId: NodeId) => string | null;
  poeDetach: (switchId: string, port: number) => void;
  poeSetPortLabel: (switchId: string, port: number, label: string) => void;

  /**
   * Switch a node between DHCP and a static address.
   *
   * Returns null on success or the reason it was refused, the same convention
   * the EDS actions use. A BLOCKING conflict is refused outright; a non-blocking
   * one (a static inside the DHCP pool) is allowed through and logged, because
   * it is a legal thing to do that happens to be a bad idea — and refusing it
   * would remove the lesson.
   */
  ipamSetStatic: (nodeId: NodeId, ip: string) => string | null;
  ipamSetDhcp: (nodeId: NodeId) => void;
  /** Mark a logged fault as cleared. The entry stays as history. */
  ipamClearFault: (id: string) => void;

  // ── Video traffic (Build 2) ──────────────────────────────────────────────
  /** Change a camera's video profile. Bitrate DERIVES from this. */
  trafficSetProfile: (nodeId: NodeId, profile: VideoProfileId) => void;
  /** Stop or start recording a camera to the NVR. */
  trafficSetRecording: (nodeId: NodeId, recording: boolean) => void;
  /** Re-size a switch's uplink — the usual real remedy for a saturated link. */
  trafficSetUplink: (switchId: string, mbps: number) => void;

  // ── Dev bench (Build 3) ──────────────────────────────────────────────────
  //
  // These build REAL nodes through the REAL attach path, so a spawned device
  // is indistinguishable from a seeded one. A bench with its own construction
  // code could create devices the game cannot, and the bug that hid would be
  // precisely the one worth finding.
  /** Create a camera and patch it in. Null port takes the next free one. */
  devSpawnCamera: (switchId: string, port: number | null, profile: VideoProfileId) => string | null;
  /** Create a recorder and make it the estate's NVR. */
  devSpawnNvr: () => string | null;

  // ── Backup and recovery (DR build) ───────────────────────────────────────
  /** Set a node's backup schedule. Does NOT run a job — see backupRunNow. */
  backupSetSchedule: (nodeId: NodeId, schedule: BackupSchedule) => void;
  /**
   * Record the purchased tier. The BUDGET is debited by the caller, which owns
   * the money; this owns the estate. Splitting them keeps a failed debit from
   * silently granting storage.
   */
  backupSetTier: (tier: StorageTierId) => void;
  /**
   * Run every scheduled job now. Returns how many succeeded — jobs fail when
   * the tier is missing or too small, exactly as they would in life.
   */
  backupRunNow: () => { ok: number; failed: number };
  /**
   * Restore a node from backup.
   *
   * Returns null on success or the reason it was refused. Attempting a restore
   * with no copy in existence marks the data PERMANENTLY lost — that is the
   * consequence the whole feature exists to teach, and it is why the UI has to
   * warn before the click rather than after.
   */
  backupRestore: (nodeId: NodeId) => string | null;

  // ── Incident response ────────────────────────────────────────────────────
  /** Begin a compromise. Used by the ransomware template's fault injection. */
  incidentStart: (patientZero: NodeId, spreadTo: NodeId[], shareIds: string[]) => void;
  /** Wipe and rebuild a compromised host. Step two of the sequence. */
  incidentWipe: (nodeId: NodeId) => string | null;
  /** Clear a resolved incident once every host is restored. */
  incidentClear: () => void;

  // ── Cascade faults (QA2) ─────────────────────────────────────────────────
  /** Plant a root cause. Used by the cascade templates' fault injection. */
  cascadeStart: (kind: CascadeKind, nodeId: NodeId) => void;
  /**
   * Record that the failed part has been replaced at the bench.
   *
   * A FACT ABOUT WHAT THE OPERATOR DID, not a conclusion — the stage machine
   * combines it with the live estate to decide where they are. Refused while
   * the host is still running, because you do not swap a cooling module on a
   * live server and the refusal is the lesson.
   */
  cascadeReplacePart: (nodeId: NodeId) => string | null;
  /** Free disk by clearing logs — the non-hardware route out of a full volume. */
  cascadeClearLogs: (nodeId: NodeId) => string | null;

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
  /**
   * Change a service's startup type.
   *
   * Deliberately NOT folded into `controlWindowsService`. Start/stop change
   * what is running NOW; startup type changes what runs after a reboot, and
   * the difference is the entire lesson of a "the fix keeps coming back"
   * ticket — a student who only starts a Disabled service has not fixed it.
   */
  setWindowsServiceStartup: (
    nodeId: NodeId,
    service: string,
    startupType: "Automatic" | "AutomaticDelayed" | "Manual" | "Disabled",
  ) => void;
  /**
   * Restart a Windows host: re-applies every service's startup type, the way a
   * real boot does, and resets uptime. The only place startup type has effect.
   */
  rebootNode: (nodeId: NodeId) => void;

  // ── Edge gateway (perimeter firewall) ──
  /**
   * Mint the perimeter gateway if the estate has none, and return its id.
   *
   * A lazy migration rather than a save-version bump: `loadSave` discards on
   * any version mismatch, so bumping would delete every existing company to
   * add one node.
   */
  /**
   * Register a machine built on the hardware bench into the estate.
   *
   * The bridge from HardwareState to VMState. Specs are read off the RIG rather
   * than typed in, so what the operator physically fitted is what the estate
   * believes it has — leave a stick out before imaging and the node genuinely
   * comes up with less memory. Returns the hostname so the bench can name it.
   */
  commissionBenchMachine: (build: BenchBuildInput) => string;
  /**
   * Join a bench-built machine to a domain.
   *
   * Separate from commissioning because it IS separate: setup lays down an OS,
   * and joining is an administrative act performed afterwards, gated on the
   * machine having a working network adapter. Folding the two together would
   * hide the step the provisioning exercise exists to teach.
   */
  joinBenchMachineToDomain: (hostname: string, domain: string) => void;
  ensureEdgeGateway: () => NodeId;
  addFirewallRule: (nodeId: NodeId, rule: FirewallRule) => void;
  updateFirewallRule: (nodeId: NodeId, ruleId: string, patch: Partial<FirewallRule>) => void;
  deleteFirewallRule: (nodeId: NodeId, ruleId: string) => void;
  /**
   * Move a rule within its chain. Order is load-bearing — first match wins —
   * so this is a real firewall control, not a cosmetic sort.
   */
  moveFirewallRule: (nodeId: NodeId, ruleId: string, dir: "up" | "down") => void;

  // ── NAT / DHCP / IDS (appliance state) ──
  addNatRule: (nodeId: NodeId, rule: NatRule) => void;
  updateNatRule: (nodeId: NodeId, ruleId: string, patch: Partial<NatRule>) => void;
  deleteNatRule: (nodeId: NodeId, ruleId: string) => void;
  setDhcpConfig: (nodeId: NodeId, patch: Partial<DhcpConfig>) => void;
  addDhcpReservation: (nodeId: NodeId, res: DhcpReservation) => void;
  deleteDhcpReservation: (nodeId: NodeId, mac: string) => void;
  setIds: (nodeId: NodeId, patch: Partial<Omit<IdsState, "events">>) => void;
  /**
   * The ticket-engine door for the IDS.
   *
   * Events are APPENDED rather than replacing the log, so a scenario that
   * floods the estate can be injected repeatedly and the operator sees a rising
   * tide instead of a log that resets each time.
   */
  pushThreatEvents: (nodeId: NodeId, events: ThreatEvent[]) => void;
  clearThreatEvents: (nodeId: NodeId) => void;
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
  /**
   * Re-establish a mapped drive's session from the client side.
   *
   * Clears the client's own `disconnected` state and lets `resolveDriveStatus`
   * decide again. It is deliberately NOT a "make this work" button: if the
   * share service is down or the server is dark, the drive resolves to
   * disconnected immediately and the operator has learned the fault is not
   * where the symptom is.
   */
  reconnectMappedDrive: (nodeId: NodeId, letter: string) => void;
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
  /**
   * Grow the company to a milestone phase (v0.6.0). ADDITIVE — it hires onto
   * the world that exists rather than regenerating it, so everything the
   * player built survives. Returns what changed, or null when the phase was
   * already applied.
   */
  growCompany: (phase: GrowthPhase) => GrowthSummary | null;
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
  infra: generateWorld(freshSeed(), 1),

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

  // ── Enterprise Directory Services (v0.8.0) ───────────────────────────────

  edsCreateUser: (spec) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Directory unreachable.";
    const dcId = reach.node.nodeId;
    const dc = infra.nodes[dcId];
    if (!dc || dc.os !== "windows" || !dc.activeDirectory) return "That host does not serve the directory.";
    const ad = dc.activeDirectory;

    const first = spec.firstName.trim();
    const last = spec.lastName.trim();
    if (!first || !last) return "A new account needs a first and last name.";
    if (!ad.ous.some((o) => o.name === spec.department)) return `No organizational unit named ${spec.department}.`;

    // Logon names collide constantly in a 450-person directory; suffix rather
    // than refuse, the way a real provisioning script does.
    const stem = `${first[0]}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    const taken = new Set(ad.users.map((u) => u.samAccountName));
    let sam = stem;
    for (let n = 2; taken.has(sam); n++) sam = `${stem}${n}`;

    const ou = ad.ous.find((o) => o.name === spec.department)!.dn;
    const mailDomain = ad.domainDns.replace(".internal", ".com");

    set((st) => {
      const node = st.infra.nodes[dcId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return st;
      const clone = structuredClone(node);
      clone.activeDirectory!.users.push({
        sid: `S-1-5-21-...-${4000 + clone.activeDirectory!.users.length}`,
        samAccountName: sam,
        upn: `${sam}@${ad.domainDns}`,
        displayName: `${first} ${last}`,
        title: spec.title,
        department: spec.department,
        email: `${sam}@${mailDomain}`,
        ou,
        memberOf: ["Domain Users", ...(spec.groups ?? [])],
        manager: spec.manager,
        enabled: true,
        locked: false,
        passwordExpired: false,
        // A provisioned account always forces a change: the administrator
        // knows the temporary password, which is the whole problem with it.
        mustChangePassword: true,
        badPwdCount: 0,
        lastLogon: null,
        passwordExpiresAt: Date.now() + 90 * 86_400_000,
        description: spec.title,
      });
      return withNode(st, dcId, clone);
    });
    return null;
  },

  edsSetEnabled: (sam, enabled) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Directory unreachable.";
    const dcId = reach.node.nodeId;
    set((st) => {
      const node = st.infra.nodes[dcId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return st;
      const clone = structuredClone(node);
      const user = clone.activeDirectory!.users.find((u) => u.samAccountName === sam);
      if (!user) return st;
      user.enabled = enabled;
      if (enabled) { user.locked = false; user.badPwdCount = 0; }
      return withNode(st, dcId, clone);
    });
    return null;
  },

  edsDeleteUser: (sam) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Directory unreachable.";
    const dcId = reach.node.nodeId;
    const dc = infra.nodes[dcId];
    const user = dc?.os === "windows" ? dc.activeDirectory?.users.find((u) => u.samAccountName === sam) : undefined;
    if (!user) return `No account named ${sam}.`;
    // The lesson, enforced: deletion destroys the SID, and with it every file
    // permission and mailbox grant that pointed at it. Disable first.
    if (user.enabled) {
      return "Disable the account first. Deleting an enabled account destroys its SID, and every permission granted to it goes with it.";
    }
    if (infra.nodes[dcId]?.os === "windows") {
      set((st) => {
        const node = st.infra.nodes[dcId];
        if (!node || node.os !== "windows" || !node.activeDirectory) return st;
        const clone = structuredClone(node);
        const ad = clone.activeDirectory!;
        ad.users = ad.users.filter((u) => u.samAccountName !== sam);
        for (const g of ad.groups) g.members = g.members.filter((m) => m !== sam);
        for (const u of ad.users) if (u.manager === sam) delete u.manager;
        return withNode(st, dcId, clone);
      });
    }
    return null;
  },

  edsResetPassword: (sam, forceChange) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Directory unreachable.";
    const dcId = reach.node.nodeId;
    set((st) => {
      const node = st.infra.nodes[dcId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return st;
      const clone = structuredClone(node);
      const user = clone.activeDirectory!.users.find((u) => u.samAccountName === sam);
      if (!user) return st;
      user.passwordExpired = false;
      user.mustChangePassword = forceChange;
      user.badPwdCount = 0;
      user.locked = false;
      user.passwordExpiresAt = Date.now() + 90 * 86_400_000;
      return withNode(st, dcId, clone);
    });
    return null;
  },

  edsUnlock: (sam) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Directory unreachable.";
    const dcId = reach.node.nodeId;
    set((st) => {
      const node = st.infra.nodes[dcId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return st;
      const clone = structuredClone(node);
      const user = clone.activeDirectory!.users.find((u) => u.samAccountName === sam);
      if (!user) return st;
      user.locked = false;
      user.badPwdCount = 0;
      return withNode(st, dcId, clone);
    });
    return null;
  },

  edsSetAttributes: (sam, patch) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Directory unreachable.";
    const dcId = reach.node.nodeId;
    const dc = infra.nodes[dcId];
    const ad = dc?.os === "windows" ? dc.activeDirectory : undefined;
    if (!ad) return "That host does not serve the directory.";
    if (patch.manager && !ad.users.some((u) => u.samAccountName === patch.manager)) {
      return `No account named ${patch.manager} to set as manager.`;
    }
    if (patch.manager === sam) return "An account cannot be its own manager.";

    set((st) => {
      const node = st.infra.nodes[dcId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return st;
      const clone = structuredClone(node);
      const user = clone.activeDirectory!.users.find((u) => u.samAccountName === sam);
      if (!user) return st;
      if (patch.title !== undefined) user.title = patch.title;
      if (patch.description !== undefined) user.description = patch.description;
      if (patch.manager !== undefined) user.manager = patch.manager || undefined;
      if (patch.ou !== undefined) user.ou = patch.ou;
      if (patch.department !== undefined) {
        user.department = patch.department;
        // Moving department moves the account: an OU that disagrees with the
        // department is how policy stops applying to somebody.
        const target = clone.activeDirectory!.ous.find((o) => o.name === patch.department);
        if (target && patch.ou === undefined) user.ou = target.dn;
      }
      return withNode(st, dcId, clone);
    });
    return null;
  },

  edsCreateOu: (name, parentDn) => {
    const infra = get().infra;
    const reach = directoryReach(infra);
    if (!reach.reachable || !reach.node) return reach.reason ?? "Directory unreachable.";
    const dcId = reach.node.nodeId;
    const dc = infra.nodes[dcId];
    const ad = dc?.os === "windows" ? dc.activeDirectory : undefined;
    if (!ad) return "That host does not serve the directory.";
    const clean = name.trim();
    if (!clean) return "An organizational unit needs a name.";
    if (ad.ous.some((o) => o.name.toLowerCase() === clean.toLowerCase())) return `${clean} already exists.`;

    const root = ad.domainDns.split(".").map((p) => `DC=${p}`).join(",");
    const dn = parentDn ? `OU=${clean},${parentDn}` : `OU=${clean},${root}`;
    set((st) => {
      const node = st.infra.nodes[dcId];
      if (!node || node.os !== "windows" || !node.activeDirectory) return st;
      const clone = structuredClone(node);
      clone.activeDirectory!.ous.push({ dn, name: clean, parentDn });
      return withNode(st, dcId, clone);
    });
    return null;
  },

  // ── Centralized Fleet Policies (v0.8.0) ──────────────────────────────────

  cfpCreatePolicy: (name, description) => {
    const clean = name.trim();
    if (!clean) return "A Fleet Policy needs a name.";
    if (get().infra.policy.policies.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      return `${clean} already exists.`;
    }
    set((s) => ({
      infra: {
        ...s.infra,
        policy: {
          ...s.infra.policy,
          policies: [
            ...s.infra.policy.policies,
            {
              id: `cfp-${Date.now().toString(36)}`,
              name: clean,
              description: description ?? "",
              enabled: true,
              settings: {},
              links: [],
              updatedAt: Date.now(),
            },
          ],
        },
      },
    }));
    return null;
  },

  cfpSetSetting: (policyId, key, value) =>
    set((s) => ({
      infra: {
        ...s.infra,
        policy: {
          ...s.infra.policy,
          policies: s.infra.policy.policies.map((p) => {
            if (p.id !== policyId) return p;
            const settings = { ...p.settings };
            if (value === undefined) delete settings[key];
            else settings[key] = value;
            return { ...p, settings, updatedAt: Date.now() };
          }),
        },
      },
    })),

  cfpSetLink: (policyId, target, patch) =>
    set((s) => ({
      infra: {
        ...s.infra,
        policy: {
          ...s.infra.policy,
          policies: s.infra.policy.policies.map((p) => {
            if (p.id !== policyId) return p;
            const existing = p.links.find((l) => l.target === target);
            const links = existing
              ? p.links.map((l) => (l.target === target ? { ...l, ...patch } : l))
              : [...p.links, { target, enforced: false, enabled: true, ...patch }];
            return { ...p, links, updatedAt: Date.now() };
          }),
        },
      },
    })),

  cfpUnlink: (policyId, target) =>
    set((s) => ({
      infra: {
        ...s.infra,
        policy: {
          ...s.infra.policy,
          policies: s.infra.policy.policies.map((p) =>
            p.id === policyId
              ? { ...p, links: p.links.filter((l) => l.target !== target), updatedAt: Date.now() }
              : p,
          ),
        },
      },
    })),

  cfpSetPolicyEnabled: (policyId, enabled) =>
    set((s) => ({
      infra: {
        ...s.infra,
        policy: {
          ...s.infra.policy,
          policies: s.infra.policy.policies.map((p) =>
            p.id === policyId ? { ...p, enabled, updatedAt: Date.now() } : p,
          ),
        },
      },
    })),

  cfpDeletePolicy: (policyId) =>
    set((s) => ({
      infra: {
        ...s.infra,
        policy: { ...s.infra.policy, policies: s.infra.policy.policies.filter((p) => p.id !== policyId) },
      },
    })),

  cfpSetBlockInheritance: (ouDn, blocked) =>
    set((s) => ({
      infra: {
        ...s.infra,
        policy: {
          ...s.infra.policy,
          blockedOus: blocked
            ? [...new Set([...s.infra.policy.blockedOus, ouDn])]
            : s.infra.policy.blockedOus.filter((d) => d !== ouDn),
        },
      },
    })),

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

  setWindowsServiceStartup: (nodeId, service, startupType) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows") return s;
      const clone = structuredClone(node);
      // Keyed by service name, exactly as `controlWindowsService` reads it —
      // `services` is a Record, not a list.
      const svc: WindowsService | undefined = clone.services[service];
      if (!svc) return s;
      svc.startupType = startupType;
      // Disabling a RUNNING service does not stop it — Windows applies the
      // change at next start. Modelling that keeps the two levers distinct
      // instead of quietly making one imply the other.
      return withNode(s, nodeId, clone);
    }),

  /**
   * Restart the server, applying startup types the way a real boot does.
   *
   * This is what makes `setWindowsServiceStartup` mean something. Start/stop
   * changes what runs now; startup type only takes effect HERE. A service the
   * operator started by hand but left on Manual comes back stopped, which is
   * the entire lesson of a "the fix keeps coming back" ticket — and it cannot
   * be taught if nothing ever re-reads the startup type.
   */
  rebootNode: (nodeId) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node || node.os !== "windows") return s;
      const clone = structuredClone(node);
      for (const svc of Object.values(clone.services)) {
        // Automatic (and delayed) start at boot; Manual and Disabled do not.
        // Manual is the subtle one: it means "startable", not "started".
        const autoStarts = svc.startupType === "Automatic" || svc.startupType === "AutomaticDelayed";
        svc.status = autoStarts ? "Running" : "Stopped";
        svc.pid = autoStarts ? (svc.pid ?? Math.floor(1000 + Math.random() * 6000)) : null;
      }
      // Uptime restarts with the machine. Left alone it would claim months of
      // continuous service on a box that just rebooted.
      clone.health = { ...clone.health, uptimeSeconds: 0 };
      return withNode(s, nodeId, clone);
    }),

  joinBenchMachineToDomain: (hostname, domain) =>
    set((s) => {
      const entry = Object.entries(s.infra.nodes).find(([, n]) => n.hostname === hostname);
      if (!entry) return s;
      const [nodeId, node] = entry;
      const clone = structuredClone(node);
      clone.domain = domain;
      // The DC is the resolver for its own domain, so a joined machine points
      // at it — a member that still resolves via the ISP would not find the DC.
      const dc = Object.values(s.infra.nodes).find((n) => n.domain === domain && n.os === "windows");
      if (dc?.connection.ip) clone.network.dnsServers = [dc.connection.ip];
      return withNode(s, nodeId, clone);
    }),

  commissionBenchMachine: (build: BenchBuildInput) => {
    const nodes = get().infra.nodes;
    const gwIp = deriveGatewayIp(nodes);
    const base = gwIp.replace(/\.\d+$/, "");
    /*
     * Take the first address not already held. The bench does not get to invent
     * an address that collides — a freshly imaged machine appearing on top of a
     * live host is a fault, not a commissioning step.
     */
    const taken = new Set(
      Object.values(nodes).flatMap((n) => (n.network?.interfaces ?? []).map((i) => i.ipv4)),
    );
    let host = 60;
    while (taken.has(`${base}.${host}`) && host < 250) host++;
    const ip = `${base}.${host}`;

    const sample = Object.values(nodes).find((n) => /^[A-Z]{3,5}-/.test(n.hostname));
    const prefix = sample?.hostname.split("-")[0] ?? "NEW";
    const seq = Object.keys(nodes).length + 1;
    const hostname =
      build.machine === "server" ? `${prefix}-SRV-${seq}` : `${prefix}-WS-${seq}`;
    const nodeId = hostname.toLowerCase();

    const node = buildBenchNode({ ...build, nodeId, hostname, ip, gateway: gwIp, domain: sample?.domain });
    /*
     * Record the commissioning on the security slice as well as adding the
     * node. The reconciler watches infra, so this is what lets a build ticket
     * grade the moment the machine appears — without it the operator finishes
     * a workstation and nothing anywhere notices.
     */
    set((s) => ({
      infra: {
        ...s.infra,
        nodes: { ...s.infra.nodes, [nodeId]: node },
        security: {
          ...s.infra.security,
          benchCommissioned: dedupe(s.infra.security.benchCommissioned ?? [], nodeId),
        },
      },
    }));
    return hostname;
  },

  ensureEdgeGateway: () => {
    const existing = get().infra.nodes[EDGE_GATEWAY_ID];
    if (existing) return EDGE_GATEWAY_ID;
    const nodes = get().infra.nodes;
    const gwIp = deriveGatewayIp(nodes);
    // Borrow the estate's own naming prefix so the appliance does not look
    // like it was bolted on from a different company.
    const sample = Object.values(nodes).find((n) => /^[A-Z]{3,5}-/.test(n.hostname));
    const prefix = sample?.hostname.split("-")[0] ?? "EDGE";
    const gw = buildEdgeGateway(gwIp, prefix, sample?.domain);
    set((s) => ({ infra: { ...s.infra, nodes: { ...s.infra.nodes, [EDGE_GATEWAY_ID]: gw } } }));
    return EDGE_GATEWAY_ID;
  },

  addFirewallRule: (nodeId, rule) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      clone.network.firewall = [...clone.network.firewall, rule];
      return withNode(s, nodeId, clone);
    }),

  updateFirewallRule: (nodeId, ruleId, patch) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      clone.network.firewall = clone.network.firewall.map((r) =>
        r.id === ruleId ? { ...r, ...patch } : r,
      );
      return withNode(s, nodeId, clone);
    }),

  deleteFirewallRule: (nodeId, ruleId) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      clone.network.firewall = clone.network.firewall.filter((r) => r.id !== ruleId);
      return withNode(s, nodeId, clone);
    }),

  moveFirewallRule: (nodeId, ruleId, dir) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      const all = clone.network.firewall;
      const rule = all.find((r) => r.id === ruleId);
      if (!rule) return s;
      /*
       * Reorder WITHIN the chain. The list holds every chain's rules together,
       * so swapping raw list neighbours could move a LAN rule past a WAN one —
       * visible as a row that jumps two places, or none.
       */
      const peers = all.filter((r) => r.chain === rule.chain);
      const at = peers.indexOf(rule);
      const to = dir === "up" ? at - 1 : at + 1;
      if (to < 0 || to >= peers.length) return s;
      const reordered = [...peers];
      reordered.splice(at, 1);
      reordered.splice(to, 0, rule);
      // Stitch the reordered chain back into the positions the chain occupied.
      let next = 0;
      clone.network.firewall = all.map((r) =>
        r.chain === rule.chain ? reordered[next++] : r,
      );
      return withNode(s, nodeId, clone);
    }),

  addNatRule: (nodeId, rule) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      clone.network.nat = [...(clone.network.nat ?? []), rule];
      return withNode(s, nodeId, clone);
    }),

  updateNatRule: (nodeId, ruleId, patch) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      clone.network.nat = (clone.network.nat ?? []).map((r) => (r.id === ruleId ? { ...r, ...patch } : r));
      return withNode(s, nodeId, clone);
    }),

  deleteNatRule: (nodeId, ruleId) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      clone.network.nat = (clone.network.nat ?? []).filter((r) => r.id !== ruleId);
      return withNode(s, nodeId, clone);
    }),

  setDhcpConfig: (nodeId, patch) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      const gwIp = clone.network.interfaces.find((i) => i.name === "lan0")?.ipv4 ?? "10.0.0.1";
      // Defaulted rather than skipped: a saved estate predates the DHCP slice,
      // and refusing to configure it would strand those saves permanently.
      clone.network.dhcp = { ...(clone.network.dhcp ?? defaultDhcp(gwIp)), ...patch };
      return withNode(s, nodeId, clone);
    }),

  addDhcpReservation: (nodeId, res) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      const gwIp = clone.network.interfaces.find((i) => i.name === "lan0")?.ipv4 ?? "10.0.0.1";
      const cfg = clone.network.dhcp ?? defaultDhcp(gwIp);
      // One reservation per MAC: re-reserving the same machine REPLACES rather
      // than appends, or the table would show a host pinned to two addresses
      // and the second would silently never apply.
      cfg.reservations = [...cfg.reservations.filter((r) => r.mac !== res.mac), res];
      clone.network.dhcp = cfg;
      return withNode(s, nodeId, clone);
    }),

  deleteDhcpReservation: (nodeId, mac) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node?.network.dhcp) return s;
      const clone = structuredClone(node);
      if (!clone.network.dhcp) return s;
      clone.network.dhcp.reservations = clone.network.dhcp.reservations.filter((r) => r.mac !== mac);
      return withNode(s, nodeId, clone);
    }),

  setIds: (nodeId, patch) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      clone.network.ids = { ...(clone.network.ids ?? defaultIds()), ...patch };
      return withNode(s, nodeId, clone);
    }),

  pushThreatEvents: (nodeId, events) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node) return s;
      const clone = structuredClone(node);
      const ids = clone.network.ids ?? defaultIds();
      /*
       * A disabled engine records NOTHING.
       *
       * Storing events while the engine is off would put them in state that no
       * screen will show — the dashboard correctly reports "nothing is being
       * recorded" — and a fault the operator cannot see is not a scenario, it
       * is a bug. An attack against an estate with the IDS off is invisible,
       * which is precisely why leaving it off is a mistake worth teaching.
       */
      if (!ids.enabled) return s;
      // Newest first, capped. An uncapped log grows without bound across a long
      // session and is the kind of thing that quietly makes a save enormous.
      ids.events = [...events, ...ids.events].slice(0, 200);
      clone.network.ids = ids;
      return withNode(s, nodeId, clone);
    }),

  clearThreatEvents: (nodeId) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      if (!node?.network.ids) return s;
      const clone = structuredClone(node);
      if (!clone.network.ids) return s;
      clone.network.ids.events = [];
      return withNode(s, nodeId, clone);
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

  reconnectMappedDrive: (nodeId, letter) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      // Only endpoints carry mapped drives; a Linux host has no such concept,
      // and narrowing here keeps the store honest about that rather than
      // widening the type to make one action compile.
      if (!node || node.os === "linux" || !node.mappedDrives) return s;
      return withNode(s, nodeId, {
        ...node,
        mappedDrives: node.mappedDrives.map((d) =>
          d.letter === letter ? { ...d, status: "connected" } : d,
        ),
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

  growCompany: (phase) => {
    const draft = structuredClone(get().infra);
    const summary = applyGrowth(draft, phase, mulberry32((draft.org.seed ^ (phase * 7919)) >>> 0));
    if (!summary) return null;
    set({ infra: draft });
    return summary;
  },

  setInfra: (infra) => set({ infra }),

  // ── PoE switches (Build 1) ───────────────────────────────────────────────

  poeSetPortEnabled: (switchId, port, enabled) =>
    set((s) => ({ infra: mutatePort(s.infra, switchId, port, (p) => ({ ...p, enabled })) })),

  poeSetPortPoe: (switchId, port, on) =>
    set((s) => ({ infra: mutatePort(s.infra, switchId, port, (p) => ({ ...p, poeEnabled: on })) })),

  poeSetPortPriority: (switchId, port, priority) =>
    set((s) => ({ infra: mutatePort(s.infra, switchId, port, (p) => ({ ...p, priority })) })),

  poeSetPortLabel: (switchId, port, label) =>
    set((s) => ({ infra: mutatePort(s.infra, switchId, port, (p) => ({ ...p, label })) })),

  poeAttach: (switchId, port, nodeId) => {
    const infra = get().infra;
    if (!infra.nodes[nodeId]) return "No such device in this estate.";
    // A device is in one place at a time. Silently moving it would leave the
    // old port showing a node that is not there — the exact drift the single
    // port-to-node join exists to prevent.
    const existing = portOfNode(infra.poe, nodeId);
    if (existing && !(existing.sw.id === switchId && existing.port.n === port)) {
      return `${infra.nodes[nodeId].hostname} is already patched into ${existing.sw.name} port ${existing.port.n}.`;
    }
    const sw = switchById(infra.poe, switchId);
    const target = sw?.ports.find((p) => p.n === port);
    if (!sw || !target) return "No such port on that switch.";
    if (target.attachedNodeId && target.attachedNodeId !== nodeId) {
      return `Port ${port} already has ${infra.nodes[target.attachedNodeId]?.hostname ?? "a device"} in it.`;
    }
    set((st) => ({
      infra: mutatePort(st.infra, switchId, port, (p) => ({ ...p, attachedNodeId: nodeId })),
    }));
    return null;
  },

  poeDetach: (switchId, port) =>
    set((s) => ({
      infra: mutatePort(s.infra, switchId, port, (p) => {
        const next = { ...p };
        delete next.attachedNodeId;
        delete next.label;
        return next;
      }),
    })),

  // ── Addressing (Build 1) ─────────────────────────────────────────────────

  ipamSetStatic: (nodeId, ip) => {
    const infra = get().infra;
    const node = infra.nodes[nodeId];
    if (!node) return "No such device in this estate.";
    const trimmed = ip.trim();
    if (!isValidIp(trimmed)) return `${trimmed || "That"} is not a valid IPv4 address.`;

    /*
     * Check against the estate as it WOULD BE, not as it is. Detecting on the
     * current state would let a duplicate through: the address is not in use
     * until the lease exists, so the conflict only becomes visible after the
     * write that causes it. Building the candidate lease table first is what
     * turns this from an after-the-fact alert into a refusal.
     */
    const candidate: IpamState = {
      ...infra.ipam,
      leases: {
        ...infra.ipam.leases,
        [nodeId]: { nodeId, mode: "static", staticIp: trimmed, updatedAt: Date.now() },
      },
    };
    const conflicts = detectConflicts({
      nodes: infra.nodes,
      subnets: infra.subnets,
      ipam: candidate,
    }).filter((c) => c.nodeId === nodeId);

    const blocking = conflicts.find((c) => c.blocking);
    if (blocking) {
      // Refused, and logged anyway. The operator's attempt is itself the
      // interesting event — a ticket asking "why did this fail" wants the
      // record, not just the toast that has already gone.
      set((st) => ({
        infra: {
          ...st.infra,
          ipam: {
            ...st.infra.ipam,
            faults: [
              logFault({
                kind:
                  blocking.kind === "duplicate"
                    ? "ip-conflict"
                    : blocking.kind === "reserved"
                      ? "reserved-address"
                      : "out-of-subnet",
                nodeId,
                detail: blocking.detail,
              }),
              ...st.infra.ipam.faults,
            ].slice(0, 60),
          },
        },
      }));
      return `IP conflict detected. ${blocking.detail} ${blocking.remedy}`;
    }

    set((st) => {
      const warn = conflicts.find((c) => !c.blocking);
      return {
        infra: {
          ...st.infra,
          ipam: {
            ...candidate,
            faults: warn
              ? [
                  logFault({ kind: "dhcp-pool-overlap", nodeId, detail: warn.detail }),
                  ...st.infra.ipam.faults,
                ].slice(0, 60)
              : st.infra.ipam.faults,
          },
        },
      };
    });
    return null;
  },

  ipamSetDhcp: (nodeId) =>
    set((s) => ({
      infra: {
        ...s.infra,
        ipam: {
          ...s.infra.ipam,
          leases: {
            ...s.infra.ipam.leases,
            [nodeId]: {
              // The typed address is KEPT. Toggling to DHCP and back should
              // return what the operator had, not a blank field.
              ...s.infra.ipam.leases[nodeId],
              nodeId,
              mode: "dhcp",
              updatedAt: Date.now(),
            },
          },
        },
      },
    })),

  ipamClearFault: (id) =>
    set((s) => ({
      infra: {
        ...s.infra,
        ipam: {
          ...s.infra.ipam,
          faults: s.infra.ipam.faults.map((f) =>
            f.id === id && !f.clearedAt ? { ...f, clearedAt: Date.now() } : f,
          ),
        },
      },
    })),


  // ── Video traffic (Build 2) ──────────────────────────────────────────────

  trafficSetProfile: (nodeId, profile) =>
    set((s) => ({
      infra: {
        ...s.infra,
        traffic: {
          ...s.infra.traffic,
          cameras: {
            ...s.infra.traffic.cameras,
            [nodeId]: {
              nodeId,
              recording: s.infra.traffic.cameras[nodeId]?.recording ?? true,
              profile,
            },
          },
        },
      },
    })),

  trafficSetRecording: (nodeId, recording) =>
    set((s) => ({
      infra: {
        ...s.infra,
        traffic: {
          ...s.infra.traffic,
          cameras: {
            ...s.infra.traffic.cameras,
            [nodeId]: {
              nodeId,
              profile: s.infra.traffic.cameras[nodeId]?.profile ?? DEFAULT_PROFILE,
              recording,
            },
          },
        },
      },
    })),

  trafficSetUplink: (switchId, mbps) =>
    set((s) => ({
      infra: {
        ...s.infra,
        traffic: {
          ...s.infra.traffic,
          uplinkMbps: { ...s.infra.traffic.uplinkMbps, [switchId]: Math.max(10, mbps) },
        },
      },
    })),

  // ── Dev bench (Build 3) ──────────────────────────────────────────────────

  devSpawnCamera: (switchId, port, profile) => {
    const infra = get().infra;
    const sw = infra.poe.switches.find((x) => x.id === switchId);
    if (!sw) return "No such switch.";
    const target = port ?? sw.ports.find((p) => !p.attachedNodeId)?.n;
    if (target == null) return `${sw.name} has no free port.`;

    // Address from the same subnet the switch manages, skipping what is taken —
    // spawning a camera straight into an IP conflict would make the bench a
    // source of noise rather than a way to isolate one variable.
    const existing = new Set(Object.values(infra.nodes).map((n) => n.connection.ip));
    const base = infra.nodes[sw.ports.find((p) => p.attachedNodeId)?.attachedNodeId ?? ""]?.connection.ip
      ?? infra.subnets[0].cidr.replace(/\.0\/24$/, ".2");
    const stem = base.replace(/\.\d+$/, "");
    let host = 30;
    while (existing.has(`${stem}.${host}`) && host < 250) host += 1;
    const ip = `${stem}.${host}`;

    let n = 1;
    while (infra.nodes[`CAM-9${String(n).padStart(2, "0")}`]) n += 1;
    const hostname = `CAM-9${String(n).padStart(2, "0")}`;

    set((st) => ({
      infra: {
        ...st.infra,
        nodes: {
          ...st.infra.nodes,
          [hostname]: devEdgeNode(hostname, "Bench camera", "ip-camera", ip),
        },
        traffic: {
          ...st.infra.traffic,
          cameras: {
            ...st.infra.traffic.cameras,
            [hostname]: { nodeId: hostname, profile, recording: true },
          },
        },
        ipam: {
          ...st.infra.ipam,
          leases: { ...st.infra.ipam.leases, [hostname]: { nodeId: hostname, mode: "dhcp" } },
        },
      },
    }));
    // The REAL attach path, with all its refusals intact.
    return get().poeAttach(switchId, target, hostname);
  },

  devSpawnNvr: () => {
    const infra = get().infra;
    let n = 1;
    while (infra.nodes[`NVR-9${String(n).padStart(2, "0")}`]) n += 1;
    const hostname = `NVR-9${String(n).padStart(2, "0")}`;
    const existing = new Set(Object.values(infra.nodes).map((x) => x.connection.ip));
    const stem = (infra.subnets[0]?.cidr ?? "10.0.0.0/24").replace(/\.0\/24$/, "");
    let host = 60;
    while (existing.has(`${stem}.${host}`) && host < 250) host += 1;

    set((st) => ({
      infra: {
        ...st.infra,
        nodes: {
          ...st.infra.nodes,
          [hostname]: devEdgeNode(hostname, "Bench recorder", "nvr", `${stem}.${host}`),
        },
        traffic: {
          ...st.infra.traffic,
          nvr: { nodeId: hostname, name: hostname, channels: 64, storageTb: 32, retentionDays: 30 },
        },
        ipam: {
          ...st.infra.ipam,
          leases: { ...st.infra.ipam.leases, [hostname]: { nodeId: hostname, mode: "dhcp" } },
        },
      },
    }));
    return null;
  },


  // ── Backup and recovery (DR build) ───────────────────────────────────────

  backupSetSchedule: (nodeId, schedule) =>
    set((s) => {
      const node = s.infra.nodes[nodeId];
      const prev = s.infra.backup.policies[nodeId];
      return {
        infra: {
          ...s.infra,
          backup: {
            ...s.infra.backup,
            policies: {
              ...s.infra.backup.policies,
              [nodeId]: {
                nodeId,
                schedule,
                // A previous successful copy SURVIVES the schedule being
                // switched off and back on — turning a job off does not delete
                // what it already wrote, and clearing this would quietly
                // destroy a restore point with a dropdown.
                lastSuccessAt: prev?.lastSuccessAt ?? null,
                sizeGb: prev?.sizeGb ?? (node ? defaultSizeGb(node) : 400),
              },
            },
          },
        },
      };
    }),

  backupSetTier: (tier) =>
    set((s) => ({ infra: { ...s.infra, backup: { ...s.infra.backup, tier } } })),

  backupRunNow: () => {
    const infra = get().infra;
    const cap = capacityOf(infra);
    const scheduled = Object.values(infra.backup.policies).filter((p) => p.schedule !== "off");

    // The whole run fails when there is nowhere to write or not enough room.
    // Partial success would be kinder and would misrepresent how these jobs
    // actually behave: a full target fails the set, not the tail of it.
    const viable = cap.tier.capacityGb > 0 && !cap.overCapacity;
    if (!viable) return { ok: 0, failed: scheduled.length };

    const now = Date.now();
    set((s) => ({
      infra: {
        ...s.infra,
        backup: {
          ...s.infra.backup,
          policies: Object.fromEntries(
            Object.entries(s.infra.backup.policies).map(([id, p]) => [
              id,
              p.schedule === "off" ? p : { ...p, lastSuccessAt: now },
            ]),
          ),
        },
      },
    }));
    return { ok: scheduled.length, failed: 0 };
  },

  backupRestore: (nodeId) => {
    const infra = get().infra;
    const avail = restoreAvailability(infra, nodeId);

    if (!avail.possible) {
      /*
       * THE DESTRUCTIVE PATH. No copy exists, so this is not a restore that
       * failed — it is the moment the data stops existing. Marked one-way, and
       * logged, because a player has to be able to look back and see that the
       * loss was caused by never having configured the thing rather than by
       * the click that revealed it.
       */
      if (avail.destructive) {
        set((st) => ({
          infra: {
            ...st.infra,
            backup: {
              ...st.infra.backup,
              dataLost: [...new Set([...st.infra.backup.dataLost, nodeId])],
              log: [
                restoreEvent(nodeId, false, avail.reason ?? "No backup existed."),
                ...st.infra.backup.log,
              ].slice(0, 40),
            },
          },
        }));
        return `Data lost. ${avail.reason} Nothing was recoverable.`;
      }
      set((st) => ({
        infra: {
          ...st.infra,
          backup: {
            ...st.infra.backup,
            log: [restoreEvent(nodeId, false, avail.reason ?? "Refused."), ...st.infra.backup.log].slice(0, 40),
          },
        },
      }));
      return avail.reason;
    }

    // The backups themselves are on the same network unless the tier is
    // offsite — which is how most real recoveries fail, and why the expensive
    // tier is the one that earns its price.
    if (backupsCompromised(infra)) {
      set((st) => ({
        infra: {
          ...st.infra,
          backup: {
            ...st.infra.backup,
            dataLost: [...new Set([...st.infra.backup.dataLost, nodeId])],
            log: [
              restoreEvent(nodeId, false, "On-premises backup storage was encrypted by the same incident."),
              ...st.infra.backup.log,
            ].slice(0, 40),
          },
        },
      }));
      return "The backup storage was on the same network and has been encrypted too. Offsite replication is the only tier this incident cannot reach.";
    }

    const now = Date.now();
    set((st) => ({
      infra: {
        ...st.infra,
        backup: {
          ...st.infra.backup,
          log: [restoreEvent(nodeId, true, "Restored from the last good copy."), ...st.infra.backup.log].slice(0, 40),
        },
        incident: {
          ...st.infra.incident,
          compromised: st.infra.incident.compromised.map((c) =>
            c.nodeId === nodeId ? { ...c, restoredAt: now } : c,
          ),
          // Shares served by a restored host come back with it.
          encryptedShareIds: st.infra.incident.encryptedShareIds.filter((id) => {
            const share = Object.values(st.infra.nodes).flatMap((n) => n.shares ?? []).find((sh) => sh.id === id);
            return share?.serverNodeId !== nodeId;
          }),
        },
      },
    }));
    return null;
  },

  // ── Incident response ────────────────────────────────────────────────────

  incidentStart: (patientZero, spreadTo, shareIds) =>
    set((s) => {
      const now = Date.now();
      return {
        infra: {
          ...s.infra,
          incident: {
            startedAt: now,
            patientZero,
            compromised: [
              { nodeId: patientZero, at: now, vector: "phishing" as const },
              ...spreadTo.map((id) => ({ nodeId: id, at: now, vector: "lateral" as const })),
            ],
            encryptedShareIds: shareIds,
            containedAt: null,
            resolvedAt: null,
          },
        },
      };
    }),

  incidentWipe: (nodeId) => {
    const infra = get().infra;
    const rec = infra.incident.compromised.find((c) => c.nodeId === nodeId);
    if (!rec) return "That host is not compromised.";
    if (rec.wipedAt) return "That host has already been wiped.";

    /*
     * ORDER IS ENFORCED HERE, not just described in the UI. Wiping a host that
     * is still on the network gets it re-encrypted within minutes, so the
     * action is refused rather than performed and quietly undone. Refusing
     * teaches the rule; silently reverting teaches that the game is broken.
     */
    if (infra.incident.patientZero && !isIsolated(infra, infra.incident.patientZero)) {
      return `${infra.incident.patientZero} is still on the network. Isolate it first — anything wiped now is re-encrypted within minutes.`;
    }

    const now = Date.now();
    set((st) => ({
      infra: {
        ...st.infra,
        incident: {
          ...st.infra.incident,
          containedAt: st.infra.incident.containedAt ?? now,
          compromised: st.infra.incident.compromised.map((c) =>
            c.nodeId === nodeId ? { ...c, wipedAt: now } : c,
          ),
        },
      },
    }));
    return null;
  },

  incidentClear: () =>
    set((s) => ({
      infra: {
        ...s.infra,
        incident: { ...s.infra.incident, resolvedAt: Date.now() },
      },
    })),


  // ── Cascade faults (QA2) ─────────────────────────────────────────────────

  cascadeStart: (kind, nodeId) =>
    set((s) => ({
      infra: {
        ...s.infra,
        cascade: {
          faults: [
            ...(s.infra.cascade?.faults ?? []).filter((f) => f.nodeId !== nodeId || f.clearedAt),
            { id: `csc-${Date.now().toString(36)}`, kind, nodeId, startedAt: Date.now() },
          ],
        },
      },
    })),

  cascadeReplacePart: (nodeId) => {
    const infra = get().infra;
    const fault = (infra.cascade?.faults ?? []).find((f) => f.nodeId === nodeId && !f.clearedAt);
    if (!fault) return "There is no outstanding hardware fault on that host.";
    if (fault.partReplacedAt) return "The part has already been replaced.";

    const node = infra.nodes[nodeId];
    if (fault.kind === "thermal" && node?.connection.online) {
      return `${nodeId} is still running. Power it down from the Server Manager before opening the chassis.`;
    }

    set((st) => ({
      infra: {
        ...st.infra,
        cascade: {
          faults: (st.infra.cascade?.faults ?? []).map((f) =>
            f.id === fault.id ? { ...f, partReplacedAt: Date.now() } : f,
          ),
        },
        // A bigger disk is a real capacity change, so the storage cascade's
        // symptom clears through the SAME field the Monitor reads. Nothing
        // special-cases it; the volume simply is not full any more.
        nodes:
          fault.kind === "storage-dependency" && node
            ? { ...st.infra.nodes, [nodeId]: { ...node, health: { ...node.health, diskUsedPct: 38 } } }
            : st.infra.nodes,
      },
    }));
    return null;
  },

  cascadeClearLogs: (nodeId) => {
    const infra = get().infra;
    const node = infra.nodes[nodeId];
    if (!node) return "No such host.";
    if (node.health.diskUsedPct < 90) return "There is already free space on that volume.";
    set((st) => {
      const n = st.infra.nodes[nodeId];
      if (!n) return st;
      return {
        infra: {
          ...st.infra,
          // Clearing logs frees less than a new disk — enough to start the
          // service, not enough to stop it happening again, which is the
          // honest difference between the two routes.
          nodes: { ...st.infra.nodes, [nodeId]: { ...n, health: { ...n.health, diskUsedPct: 72 } } },
        },
      };
    });
    return null;
  },

  reset: () => set({ infra: generateWorld(freshSeed(), 1) }),
}));


let restoreSeq = 0;

function restoreEvent(nodeId: NodeId, ok: boolean, detail: string): RestoreEvent {
  restoreSeq += 1;
  return { id: `rst-${Date.now().toString(36)}-${restoreSeq}`, at: Date.now(), nodeId, ok, detail };
}


/** A minimal edge node for the bench — the same shape the seeder produces. */
function devEdgeNode(
  hostname: string,
  displayName: string,
  role: "ip-camera" | "nvr",
  ip: string,
): TargetNode {
  const gw = ip.replace(/\.\d+$/, ".1");
  return {
    nodeId: hostname,
    hostname,
    displayName,
    role,
    connection: {
      protocol: "ssh",
      ip,
      port: 22,
      reachable: true,
      online: true,
      requiresCredentials: true,
      authenticated: false,
      latencyMs: 2.4,
    },
    network: {
      interfaces: [{ name: "eth0", up: true, ipv4: ip, netmask: "255.255.255.0", mac: "02:1c:00:00:00:00", carrier: true }],
      routes: [{ destination: "default", gateway: gw, iface: "eth0", metric: 100 }],
      dnsServers: [gw],
      hostsTable: { [hostname]: ip },
      firewall: [],
      reachableHosts: {},
    },
    health: { status: "healthy", cpuLoad: 6, memUsedPct: 30, diskUsedPct: 12, uptimeSeconds: 3600 },
    workloads: [],
    tags: [role],
    os: "linux",
    distro: role === "ip-camera" ? "BusyBox 1.35 (camera firmware)" : "Linux (appliance)",
    kernel: "5.15.0-embedded",
    filesystem: { kind: "dir", children: {} },
    users: [],
    services: {},
    processes: [],
    logs: {},
    packages: [],
    session: { cwd: "/", user: "root", history: [], env: {} },
  } as unknown as TargetNode;
}


// ── Build 1 helpers ─────────────────────────────────────────────────────────

/**
 * Rewrite one port, leaving every other switch and port identically shaped.
 *
 * One place that knows how to reach into the nested structure, so a new port
 * action cannot get the spreading subtly wrong and silently drop a sibling.
 */
function mutatePort(
  infra: InfrastructureState,
  switchId: string,
  port: number,
  fn: (p: PoePort) => PoePort,
): InfrastructureState {
  return {
    ...infra,
    poe: {
      ...infra.poe,
      switches: infra.poe.switches.map((sw) =>
        sw.id !== switchId
          ? sw
          : { ...sw, ports: sw.ports.map((p) => (p.n === port ? fn(p) : p)) },
      ),
    },
  };
}

let faultSeq = 0;

/** A fault entry with an id unique within the session. */
function logFault(spec: {
  kind: NetworkFault["kind"];
  nodeId?: NodeId;
  detail: string;
}): NetworkFault {
  faultSeq += 1;
  return { id: `flt-${Date.now().toString(36)}-${faultSeq}`, at: Date.now(), ...spec };
}

/** Convenience hook: subscribe to a single node by id. */
export function useNode(nodeId: NodeId): TargetNode | undefined {
  return useInfraStore((s) => s.infra.nodes[nodeId]);
}
