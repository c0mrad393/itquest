/**
 * ITQuest — Procedural ticket engine
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
  effectiveGroups, hasAccess, phaseSpec, poolExhausted, settingApplies, storageDemandGb,
} from "@/lib/core";
import type { ShareAccess } from "@/lib/core";
import { int, pick, sample, type Rng } from "@/lib/org/rng";
import { endpointForUser } from "@/lib/core";
import { resolveDriveStatus } from "@/lib/infra/shares";
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

/**
 * A workstation from the GATEWAY roster.
 *
 * Two families still use this, on purpose. `gen-ransomware` isolates its host
 * through the security layer and `gen-stock-out` runs through Procurement, and
 * both were written against a machine the gateway lists; moving them to the
 * fleet is a change worth making against a verified run rather than in the
 * same pass as everything else.
 *
 * Everything that is only about somebody's own machine uses `staffEndpoint`
 * instead — see the note there for why that matters.
 */
function anyWorkstation(infra: InfrastructureState, rng: Rng): TargetNode | null {
  const ws = gatewayNodes(infra).filter((n) => n.role === "workstation");
  return ws.length ? pick(rng, ws) : null;
}

/**
 * A member of staff and the machine they actually use.
 *
 * ── WHY NOT JUST TAKE A WORKSTATION ─────────────────────────────────────────
 *
 * The estate has 24 workstations at phase 1 and 216 at phase 3, and all but a
 * couple carry the `fleet-endpoint` tag that keeps them off the Remote Gateway
 * list. That is a deliberate and correct call — a gateway listing 216 desktops
 * is not a tool — but it left exactly ONE connectable Windows workstation at
 * every growth phase, so every endpoint ticket in the library pointed at the
 * same machine. Two tickets raised together landed on the same host, and
 * fixing one could resolve the other.
 *
 * The fleet is not unreachable; it is reached the way a real service desk
 * reaches it — through the directory, per person. `endpointForUser` is the
 * exact mapping the Directory Console's Remote Connect uses, so a ticket bound
 * this way names the machine the operator will actually land on, and the route
 * it teaches is the one the estate was designed around.
 *
 * It also writes better. "Nothing prints from WS-430" is a hostname; "Iris
 * Takeda cannot print" is somebody's morning.
 */
function staffEndpoint(
  infra: InfrastructureState,
  rng: Rng,
  service?: string,
): { user: { samAccountName: string; displayName: string; department?: string }; node: TargetNode } | null {
  const ad = adUsers(infra);
  if (!ad) return null;
  // Filter to workable pairs BEFORE picking. Picking a person and then
  // discovering their machine is a Mac is how a family becomes unhostable
  // half the time, silently.
  const pairs = ad.users
    .filter((u) => u.enabled)
    .map((u) => ({ user: u, node: endpointForUser(infra, u.samAccountName) }))
    .filter(
      (p): p is { user: typeof p.user; node: TargetNode } =>
        !!p.node && p.node.os === "windows" && (!service || !!p.node.services?.[service]),
    );
  return pairs.length ? pick(rng, pairs) : null;
}

/**
 * A Windows workstation that actually has the named service.
 *
 * FILTER FIRST, THEN PICK. Writing this as `anyWorkstation(...)` followed by a
 * guard looks equivalent and is not: a phase-1 estate puts two workstations on
 * the gateway and one of them is a Mac, so picking at random and then
 * rejecting the wrong answer makes the whole family unhostable half the time —
 * silently, because an unhostable template is simply skipped by the factory.
 * That is how two families I had just written ended up generating nothing at
 * all in a starter world.
 */
function windowsWorkstation(
  infra: InfrastructureState,
  rng: Rng,
  service: string,
): TargetNode | null {
  const candidates = gatewayNodes(infra).filter(
    (n) => n.role === "workstation" && n.os === "windows" && !!n.services?.[service],
  );
  return candidates.length ? pick(rng, candidates) : null;
}

function adUsers(infra: InfrastructureState) {
  const dc = nodesOf(infra).find((n) => n.role === "domain-controller");
  return dc && "activeDirectory" in dc ? dc.activeDirectory : null;
}

const mailDomain = (org: { domain: string }) => org.domain.replace(".internal", ".com");

/**
 * The directory as DATA.
 *
 * Deliberately NOT `liveDirectory`: a win-condition grades the state of the
 * estate, not whether the console happens to be reachable at the instant the
 * reconciler runs. Gating the grade on reachability would un-resolve a
 * finished ticket the moment someone tripped a breaker elsewhere.
 */
function adOf(infra: InfrastructureState) {
  const dc = Object.values(infra.nodes).find((n) => n.os === "windows" && !!n.activeDirectory);
  return dc && dc.os === "windows" ? dc.activeDirectory : undefined;
}

/** The estate's file server, whatever it is called in this org. */
function fileServerOf(infra: InfrastructureState) {
  return Object.values(infra.nodes).find((n) => n.role === "file-server");
}

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
          const hit = staffEndpoint(infra, r);
          if (!hit) return null;
          return {
            targetNodeId: hit.node.nodeId,
            targetHostname: hit.node.hostname,
            targetUserId: hit.user.samAccountName,
            targetUserName: hit.user.displayName,
            department: hit.user.department ?? dept,
            serviceName: spec.label,
          };
        },
        title: (ctx) => `${ctx.targetUserName} out of memory — ${ctx.serviceName} upgrade`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** (${ctx.department}) reports ` +
          `**${ctx.targetHostname} freezing** under load.\n\n` +
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
          const hit = staffEndpoint(infra, r);
          if (!hit) return null;
          return {
            targetNodeId: hit.node.nodeId,
            targetHostname: hit.node.hostname,
            targetUserId: hit.user.samAccountName,
            targetUserName: hit.user.displayName,
            department: hit.user.department,
            serviceName: proc,
          };
        },
        title: (ctx) => `${ctx.targetUserName}'s machine is unusable — one process eating the CPU`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** (${ctx.department}) says **${ctx.targetHostname}** is ` +
          `"so slow it's unusable" and the fan has been at full speed all morning.\n\n` +
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

  // ── The software topology (v0.5.0) ───────────────────────────────────────
  //
  // These families cannot be closed from any single app. Each one needs a
  // directory change AND a share change, and each is graded on EFFECTIVE
  // ACCESS — the same resolver the Shared Drives app shows — so half a fix
  // reads as half a fix rather than silently passing.
  //
  // They also inherit the whole stack beneath them: if the domain controller's
  // rack has tripped, none of this is reachable until the breaker is back on.
  // The cascade is not scripted, it just falls out of the dependency chain.
  {
    id: "gen-share-access",
    category: "Identity & Access",
    track: "helpdesk",
    tags: ["ad", "identity", "shares", "acl", "access"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const level = tier === "Tier_3_Hard" ? ("change" as const) : ("read" as const);
      const voice = pick(rng, VOICES);
      return base(
        { category: "Identity & Access", track: "helpdesk", tags: ["ad", "identity", "shares", "acl", "access"] },
        tier,
        id,
        {
          personaId: voice.persona,
          summary: "A member of staff needs access to a departmental share they are not entitled to yet.",
          hints: [
            "Open Enterprise Directory Services and add the account to the group that owns the data",
            "Then open Shared Drives — membership alone grants nothing until the group is on the share's access list",
            "Use Effective access on the share to prove it before you resolve",
          ],
          makeContext: (infra, r) => {
            const dir = adOf(infra);
            const fs = fileServerOf(infra);
            if (!dir || !fs?.shares?.length) return null;

            /*
             * FILTER TO SHARES THAT CAN ACTUALLY CARRY THIS TICKET, then pick.
             *
             * Picking first and rejecting after made this family bind only 87%
             * of the time: a starter estate has a `Public` share owned by
             * Domain Users, so there is nobody outside it to be asking for
             * access, and landing on it returned null. Thirteen percent of the
             * time the family silently did not exist — and an unhostable
             * template is skipped without complaint, so nothing ever said so.
             */
            const usable = fs.shares
              .filter((sh) => sh.acl.length > 0 && !sh.acl.some((a) => a.deny))
              .map((sh) => ({
                share: sh,
                owningGroup: sh.acl.find((a) => !a.deny && a.groupName !== "Domain Admins")?.groupName,
              }))
              .filter((c): c is { share: typeof c.share; owningGroup: string } => !!c.owningGroup)
              .map((c) => ({
                ...c,
                outsiders: dir.users.filter(
                  (u) => u.enabled && !effectiveGroups(dir, u.samAccountName).includes(c.owningGroup),
                ),
              }))
              .filter((c) => c.outsiders.length > 0);
            if (!usable.length) return null;
            const chosen = pick(r, usable);
            const share = chosen.share;
            const owningGroup = chosen.owningGroup;
            const user = pick(r, chosen.outsiders);

            return {
              targetUserId: user.samAccountName,
              targetUserName: user.displayName,
              department: user.department,
              targetGroup: owningGroup,
              shareId: share.id,
              shareName: share.name,
              sharePath: share.path,
              accessLevel: level,
            };
          },
          title: (ctx) => `Access request — ${ctx.targetUserName} needs ${ctx.shareName}`,
          description: (ctx) =>
            `User request:\n**${ctx.targetUserName}** (${ctx.targetUserId}, ${ctx.department}) has been asked to ` +
            `work on material in **${ctx.sharePath}** and cannot open it.\n\nWhat we found:\n` +
            `• The share grants access through the **${ctx.targetGroup}** security group\n` +
            `• Their account is not in that group\n\nObjective:\n` +
            `• Grant them **${ctx.accessLevel === "change" ? "Change" : "Read"}** access to ${ctx.shareName}\n` +
            `• Group-based access only — do not add the account to the share directly\n\n` +
            `> Membership and the access list are two different things. Check both.`,
          requester: (ctx, org) => ({
            name: String(ctx.targetUserName),
            role: voice.role,
            email: `${ctx.targetUserId}@${mailDomain(org)}`,
            department: String(ctx.department),
          }),
          win: (infra, ctx) => {
            const dir = adOf(infra);
            const fs = fileServerOf(infra);
            const share = fs?.shares?.find((sh) => sh.id === ctx.shareId);
            if (!dir || !share) return false;
            // Graded on what the user can ACTUALLY do, not on the steps taken.
            return hasAccess(dir, share, String(ctx.targetUserId), ctx.accessLevel as ShareAccess);
          },
        },
      );
    },
  },
  {
    id: "gen-stale-deny",
    category: "Identity & Access",
    track: "helpdesk",
    tags: ["ad", "identity", "shares", "acl"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 2,
    build: ({ rng, tier, id }) =>
      base(
        { category: "Identity & Access", track: "helpdesk", tags: ["ad", "identity", "shares", "acl"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: "A user is in the right group and still cannot open the share.",
          hints: [
            "Run Effective access on the share against their logon name — it names the reason",
            "An explicit Deny beats every grant, including Full control",
            "The Deny is on a group, not on the person; take it off the access list",
          ],
          makeContext: (infra, r) => {
            const dir = adOf(infra);
            const fs = fileServerOf(infra);
            const share = fs?.shares?.find((sh) => sh.acl.some((a) => a.deny));
            if (!dir || !share) return null;
            const deny = share.acl.find((a) => a.deny)!;
            const victims = dir.users.filter(
              (u) => u.enabled && effectiveGroups(dir, u.samAccountName).includes(deny.groupName),
            );
            if (!victims.length) return null;
            const user = pick(r, victims);
            return {
              targetUserId: user.samAccountName,
              targetUserName: user.displayName,
              department: user.department,
              targetGroup: deny.groupName,
              shareId: share.id,
              shareName: share.name,
              sharePath: share.path,
            };
          },
          title: (ctx) => `${ctx.targetUserName} is denied ${ctx.shareName} despite being in the group`,
          description: (ctx) =>
            `User request:\n**${ctx.targetUserName}** says ${ctx.sharePath} throws access denied, and their ` +
            `manager confirms they should have it.\n\nWhat we found:\n` +
            `• The account IS in a group that appears on the share\n` +
            `• Access is still refused\n\nObjective:\n` +
            `• Work out what is overriding the grant and clear it\n\n` +
            `> This one is a five-minute fix if you check effective access first, and an afternoon if you do not.`,
          requester: (ctx, org) => ({
            name: String(ctx.targetUserName),
            role: "Analyst",
            email: `${ctx.targetUserId}@${mailDomain(org)}`,
            department: String(ctx.department),
          }),
          win: (infra, ctx) => {
            const dir = adOf(infra);
            const fs = fileServerOf(infra);
            const share = fs?.shares?.find((sh) => sh.id === ctx.shareId);
            if (!dir || !share) return false;
            return hasAccess(dir, share, String(ctx.targetUserId), "read");
          },
        },
      ),
  },
  {
    id: "gen-onboard-access",
    category: "Identity & Access",
    track: "helpdesk",
    tags: ["ad", "identity", "onboarding", "shares", "acl"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 2,
    build: ({ rng, tier, id }) => {
      const groupSuffix = pick(rng, ["Project", "Programme", "Workstream"]);
      return base(
        { category: "Identity & Access", track: "helpdesk", tags: ["ad", "identity", "onboarding", "shares", "acl"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: "A new cross-team workstream needs its own security group and share access.",
          hints: [
            "Create the security group in Enterprise Directory Services first — the share cannot grant to a group that does not exist",
            "Add the named people to it",
            "Then grant that group Change on the share in Shared Drives",
          ],
          makeContext: (infra, r) => {
            const dir = adOf(infra);
            const fs = fileServerOf(infra);
            if (!dir || !fs?.shares?.length) return null;
            const share = pick(r, fs.shares.filter((sh) => !sh.acl.some((a) => a.deny)));
            if (!share) return null;
            const members = sample(r, dir.users.filter((u) => u.enabled), 2);
            if (members.length < 2) return null;
            const dept = share.owner.replace(/\s+/g, "");
            return {
              targetGroup: `${dept}_${groupSuffix}`,
              shareId: share.id,
              shareName: share.name,
              sharePath: share.path,
              targetUserId: members[0].samAccountName,
              targetUserName: members[0].displayName,
              newUserSam: members[1].samAccountName,
              newUserName: members[1].displayName,
              department: share.owner,
            };
          },
          title: (ctx) => `Stand up ${ctx.targetGroup} and give it ${ctx.shareName}`,
          description: (ctx) =>
            `Change request:\nA new cross-team workstream is starting and needs its own access, kept separate ` +
            `from the departmental groups.\n\nWhat we need:\n` +
            `• A security group named **${ctx.targetGroup}**\n` +
            `• **${ctx.targetUserName}** (${ctx.targetUserId}) and **${ctx.newUserName}** (${ctx.newUserSam}) in it\n` +
            `• That group granted **Change** on **${ctx.sharePath}**\n\n` +
            `> Do not grant the individuals directly. The point of the group is that the next joiner is one click.`,
          win: (infra, ctx) => {
            const dir = adOf(infra);
            const fs = fileServerOf(infra);
            const share = fs?.shares?.find((sh) => sh.id === ctx.shareId);
            if (!dir || !share) return false;
            const group = String(ctx.targetGroup);
            if (!dir.groups.some((g) => g.name === group)) return false;
            // Both people, and through the NEW group specifically — otherwise
            // an existing departmental grant would close the ticket for free.
            const ace = share.acl.find((a) => a.groupName === group && !a.deny);
            if (!ace || ace.access === "read") return false;
            return (
              effectiveGroups(dir, String(ctx.targetUserId)).includes(group) &&
              effectiveGroups(dir, String(ctx.newUserSam)).includes(group)
            );
          },
        },
      );
    },
  },

  // ── Growing pains (v0.6.0) ───────────────────────────────────────────────
  //
  // These arrive BECAUSE the company grew. Each one is the bill for a milestone
  // the operator has already banked: more staff means more addresses, more
  // home-drive data and more watts, and the estate that carried 35 people does
  // not carry 300. They grade the infrastructure fix, never the headcount.
  {
    id: "gen-scaling-project",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["rack", "capacity-plan", "shares", "onboarding", "growth"],
    tiers: ["Tier_3_Hard"],
    variants: 1,
    build: ({ rng, tier, id }) =>
      base(
        { category: "System & Web Services", track: "sysadmin", tags: ["rack", "capacity-plan", "shares", "onboarding", "growth"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          severity: "high",
          priority: "P2",
          // A milestone project is the company's decision, not a request the
          // service desk gets to decline.
          mandatory: true,
          summary: "The company has grown. The infrastructure has not.",
          hints: [
            "Enterprise Directory Services already has the new starters — the organizational units and groups came with them",
            "Check the file server has storage for their home drives and the shares to put them in",
            "Check every rack is still inside its power and thermal envelope",
          ],
          makeContext: (infra) => {
            const spec = phaseSpec(infra.growth.phase);
            return {
              department: "IT",
              serviceName: spec.label,
              accessLevel: "change" as const,
            };
          },
          title: (_ctx, org) => `Scale-up project — ${org.name} has grown`,
          description: (_ctx, org) => {
            return (
              `Project brief:\n**${org.name}** now employs ${org.employeeCount} people. The accounts exist; ` +
              `the infrastructure to serve them does not yet.\n\nWhat we found:\n` +
              `• Headcount has outgrown what the current estate was sized for\n` +
              `• Addressing, storage and power all need a look before something breaks\n\n` +
              `Objective:\n` +
              `• Bring the estate back inside its limits — every rack under its PDU ceiling, ` +
              `thermally optimal, and with room for what comes next\n\n` +
              `> This one cannot be declined. It is the company's project, not a service request.`
            );
          },
          requester: (_ctx, org) => ({
            name: "Programme Office",
            role: "Head of IT",
            email: `it-programme@${mailDomain(org)}`,
            department: "IT",
          }),
          win: (infra) =>
            // The estate is healthy at the CURRENT size: no dark racks, no rack
            // cooking, nothing over its feed. Deliberately broad — the project
            // is "make it work at this scale", not a checklist.
            infra.datacenter.racks.every(
              (r) =>
                !r.breakerTripped &&
                !rackPower(r, infra.nodes).overloaded &&
                rackThermal(r, infra.nodes).state !== "critical",
            ) &&
            Object.values(infra.nodes)
              .filter((n) => isRackable(n.role) && !!locationOf(infra.datacenter, n.nodeId))
              .every((n) => n.connection.online),
        },
      ),
  },
  {
    id: "gen-dhcp-exhaustion",
    category: "Network & Routing",
    track: "netops",
    tags: ["network", "dhcp", "capacity", "growth"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 2,
    build: ({ rng, tier, id }) => {
      const voice = pick(rng, VOICES);
      return base(
        { category: "Network & Routing", track: "netops", tags: ["network", "dhcp", "capacity", "growth"] },
        tier,
        id,
        {
          personaId: voice.persona,
          summary: "New starters cannot get an address — the user pool is full.",
          hints: [
            "Count the staff against what a /24 can actually hand out: 254 usable addresses",
            "NetOps Console — re-route the user link onto a subnet with room",
            "A wider prefix is the fix; handing out static addresses is not",
          ],
          makeContext: (infra, r) => {
            // Only real once the company is big enough to have filled a /24.
            const infraNodes = Object.values(infra.nodes).filter((n) => isRackable(n.role)).length;
            if (!poolExhausted(infra.growth.employees, infraNodes)) return null;
            const link = pick(r, infra.links.filter((l) => l.to !== "internet"));
            if (!link) return null;
            const roomy = infra.subnets.find((sn) => sn.cidr !== link.via);
            if (!roomy) return null;
            return {
              linkId: link.id,
              affectedVlan: link.via,
              rackIpv4: roomy.cidr,
              department: pick(r, DEPARTMENTS),
            };
          },
          title: () => `DHCP pool exhausted — new starters cannot get on the network`,
          description: (ctx, org) =>
            `Service desk:\nFour of this week's starters in ${ctx.department} have no network. Their machines ` +
            `pull an APIPA address and give up.\n\nWhat we found:\n` +
            `• ${org.name} now employs ${org.employeeCount} people\n` +
            `• The user subnet **${ctx.affectedVlan}** is a /24 — 254 usable addresses, and the estate needs more\n\n` +
            `Objective:\n` +
            `• Move the user segment onto a subnet with room\n\n` +
            `> Static addresses for four people is not a fix, it is four more tickets next month.`,
          requester: (_ctx, org) => ({
            name: "Service Desk",
            role: "Team Lead",
            email: `servicedesk@${mailDomain(org)}`,
            department: "IT",
          }),
          // Grades the ACTION: the link is off the exhausted subnet.
          win: (infra, ctx) => {
            const l = infra.links.find((x) => x.id === ctx.linkId);
            return !!l && l.via !== ctx.affectedVlan;
          },
        },
      );
    },
  },
  {
    id: "gen-storage-exhaustion",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["rack", "storage", "hardware", "capacity-plan", "migration", "growth"],
    tiers: ["Tier_3_Hard", "Tier_4_Expert"],
    variants: 2,
    build: ({ rng, tier, id }) =>
      base(
        { category: "System & Web Services", track: "sysadmin", tags: ["rack", "storage", "hardware", "capacity-plan", "migration", "growth"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: "The file server is out of disk — home drives have outgrown the array.",
          hints: [
            "Work out what the headcount needs: roughly 12 GB of home drive each",
            "Order enterprise disks from Procurement",
            "You cannot open a live chassis — drain it in the Server Manager first, then fit the array",
          ],
          makeContext: (infra) => {
            const fs = fileServerOf(infra);
            const at = fs ? locationOf(infra.datacenter, fs.nodeId) : undefined;
            if (!fs || !at) return null;
            const needGb = storageDemandGb(infra.growth.employees);
            // Only fires when the fitted array genuinely cannot carry the staff.
            if (at.device.hardware && at.device.hardware.storageGb >= needGb) return null;
            return {
              targetNodeId: fs.nodeId,
              targetHostname: fs.hostname,
              rackName: at.rack.name,
              serviceName: `${needGb} GB`,
            };
          },
          title: (ctx) => `${ctx.targetHostname} is out of storage — home drives will not fit`,
          description: (ctx, org) =>
            `Capacity alert:\n**${ctx.targetHostname}** (${ctx.rackName}) has no room left. Home drives for ` +
            `${org.employeeCount} staff need about **${ctx.serviceName}** and the fitted array is smaller than that.` +
            `\n\nWhat we found:\n` +
            `• Shares are refusing writes as the volume fills\n` +
            `• The chassis has bays free\n\nObjective:\n` +
            `• Fit enough enterprise storage to carry the current headcount\n` +
            `• Do it inside a change window — this host serves every department`,
          win: (infra, ctx) => {
            const at = locationOf(infra.datacenter, String(ctx.targetNodeId));
            const node = infra.nodes[String(ctx.targetNodeId)];
            if (!at?.device.hardware || !node) return false;
            return (
              at.device.hardware.storageGb >= storageDemandGb(infra.growth.employees) &&
              node.connection.online
            );
          },
        },
      ),
  },

  // ── Directory & policy work (v0.8.0) ─────────────────────────────────────
  //
  // The classic service-desk curriculum, graded on the ESTATE rather than on
  // the steps taken. The onboarding ticket in particular checks the finished
  // account — OU, groups, title, manager — so there is no prescribed click
  // order, only a correct outcome.
  {
    id: "gen-eds-lockout",
    category: "Identity & Access",
    track: "helpdesk",
    tags: ["ad", "lockout", "identity"],
    tiers: ["Tier_1_Easy"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const voice = pick(rng, VOICES);
      const cause = pick(rng, [
        "a phone still signing in with last month's password",
        "a stale mapped drive retrying in the background",
        "one too many attempts before the morning coffee",
      ]);
      return base(
        { category: "Identity & Access", track: "helpdesk", tags: ["ad", "lockout", "identity"] },
        tier,
        id,
        {
          personaId: voice.persona,
          summary: "An account has locked itself out on failed sign-ins.",
          hints: [
            "Remote into the directory server and open Enterprise Directory Services",
            "Find the account — locked ones carry a padlock in the list",
            "Unlock clears the lock AND the bad-password counter; a reset is only needed if they have forgotten it",
          ],
          makeContext: (infra, r) => {
            const ad = adOf(infra);
            if (!ad) return null;
            const candidates = ad.users.filter((u) => u.enabled);
            if (!candidates.length) return null;
            const user = pick(r, candidates);
            return {
              targetUserId: user.samAccountName,
              targetUserName: user.displayName,
              department: user.department,
            };
          },
          title: (ctx) => `${ctx.targetUserName} is locked out and cannot sign in`,
          description: (ctx) =>
            `User request:\n**${ctx.targetUserName}** (${ctx.targetUserId}, ${ctx.department}) cannot sign in. ` +
            `The message says the account is locked.\n\nWhat we found:\n` +
            `• Repeated failed sign-ins tripped the lockout threshold — probably ${cause}\n` +
            `• The account itself is not disabled\n\nObjective:\n` +
            `• Clear the lockout so they can work\n\n` +
            `> Unlocking is not the same as resetting. Reset only if the password is genuinely forgotten — every ` +
            `reset is a password they have to memorise again.`,
          requester: (ctx, org) => ({
            name: String(ctx.targetUserName),
            role: voice.role,
            email: `${ctx.targetUserId}@${mailDomain(org)}`,
            department: String(ctx.department),
          }),
          injectFault: (draft, ctx) => {
            const dc = Object.values(draft.nodes).find((n) => n.os === "windows" && !!n.activeDirectory);
            const ad = dc && dc.os === "windows" ? dc.activeDirectory : undefined;
            const u = ad?.users.find((x) => x.samAccountName === ctx.targetUserId);
            if (u) { u.locked = true; u.badPwdCount = 7; }
          },
          win: (infra, ctx) => {
            const ad = adOf(infra);
            const u = ad?.users.find((x) => x.samAccountName === ctx.targetUserId);
            return !!u && !u.locked && u.enabled;
          },
        },
      );
    },
  },
  {
    id: "gen-eds-onboarding",
    category: "Identity & Access",
    track: "helpdesk",
    tags: ["ad", "identity", "onboarding"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 2,
    build: ({ rng, tier, id }) => {
      const seniority = pick(rng, ["VP of Sales", "Head of Finance", "Director of Operations", "Head of People"]);
      return base(
        { category: "Identity & Access", track: "helpdesk", tags: ["ad", "identity", "onboarding"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: `A senior hire starts Monday and needs an account provisioning properly.`,
          hints: [
            "Enterprise Directory Services — create the account in the right organizational unit",
            "The OU decides which Fleet Policies apply, so the department is not just a label",
            "Set the job title and the reporting line; an org chart with holes is how leavers get missed",
          ],
          makeContext: (infra, r) => {
            const ad = adOf(infra);
            if (!ad) return null;
            const dept = ad.ous.find((o) => new RegExp(seniority.split(" ").pop() ?? "", "i").test(o.name))
              ?? pick(r, ad.ous);
            const managers = ad.users.filter((u) => u.enabled && u.department === dept.name);
            const manager = managers.length ? pick(r, managers) : pick(r, ad.users);
            const first = pick(r, ["Tamar", "Nino", "Giorgi", "Sopho", "Luka", "Mariam"]);
            const last = pick(r, ["Varamishvili", "Beridze", "Kapanadze", "Tsereteli", "Gogoladze"]);
            return {
              newUserName: `${first} ${last}`,
              newUserSam: `${first[0].toLowerCase()}.${last.toLowerCase()}`,
              targetTitle: seniority,
              department: dept.name,
              targetGroup: `${dept.name.replace(/\s+/g, "")}_RW`,
              targetUserId: manager.samAccountName,
              targetUserName: manager.displayName,
            };
          },
          title: (ctx) => `Onboard ${ctx.newUserName} — ${ctx.targetTitle}`,
          description: (ctx) =>
            `HR request:\n**${ctx.newUserName}** joins as **${ctx.targetTitle}** on Monday and needs to be able ` +
            `to work on day one.\n\nWhat we need:\n` +
            `• An account in the **${ctx.department}** organizational unit\n` +
            `• Job title set to **${ctx.targetTitle}**\n` +
            `• Reporting to **${ctx.targetUserName}** (${ctx.targetUserId})\n` +
            `• Member of **${ctx.targetGroup}** so the department's drive works\n\n` +
            `> Put them in the right unit from the start. Moving an account later changes which Fleet Policies ` +
            `apply to it, and that is how someone quietly loses their drive mapping.`,
          requester: (_ctx, org) => ({
            name: "People Operations",
            role: "HR Business Partner",
            email: `people@${mailDomain(org)}`,
            department: "HR",
          }),
          win: (infra, ctx) => {
            const ad = adOf(infra);
            if (!ad) return false;
            // Graded on the finished ACCOUNT, not the click order: any route
            // that ends with a correctly-provisioned person is correct.
            const u = ad.users.find(
              (x) =>
                x.displayName.toLowerCase() === String(ctx.newUserName).toLowerCase() ||
                x.samAccountName === ctx.newUserSam,
            );
            if (!u || !u.enabled) return false;
            if (u.department !== ctx.department) return false;
            if (u.title !== ctx.targetTitle) return false;
            if (u.manager !== ctx.targetUserId) return false;
            return effectiveGroups(ad, u.samAccountName).includes(String(ctx.targetGroup));
          },
        },
      );
    },
  },
  {
    id: "gen-cfp-usb-lockdown",
    category: "Security & Incident",
    track: "sysadmin",
    tags: ["ad", "policy", "cfp", "security", "compliance"],
    tiers: ["Tier_2_Medium", "Tier_3_Hard"],
    variants: 2,
    build: ({ rng, tier, id }) =>
      base(
        { category: "Security & Incident", track: "sysadmin", tags: ["ad", "policy", "cfp", "security", "compliance"] },
        tier,
        id,
        {
          personaId: pick(rng, VOICES).persona,
          summary: "A regulated team must have removable storage blocked.",
          hints: [
            "Centralized Fleet Policies — create a policy and set Block USB mass storage",
            "A policy that is not LINKED to a container does nothing at all",
            "Link it to the department's organizational unit, not the domain root — this applies to one team",
            "The Resulting settings panel tells you what is really in force, and which policy won",
          ],
          makeContext: (infra, r) => {
            const ad = adOf(infra);
            if (!ad) return null;
            const ou = ad.ous.find((o) => /finance/i.test(o.name)) ?? pick(r, ad.ous);
            return { department: ou.name, targetGroup: ou.dn, serviceName: "removable storage" };
          },
          title: (ctx) => `Block USB storage for ${ctx.department} — audit finding`,
          description: (ctx, org) =>
            `Compliance action:\nThe external audit of ${org.name} flagged that **${ctx.department}** handle ` +
            `regulated data on machines where anyone can plug in a USB stick.\n\nWhat we need:\n` +
            `• Removable storage blocked for **${ctx.department}** and nobody else\n` +
            `• Delivered through Centralized Fleet Policies, not by visiting desks\n\n` +
            `Objective:\n` +
            `• A Fleet Policy that blocks USB mass storage, linked so it is in force on ${ctx.department}\n\n` +
            `> Check the resulting settings before you close this. A policy you created but never linked is the ` +
            `commonest reason an audit finding comes back.`,
          requester: (_ctx, org) => ({
            name: "Compliance Office",
            role: "Compliance Officer",
            email: `compliance@${mailDomain(org)}`,
            department: "Legal",
          }),
          win: (infra, ctx) => {
            const ou = String(ctx.targetGroup);
            // Grades the RESULT of policy resolution, so any correct linking
            // works — new policy or existing, OU link or an enforced one from
            // above — and an unlinked policy fails, which is the lesson.
            if (!settingApplies(infra.policy, ou, "usbStorageBlocked", true)) return false;
            // ...and only for them. A domain-wide block would also satisfy a
            // naive check, but it is not what compliance asked for.
            const ad = adOf(infra);
            const others = (ad?.ous ?? []).filter((o) => o.dn !== ou);
            return !others.some((o) => settingApplies(infra.policy, o.dn, "usbStorageBlocked", true));
          },
        },
      ),
  },

  /* ── First-shift breadth ────────────────────────────────────────────────
   *
   * A brand-new operator could only ever be handed five kinds of work, and
   * nine of the twenty-four level-1 templates were the same account lockout.
   * Nothing here needs a new mechanic: the estate already models Windows
   * services, per-node DNS and the update agent, with panels to drive all
   * three — no ticket had ever sent anybody to them.
   *
   * Every tag below is deliberately outside TAG_APP, so none of these gate on
   * an app the free tier cannot reach.
   */
  {
    id: "gen-print-spooler",
    category: "System & Web Services",
    track: "helpdesk",
    tags: ["print", "service", "endpoint"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const dept = pick(rng, DEPARTMENTS);
      const voice = pick(rng, VOICES);
      const hard = tier !== "Tier_1_Easy";
      return base({ category: "System & Web Services", track: "helpdesk", tags: ["print", "service", "endpoint"] }, tier, id, {
        personaId: voice.persona,
        summary: `Printing has stopped on a ${dept} machine — the spooler is not running.`,
        hints: [
          "This is a staff machine, not infrastructure — find the person in the directory",
          "Directory Console → the requester → Remote Connect opens their endpoint",
          "Open Services on it and find Print Spooler",
          hard
            ? "Starting it is not enough here — check its startup type, or it will be gone again after a reboot"
            : "Start the service, then have them print a test page",
        ],
        makeContext: (infra, r) => {
          const hit = staffEndpoint(infra, r, "Spooler");
          if (!hit) return null;
          return {
            targetNodeId: hit.node.nodeId,
            targetHostname: hit.node.hostname,
            targetUserId: hit.user.samAccountName,
            targetUserName: hit.user.displayName,
            department: hit.user.department ?? dept,
          };
        },
        title: (ctx) => `${ctx.targetUserName} cannot print`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** (${ctx.department}) has a stack of jobs that never ` +
          `come out. Other people on the same printer are fine.\n\nWhat we found:\n` +
          `• The printer answers on the network, so it is not the printer\n` +
          `• The problem is on **${ctx.targetHostname}**, the machine they sign in to\n` +
          `• The Print Spooler service on this machine is not running\n` +
          (hard
            ? `• Somebody set it to not start at all, so a reboot will not fix it\n`
            : ``) +
          `\nObjective:\n• Get printing working from this machine` +
          (hard ? ` — and make sure it survives a restart` : ``),
        requester: (ctx, org) => ({
          name: String(ctx.targetUserName),
          role: voice.role,
          email: `${ctx.targetUserId}@${mailDomain(org)}`,
          department: String(ctx.department),
        }),
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (!n || n.os !== "windows") return;
          const svc = n.services.Spooler;
          if (!svc) return;
          svc.status = "Stopped";
          svc.pid = null;
          if (hard) svc.startupType = "Disabled";
        },
        /*
         * The harder variant grades the STARTUP TYPE as well, because the
         * complaint is "it keeps coming back". Accepting a running service
         * that is still disabled would mark the ticket solved and let the
         * fault return on the next reboot.
         */
        win: (infra, ctx) => {
          const n = infra.nodes[String(ctx.targetNodeId)];
          if (!n || n.os !== "windows") return false;
          const svc = n.services.Spooler;
          if (!svc || svc.status !== "Running") return false;
          return hard ? svc.startupType !== "Disabled" : true;
        },
        healthyNode: (_i, ctx) => String(ctx.targetNodeId),
      });
    },
  },
  {
    id: "gen-dns-client",
    category: "Network & Routing",
    track: "netops",
    tags: ["dns", "network", "endpoint"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const dept = pick(rng, DEPARTMENTS);
      const voice = pick(rng, VOICES);
      // A plausible wrong answer: a public resolver that cannot see the
      // internal zone, which is exactly why the symptom is "internal things
      // are broken but the internet is fine".
      const stray = pick(rng, ["9.9.9.9", "1.1.1.1", "8.8.4.4"]);
      return base({ category: "Network & Routing", track: "netops", tags: ["dns", "network", "endpoint"] }, tier, id, {
        personaId: voice.persona,
        summary: `One machine cannot resolve internal names — its DNS points outside.`,
        hints: [
          "Find the person in the directory and Remote Connect to their endpoint",
          "Check its DNS servers — a public resolver cannot see the internal zone",
          "Point it back at the domain controller",
        ],
        makeContext: (infra, r) => {
          const hit = staffEndpoint(infra, r);
          const dc = nodesOf(infra).find((n) => n.role === "domain-controller");
          if (!hit || !dc) return null;
          return {
            targetNodeId: hit.node.nodeId,
            targetHostname: hit.node.hostname,
            targetUserId: hit.user.samAccountName,
            targetUserName: hit.user.displayName,
            department: hit.user.department ?? dept,
            expectedDns: dc.connection.ip,
            observedDns: stray,
          };
        },
        title: (ctx) => `${ctx.targetUserName} has lost the intranet and their drives`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** (${ctx.department}) says the intranet and their ` +
          `mapped drives have "disappeared" from **${ctx.targetHostname}**, but the internet works.\n\n` +
          `What we found:\n` +
          `• The machine is on the network and pings by IP\n` +
          `• Its DNS is set to **${ctx.observedDns}**, which has never heard of the internal zone\n` +
          `• The domain controller at **${ctx.expectedDns}** is the one that answers for it\n\n` +
          `Objective:\n• Get the machine resolving internal names again`,
        requester: (ctx, org) => ({
          name: String(ctx.targetUserName),
          role: voice.role,
          email: `${ctx.targetUserId}@${mailDomain(org)}`,
          department: String(ctx.department),
        }),
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (n) n.network.dnsServers = [String(ctx.observedDns)];
        },
        win: (infra, ctx) => {
          const n = infra.nodes[String(ctx.targetNodeId)];
          if (!n) return false;
          const dns = n.network.dnsServers;
          // The internal resolver has to be there, and the stray one gone —
          // leaving both would work by luck and fail the moment order changed.
          return dns.includes(String(ctx.expectedDns)) && !dns.includes(String(ctx.observedDns));
        },
        healthyNode: (_i, ctx) => String(ctx.targetNodeId),
      });
    },
  },
  {
    id: "gen-update-blocked",
    category: "System & Web Services",
    track: "sysadmin",
    tags: ["updates", "patching", "service", "endpoint"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const dept = pick(rng, DEPARTMENTS);
      return base({ category: "System & Web Services", track: "sysadmin", tags: ["updates", "patching", "service", "endpoint"] }, tier, id, {
        personaId: "persona-marcus-calm",
        summary: `A machine has stopped taking updates — the update service is disabled.`,
        hints: [
          "A staff laptop, so go through the directory rather than the gateway",
          "Directory Console → the user → Remote Connect",
          "Open Services and look at the update service, not the update panel",
          "A disabled service cannot be started by the panel that depends on it",
        ],
        makeContext: (infra, r) => {
          const hit = staffEndpoint(infra, r, "wuauserv");
          if (!hit) return null;
          return {
            targetNodeId: hit.node.nodeId,
            targetHostname: hit.node.hostname,
            targetUserId: hit.user.samAccountName,
            targetUserName: hit.user.displayName,
            department: hit.user.department ?? dept,
          };
        },
        title: (ctx) => `${ctx.targetHostname} has not patched in months`,
        description: (ctx) =>
          `User request:\nThe compliance report flags **${ctx.targetHostname}** — the machine ` +
          `**${ctx.targetUserName}** (${ctx.department}) signs in to — as months behind on patches. ` +
          `They say the update screen "just spins".\n\n` +
          `What we found:\n` +
          `• The machine is online and otherwise healthy\n` +
          `• Its update service is set to Disabled, so the update screen has nothing to talk to\n` +
          `• Nothing is wrong with the update source itself\n\n` +
          `Objective:\n• Put the update service back in service so the machine can patch again`,
        requester: (_ctx, org) => ({
          name: "Compliance",
          role: "Risk & Compliance",
          email: `compliance@${mailDomain(org)}`,
          department: "Legal",
        }),
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (!n || n.os !== "windows") return;
          const svc = n.services.wuauserv;
          if (!svc) return;
          svc.status = "Stopped";
          svc.pid = null;
          svc.startupType = "Disabled";
        },
        /*
         * Both halves, deliberately. Starting the service once satisfies the
         * complaint for today; leaving it Disabled means the next reboot puts
         * the machine straight back on the compliance report.
         */
        win: (infra, ctx) => {
          const n = infra.nodes[String(ctx.targetNodeId)];
          if (!n || n.os !== "windows") return false;
          const svc = n.services.wuauserv;
          return !!svc && svc.status === "Running" && svc.startupType !== "Disabled";
        },
        healthyNode: (_i, ctx) => String(ctx.targetNodeId),
      });
    },
  },

  {
    /*
     * NOT A LOCKOUT, and the difference is the whole lesson.
     *
     * A lockout is the account defending itself after bad passwords and clears
     * with an unlock. A DISABLED account was switched off by a person — the
     * leaver process, a manager's request, a mistake during onboarding — and
     * unlocking it does nothing at all. The two look identical from the user's
     * side ("it won't let me in") and are fixed in different places, which is
     * exactly the discrimination a first-line technician has to learn.
     */
    id: "gen-disabled-account",
    category: "Identity & Access",
    track: "helpdesk",
    tags: ["ad", "identity", "access"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const voice = pick(rng, VOICES);
      const reason = pick(rng, [
        "came back from a long secondment",
        "returned from parental leave",
        "was re-hired into a new team",
        "moved back from the contractor roll",
      ]);
      return base({ category: "Identity & Access", track: "helpdesk", tags: ["ad", "identity", "access"] }, tier, id, {
        personaId: voice.persona,
        summary: `An account is switched off, not locked — unlocking it will not help.`,
        hints: [
          "Directory Console → find the account and read its state carefully",
          "Locked and Disabled are different things with different fixes",
          "Enable the account, then check it is not also locked",
        ],
        makeContext: (infra, r) => {
          const ad = adUsers(infra);
          if (!ad) return null;
          // Filter before picking: an account that is already disabled cannot
          // be disabled by this ticket's fault and would read as pre-solved.
          const candidates = ad.users.filter((u) => u.enabled && !u.locked);
          if (!candidates.length) return null;
          const user = pick(r, candidates);
          return {
            targetUserId: user.samAccountName,
            targetUserName: user.displayName,
            department: user.department,
          };
        },
        title: (ctx) => `${ctx.targetUserName} cannot sign in — "your account has been disabled"`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** (${ctx.targetUserId}, ${ctx.department}) ${reason} ` +
          `and cannot sign in. The message names their account, not their password.\n\n` +
          `What we found:\n` +
          `• The account is not locked — no failed sign-in run, nothing to unlock\n` +
          `• It is DISABLED: somebody switched it off and nobody switched it back\n` +
          `• Their password is fine and does not need resetting\n\n` +
          `Objective:\n• Put the account back in service without changing their password`,
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
          if (u) u.enabled = false;
        },
        /*
         * Graded on BOTH, so the lazy fix fails: resetting the password or
         * clearing a lock leaves the account off, and the user still cannot
         * sign in tomorrow.
         */
        win: (infra, ctx) => {
          const ad = adUsers(infra);
          const u = ad?.users.find((x) => x.samAccountName === ctx.targetUserId);
          return !!u && u.enabled && !u.locked;
        },
      });
    },
  },
  {
    /*
     * The third Windows service the estate models, and the one that produces
     * the most confusing symptom: the resolver addresses are correct, so every
     * check an operator makes on paper passes — but the client that asks them
     * is not running.
     */
    id: "gen-dns-service",
    category: "Network & Routing",
    track: "netops",
    tags: ["dns", "service", "endpoint"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const voice = pick(rng, VOICES);
      return base({ category: "Network & Routing", track: "netops", tags: ["dns", "service", "endpoint"] }, tier, id, {
        personaId: voice.persona,
        summary: `Name resolution is dead on one machine, but its DNS settings are correct.`,
        hints: [
          "Find the person in the directory and Remote Connect to their machine",
          "The DNS server addresses are right — check them and rule them out",
          "The DNS Client service is what asks them, and it is not running",
        ],
        makeContext: (infra, r) => {
          const hit = staffEndpoint(infra, r, "Dnscache");
          if (!hit) return null;
          return {
            targetNodeId: hit.node.nodeId,
            targetHostname: hit.node.hostname,
            targetUserId: hit.user.samAccountName,
            targetUserName: hit.user.displayName,
            department: hit.user.department,
          };
        },
        title: (ctx) => `${ctx.targetUserName} can reach things by IP but nothing by name`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** (${ctx.department}) can open a bookmarked address ` +
          `that happens to be an IP, and nothing else. Everything by name fails on ` +
          `**${ctx.targetHostname}**.\n\nWhat we found:\n` +
          `• The machine is on the network and routes fine\n` +
          `• Its DNS server addresses are correct — this is not a settings problem\n` +
          `• Nothing on the machine is asking them\n\n` +
          `Objective:\n• Get name resolution working again on this machine`,
        requester: (ctx, org) => ({
          name: String(ctx.targetUserName),
          role: voice.role,
          email: `${ctx.targetUserId}@${mailDomain(org)}`,
          department: String(ctx.department),
        }),
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (!n || n.os !== "windows") return;
          const svc = n.services.Dnscache;
          if (!svc) return;
          svc.status = "Stopped";
          svc.pid = null;
        },
        win: (infra, ctx) => {
          const n = infra.nodes[String(ctx.targetNodeId)];
          if (!n || n.os !== "windows") return false;
          return n.services.Dnscache?.status === "Running";
        },
        healthyNode: (_i, ctx) => String(ctx.targetNodeId),
      });
    },
  },

  {
    /*
     * THE SYMPTOM IS NOT ALWAYS WHERE THE FAULT IS, and this family is built
     * so the operator has to find out which case they are in.
     *
     * Tier 1: one person's session did not come back at logon. Everyone else
     * is fine, the server is fine, and Reconnect on their machine is the whole
     * job — the client is genuinely the fault.
     *
     * Tier 2: the same complaint, from one person, but the share service on
     * the file server has stopped. Reconnect is still the obvious first move
     * and it will fail, immediately and for a reason — which is the moment the
     * operator learns to look past the machine in front of them. Everyone
     * else's drives are down too; nobody has said so yet.
     *
     * The two are indistinguishable from the ticket text on purpose. That is
     * what makes the first check worth making.
     */
    id: "gen-drive-dropped",
    category: "System & Web Services",
    track: "helpdesk",
    tags: ["shares", "mapped-drive", "endpoint"],
    tiers: ["Tier_1_Easy", "Tier_2_Medium"],
    variants: 3,
    build: ({ rng, tier, id }) => {
      const voice = pick(rng, VOICES);
      const serverSide = tier !== "Tier_1_Easy";
      return base({ category: "System & Web Services", track: "helpdesk", tags: ["shares", "mapped-drive", "endpoint"] }, tier, id, {
        personaId: voice.persona,
        summary: serverSide
          ? `A mapped drive is down, and reconnecting it will not help.`
          : `One person's mapped drive did not come back after a restart.`,
        hints: [
          "Find the person in the directory and Remote Connect to their machine",
          "This PC shows the drive and whether it is actually connected",
          serverSide
            ? "Reconnect fails straight away — that is the answer. Check whether anyone ELSE can reach the share"
            : "Reconnect re-establishes the session; confirm it comes back Connected",
        ],
        makeContext: (infra, r) => {
          const fs = fileServerOf(infra);
          if (!fs) return null;
          // Filter to staff whose machine actually carries a drive from this
          // server, then pick. There is no ticket here without one.
          const ad = adUsers(infra);
          if (!ad) return null;
          const pairs = ad.users
            .filter((u) => u.enabled)
            .map((u) => ({ user: u, node: endpointForUser(infra, u.samAccountName) }))
            .filter((p) => !!p.node && p.node.os === "windows")
            .map((p) => ({
              ...p,
              drive: (p.node as TargetNode & { mappedDrives?: { letter: string; serverNodeId?: string; shareName?: string }[] })
                .mappedDrives?.find((d) => d.serverNodeId === fs.nodeId),
            }))
            .filter((p) => !!p.drive);
          if (!pairs.length) return null;
          const hit = pick(r, pairs);
          return {
            targetNodeId: hit.node!.nodeId,
            targetHostname: hit.node!.hostname,
            targetUserId: hit.user.samAccountName,
            targetUserName: hit.user.displayName,
            department: hit.user.department,
            serverNodeId: fs.nodeId,
            serverHostname: fs.hostname,
            shareName: hit.drive!.letter,
          };
        },
        title: (ctx) => `${ctx.targetUserName} cannot open ${ctx.shareName} — drive shows disconnected`,
        description: (ctx) =>
          `User request:\n**${ctx.targetUserName}** (${ctx.department}) restarted this morning and ` +
          `**${ctx.shareName}** has not come back. Everything they need for today is on it.\n\n` +
          `What we found:\n` +
          `• The drive is still mapped to **\\\\${ctx.serverHostname}** — nothing was deleted\n` +
          `• It reports disconnected on **${ctx.targetHostname}**\n` +
          `• Nobody else has reported anything\n\n` +
          `Objective:\n• Get them back into ${ctx.shareName}`,
        requester: (ctx, org) => ({
          name: String(ctx.targetUserName),
          role: voice.role,
          email: `${ctx.targetUserId}@${mailDomain(org)}`,
          department: String(ctx.department),
        }),
        injectFault: (draft, ctx) => {
          const n = draft.nodes[String(ctx.targetNodeId)];
          if (n && n.os !== "linux" && n.mappedDrives) {
            const d = n.mappedDrives.find((x) => x.letter === ctx.shareName);
            if (d) d.status = "disconnected";
          }
          if (!serverSide) return;
          // The server-side variant ALSO stops the share service, so the
          // client-side fix is attempted, fails, and sends them upstream.
          const fs = draft.nodes[String(ctx.serverNodeId)];
          if (fs && fs.os === "windows" && fs.services.FleetShare) {
            fs.services.FleetShare.status = "Stopped";
            fs.services.FleetShare.pid = null;
          }
        },
        /*
         * Graded through the same derivation the endpoint's own file view
         * uses, so "solved" means exactly what the operator can see: the drive
         * reads Connected. On the Tier 2 variant that is only reachable once
         * the share service is back, whatever was clicked on the client.
         */
        win: (infra, ctx) => {
          const n = infra.nodes[String(ctx.targetNodeId)];
          if (!n || n.os === "linux" || !n.mappedDrives) return false;
          const d = n.mappedDrives.find((x) => x.letter === ctx.shareName);
          return !!d && resolveDriveStatus(infra, d) === "connected";
        },
      });
    },
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
