/**
 * TriageOS — Procedural ticket engine
 * ===================================
 * Scales the content library past 100 scenarios without 100 hand-written
 * objects, and — more importantly — without 100 near-identical ones.
 *
 * ARCHITECTURE
 * A family is a WIN-CONDITION ARCHETYPE (the thing the player actually does)
 * crossed with VARIANT AXES (what makes each instance read differently). The
 * generator emits real `TicketTemplate`s, so `buildTicket`, the reconciler,
 * the hint economy and the Toolbox all work unchanged — procedural tickets are
 * indistinguishable from hand-authored ones downstream.
 *
 *   family        = archetype + flavour + which tiers it can be minted at
 *   variant axis  = department, brand, capacity, interface, urgency, subsystem
 *   instance      = one (family, variant, tier) triple → one TicketTemplate
 *
 * WHY THIS SHAPE
 * Generating prose around a fixed win-condition would produce filler. Instead
 * the variant chooses the CONSTRAINT — which memory generation, which
 * interface, which port, which subnet — so two instances of the same family
 * require materially different actions and different parts from Procurement.
 *
 * Everything is seeded off the world, so a given org always produces the same
 * library and saves stay reproducible.
 */

import type {
  InfrastructureState,
  TargetNode,
  TicketDifficulty,
  TicketDynamicContext,
} from "@/lib/core";
import {
  availableOf, baseHardwareFor, connectedLoadWatts, DEVICE_COOLING_C, floorSummary,
  isPowered, isRackable, locationOf, pduSpec, rackPower, rackThermal,
} from "@/lib/core";
import { int, pick, type Rng } from "@/lib/org/rng";
import type { TicketTemplate } from "./matrix";

// ── Tier tuning ─────────────────────────────────────────────────────────────

interface TierTuning {
  severity: TicketTemplate["severity"];
  priority: TicketTemplate["priority"];
  sla: number;
  response: number;
  xp: number;
  origin: TicketTemplate["origin"];
}

const TIER: Record<TicketDifficulty, TierTuning> = {
  Tier_1_Easy: { severity: "low", priority: "P4", sla: 30 * 60, response: 10 * 60, xp: 160, origin: "dashboard" },
  Tier_2_Medium: { severity: "medium", priority: "P3", sla: 25 * 60, response: 8 * 60, xp: 340, origin: "dashboard" },
  Tier_3_Hard: { severity: "high", priority: "P2", sla: 20 * 60, response: 6 * 60, xp: 640, origin: "mail" },
  Tier_4_Expert: { severity: "critical", priority: "P1", sla: 15 * 60, response: 4 * 60, xp: 980, origin: "mail" },
};

// ── Variant vocabulary ──────────────────────────────────────────────────────

/** Rack labels the datacentre incidents name. */
const RACK_NAMES = ["Rack 01", "Rack A", "Rack B", "Rack DC-2"];

const DEPARTMENTS = ["Finance", "HR", "Sales", "Legal", "Marketing", "Operations", "Engineering", "Support"];

/** Requester archetypes so the prose does not repeat one voice. */
const VOICES = [
  { role: "Team Lead", persona: "persona-marcus-calm", tone: "measured" },
  { role: "Analyst", persona: "persona-priya-stressed", tone: "urgent" },
  { role: "Office Manager", persona: "persona-marcus-calm", tone: "practical" },
  { role: "Developer", persona: "persona-priya-stressed", tone: "technical" },
  { role: "Director", persona: "persona-marcus-calm", tone: "impatient" },
];

const MEMORY_SPECS = [
  { label: "32GB DDR5-4800 ECC", req: { memoryType: "DDR5" as const, ecc: true, minCapacityGb: 32 }, gb: 32 },
  { label: "16GB DDR5-4800 ECC", req: { memoryType: "DDR5" as const, ecc: true, minCapacityGb: 16 }, gb: 16 },
  { label: "16GB DDR4-3200 ECC", req: { memoryType: "DDR4" as const, ecc: true, minCapacityGb: 16 }, gb: 16 },
  { label: "64GB DDR5-5600 ECC", req: { memoryType: "DDR5" as const, ecc: true, minCapacityGb: 64 }, gb: 64 },
];

const DISK_SPECS = [
  { label: "2TB Enterprise SAS", req: { busInterface: "SAS" as const, minCapacityGb: 2048, hotSwap: true }, gb: 2048 },
  { label: "4TB Enterprise SAS", req: { busInterface: "SAS" as const, minCapacityGb: 4096, hotSwap: true }, gb: 4096 },
  { label: "1TB NVMe Gen4", req: { busInterface: "NVMe" as const, formFactor: "M.2 2280", minCapacityGb: 1024 }, gb: 1024 },
  { label: "2TB NVMe U.2", req: { busInterface: "NVMe" as const, formFactor: "U.2", minCapacityGb: 2048, hotSwap: true }, gb: 2048 },
];

// ── World helpers ───────────────────────────────────────────────────────────

const nodesOf = (infra: InfrastructureState): TargetNode[] => Object.values(infra.nodes);

const gatewayNodes = (infra: InfrastructureState): TargetNode[] =>
  infra.gateway.map((g) => infra.nodes[g.nodeId]).filter(Boolean);

function nodeByRole(infra: InfrastructureState, role: string, rng: Rng): TargetNode | null {
  const found = gatewayNodes(infra).filter((n) => n.role === role);
  return found.length ? pick(rng, found) : null;
}

function anyWorkstation(infra: InfrastructureState, rng: Rng): TargetNode | null {
  const ws = gatewayNodes(infra).filter((n) => n.role === "workstation");
  return ws.length ? pick(rng, ws) : null;
}

function adUsers(infra: InfrastructureState) {
  const dc = nodesOf(infra).find((n) => n.role === "domain-controller");
  return dc && "activeDirectory" in dc ? dc.activeDirectory : null;
}

const mailDomain = (org: { domain: string }) => org.domain.replace(".internal", ".com");

// ── Family definitions ──────────────────────────────────────────────────────

/**
 * A family knows how to mint one template for a given variant + tier. Keeping
 * `build` a pure function of (variant, tier, index) is what lets the generator
 * enumerate the whole library deterministically.
 */
interface Family {
  id: string;
  category: TicketTemplate["category"];
  track: TicketTemplate["track"];
  tags: string[];
  tiers: TicketDifficulty[];
  /** How many distinct variants to mint per tier. */
  variants: number;
  build: (args: { rng: Rng; tier: TicketDifficulty; variantIndex: number; id: string }) => TicketTemplate;
}

/** Shared scaffolding so each family body stays about the scenario. */
function base(
  f: Pick<Family, "category" | "track" | "tags">,
  tier: TicketDifficulty,
  id: string,
  extra: Partial<TicketTemplate>,
): TicketTemplate {
  const t = TIER[tier];
  return {
    id,
    category: f.category,
    track: f.track,
    difficulty: tier,
    severity: t.severity,
    priority: t.priority,
    slaDuration: t.sla,
    responseSeconds: t.response,
    xpReward: t.xp,
    personaId: "persona-marcus-calm",
    tags: f.tags,
    origin: t.origin,
    summary: "",
    hints: [],
    playable: true,
    makeContext: () => null,
    title: () => "",
    description: () => "",
    requester: (_c, org) => ({
      name: "Service Desk",
      role: "IT",
      email: `it@${mailDomain(org)}`,
      department: "IT",
    }),
    win: () => false,
    ...extra,
  } as TicketTemplate;
}

const FAMILIES: Family[] = [
  // ── Identity ─────────────────────────────────────────────────────────────
  {
    id: "gen-lockout",
    category: "Identity & Access",
    track: "helpdesk",
    tags: ["ad", "lockout", "identity"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 4,
    build: ({ rng, tier, id }) => {
      const dept = pick(rng, DEPARTMENTS);
      const voice = pick(rng, VOICES);
      return base({ category: "Identity & Access", track: "helpdesk", tags: ["ad", "lockout", "identity"] }, tier, id, {
        personaId: voice.persona,
        summary: `A ${dept} user is locked out and cannot sign in.`,
        hints: [
          "Remote into the domain controller and open ADUC",
          "Filter the directory by Locked to find the account",
          "Unlock it, then confirm the account is also Enabled",
        ],
        makeContext: (infra, r) => {
          const ad = adUsers(infra);
          if (!ad) return null;
          const candidates = ad.users.filter((u) => u.department === dept);
          const user = candidates.length ? pick(r, candidates) : pick(r, ad.users);
          return { targetUserId: user.samAccountName, targetUserName: user.displayName, department: dept };
        },
        title: (ctx) => `Account lockout — ${ctx.targetUserName} cannot sign in`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** (${ctx.targetUserId}, ${ctx.department}) is locked out ` +
          `and has a deadline today.\n\nWhat we found:\n` +
          `• Repeated failed sign-ins tripped the lockout threshold\n` +
          `• The account itself is not disabled\n\nObjective:\n` +
          `• Unlock the account and confirm they can authenticate`,
        requester: (ctx, org) => ({
          name: String(ctx.targetUserName),
          role: voice.role,
          email: `${ctx.targetUserId}@${mailDomain(org)}`,
          department: String(ctx.department),
        }),
        injectFault: (draft, ctx) => {
          const dc = Object.values(draft.nodes).find((n) => n.role === "domain-controller");
          const ad = dc && "activeDirectory" in dc ? dc.activeDirectory : undefined;
          const u = ad?.users.find((x) => x.samAccountName === ctx.targetUserId);
          if (u) u.locked = true;
        },
        win: (infra, ctx) => {
          const ad = adUsers(infra);
          const u = ad?.users.find((x) => x.samAccountName === ctx.targetUserId);
          return !!u && !u.locked && u.enabled;
        },
      });
    },
  },
  {
    id: "gen-group-access",
    category: "Identity & Access",
    track: "sysadmin",
    tags: ["ad", "groups", "identity", "access"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 4,
    build: ({ rng, tier, id }) => {
      const dept = pick(rng, DEPARTMENTS);
      return base({ category: "Identity & Access", track: "sysadmin", tags: ["ad", "groups", "identity", "access"] }, tier, id, {
        summary: `A user needs ${dept} resource access granted.`,
        hints: [
          "ADUC → find the user → Properties → Member Of",
          `Every department has an identity group and a matching _RW resource group`,
          `Add ${dept}_RW — the identity group alone grants no write access`,
        ],
        makeContext: (infra, r) => {
          const ad = adUsers(infra);
          if (!ad) return null;
          const outside = ad.users.filter((u) => u.department !== dept);
          if (!outside.length) return null;
          const user = pick(r, outside);
          return {
            targetUserId: user.samAccountName,
            targetUserName: user.displayName,
            targetGroup: `${dept}_RW`,
            department: dept,
          };
        },
        title: (ctx) => `${ctx.targetUserName} needs write access to ${ctx.department} resources`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** has taken on ${ctx.department} work and cannot write ` +
          `to the department share.\n\nWhat we found:\n` +
          `• They hold their own department groups but nothing for ${ctx.department}\n` +
          `• Read access comes from the identity group; write comes from the **_RW** group\n\n` +
          `Objective:\n• Add **${ctx.targetGroup}** to their group membership`,
        win: (infra, ctx) => {
          const ad = adUsers(infra);
          const u = ad?.users.find((x) => x.samAccountName === ctx.targetUserId);
          return !!u && u.memberOf.includes(String(ctx.targetGroup));
        },
      });
    },
  },

  // ── Hardware (uses the compatibility + procurement mechanics) ────────────
  {
    id: "gen-mem-upgrade",
    category: "System & Web Services",
    track: "helpdesk",
    tags: ["hardware", "ram", "upgrade"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium", "Tier_3_Hard"],
    variants: 4,
    build: ({ rng, tier, id }) => {
      const spec = pick(rng, MEMORY_SPECS);
      const dept = pick(rng, DEPARTMENTS);
      const voice = pick(rng, VOICES);
      return base({ category: "System & Web Services", track: "helpdesk", tags: ["hardware", "ram", "upgrade"] }, tier, id, {
        personaId: voice.persona,
        summary: `A workstation needs a ${spec.label} memory upgrade.`,
        hints: [
          "Asset Manager → check whether the exact module is on the shelf",
          "Procurement → the catalogue lists near-identical parts; match the spec exactly",
          "Hardware Lab → Workshop → extract the old module, fit the new one",
          "Provision fully, then dispatch a field technician for the physical swap",
        ],
        makeContext: (infra, r) => {
          const ws = anyWorkstation(infra, r);
          if (!ws) return null;
          return { targetNodeId: ws.nodeId, targetHostname: ws.hostname, department: dept, serviceName: spec.label };
        },
        title: (ctx) => `${ctx.targetHostname} out of memory — ${ctx.serviceName} upgrade`,
        description: (ctx) =>
          `User request:\nA ${ctx.department} user reports **${ctx.targetHostname} freezing** under load.\n\n` +
          `What we found:\n• The machine is paging constantly and pinned near 100% memory\n` +
          `• The board takes **${ctx.serviceName}** — nothing else will seat\n\n` +
          `Objective:\n• Source the correct module (check the store room before ordering)\n` +
          `• Fit it in the Hardware Lab and dispatch the swap`,
        requester: (ctx, org) => ({
          name: `${ctx.department} ${voice.role}`,
          role: voice.role,
          email: `${String(ctx.department).toLowerCase()}@${mailDomain(org)}`,
          department: String(ctx.department),
        }),
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (n) {
            n.health.memUsedPct = 97;
            n.health.status = "degraded";
          }
        },
        win: (infra, ctx) => infra.security.hardwareReplaced.includes(String(ctx.targetNodeId)),
      });
    },
  },
  {
    id: "gen-disk-swap",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["hardware", "disk", "raid", "storage"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 4,
    build: ({ rng, tier, id }) => {
      const spec = pick(rng, DISK_SPECS);
      return base({ category: "System & Web Services", track: "sysadmin", tags: ["hardware", "disk", "raid", "storage"] }, tier, id, {
        summary: `A failed array member needs replacing with a ${spec.label}.`,
        hints: [
          "Monitor → confirm which host is reporting the fault",
          "Asset Manager → the bay is a specific interface; a mismatched drive will not fit",
          "Procurement → express freight if the array is running degraded",
          "Hardware Lab → swap the drive, then dispatch",
        ],
        makeContext: (infra, r) => {
          const node =
            nodeByRole(infra, "database", r) ??
            nodeByRole(infra, "file-server", r) ??
            nodeByRole(infra, "app-server", r);
          if (!node) return null;
          return { targetNodeId: node.nodeId, targetHostname: node.hostname, serviceName: spec.label };
        },
        title: (ctx) => `Degraded array on ${ctx.targetHostname} — replace failed member`,
        description: (ctx) =>
          `Alert:\nThe array on **${ctx.targetHostname}** is running degraded after a member failed.\n\n` +
          `What we found:\n• One drive has dropped out; the array is rebuilding onto nothing\n` +
          `• The bay takes a **${ctx.serviceName}** — the interface must match\n\n` +
          `Objective:\n• Fit a compatible replacement and return the array to health\n\n` +
          `> A second failure while degraded loses the volume. Treat the clock as real.`,
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (n) n.health.status = "critical";
        },
        win: (infra, ctx) => infra.security.hardwareReplaced.includes(String(ctx.targetNodeId)),
      });
    },
  },

  // ── Systems / services ───────────────────────────────────────────────────
  {
    id: "gen-service-down",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["service", "outage", "linux"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium", "Tier_3_Hard"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const svc = pick(rng, ["app", "postgresql"]);
      return base({ category: "System & Web Services", track: "sysadmin", tags: ["service", "outage", "linux"] }, tier, id, {
        personaId: "persona-priya-stressed",
        summary: `The ${svc} service is down and taking the site with it.`,
        hints: [
          "Remote Gateway → SSH to the affected host",
          `systemctl status ${svc} — read WHY it stopped before restarting`,
          `systemctl start ${svc}, then curl the endpoint to confirm a 200`,
        ],
        makeContext: (infra, r) => {
          const node = gatewayNodes(infra).filter((n) => n.os === "linux");
          if (!node.length) return null;
          const target = pick(r, node);
          return { targetNodeId: target.nodeId, targetHostname: target.hostname, serviceName: svc };
        },
        title: (ctx) => `${ctx.serviceName} down on ${ctx.targetHostname} — service unavailable`,
        description: (ctx) =>
          `User request:\nCustomers are getting errors. **${ctx.targetHostname}** is answering but the ` +
          `**${ctx.serviceName}** service behind it is not.\n\n` +
          `What we found:\n• The proxy is healthy; the upstream unit is stopped\n` +
          `• Restarting without reading the journal tells you nothing about the cause\n\n` +
          `Objective:\n• Bring **${ctx.serviceName}** back and confirm the endpoint answers`,
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (n && n.os === "linux" && n.services[String(ctx.serviceName)]) {
            n.services[String(ctx.serviceName)].status = "failed";
            n.health.status = "critical";
          }
        },
        win: (infra, ctx) => {
          const n = infra.nodes[String(ctx.targetNodeId)];
          return !!n && n.os === "linux" && n.services[String(ctx.serviceName)]?.status === "active";
        },
        healthyNode: (_i, ctx) => String(ctx.targetNodeId),
      });
    },
  },
  {
    id: "gen-runaway-proc",
    category: "System & Web Services",
    track: "helpdesk",
    tags: ["endpoint", "cpu", "process"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 4,
    build: ({ rng, tier, id }) => {
      const proc = pick(rng, [
        "TelemetryUpdater.exe",
        "IndexerHost.exe",
        "CrashHandler.exe",
        "SyncAgent.exe",
        "MediaScan.exe",
      ]);
      return base({ category: "System & Web Services", track: "helpdesk", tags: ["endpoint", "cpu", "process"] }, tier, id, {
        summary: `A runaway process is pinning a workstation's CPU.`,
        hints: [
          "Monitor → the host's CPU trace is flat at the ceiling",
          "Remote into the machine and open Task Manager",
          `Sort by CPU and end ${proc}`,
        ],
        makeContext: (infra, r) => {
          const ws = anyWorkstation(infra, r);
          if (!ws) return null;
          return { targetNodeId: ws.nodeId, targetHostname: ws.hostname, serviceName: proc };
        },
        title: (ctx) => `${ctx.targetHostname} unusable — one process eating the CPU`,
        description: (ctx) =>
          `User request:\nThe machine is "so slow it's unusable" and the fan has been at full speed all morning.\n\n` +
          `What we found:\n• A single process, **${ctx.serviceName}**, is holding the CPU near 100%\n` +
          `• Nothing else on the box is misbehaving\n\n` +
          `Objective:\n• Remote in and end the offending process`,
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (n) {
            n.processes = [
              ...n.processes,
              { pid: 7788, ppid: 1, user: "user", command: String(ctx.serviceName), cpu: 96.4, mem: 12.1, state: "R" },
            ];
            n.health.cpuLoad = 98;
          }
        },
        win: (infra, ctx) => {
          const n = infra.nodes[String(ctx.targetNodeId)];
          return !!n && !n.processes.some((p) => p.command === String(ctx.serviceName));
        },
        healthyNode: (_i, ctx) => String(ctx.targetNodeId),
      });
    },
  },
  {
    id: "gen-disk-full",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["disk", "capacity", "logs"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 3,
    build: ({ rng, tier, id }) =>
      base({ category: "System & Web Services", track: "sysadmin", tags: ["disk", "capacity", "logs"] }, tier, id, {
        summary: "A volume has filled and the host has stopped writing.",
        hints: [
          "Monitor → the host reports disk saturation",
          "NetOps Console → Incident response → Rotate logs on that host",
          "Rotation before deletion — you cannot recover data you removed",
        ],
        makeContext: (infra, r) => {
          const node = gatewayNodes(infra).filter((n) => n.role !== "workstation");
          if (!node.length) return null;
          const target = pick(r, node);
          return { targetNodeId: target.nodeId, targetHostname: target.hostname };
        },
        title: (ctx) => `${ctx.targetHostname} out of disk — writes failing`,
        description: (ctx) =>
          `Alert:\n**${ctx.targetHostname}** has filled its volume and services on it have stopped writing.\n\n` +
          `What we found:\n• The volume is above 98%, which behaves like a broken disk rather than a full one\n` +
          `• Log growth is the cause, not user data\n\n` +
          `Objective:\n• Reclaim space through log rotation and bring the volume back under threshold`,
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (n) {
            n.health.diskUsedPct = 99;
            n.health.status = "critical";
          }
        },
        win: (infra, ctx) => infra.security.logsRotated.includes(String(ctx.targetNodeId)),
        healthyNode: (_i, ctx) => String(ctx.targetNodeId),
      }),
  },

  // ── Networking ───────────────────────────────────────────────────────────
  {
    id: "gen-congestion",
    category: "Network & Routing",
    track: "netops",
    tags: ["network", "congestion", "latency"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 3,
    build: ({ tier, id }) =>
      base({ category: "Network & Routing", track: "netops", tags: ["network", "congestion", "latency"] }, tier, id, {
        summary: "A saturated link is dropping packets across a subnet.",
        hints: [
          "NetOps Console → find the link with high utilisation and loss",
          "Re-route it onto a quieter segment to shed load",
          "A software firewall dampens loss but adds latency — re-routing is the fix",
        ],
        makeContext: (infra, r) => {
          const busy = infra.links.filter((l) => !l.blocked && l.to !== "internet");
          if (!busy.length) return null;
          const link = pick(r, busy);
          // Record the segment the link STARTS on. The win-condition compares
          // against this rather than reading loss directly — see below.
          return { linkId: link.id, affectedVlan: link.via, rackIpv4: link.via };
        },
        title: (ctx) => `Packet loss and latency on ${ctx.affectedVlan}`,
        description: (ctx) =>
          `User request:\nEveryone on **${ctx.affectedVlan}** reports the network "dropping out" intermittently.\n\n` +
          `What we found:\n• One link is running hot enough to drop frames\n` +
          `• Utilisation, not a fault — the segment is simply carrying more than it can\n\n` +
          `Objective:\n• Shed the load so loss returns to normal`,
        injectFault: (draft, ctx) => {
          const l = draft.links.find((x) => x.id === ctx.linkId);
          if (l) {
            l.utilizationPct = 96;
            l.packetLossPct = 5.2;
          }
        },
        /**
         * Graded on the ACTION, not the metric.
         *
         * NetworkEngine random-walks utilisation every 2s, so a win-condition
         * of "loss < 1%" resolves itself while the player is reading the
         * ticket — which is exactly what happened in testing. Requiring the
         * link to have been re-routed off its congested segment (or given a
         * software firewall to dampen the spikes) means only a deliberate fix
         * closes it.
         */
        win: (infra, ctx) => {
          const l = infra.links.find((x) => x.id === ctx.linkId);
          if (!l) return false;
          return l.via !== String(ctx.rackIpv4) || l.softwareFirewall;
        },
      }),
  },
  {
    id: "gen-blocked-link",
    category: "Network & Routing",
    track: "netops",
    tags: ["network", "firewall", "change"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 3,
    build: ({ tier, id }) =>
      base({ category: "Network & Routing", track: "netops", tags: ["network", "firewall", "change"] }, tier, id, {
        summary: "A change window left a segment black-holed.",
        hints: [
          "NetOps Console → a blocked link shows zero traffic, not high traffic",
          "Timing is the clue: the fault began right after the maintenance window",
          "Unblock the link to restore the segment",
        ],
        makeContext: (infra, r) => {
          const internal = infra.links.filter((l) => l.to !== "internet");
          if (!internal.length) return null;
          const link = pick(r, internal);
          return { linkId: link.id, affectedVlan: link.via };
        },
        title: (ctx) => `Connectivity lost on ${ctx.affectedVlan} after the change window`,
        description: (ctx) =>
          `User request:\nNothing on **${ctx.affectedVlan}** can reach the rest of the estate. It worked yesterday.\n\n` +
          `What we found:\n• A change last night applied a rule far broader than intended\n` +
          `• The segment shows no traffic at all rather than congestion\n\n` +
          `Objective:\n• Identify the bad change and restore the path`,
        injectFault: (draft, ctx) => {
          const l = draft.links.find((x) => x.id === ctx.linkId);
          if (l) l.blocked = true;
        },
        win: (infra, ctx) => {
          const l = infra.links.find((x) => x.id === ctx.linkId);
          return !!l && !l.blocked;
        },
      }),
  },

  // ── Security ─────────────────────────────────────────────────────────────
  {
    id: "gen-intrusion",
    category: "Security & Incident",
    track: "secops",
    tags: ["security", "intrusion", "containment"],
    tiers: ["Tier_3_Hard", "Tier_4_Expert"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const ip = `${int(rng, 41, 210)}.${int(rng, 2, 250)}.${int(rng, 2, 250)}.${int(rng, 2, 250)}`;
      return base({ category: "Security & Incident", track: "secops", tags: ["security", "intrusion", "containment"] }, tier, id, {
        personaId: "persona-soc-urgent",
        summary: "An external address is actively exfiltrating data.",
        hints: [
          "Containment comes before investigation",
          "NetOps Console → Incident response → block the address at the edge",
          "Assume anything the host could reach has been read — rotate service credentials",
        ],
        makeContext: () => ({ maliciousIp: ip }),
        title: () => `Active exfiltration to ${ip} — contain now`,
        description: () =>
          `Alert:\nSustained outbound transfer to **${ip}**, an address with no business relationship.\n\n` +
          `What we found:\n• Volume and timing are consistent with staged exfiltration\n` +
          `• Credentials reachable from the affected segment must be treated as compromised\n\n` +
          `Objective:\n• Block the address at the edge\n• Rotate every service credential`,
        requester: (_c, org) => ({
          name: "SOC On-Call",
          role: "Security Operations",
          email: `soc@${mailDomain(org)}`,
          department: "Security",
        }),
        win: (infra, ctx) =>
          infra.security.blockedIps.includes(String(ctx.maliciousIp)) && infra.security.credentialsRotated,
      });
    },
  },
  {
    id: "gen-phishing",
    category: "Security & Incident",
    track: "secops",
    tags: ["security", "phishing", "mail"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 4,
    build: ({ rng, tier, id }) => {
      const domain = pick(rng, [
        "secure-mail-verify.co",
        "account-servicedesk.net",
        "it-helpdesk-portal.org",
        "corp-password-reset.io",
        "payroll-notices.co",
      ]);
      return base({ category: "Security & Incident", track: "secops", tags: ["security", "phishing", "mail"] }, tier, id, {
        summary: "A credential-harvesting mail is circulating internally.",
        hints: [
          "CoreMail → open the reported message and read the sender domain",
          "Flag the DOMAIN, not the individual message",
          "Flagging blocks it estate-wide; deleting protects one mailbox",
        ],
        makeContext: (infra, r) => {
          const ad = adUsers(infra);
          const user = ad?.users.length ? pick(r, ad.users) : null;
          return {
            senderDomain: domain,
            targetUserId: user?.samAccountName,
            targetUserName: user?.displayName,
          };
        },
        title: () => `Phishing campaign from ${domain} — staff reporting`,
        description: (ctx) =>
          `Alert:\nStaff are reporting a convincing "password expiry" mail from **${ctx.senderDomain}**.\n\n` +
          `What we found:\n• The link leads to a credential-harvesting page\n` +
          `• At least one recipient (${ctx.targetUserName ?? "unconfirmed"}) opened it\n\n` +
          `Objective:\n• Flag the sender domain so it is blocked for everyone`,
        requester: (_c, org) => ({
          name: "SOC On-Call",
          role: "Security Operations",
          email: `soc@${mailDomain(org)}`,
          department: "Security",
        }),
        win: (infra, ctx) => infra.security.flaggedDomains.includes(String(ctx.senderDomain)),
      });
    },
  },
  {
    id: "gen-ransomware",
    category: "Security & Incident",
    track: "secops",
    tags: ["security", "ransomware", "isolation"],
    tiers: ["Tier_3_Hard", "Tier_4_Expert"],
    variants: 2,
    build: ({ tier, id }) =>
      base({ category: "Security & Incident", track: "secops", tags: ["security", "ransomware", "isolation"] }, tier, id, {
        personaId: "persona-soc-urgent",
        summary: "An endpoint is encrypting files and must be isolated.",
        hints: [
          "Isolate first — every second it stays on the network costs shares",
          "NetOps Console → Incident response → select the host → Isolate",
          "Leave it powered on; pulling the plug destroys volatile evidence",
        ],
        makeContext: (infra, r) => {
          const ws = anyWorkstation(infra, r);
          if (!ws) return null;
          return { targetNodeId: ws.nodeId, targetHostname: ws.hostname };
        },
        title: (ctx) => `Ransomware activity on ${ctx.targetHostname} — isolate immediately`,
        description: (ctx) =>
          `Alert:\nFile-encryption behaviour detected on **${ctx.targetHostname}**, spreading to mapped shares.\n\n` +
          `What we found:\n• Rapid sequential writes with changed extensions across the user's drives\n` +
          `• The machine still holds live network access\n\n` +
          `Objective:\n• Cut it off the network without powering it down`,
        requester: (_c, org) => ({
          name: "SOC On-Call",
          role: "Security Operations",
          email: `soc@${mailDomain(org)}`,
          department: "Security",
        }),
        win: (infra, ctx) => infra.security.isolatedNodeIds.includes(String(ctx.targetNodeId)),
      }),
  },

  // ── Procurement-driven (explicitly exercises scarcity + shipping) ────────
  {
    id: "gen-stock-out",
    category: "System & Web Services",
    track: "helpdesk",
    tags: ["hardware", "procurement", "shipping", "peripheral"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const dept = pick(rng, DEPARTMENTS);
      const spec = pick(rng, MEMORY_SPECS);
      return base({ category: "System & Web Services", track: "helpdesk", tags: ["hardware", "procurement", "shipping", "peripheral"] }, tier, id, {
        summary: "A rebuild is blocked because the store room is empty.",
        hints: [
          "Asset Manager → confirm the shelf is actually empty before ordering",
          "Procurement → standard freight is free but lands after two more closures",
          "Express costs more but keeps you inside the SLA — weigh it against the clock",
          "Hardware Lab → fit the part once it arrives, then dispatch",
        ],
        makeContext: (infra, r) => {
          const ws = anyWorkstation(infra, r);
          if (!ws) return null;
          return { targetNodeId: ws.nodeId, targetHostname: ws.hostname, department: dept, serviceName: spec.label };
        },
        title: (ctx) => `Rebuild blocked — no ${ctx.serviceName} in the store room`,
        description: (ctx) =>
          `User request:\n**${ctx.targetHostname}** (${ctx.department}) is down and waiting on parts.\n\n` +
          `What we found:\n• The rebuild needs **${ctx.serviceName}**\n` +
          `• The shelf is empty, so the bench cannot fit anything\n\n` +
          `Objective:\n• Order the correct part, choosing a shipping lane that fits the clock\n` +
          `• Complete the rebuild once it lands\n\n` +
          `> Express freight costs 65% more. If the SLA is comfortable, standard is free money saved.`,
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (n) {
            n.connection.online = false;
            n.health.status = "offline";
          }
        },
        win: (infra, ctx) => infra.security.hardwareReplaced.includes(String(ctx.targetNodeId)),
      });
    },
  },
  {
    id: "gen-cable-shortage",
    category: "Network & Routing",
    track: "netops",
    tags: ["rack", "hardware", "cable", "procurement"],
    tiers: ["Tier_2_Medium"],
    variants: 2,
    build: ({ tier, id }) =>
      base({ category: "Network & Routing", track: "netops", tags: ["rack", "hardware", "cable", "procurement"] }, tier, id, {
        summary: "A patching job cannot proceed without cables in stock.",
        hints: [
          "Asset Manager → check patch cable availability first",
          "Procurement → cables are cheap; a stock-out is what costs you",
          "Rack & Network Lab → cable the device once you have stock",
        ],
        makeContext: (infra) => {
          const cable = infra.inventory.items.find((i) => i.id === "sku-rj45-3m");
          if (!cable) return null;
          return { serviceName: cable.name };
        },
        title: () => `Patching blocked — no Cat6 3m cables on the shelf`,
        description: (ctx) =>
          `User request:\nThe new rack row cannot be patched. The bench is out of **${ctx.serviceName}**.\n\n` +
          `What we found:\n• Every run needs a patch lead and there are none spare\n\n` +
          `Objective:\n• Restock the cable line so patching can continue`,
        win: (infra) => {
          const cable = infra.inventory.items.find((i) => i.id === "sku-rj45-3m");
          return !!cable && availableOf(cable) >= 3;
        },
      }),
  },

  // ── Cloud ────────────────────────────────────────────────────────────────
  {
    id: "gen-cloud-exposure",
    category: "Security & Incident",
    track: "secops",
    tags: ["cloud", "aether", "security", "shield"],
    tiers: ["Tier_3_Hard", "Tier_4_Expert"],
    variants: 2,
    build: ({ rng, tier, id }) => {
      const port = pick(rng, [3389, 5432, 3306, 1433]);
      return base({ category: "Security & Incident", track: "secops", tags: ["cloud", "aether", "security", "shield"] }, tier, id, {
        personaId: "persona-soc-urgent",
        summary: "A cloud Shield rule exposes an admin port publicly.",
        hints: [
          "AetherCloud → AetherTrace → filter to critical and read what changed",
          "The entry names the rule id and the port",
          "Shield tab → delete the rule or restrict its source to the corporate range",
        ],
        makeContext: (infra) => {
          const avn = infra.cloud.avns[0];
          if (!avn) return null;
          return { serviceName: avn.name, affectedVlan: avn.cidr, rackPort: String(port) };
        },
        title: (ctx) => `Public exposure of port ${ctx.rackPort} in ${ctx.serviceName}`,
        description: (ctx) =>
          `Alert:\nAn external scan reached **port ${ctx.rackPort}** inside **${ctx.serviceName}** ` +
          `(${ctx.affectedVlan}) from an unauthenticated source.\n\n` +
          `What we found:\n• A Shield rule allows the port from **0.0.0.0/0**\n` +
          `• AetherTrace recorded the change and who made it\n\n` +
          `Objective:\n• Close the exposure without breaking legitimate web traffic`,
        requester: (_c, org) => ({
          name: "SOC On-Call",
          role: "Security Operations",
          email: `soc@${mailDomain(org)}`,
          department: "Security",
        }),
        injectFault: (draft, ctx) => {
          const avn = draft.cloud.avns[0];
          if (!avn) return;
          const rid = `sr-${9000 + Number(ctx.rackPort ?? 0) % 900}`;
          draft.cloud.shieldRules.push({
            id: rid,
            avnId: avn.id,
            description: "TEMP - vendor access",
            protocol: "tcp",
            port: Number(ctx.rackPort),
            source: "0.0.0.0/0",
            action: "allow",
          });
          draft.cloud.audit.unshift({
            id: `aud-${rid}`,
            at: Date.now() - 1000 * 60 * 40,
            actor: "j.doe",
            action: `Opened TCP port ${ctx.rackPort} from 0.0.0.0/0 on Shield rule ${rid}`,
            target: rid,
            severity: "critical",
          });
        },
        win: (infra, ctx) =>
          !infra.cloud.shieldRules.some(
            (r) => r.action === "allow" && r.source === "0.0.0.0/0" && r.port === Number(ctx.rackPort),
          ),
      });
    },
  },
  {
    id: "gen-cloud-capacity",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["cloud", "aether", "capacity", "finops"],
    tiers: ["Tier_3_Hard"],
    variants: 2,
    build: ({ tier, id }) =>
      base({ category: "System & Web Services", track: "sysadmin", tags: ["cloud", "aether", "capacity", "finops"] }, tier, id, {
        summary: "A workload needs cloud compute, sized sensibly.",
        hints: [
          "AetherCloud → Compute → launch a vNode for the workload",
          "Right-size it — High-Spec bills 8 cr/h and costs XP at resolution",
          "A Standard node is enough unless the ticket says otherwise",
        ],
        makeContext: (infra) => {
          const avn = infra.cloud.avns[0];
          if (!avn) return null;
          return { serviceName: avn.name };
        },
        title: () => `Batch workload has nowhere to run — provision cloud compute`,
        description: (ctx) =>
          `User request:\nThe nightly batch has outgrown the rack and needs somewhere to run.\n\n` +
          `What we found:\n• No spare on-prem capacity\n• **${ctx.serviceName}** has room\n\n` +
          `Objective:\n• Launch a running vNode sized to the job\n\n` +
          `> Finance reviews the burn rate. Over-provisioning reduces the XP awarded here.`,
        win: (infra) => infra.cloud.vnodes.filter((v) => v.status === "running").length >= 3,
      }),
  },

  // ── Datacentre physics (v0.3.1) ──────────────────────────────────────────
  //
  // Every win-condition here grades an ACTION the operator takes in the rack —
  // reset the breaker, fit cooling, upgrade the feed — never a metric that can
  // drift back into range on its own. A ticket that heals itself while the
  // player is still reading it teaches nothing.
  {
    id: "gen-pdu-trip",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["rack", "power", "pdu", "outage"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const rackName = pick(rng, RACK_NAMES);
      const voice = pick(rng, VOICES);
      // Tier 3 is not satisfied by a bare reset: the rack has to come back
      // with real headroom, or the next spin-up trips it straight back.
      const headroomPct = tier === "Tier_3_Hard" ? 85 : 100;
      return base(
        { category: "System & Web Services", track: "sysadmin", tags: ["rack", "power", "pdu", "outage"] },
        tier,
        id,
        {
          personaId: voice.persona,
          severity: "critical",
          priority: "P1",
          summary: `${rackName} is dark — the PDU breaker has tripped.`,
          hints: [
            "Open Rack Lab: the header bar reads draw against the PDU ceiling",
            "A breaker will not re-close into a fault — unpatch a power lead first",
            headroomPct < 100
              ? "Leave real headroom (under 85%); a rack sitting at 99% trips again immediately"
              : "Reset the breaker once the cabled load is back under the ceiling",
          ],
          makeContext: () => ({ rackName }),
          title: (ctx) => `Rack PDU power trip — ${ctx.rackName} lost all feeds`,
          description: (ctx) =>
            `Alert:\nThe PDU feeding **${ctx.rackName}** has tripped its breaker. Every device on ` +
            `that bus dropped simultaneously.\n\nWhat we found:\n` +
            `• Continuous draw exceeded the rated ceiling on the feed\n` +
            `• The breaker is latched open and will not self-restore\n\n` +
            `Objective:\n` +
            `• Shed enough load to get back under the PDU rating\n` +
            `• Re-close the breaker${headroomPct < 100 ? ` and leave the rack under ${headroomPct}% load` : ""}`,
          injectFault: (draft) => {
            // Trip the busiest rack — the one where an overload is plausible.
            const target = [...draft.datacenter.racks].sort(
              (a, b) => connectedLoadWatts(b) - connectedLoadWatts(a),
            )[0];
            if (target) {
              target.breakerTripped = true;
              target.trippedAt = Date.now();
            }
          },
          win: (infra) =>
            // Every rack closed, and none of them sitting on the limit.
            infra.datacenter.racks.every(
              (r) =>
                !r.breakerTripped &&
                connectedLoadWatts(r, infra.nodes) <= (pduSpec(r.pduId).maxWatts * headroomPct) / 100,
            ),
        },
      );
    },
  },
  {
    id: "gen-rack-cooling",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["rack", "thermal", "cooling", "procurement"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard", "Tier_4_Expert"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const rackName = pick(rng, RACK_NAMES);
      const subject = pick(rng, ["SAN array", "virtualisation cluster", "database node", "backup target"]);
      // Tier sets the grade of cooling the room actually needs: a fan tray
      // buys 5C, a CRAC buys 18C and costs 450W of the power budget to run.
      const needC = tier === "Tier_4_Expert" ? DEVICE_COOLING_C.crac! : DEVICE_COOLING_C["fan-tray"]!;
      const gear = needC >= 18 ? "2U in-rack CRAC" : "1U fan tray";
      return base(
        { category: "System & Web Services", track: "sysadmin", tags: ["rack", "thermal", "cooling", "procurement"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: `${subject} in ${rackName} is running hot and throttling.`,
          hints: [
            "Rack Lab's header gauge reads the rack's steady-state temperature",
            `Procurement stocks the ${gear} under Power`,
            "Cooling only counts once it is mounted AND cabled for power — an unpatched CRAC cools nothing",
          ],
          makeContext: () => ({ rackName, serviceName: subject }),
          title: (ctx) => `Overheating ${ctx.serviceName} in ${ctx.rackName}`,
          description: (ctx) =>
            `User request:\nThe **${ctx.serviceName}** in ${ctx.rackName} keeps throttling and the ` +
            `chassis alarm will not clear.\n\nWhat we found:\n` +
            `• Rack inlet temperature is well above the 20-22C target\n` +
            `• No cooling capacity is fitted in that rack\n\n` +
            `Objective:\n` +
            `• Fit and power at least a ${gear} (${needC}C of cooling)\n` +
            `• Bring the rack back out of thermal shutdown`,
          win: (infra) =>
            // Cooling has to land in a rack that is actually carrying load —
            // fitting a CRAC in an empty rack fixes nothing.
            infra.datacenter.racks.some((r) => {
              const cooling = r.devices
                .filter((d) => isPowered(r, d.id))
                .reduce((t, d) => t + (DEVICE_COOLING_C[d.kind] ?? 0), 0);
              return cooling >= needC && connectedLoadWatts(r, infra.nodes) > 0;
            }) && infra.datacenter.racks.every((r) => rackThermal(r, infra.nodes).state !== "critical"),
        },
      );
    },
  },
  {
    id: "gen-rack-capacity",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["rack", "power", "procurement", "capacity"],
    tiers: ["Tier_3_Hard", "Tier_4_Expert"],
    variants: 2,
    build: ({ rng, tier, id }) => {
      const rackName = pick(rng, RACK_NAMES);
      return base(
        { category: "System & Web Services", track: "sysadmin", tags: ["rack", "power", "procurement", "capacity"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: `${rackName} has no power budget left for the next build-out.`,
          hints: [
            "The 120V/20A feed tops out at 2,400W — that is the ceiling in the header bar",
            "Procurement stocks a 208V/30A high-density PDU under Power",
            "Swap the rack feed from Rack Lab once the unit is on the shelf",
          ],
          makeContext: () => ({ rackName }),
          title: (ctx) => `Insufficient rack power capacity — ${ctx.rackName} build-out blocked`,
          description: (ctx) =>
            `Change request:\nCapacity planning wants two more nodes in **${ctx.rackName}**, and the ` +
            `existing feed cannot carry them.\n\nWhat we found:\n` +
            `• The rack runs from a standard 120V/20A PDU (2,400W ceiling)\n` +
            `• Projected draw after the build-out exceeds that\n\n` +
            `Objective:\n` +
            `• Procure and cut over to the 208V/30A high-density feed\n` +
            `• Confirm the rack is energised and inside its new envelope`,
          win: (infra) =>
            infra.datacenter.racks.some(
              (r) => r.pduId === "pdu-30a" && !r.breakerTripped && !rackPower(r, infra.nodes).overloaded,
            ),
        },
      );
    },
  },

  // ── The unified estate (v0.4.0) ──────────────────────────────────────────
  //
  // These are the families the Grand Unification exists for. Each one can only
  // be resolved by crossing the physical/logical boundary in BOTH directions:
  // read a fault in the Server Manager, act on it in the rack, and prove it in
  // the Server Manager again. None of them can be closed from one app.
  {
    id: "gen-thermal-remediation",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["rack", "thermal", "migration", "hardware", "procurement"],
    tiers: ["Tier_3_Hard", "Tier_4_Expert"],
    variants: 2,
    build: ({ rng, tier, id }) => {
      const subject = pick(rng, ["database", "virtualisation", "storage", "directory"]);
      return base(
        { category: "System & Web Services", track: "sysadmin", tags: ["rack", "thermal", "migration", "hardware", "procurement"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          severity: "high",
          priority: "P2",
          summary: `A ${subject} host is running hot and needs a liquid loop fitted.`,
          hints: [
            "Server Manager tells you which host it is and which rack and U it sits in",
            "You cannot open a live chassis — Maintenance Mode, then live-migrate its workloads to a host with headroom",
            "Once it is drained you can power it down; then fit the Liquid Cooling Kit on the Datacenter Floor",
            "Bring it back up afterwards. A host left powered down is still an outage",
          ],
          makeContext: (infra, r) => {
            const racked = Object.values(infra.nodes).filter(
              (n) => isRackable(n.role) && !!locationOf(infra.datacenter, n.nodeId),
            );
            if (racked.length < 2) return null; // nowhere to migrate to
            const target = pick(r, racked);
            return { targetNodeId: target.nodeId, targetHostname: target.hostname };
          },
          title: (ctx) => `Overheating host ${ctx.targetHostname} — fit liquid cooling without dropping service`,
          description: (ctx, org) =>
            `Change request:\n**${ctx.targetHostname}** is the hottest box on the floor and Capacity want a liquid ` +
            `loop on it before the summer peak. ${org.name} does not accept unplanned downtime on it.\n\n` +
            `What we found:\n` +
            `• The chassis runs above its neighbours under sustained load\n` +
            `• It is carrying live workloads, so it cannot simply be switched off\n\n` +
            `Objective:\n` +
            `• Put the host into a change window and live-migrate its workloads elsewhere\n` +
            `• Power it down cleanly, fit a **Liquid Cooling Kit**, then bring it back online\n\n` +
            `> Yanking a live host is recorded as an unplanned outage and scored as one.`,
          win: (infra, ctx) => {
            const at = locationOf(infra.datacenter, String(ctx.targetNodeId));
            const node = infra.nodes[String(ctx.targetNodeId)];
            if (!at || !node) return false;
            // Fitted, and the host is back in service. Half a job is not a job.
            return !!at.device.liquidCooled && node.connection.online;
          },
        },
      );
    },
  },
  {
    id: "gen-capacity-upgrade",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["rack", "capacity-plan", "migration", "ram", "hardware", "procurement"],
    tiers: ["Tier_3_Hard", "Tier_4_Expert"],
    variants: 2,
    build: ({ rng, tier, id }) => {
      const addGb = pick(rng, [32, 64]);
      return base(
        { category: "System & Web Services", track: "sysadmin", tags: ["rack", "capacity-plan", "migration", "ram", "hardware", "procurement"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: `A host is out of memory headroom and needs another ${addGb} GB fitted.`,
          hints: [
            "Server Manager shows committed memory against what is physically fitted",
            "Match the generation — a DDR4 module will not seat in a DDR5 board, and the app will say so",
            "Drain and power down before opening the chassis; fitting a part into a live host is refused",
            "Capacity updates the moment the DIMM is in — there is no separate sync step",
          ],
          makeContext: (infra, r) => {
            const racked = Object.values(infra.nodes).filter(
              (n) => isRackable(n.role) && n.workloads.length > 0 && !!locationOf(infra.datacenter, n.nodeId),
            );
            if (racked.length < 2) return null;
            const target = pick(r, racked);
            const at = locationOf(infra.datacenter, target.nodeId)!;
            return {
              targetNodeId: target.nodeId,
              targetHostname: target.hostname,
              rackName: at.rack.name,
            };
          },
          title: (ctx) => `${ctx.targetHostname} is short on memory — fit another ${addGb} GB`,
          description: (ctx) =>
            `Capacity request:\n**${ctx.targetHostname}** (${ctx.rackName}) is running close to its committed ` +
            `memory ceiling and the next workload will not fit.\n\nWhat we found:\n` +
            `• Committed memory is at or near what is physically installed\n` +
            `• There are free DIMM slots in the chassis\n\n` +
            `Objective:\n` +
            `• Order matching memory from Procurement\n` +
            `• Drain the host, power it down, and fit at least **${addGb} GB** more\n` +
            `• Bring it back online and confirm the new capacity in the Server Manager`,
          win: (infra, ctx) => {
            const at = locationOf(infra.datacenter, String(ctx.targetNodeId));
            const node = infra.nodes[String(ctx.targetNodeId)];
            if (!at || !node || !at.device.hardware) return false;
            const baseline = baseHardwareFor(at.device.assetItemId);
            return at.device.hardware.ramGb >= baseline.ramGb + addGb && node.connection.online;
          },
        },
      );
    },
  },
  {
    id: "gen-missing-uplink",
    category: "Network & Routing",
    track: "netops",
    tags: ["rack", "cabling", "provisioning"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 2,
    build: ({ rng, tier, id }) => {
      const who = pick(rng, ["Capacity Planning", "the build team", "the previous shift", "a contractor"]);
      return base(
        { category: "Network & Routing", track: "netops", tags: ["rack", "cabling", "provisioning"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: "A chassis was racked and powered but never patched into the top-of-rack switch.",
          hints: [
            "The Datacenter Floor header counts chassis with no uplink",
            "Select the chassis; if the ToR switch has a free port, Connect uplink provisions it",
            "No free ports means fitting a bigger switch, not forcing it",
          ],
          makeContext: () => ({ department: "IT" }),
          title: () => `Racked server is unreachable — no top-of-rack uplink`,
          description: () =>
            `Handover note:\n${who} racked and powered a server but the build was never finished. It does not ` +
            `answer, and it is not in the Server Manager at all.\n\nWhat we found:\n` +
            `• The chassis is mounted and drawing power\n` +
            `• Nothing is patched from it into the rack's ToR switch, so it has no address\n\n` +
            `Objective:\n` +
            `• Patch the uplink and provision the host\n` +
            `• Confirm it appears in the Server Manager with an IP`,
          injectFault: (draft) => {
            // Rack a bare chassis with power but deliberately no uplink. This
            // is the single most confusing state in the app, so the ticket
            // that teaches it hands the player the exact symptom.
            //
            // ONE orphan, however many variants of this family spawn. God Mode
            // mints every template at once; without this guard the floor would
            // grow four unpatched servers and 1kW of phantom load before the
            // player had touched anything.
            const alreadyOrphaned = draft.datacenter.racks.some((r) =>
              r.devices.some(
                (d) =>
                  d.kind === "server" &&
                  !r.cables.some(
                    (c) => c.kind === "patch" && (c.fromDeviceId === d.id || c.toDeviceId === d.id),
                  ),
              ),
            );
            if (alreadyOrphaned) return;

            const rack = draft.datacenter.racks.find((r) =>
              r.devices.some((d) => d.kind === "switch"),
            );
            if (!rack) return;
            const occupied = new Set<number>();
            for (const d of rack.devices) {
              for (let u = d.uStart; u < d.uStart + d.uSize; u++) occupied.add(u);
            }
            let slot = 0;
            for (let u = 3; u <= rack.sizeU; u++) {
              if (!occupied.has(u)) { slot = u; break; }
            }
            if (!slot) return;
            const pdu = rack.devices.find((d) => d.kind === "pdu");
            const id = `rd-orphan-${draft.org.seed}`;
            rack.devices.push({
              id,
              kind: "server",
              name: `SRV-NEW-${String(draft.org.seed % 90 + 10)}`,
              assetItemId: "sku-srv-1u",
              watts: 250,
              uStart: slot,
              uSize: 1,
              ports: ["eth0", "eth1", "psu"],
              // Give it real parts: a chassis with no hardware would report
              // capacity from a fallback and read as "—" in every panel.
              hardware: baseHardwareFor("sku-srv-1u"),
            });
            if (pdu) {
              const used = new Set(rack.cables.filter((c) => c.toDeviceId === pdu.id).map((c) => c.toPort));
              const outlet = pdu.ports.find((o) => !used.has(o));
              if (outlet) {
                rack.cables.push({
                  id: `cb-orphan-${draft.org.seed}`,
                  kind: "power",
                  fromDeviceId: id,
                  fromPort: "psu",
                  toDeviceId: pdu.id,
                  toPort: outlet,
                });
              }
            }
          },
          win: (infra) =>
            // Nothing on the floor is racked-but-unreachable any more.
            floorSummary(infra.datacenter, infra.nodes).unlinkedCount === 0,
        },
      );
    },
  },
  {
    id: "gen-unplanned-outage",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["migration", "outage", "change-control"],
    tiers: ["Tier_3_Hard"],
    variants: 1,
    build: ({ rng, tier, id }) =>
      base(
        { category: "System & Web Services", track: "sysadmin", tags: ["migration", "outage", "change-control"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          severity: "critical",
          priority: "P1",
          summary: "A host was powered down while it was still carrying live services.",
          hints: [
            "Bring every host back online first — the services are down until their host is up",
            "Next time: Maintenance Mode, then live-migrate, and only then cut power",
          ],
          makeContext: () => ({ department: "IT" }),
          title: () => `Service outage — a live host was powered down without draining it`,
          description: (_ctx, org) =>
            `Major incident:\nServices went dark across ${org.name} with no change record. The host carrying them ` +
            `was powered off while it was still running them.\n\nWhat we found:\n` +
            `• The workloads did not migrate — they stopped\n` +
            `• No change window had been declared for the host\n\n` +
            `Objective:\n` +
            `• Restore service: every racked host back online\n\n` +
            `> Change control exists so that this costs a change window instead of an incident.`,
          // Grades the RECOVERY, not the mistake: bring the estate back up.
          win: (infra) =>
            Object.values(infra.nodes)
              .filter((n) => isRackable(n.role) && !!locationOf(infra.datacenter, n.nodeId))
              .every((n) => n.connection.online),
        },
      ),
  },
];

// ── Generator ───────────────────────────────────────────────────────────────

/**
 * Enumerate the whole procedural library for a world.
 *
 * Deterministic in the world seed, so the same org always yields the same
 * catalogue — saves stay reproducible and a ticket id always means the same
 * scenario.
 */
export function generateProceduralTemplates(rng: Rng): Record<string, TicketTemplate> {
  const out: Record<string, TicketTemplate> = {};
  for (const family of FAMILIES) {
    for (const tier of family.tiers) {
      for (let v = 0; v < family.variants; v++) {
        const id = `${family.id}-${tier.split("_")[1].toLowerCase()}-${v + 1}`;
        out[id] = family.build({ rng, tier, variantIndex: v, id });
      }
    }
  }
  return out;
}

/** Library size without building it — used by the Toolbox and tests. */
export function proceduralLibrarySize(): number {
  return FAMILIES.reduce((t, f) => t + f.tiers.length * f.variants, 0);
}
