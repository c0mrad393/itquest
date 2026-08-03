/**
 * TriageOS — Ticket Content Matrix (procedural content engine)
 * ============================================================
 * The single registry of ticket templates, 3 per category across Tiers 1-3.
 * Replaces the old SCENARIOS map: each template owns its classification,
 * dynamic text, persona, SLA, optional world-fault injection, and a
 * context-addressed win-condition evaluated by the reconciler.
 *
 * A template's `makeContext` binds procedurally generated assets (a specific
 * AD user, hostname, VLAN, attacker IP…) into a TicketDynamicContext; the
 * factory then renders title/description/email against it, and `win(infra, ctx)`
 * checks live state for exactly that instance.
 */

import type {
  InfrastructureState,
  NodeId,
  OrganizationProfile,
  TicketCategory,
  TicketDifficulty,
  TicketDynamicContext,
  TicketOrigin,
  TicketPriority,
  TicketRequester,
  TicketSeverity,
  TicketTrack,
  WindowsNodeState,
} from "@/lib/core";
import { isPowered, uplinkOf, hybridRoute, exposedAdminRules } from "@/lib/core";
import { findFaultWeb, findFirstWorkstation, findPrimaryDC } from "@/lib/org/generator";
import { int, pick, type Rng } from "@/lib/org/rng";

export interface EmailBeat {
  from: string;
  fromEmail: string;
  subject: string;
  body: string;
  /** Minutes before "now" this beat arrived (older = larger). */
  ageMin: number;
}

export interface TicketTemplate {
  id: string;
  category: TicketCategory;
  difficulty: TicketDifficulty;
  track: TicketTrack;
  severity: TicketSeverity;
  priority: TicketPriority;
  /** Resolution SLA (seconds). Tighter for higher urgency. */
  slaDuration: number;
  responseSeconds: number;
  xpReward: number;
  personaId: string;
  tags: string[];
  /** Tier 2/3 default to "mail" (escalating thread before hitting the board). */
  origin: TicketOrigin;
  summary: string; // Toolbox runbook summary
  hints: string[];
  /** Whether this template's win-condition is fully interactive this build. */
  playable: boolean;

  /** Bind generated assets; return null if the world can't host this template. */
  makeContext: (infra: InfrastructureState, rng: Rng) => TicketDynamicContext | null;
  title: (ctx: TicketDynamicContext, org: OrganizationProfile) => string;
  description: (ctx: TicketDynamicContext, org: OrganizationProfile) => string;
  requester: (ctx: TicketDynamicContext, org: OrganizationProfile) => TicketRequester;
  /** Escalating CoreMail thread (Tier 2/3). Oldest beat first. */
  emailThread?: (ctx: TicketDynamicContext, org: OrganizationProfile) => EmailBeat[];

  /** Optional world fault injected at generation (mutates the infra draft). */
  injectFault?: (infra: InfrastructureState, ctx: TicketDynamicContext) => void;
  /** Resolution predicate over live infra + this instance's context. */
  win: (infra: InfrastructureState, ctx: TicketDynamicContext) => boolean;
  /** Node forced healthy on resolve. */
  healthyNode?: (infra: InfrastructureState, ctx: TicketDynamicContext) => NodeId | undefined;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

const mailDomain = (org: OrganizationProfile) => org.domain.replace(".internal", ".com");
const adUserEmail = (ctx: TicketDynamicContext, org: OrganizationProfile) =>
  `${ctx.targetUserId}@${mailDomain(org)}`;

function randomUser(infra: InfrastructureState, rng: Rng) {
  const ad = findPrimaryDC(infra)?.activeDirectory;
  if (!ad || ad.users.length === 0) return null;
  return pick(rng, ad.users.filter((u) => u.enabled) ?? ad.users);
}

function lockedUser(infra: InfrastructureState) {
  const ad = findPrimaryDC(infra)?.activeDirectory;
  return ad?.users.find((u) => u.locked) ?? null;
}

function domainAdmin(infra: InfrastructureState, rng: Rng) {
  const ad = findPrimaryDC(infra)?.activeDirectory;
  const admins = ad?.users.filter((u) => u.memberOf.includes("Domain Admins")) ?? [];
  return admins.length ? pick(rng, admins) : (ad?.users[0] ?? null);
}

function nodeByRole(infra: InfrastructureState, role: string) {
  return Object.values(infra.nodes).find((n) => n.role === role) ?? null;
}

function externalIp(rng: Rng): string {
  return `${int(rng, 23, 210)}.${int(rng, 0, 255)}.${int(rng, 0, 255)}.${int(rng, 2, 254)}`;
}

const LOOKALIKE_DOMAINS = [
  "it-support-desk.com", "secure-verify-login.net", "account-security-alert.com",
  "hr-benefits-portal.co", "invoice-payments-team.com",
];

// ── The matrix ──────────────────────────────────────────────────────────────

export const TICKET_TEMPLATES: Record<string, TicketTemplate> = {
  // ═══ A. Identity & Access ═══════════════════════════════════════════════
  "id-t1-lockout": {
    id: "id-t1-lockout",
    category: "Identity & Access",
    difficulty: "Tier_1_Easy",
    track: "helpdesk",
    severity: "medium",
    priority: "P3",
    slaDuration: 30 * 60,
    responseSeconds: 5 * 60,
    xpReward: 160,
    personaId: "persona-jane-irritated",
    tags: ["active-directory", "account-lockout"],
    origin: "dashboard",
    summary: "A domain user is locked out after repeated failed sign-ins.",
    hints: [
      "ADUC → filter by Locked → find the user",
      "Unlock account, confirm it is Enabled",
    ],
    playable: true,
    makeContext: (infra) => {
      const u = lockedUser(infra);
      return u ? { targetUserId: u.samAccountName, targetUserName: u.displayName, department: u.department } : null;
    },
    title: (ctx) => `Account lockout — ${ctx.targetUserName} cannot sign in`,
    description: (ctx, org) =>
      `${ctx.targetUserName} (${ctx.targetUserId}, ${ctx.department}) reports being locked out of the ${org.netbios} domain before an important deadline. Unlock the account and confirm the lockout source.`,
    requester: (ctx, org) => ({
      name: ctx.targetUserName!, role: `${ctx.department} staff`, email: adUserEmail(ctx, org), department: ctx.department,
    }),
    win: (infra, ctx) => {
      const u = findPrimaryDC(infra)?.activeDirectory?.users.find((x) => x.samAccountName === ctx.targetUserId);
      return !!u && !u.locked && u.enabled;
    },
  },

  "id-t2-onboarding": {
    id: "id-t2-onboarding",
    category: "Identity & Access",
    difficulty: "Tier_2_Medium",
    track: "sysadmin",
    severity: "medium",
    priority: "P3",
    slaDuration: 45 * 60,
    responseSeconds: 15 * 60,
    xpReward: 300,
    personaId: "persona-marcus-calm",
    tags: ["active-directory", "powershell", "onboarding"],
    origin: "mail",
    summary: "A batch new-hire import failed on a PowerShell syntax error.",
    hints: [
      "Review the New-ADUser import script for the malformed line",
      "Correct the syntax and re-run the batch (ADUC → Bulk import)",
    ],
    playable: false,
    makeContext: (infra, rng) => ({ department: pick(rng, ["Sales", "Operations", "Finance"]) }),
    title: (ctx) => `Onboarding batch failed — ${ctx.department} new hires have no accounts`,
    description: (ctx) =>
      `The Monday ${ctx.department} onboarding batch (14 accounts) failed halfway. The New-ADUser import script threw a syntax error and the remaining users were skipped. Fix the script and complete the import before start-of-day.`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "IT Coordinator", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    emailThread: (ctx, org) => [
      { from: "HR Operations", fromEmail: `hr-ops@${mailDomain(org)}`, subject: `New hire accounts for ${ctx.department} not ready`, body: `Hi IT — our ${ctx.department} new starters can't log in. Payroll and building access depend on their AD accounts. Can you check the import?`, ageMin: 55 },
      { from: "Marcus Feld", fromEmail: `marcus.feld@${mailDomain(org)}`, subject: `Re: New hire accounts — import script erroring`, body: `Confirmed — the New-ADUser batch failed on a syntax error ('-Enabled $ture'?). 8 of 14 created, rest skipped. Escalating to the ticket queue so we can fix the script and re-run.`, ageMin: 40 },
    ],
    win: (infra) => infra.security.onboardingComplete,
  },

  "id-t3-rogue-admin": {
    id: "id-t3-rogue-admin",
    category: "Identity & Access",
    difficulty: "Tier_3_Hard",
    track: "secops",
    severity: "critical",
    priority: "P1",
    slaDuration: 8 * 60,
    responseSeconds: 3 * 60,
    xpReward: 620,
    personaId: "persona-soc-panicked",
    tags: ["active-directory", "privilege-escalation", "incident-response"],
    origin: "mail",
    summary: "A Domain Admin account shows anomalous activity — likely compromised.",
    hints: [
      "Event Viewer → Security on the primary DC: review the admin's logons",
      "ADUC → disable the compromised admin account",
      "Force a GPO update to invalidate cached tokens",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const a = domainAdmin(infra, rng);
      return a ? { targetUserId: a.samAccountName, targetUserName: a.displayName } : null;
    },
    title: (ctx) => `Rogue Domain Admin — ${ctx.targetUserName} acting anomalously`,
    description: (ctx) =>
      `SIEM flagged the Domain Admin ${ctx.targetUserName} (${ctx.targetUserId}) creating accounts and touching GPOs at 03:12 from an unrecognized host. Treat as compromised: disable the account and force a policy refresh.`,
    requester: (_ctx, org) => ({ name: "SOC On-Call", role: "Detection & Response", email: `soc-noreply@${mailDomain(org)}`, department: "Security" }),
    emailThread: (ctx, org) => [
      { from: "SOC Automated Alerting", fromEmail: `soc-noreply@${mailDomain(org)}`, subject: `[HIGH] Off-hours Domain Admin activity — ${ctx.targetUserId}`, body: `Detection: privileged account ${ctx.targetUserId} authenticated at 03:12 local from an unenrolled device and enumerated Domain Admins. Baseline: this account never logs in off-hours.`, ageMin: 12 },
      { from: "SOC On-Call", fromEmail: `soc-noreply@${mailDomain(org)}`, subject: `Re: [HIGH] — escalating, please contain ${ctx.targetUserId}`, body: `This looks like credential compromise or an insider. We need the account disabled and a forced GPO update NOW. Opening a P1.`, ageMin: 6 },
    ],
    win: (infra, ctx) => {
      const u = findPrimaryDC(infra)?.activeDirectory?.users.find((x) => x.samAccountName === ctx.targetUserId);
      return !!u && !u.enabled;
    },
  },

  // ═══ B. Network & Routing ═══════════════════════════════════════════════
  "net-t1-latency": {
    id: "net-t1-latency",
    category: "Network & Routing",
    difficulty: "Tier_1_Easy",
    track: "netops",
    severity: "medium",
    priority: "P3",
    slaDuration: 20 * 60,
    responseSeconds: 5 * 60,
    xpReward: 200,
    personaId: "persona-marcus-calm",
    tags: ["latency", "congestion", "routing"],
    origin: "dashboard",
    summary: "A congested link is dropping packets and slowing a subnet.",
    hints: [
      "NetOps Console → find the link over ~85% utilization / high loss",
      "Re-route it onto a less-congested subnet to shed load",
    ],
    playable: true,
    makeContext: (infra) => {
      const worst = [...infra.links].filter((l) => !l.blocked).sort((a, b) => b.utilizationPct - a.utilizationPct)[0];
      return worst ? { linkId: worst.id, affectedVlan: worst.via } : null;
    },
    title: (ctx) => `High latency / packet loss on ${ctx.affectedVlan}`,
    description: (ctx) =>
      `Users on ${ctx.affectedVlan} report timeouts and slow file access. The uplink for that segment is saturated and dropping packets. Optimize the route to restore stability.`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "Branch IT Coordinator", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    injectFault: (infra, ctx) => {
      const l = infra.links.find((x) => x.id === ctx.linkId);
      if (l) { l.utilizationPct = 92; l.packetLossPct = 4.5; }
    },
    win: (infra, ctx) => {
      const l = infra.links.find((x) => x.id === ctx.linkId);
      return !!l && l.utilizationPct < 70 && l.packetLossPct < 1.5;
    },
  },

  "net-t2-firewall": {
    id: "net-t2-firewall",
    category: "Network & Routing",
    difficulty: "Tier_2_Medium",
    track: "netops",
    severity: "high",
    priority: "P2",
    slaDuration: 30 * 60,
    responseSeconds: 10 * 60,
    xpReward: 340,
    personaId: "persona-marcus-calm",
    tags: ["firewall", "segmentation", "connectivity"],
    origin: "mail",
    summary: "A misconfigured core firewall rule is blocking inter-subnet traffic.",
    hints: [
      "NetOps Console → the affected link shows as blocked",
      "Remove the erroneous block so the subnets can talk again",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const internal = infra.links.filter((l) => l.to !== "internet");
      if (internal.length === 0) return null;
      const l = pick(rng, internal);
      return { linkId: l.id, affectedVlan: l.via };
    },
    title: (ctx) => `Core firewall change broke connectivity on ${ctx.affectedVlan}`,
    description: (ctx) =>
      `After last night's change window, a core firewall rule is blocking internal traffic across ${ctx.affectedVlan}. Two subnets can no longer reach each other. Identify and remove the bad rule.`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "Branch IT Coordinator", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    emailThread: (ctx, org) => [
      { from: "Operations", fromEmail: `ops@${mailDomain(org)}`, subject: `Systems can't reach each other since this morning`, body: `Our line-of-business app can't reach the database segment. Started right after the maintenance window. Everything on ${ctx.affectedVlan} is affected.`, ageMin: 35 },
      { from: "Marcus Feld", fromEmail: `marcus.feld@${mailDomain(org)}`, subject: `Re: connectivity — firewall change suspect`, body: `The change window added a deny rule that's too broad and it's black-holing ${ctx.affectedVlan}. Escalating so we can pull the rule.`, ageMin: 22 },
    ],
    injectFault: (infra, ctx) => {
      const l = infra.links.find((x) => x.id === ctx.linkId);
      if (l) l.blocked = true;
    },
    win: (infra, ctx) => {
      const l = infra.links.find((x) => x.id === ctx.linkId);
      return !!l && !l.blocked;
    },
  },

  "net-t2-share": {
    id: "net-t2-share",
    category: "Network & Routing",
    difficulty: "Tier_2_Medium",
    track: "helpdesk",
    severity: "high",
    priority: "P2",
    slaDuration: 30 * 60,
    responseSeconds: 8 * 60,
    xpReward: 320,
    personaId: "persona-tara-calm",
    tags: ["smb", "file-share", "mapped-drive"],
    origin: "dashboard",
    summary: "Mapped network drives are disconnected across the department.",
    hints: [
      "This PC / Finder → the mapped share shows a red ✕ (disconnected)",
      "The share is served by the file server's SMB (Server / LanmanServer) service",
      "RDP to the file server → Services (services.msc) → start the Server service",
    ],
    playable: true,
    makeContext: (infra) => {
      const fs = Object.values(infra.nodes).find(
        (n): n is WindowsNodeState => n.os === "windows" && n.role === "file-server" && !!n.services["LanmanServer"],
      );
      if (!fs) return null;
      // Only fire if at least one workstation actually maps a share here.
      const mapped = Object.values(infra.nodes).some(
        (n) => n.os !== "linux" && (n.mappedDrives ?? []).some((d) => d.serverNodeId === fs.nodeId),
      );
      if (!mapped) return null;
      return { targetNodeId: fs.nodeId, targetHostname: fs.hostname, serviceName: "LanmanServer" };
    },
    title: (ctx) => `Users can't reach network drives — ${ctx.targetHostname} share offline`,
    description: (ctx) =>
      `Multiple staff report their mapped drives (e.g. Z:\\ Finance) show a red ✕ and 'disconnected'. The shares are hosted on ${ctx.targetHostname}; its Server (SMB) service appears to have stopped, so no one can open files. Restore the service to bring the shares back.`,
    requester: (_ctx, org) => ({ name: "Tara Coles", role: "Front Desk", email: `tara.coles@${mailDomain(org)}`, department: "Facilities" }),
    injectFault: (infra, ctx) => {
      const fs = infra.nodes[ctx.targetNodeId as NodeId] as WindowsNodeState | undefined;
      const svc = fs?.services["LanmanServer"];
      if (svc) { svc.status = "Stopped"; svc.pid = null; }
    },
    win: (infra, ctx) => {
      const fs = infra.nodes[ctx.targetNodeId as NodeId] as WindowsNodeState | undefined;
      return fs?.services["LanmanServer"]?.status === "Running";
    },
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  // ── Hardware Provisioning Lab & Field Dispatch ──────────────────────────────

  "hw-t1-ram-upgrade": {
    id: "hw-t1-ram-upgrade",
    category: "System & Web Services",
    difficulty: "Tier_1_Easy",
    track: "helpdesk",
    severity: "medium",
    priority: "P3",
    slaDuration: 25 * 60,
    responseSeconds: 5 * 60,
    xpReward: 220,
    personaId: "persona-tara-calm",
    tags: ["hardware", "ram", "deployment"],
    origin: "dashboard",
    summary: "A developer's workstation is crashing from out-of-memory.",
    hints: [
      "Hardware Lab → Workshop → assemble a 32GB memory module",
      "Image the replacement box (Boot from PXE)",
      "Dispatch a field team to physically swap the unit",
    ],
    playable: true,
    makeContext: (infra) => {
      const ws = findFirstWorkstation(infra);
      return ws ? { targetNodeId: ws.nodeId, targetHostname: ws.hostname, serviceName: "RAM" } : null;
    },
    title: (ctx) => `${ctx.targetHostname} crashing — out-of-memory, needs RAM upgrade`,
    description: (ctx) =>
      `User request:\nA developer says **${ctx.targetHostname} keeps crashing** whenever they run a build.\n\nWhat we found:\n• The box only has 8GB and is sitting at 98% memory\n• Their build tooling needs far more headroom\n\nObjective:\n• Fit a **32GB memory upgrade** and re-image the unit\n• Dispatch a field tech to swap it on the user's desk`,
    requester: (_ctx, org) => ({ name: "Devan Rao", role: "Software Engineer", email: `devan.rao@${mailDomain(org)}`, department: "IT" }),
    injectFault: (infra, ctx) => {
      const n = infra.nodes[ctx.targetNodeId as NodeId];
      if (n) { n.health.memUsedPct = 98; n.health.status = "critical"; }
    },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "hw-t2-rack-disk": {
    id: "hw-t2-rack-disk",
    category: "System & Web Services",
    difficulty: "Tier_2_Medium",
    track: "helpdesk",
    severity: "high",
    priority: "P2",
    slaDuration: 35 * 60,
    responseSeconds: 8 * 60,
    xpReward: 360,
    personaId: "persona-marcus-calm",
    tags: ["hardware", "disk", "storage", "hot-swap"],
    origin: "dashboard",
    summary: "A database storage server has a disk array I/O hardware failure.",
    hints: [
      "Hardware Lab → Workshop → hot-swap the failed drive on the rack tray",
      "Pick the enterprise hot-swap SAS drive from stock",
      "Dispatch a field team to rack 4B for the physical replacement",
    ],
    playable: true,
    makeContext: (infra) => {
      const db = Object.values(infra.nodes).find((n) => n.role === "database");
      return db ? { targetNodeId: db.nodeId, targetHostname: db.hostname, serviceName: "/dev/sdb" } : null;
    },
    title: (ctx) => `Disk array I/O failure on ${ctx.targetHostname} (/dev/sdb)`,
    description: (ctx) =>
      `Alert:\n**${ctx.targetHostname}** is logging I/O errors on its storage array.\n\nWhat we found:\n• The drive at **/dev/sdb** has a hardware fault\n• The array is degraded and has lost redundancy cover\n\nObjective:\n• Hot-swap in a replacement enterprise drive\n• Dispatch a field tech to rack 4B — do this before a second drive goes`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "Infrastructure Engineer", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    injectFault: (infra, ctx) => {
      const n = infra.nodes[ctx.targetNodeId as NodeId];
      if (n) { n.health.diskUsedPct = 99; n.health.status = "critical"; }
    },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "hw-v2-raid-rebuild": {
    id: "hw-v2-raid-rebuild",
    category: "System & Web Services",
    difficulty: "Tier_3_Hard",
    track: "helpdesk",
    severity: "high",
    priority: "P2",
    slaDuration: 50 * 60,
    responseSeconds: 12 * 60,
    xpReward: 560,
    personaId: "persona-marcus-calm",
    tags: ["hardware", "raid", "rebuild", "bios"],
    origin: "dashboard",
    summary: "A workstation's RAID array failed — data missing, full rebuild required.",
    hints: [
      "Hardware Lab → install two fresh disks (route SATA power + data)",
      "BIOS → set SATA Mode = RAID, build a RAID 1 mirror",
      "Partition (EFI/MSR/NTFS), set TCP/IP, join the domain, then dispatch",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const ws = Object.values(infra.nodes).filter((n) => n.os === "windows" && n.role === "workstation");
      if (ws.length === 0) return null;
      const n = ws.length > 1 ? ws[1 + (int(rng, 0, ws.length - 2))] : ws[0];
      return { targetNodeId: n.nodeId, targetHostname: n.hostname };
    },
    title: (ctx) => `Data loss on ${ctx.targetHostname} — RAID array degraded, rebuild required`,
    description: (ctx) =>
      `${ctx.targetHostname} (a high-end design workstation) reports missing data: one disk in its mirror failed and the array is degraded. Rebuild it in the Hardware Lab — install two fresh disks, enter BIOS to create a new RAID 1 array (SATA Mode = RAID), then partition, image, set static IP, join the domain, and dispatch a tech.`,
    requester: (_ctx, org) => ({ name: "Devan Rao", role: "3D Artist", email: `devan.rao@${mailDomain(org)}`, department: "IT" }),
    injectFault: (infra, ctx) => {
      const n = infra.nodes[ctx.targetNodeId as NodeId];
      if (n) { n.health.status = "critical"; n.health.diskUsedPct = 0; }
    },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "sw-v2-domain-trust": {
    id: "sw-v2-domain-trust",
    category: "Identity & Access",
    difficulty: "Tier_2_Medium",
    track: "helpdesk",
    severity: "medium",
    priority: "P3",
    slaDuration: 30 * 60,
    responseSeconds: 8 * 60,
    xpReward: 300,
    personaId: "persona-tara-calm",
    tags: ["domain", "trust-relationship", "rejoin"],
    origin: "dashboard",
    summary: "A PC can't log in — 'trust relationship between workstation and domain failed'.",
    hints: [
      "The machine password is out of sync with AD (secure channel broken)",
      "Hardware Lab → boot the unit → unjoin, then rejoin triageos.corp",
      "Use the deployment domain-admin credential from the vault to rejoin",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const ws = Object.values(infra.nodes).filter((n) => n.os === "windows" && n.role === "workstation");
      if (ws.length === 0) return null;
      const n = ws[int(rng, 0, ws.length - 1)];
      return { targetNodeId: n.nodeId, targetHostname: n.hostname };
    },
    title: (ctx) => `${ctx.targetHostname} — "trust relationship failed", user can't log in`,
    description: (ctx) =>
      `User request:\n"My PC is on but it won't let me log in — it says **the trust relationship failed**."\n\nWhat we found:\n• **${ctx.targetHostname}**'s secure channel to Active Directory is broken\n• Its machine password is out of sync with the domain\n\nObjective:\n• **Unjoin** the machine from the domain\n• **Rejoin** triageos.corp using the deployment domain-admin credential`,
    requester: (_ctx, org) => ({ name: "Tara Coles", role: "Front Desk", email: `tara.coles@${mailDomain(org)}`, department: "Facilities" }),
    injectFault: (infra, ctx) => {
      const n = infra.nodes[ctx.targetNodeId as NodeId];
      if (n) { n.health.status = "degraded"; }
    },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  // ── Hardware Lab v2 · expanded provisioning pool ───────────────────────────

  "sw-v2-efi-repair": {
    id: "sw-v2-efi-repair",
    category: "System & Web Services",
    difficulty: "Tier_1_Easy",
    track: "helpdesk",
    severity: "medium",
    priority: "P3",
    slaDuration: 20 * 60,
    responseSeconds: 5 * 60,
    xpReward: 200,
    personaId: "persona-tara-calm",
    tags: ["boot", "efi", "bcd"],
    origin: "dashboard",
    summary: "A workstation boots to 'Missing Operating System'.",
    hints: [
      "Hardware Lab → BIOS: the boot order points at the network, set it to Disk",
      "Imaging Suite → rebuild ONLY the EFI System Partition (don't wipe the data drive)",
      "Dispatch a tech to return the unit",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const ws = Object.values(infra.nodes).filter((n) => n.os === "windows" && n.role === "workstation");
      if (ws.length === 0) return null;
      const n = ws[int(rng, 0, ws.length - 1)];
      return { targetNodeId: n.nodeId, targetHostname: n.hostname };
    },
    title: (ctx) => `${ctx.targetHostname} — "Missing Operating System" at boot`,
    description: (ctx) =>
      `User request:\n"My PC won't start — it just says **Missing Operating System**."\n\nWhat we found:\n• Boot order has drifted to PXE (network) instead of the disk\n• The EFI System Partition is damaged\n• **The Windows install and the user's data are intact**\n\nObjective:\n• Fix the boot order in BIOS\n• Rebuild **only the EFI partition** — do not wipe the data drive\n• Dispatch a tech to return the unit`,
    requester: (_ctx, org) => ({ name: "Tara Coles", role: "Front Desk", email: `tara.coles@${mailDomain(org)}`, department: "Facilities" }),
    injectFault: (infra, ctx) => { const n = infra.nodes[ctx.targetNodeId as NodeId]; if (n) n.health.status = "degraded"; },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "hw-v2-ceo-laptop": {
    id: "hw-v2-ceo-laptop",
    category: "System & Web Services",
    difficulty: "Tier_2_Medium",
    track: "helpdesk",
    severity: "high",
    priority: "P2",
    slaDuration: 40 * 60,
    responseSeconds: 10 * 60,
    xpReward: 400,
    personaId: "persona-marcus-calm",
    tags: ["hardware", "laptop", "vip", "provisioning"],
    origin: "dashboard",
    summary: "The CEO needs a new ultra-light laptop provisioned.",
    hints: [
      "Hardware Lab → Laptop: disconnect the battery, install the NVMe SSD, reconnect",
      "BIOS: Secure Boot ON for Windows 11",
      "Image with strict EFI/MSR/NTFS partitioning, then Domain Join",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const ws = Object.values(infra.nodes).filter((n) => n.os === "windows" && n.role === "workstation");
      if (ws.length === 0) return null;
      const n = ws[int(rng, 0, ws.length - 1)];
      return { targetNodeId: n.nodeId, targetHostname: n.hostname };
    },
    title: (ctx) => `VIP build — provision the CEO's new ultra-light laptop (${ctx.targetHostname})`,
    description: (ctx) =>
      `User request:\nThe CEO needs their **new ultra-light laptop ready for tomorrow** — white-glove build.\n\nObjective:\n• Disconnect the battery ribbon before opening the chassis (safety)\n• Fit the **NVMe SSD**, reconnect the battery and fasten the screws\n• Enable **Secure Boot** (required for Windows 11)\n• Partition **EFI → MSR → NTFS**, then join the domain\n• Dispatch for hand-delivery`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "Executive Support", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    injectFault: (infra, ctx) => { const n = infra.nodes[ctx.targetNodeId as NodeId]; if (n) { n.health.status = "critical"; n.connection.online = false; } },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "sw-v2-ransomware-wipe": {
    id: "sw-v2-ransomware-wipe",
    category: "Security & Incident",
    difficulty: "Tier_2_Medium",
    track: "secops",
    severity: "high",
    priority: "P1",
    slaDuration: 35 * 60,
    responseSeconds: 8 * 60,
    xpReward: 420,
    personaId: "persona-tara-calm",
    tags: ["ransomware", "reimage", "wipe"],
    origin: "dashboard",
    summary: "A ransomware-infected workstation must be wiped and reimaged.",
    hints: [
      "No hardware swap — the disk is fine, the OS is compromised",
      "Imaging Suite → wipe: re-create EFI/MSR/NTFS from scratch, then image",
      "Re-join the domain and dispatch the clean unit",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const ws = Object.values(infra.nodes).filter((n) => n.os === "windows" && n.role === "workstation");
      if (ws.length === 0) return null;
      const n = ws[int(rng, 0, ws.length - 1)];
      return { targetNodeId: n.nodeId, targetHostname: n.hostname };
    },
    title: (ctx) => `${ctx.targetHostname} compromised by ransomware — wipe & reimage`,
    description: (ctx) =>
      `Security alert:\nEDR has quarantined **${ctx.targetHostname}** after a ransomware detonation.\n\nWhat we found:\n• The hardware is healthy — only the OS is compromised\n• **Do not attempt to clean it in place.** The machine gets flattened\n\nObjective:\n• Wipe and re-create the partition table (**EFI / MSR / NTFS**)\n• Lay down a clean Windows image and re-join the domain\n• Dispatch the rebuilt machine back to the user`,
    requester: (_ctx, org) => ({ name: "Tara Coles", role: "Front Desk", email: `tara.coles@${mailDomain(org)}`, department: "Facilities" }),
    injectFault: (infra, ctx) => { const n = infra.nodes[ctx.targetNodeId as NodeId]; if (n) { n.health.status = "critical"; n.connection.online = false; } },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "hw-v2-mobo-swap": {
    id: "hw-v2-mobo-swap",
    category: "System & Web Services",
    difficulty: "Tier_3_Hard",
    track: "helpdesk",
    severity: "high",
    priority: "P2",
    slaDuration: 50 * 60,
    responseSeconds: 12 * 60,
    xpReward: 540,
    personaId: "persona-marcus-calm",
    tags: ["hardware", "motherboard", "cabling", "rebuild"],
    origin: "dashboard",
    summary: "A dev workstation's motherboard is dead — full board swap.",
    hints: [
      "Hardware Lab → re-seat RAM and route the ATX + CPU power cables",
      "BIOS: the new board defaults to PXE — set boot order to Disk",
      "Fresh OS install: partition, static IP, domain join",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const ws = Object.values(infra.nodes).filter((n) => n.os === "windows" && n.role === "workstation");
      if (ws.length === 0) return null;
      const n = ws[int(rng, 0, ws.length - 1)];
      return { targetNodeId: n.nodeId, targetHostname: n.hostname };
    },
    title: (ctx) => `${ctx.targetHostname} won't power on — motherboard failure, board swap`,
    description: (ctx) =>
      `User request:\n"My workstation is **completely dead** — no lights, no POST."\n\nWhat we found:\n• The motherboard has failed and needs replacing\n\nObjective:\n• Re-seat the RAM on the new board\n• Route the **24-pin ATX** and **8-pin CPU** power cables\n• The replacement board ships defaulting to PXE — set boot order to **Disk**\n• Fresh OS install: partition, static IP, domain join, then dispatch`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "Infrastructure Engineer", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    injectFault: (infra, ctx) => { const n = infra.nodes[ctx.targetNodeId as NodeId]; if (n) { n.health.status = "critical"; n.connection.online = false; } },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "hw-v2-web-node-crash": {
    id: "hw-v2-web-node-crash",
    category: "System & Web Services",
    difficulty: "Tier_3_Hard",
    track: "netops",
    severity: "critical",
    priority: "P1",
    slaDuration: 55 * 60,
    responseSeconds: 12 * 60,
    xpReward: 600,
    personaId: "persona-marcus-calm",
    tags: ["hardware", "server", "raid", "storage", "linux"],
    origin: "dashboard",
    summary: "A web-server rack node lost its storage array — full rebuild.",
    hints: [
      "Hardware Lab → Server: extract the rack tray, remove the baffle, swap 2× NVMe",
      "Route both backplane cables; BIOS: RAID mode + build a RAID 1 mirror",
      "Linux image: partition EFI + ext4, set the static IP",
    ],
    playable: true,
    makeContext: (infra) => {
      const web = Object.values(infra.nodes).find((n) => n.role === "web-server");
      return web ? { targetNodeId: web.nodeId, targetHostname: web.hostname } : null;
    },
    title: (ctx) => `Storage failure on web node ${ctx.targetHostname} — rack rebuild`,
    description: (ctx) =>
      `Alert:\n**${ctx.targetHostname}** dropped both drives and fell out of the load-balancer pool.\n\nObjective:\n• Slide out the rack tray and remove the air baffle\n• Hot-swap **both failed NVMe drives** and route the backplane cables\n• In BIOS: set SATA mode to **RAID** and build a **RAID 1** mirror\n• Image with Linux (**EFI + ext4**) and set the static IP\n• Dispatch a tech to rack 4B`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "Site Reliability Engineer", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    injectFault: (infra, ctx) => { const n = infra.nodes[ctx.targetNodeId as NodeId]; if (n) { n.health.status = "critical"; n.connection.online = false; } },
    win: (infra, ctx) => infra.security.hardwareReplaced.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  // ── Rack & network infrastructure lab ──────────────────────────────────────

  // ── Hybrid cloud (AetherCloud Engine) ─────────────────────────────────────

  "cloud-hybrid-vpn": {
    id: "cloud-hybrid-vpn",
    category: "Network & Routing",
    difficulty: "Tier_3_Hard",
    track: "netops",
    severity: "high",
    priority: "P2",
    slaDuration: 40 * 60,
    responseSeconds: 8 * 60,
    xpReward: 620,
    personaId: "persona-marcus-calm",
    tags: ["cloud", "vpn", "ipsec", "hybrid", "aether"],
    origin: "mail",
    summary: "The site-to-site tunnel to the Aether Virtual Network is down.",
    hints: [
      "AetherCloud → Network tab → the tunnel panel shows the current state",
      "The on-prem side terminates on a gateway/router node — pick it as the local gateway",
      "Advertise the on-prem network that needs to reach the cloud, in CIDR form",
      "Bind the tunnel to the AVN that holds the backup vNode, then use Route test to prove it",
    ],
    playable: true,
    makeContext: (infra) => {
      const backup = infra.cloud.vnodes.find((v) => v.purpose === "backup");
      const avn = infra.cloud.avns[0];
      if (!backup || !avn) return null;
      const core = infra.subnets[0]?.cidr;
      if (!core) return null;
      return { affectedVlan: core, serviceName: backup.name, targetHostname: avn.name };
    },
    title: (ctx) => `Backup replication failing — no route to ${ctx.targetHostname}`,
    description: (ctx, org) =>
      `User request:\nNightly replication to the cloud has not run for two days. The backup target ` +
      `**${ctx.serviceName}** lives in the Aether Virtual Network **${ctx.targetHostname}** and is ` +
      `unreachable from the datacentre.\n\nWhat we found:\n` +
      `• The IPsec **site-to-site tunnel is down** in the AetherCloud console\n` +
      `• Nothing on ${ctx.affectedVlan} can reach the ${ctx.targetHostname} address space\n` +
      `• ${org.name} policy requires replication traffic to stay on the private tunnel\n\n` +
      `Objective:\n• Re-establish the tunnel between our **gateway router** and **${ctx.targetHostname}**\n` +
      `• Advertise **${ctx.affectedVlan}** as the local network\n` +
      `• Confirm a route exists to the backup node`,
    requester: (_ctx, org) => ({
      name: "Marcus Feld",
      role: "Network Engineer",
      email: `marcus.feld@${mailDomain(org)}`,
      department: "IT",
    }),
    emailThread: (ctx, org) => [
      {
        from: "Backup Operations",
        fromEmail: `backups@${mailDomain(org)}`,
        subject: "Replication job failed (2 nights running)",
        body: `The offsite job cannot reach ${ctx.serviceName}. Error is "no route to host". Nothing changed on our side.`,
        ageMin: 90,
      },
      {
        from: "Marcus Feld",
        fromEmail: `marcus.feld@${mailDomain(org)}`,
        subject: "Re: Replication job failed — tunnel is down",
        body: `Confirmed: the site-to-site tunnel into ${ctx.targetHostname} is showing DOWN in AetherCloud. Raising this so someone can rebuild it — we are outside our recovery window.`,
        ageMin: 40,
      },
    ],
    win: (infra, ctx) => {
      const backup = infra.cloud.vnodes.find((v) => v.name === ctx.serviceName);
      if (!backup) return false;
      // Graded through the SAME routing function the console's Route test uses,
      // so passing the test in the UI is exactly what resolves the ticket.
      const src = String(ctx.affectedVlan).split("/")[0].replace(/0$/, "10");
      return hybridRoute(infra.cloud, src, backup.privateIp).ok;
    },
  },

  "cloud-autoscale-failover": {
    id: "cloud-autoscale-failover",
    category: "System & Web Services",
    difficulty: "Tier_3_Hard",
    track: "sysadmin",
    severity: "high",
    priority: "P2",
    slaDuration: 40 * 60,
    responseSeconds: 8 * 60,
    xpReward: 640,
    personaId: "persona-priya-stressed",
    tags: ["cloud", "load-balancer", "failover", "capacity", "aether"],
    origin: "mail",
    summary: "The on-prem web tier needs cloud burst capacity behind a router.",
    hints: [
      "AetherCloud → Compute: you need at least one running web vNode to send traffic to",
      "Right-size it — a High-Spec node for one web tier will cost you XP at resolution",
      "Traffic tab → create an Aether Traffic Router and add the vNode as a target",
      "Set the physical web server as the router's origin, with a CPU threshold to fail over at",
    ],
    playable: true,
    makeContext: (infra) => {
      const web = findFaultWeb(infra) ?? Object.values(infra.nodes).find((n) => n.role === "web-server");
      const avn = infra.cloud.avns[0];
      if (!web || !avn) return null;
      return { targetNodeId: web.nodeId, targetHostname: web.hostname, serviceName: avn.name };
    },
    title: (ctx) => `${ctx.targetHostname} saturating at peak — add cloud burst capacity`,
    description: (ctx) =>
      `User request:\nThe storefront slows to a crawl every afternoon. **${ctx.targetHostname}** is ` +
      `pinned at high CPU during peak and we have no headroom left in the rack.\n\n` +
      `What we found:\n• A single physical web server carries the whole tier\n` +
      `• There is spare capacity available in **${ctx.serviceName}**\n\n` +
      `Objective:\n• Stand up a **web vNode** in the cloud, sized sensibly\n` +
      `• Put an **Aether Traffic Router** in front of it\n` +
      `• Point the router at **${ctx.targetHostname}** as its origin so traffic shifts on high CPU\n\n` +
      `Finance will review the credit spend, so do not over-provision.`,
    requester: (_ctx, org) => ({
      name: "Priya Raman",
      role: "Head of Digital",
      email: `priya.raman@${mailDomain(org)}`,
      department: "Operations",
    }),
    emailThread: (ctx, org) => [
      {
        from: "Priya Raman",
        fromEmail: `priya.raman@${mailDomain(org)}`,
        subject: "Storefront is unusable at 3pm every day",
        body: `We are losing baskets every afternoon. Whatever is serving the site cannot cope with peak. Can we not use the cloud capacity we already pay for?`,
        ageMin: 55,
      },
      {
        from: "Capacity Planning",
        fromEmail: `capacity@${mailDomain(org)}`,
        subject: `Re: Storefront — ${ctx.targetHostname} at ceiling`,
        body: `Confirmed, ${ctx.targetHostname} tops out during peak and there is no room to scale it in the rack. Cloud burst behind a traffic router is the intended pattern here.`,
        ageMin: 25,
      },
    ],
    win: (infra, ctx) =>
      infra.cloud.routers.some((r) => {
        if (!r.enabled || r.originNodeId !== ctx.targetNodeId) return false;
        // The router must actually have somewhere live to send traffic.
        return r.targets.some((t) => {
          const v = infra.cloud.vnodes.find((x) => x.id === t);
          return !!v && v.status === "running";
        });
      }),
  },

  "cloud-security-audit": {
    id: "cloud-security-audit",
    category: "Security & Incident",
    difficulty: "Tier_4_Expert",
    track: "secops",
    severity: "critical",
    priority: "P1",
    slaDuration: 30 * 60,
    responseSeconds: 5 * 60,
    xpReward: 900,
    personaId: "persona-soc-urgent",
    tags: ["cloud", "security", "audit", "shield", "exposure", "aether"],
    origin: "mail",
    summary: "An audit-log entry shows an admin port opened to the public internet.",
    hints: [
      "AetherCloud → AetherTrace: filter to critical events and read what was changed",
      "The offending entry names the Shield rule id and the port it opened",
      "Shield tab → find that rule; an admin port must never be sourced from 0.0.0.0/0",
      "Either delete the rule or restrict its source to the corporate range",
    ],
    playable: true,
    makeContext: (infra) => {
      const avn = infra.cloud.avns[0];
      if (!avn) return null;
      return { serviceName: avn.name, affectedVlan: avn.cidr };
    },
    title: () => `Public exposure of internal cloud ports — immediate containment`,
    description: (ctx) =>
      `Alert:\nAn external scan flagged **administrative ports reachable from the internet** inside ` +
      `**${ctx.serviceName}** (${ctx.affectedVlan}).\n\nWhat we found:\n` +
      `• A change was made to an **Aether Shield Rule** during the last change window\n` +
      `• The rule allows an admin port from **0.0.0.0/0** — the entire public internet\n` +
      `• **AetherTrace** recorded who made the change and which rule id it touched\n\n` +
      `Objective:\n• Use the audit log to identify the offending rule\n` +
      `• Remove it, or restrict its source to the corporate range\n` +
      `• Leave legitimate web traffic (80/443) alone`,
    requester: (_ctx, org) => ({
      name: "SOC On-Call",
      role: "Security Operations",
      email: `soc@${mailDomain(org)}`,
      department: "Security",
    }),
    emailThread: (ctx, org) => [
      {
        from: "External Attack Surface Monitoring",
        fromEmail: "alerts@surfacewatch.io",
        subject: `[CRITICAL] Administrative port exposed — ${ctx.serviceName}`,
        body: `Our scanner reached an administrative service on your ${ctx.serviceName} address space from an unauthenticated source. Exposure began during your last change window.`,
        ageMin: 22,
      },
      {
        from: "SOC On-Call",
        fromEmail: `soc@${mailDomain(org)}`,
        subject: `Re: [CRITICAL] Administrative port exposed`,
        body: `Treat as P1. The change is in AetherTrace — someone widened a Shield rule to 0.0.0.0/0. Close the exposure first, attribute afterwards. Do not break 80/443.`,
        ageMin: 9,
      },
    ],
    injectFault: (draft) => {
      const avn = draft.cloud.avns[0];
      if (!avn) return;
      // The misconfiguration AND the audit trail that explains it — the ticket
      // is solved by reading the log, so the log has to carry the evidence.
      draft.cloud.shieldRules = [
        ...draft.cloud.shieldRules,
        {
          id: "sr-8812",
          avnId: avn.id,
          description: "TEMP - vendor debugging access",
          protocol: "tcp",
          port: 22,
          source: "0.0.0.0/0",
          action: "allow",
        },
      ];
      draft.cloud.audit = [
        {
          id: "aud-exposure",
          at: Date.now() - 1000 * 60 * 47,
          actor: "j.doe",
          action: "Opened TCP port 22 from 0.0.0.0/0 on Shield rule sr-8812",
          target: "sr-8812",
          severity: "critical",
        },
        {
          id: "aud-exposure-ctx",
          at: Date.now() - 1000 * 60 * 48,
          actor: "j.doe",
          action: "Started change window CW-4471 (vendor support session)",
          target: "cw-4471",
          severity: "info",
        },
        ...draft.cloud.audit,
      ];
    },
    win: (infra) => exposedAdminRules(infra.cloud).length === 0,
  },

  "net-rack-vlan": {
    id: "net-rack-vlan",
    category: "Network & Routing",
    difficulty: "Tier_2_Medium",
    track: "netops",
    severity: "medium",
    priority: "P3",
    slaDuration: 30 * 60,
    responseSeconds: 8 * 60,
    xpReward: 330,
    personaId: "persona-marcus-calm",
    tags: ["rack", "switch", "vlan", "cli"],
    origin: "dashboard",
    summary: "The Sales VLAN must be created and trunked to a switch port.",
    hints: [
      "Rack & Network Lab → drag a 24-port switch into the rack, power it from the UPS/PDU",
      "Select the switch → Console (CLI): enable, conf t, vlan <id>",
      "interface <port> → switchport access vlan <id> → no shutdown",
    ],
    playable: true,
    makeContext: () => ({ rackVlanId: 20, rackPort: "gi0/3" }),
    title: (ctx) => `Configure the Sales VLAN (${ctx.rackVlanId}) on the core switch`,
    description: (ctx) =>
      `Request from Networks:\nSales are moving onto **their own broadcast domain**.\n\nObjective:\n• Make sure a switch is racked and **powered from the UPS/PDU**\n• Create **VLAN ${ctx.rackVlanId}** on the switch\n• Put port **${ctx.rackPort}** into that VLAN as an access port, left up\n\nCLI:\nenable → conf t → vlan ${ctx.rackVlanId} → interface ${ctx.rackPort} → switchport access vlan ${ctx.rackVlanId} → no shutdown`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "Network Engineer", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    win: (infra, ctx) => {
      const vlan = Number(ctx.rackVlanId);
      const port = String(ctx.rackPort);
      return infra.rack.devices.some((d) => {
        if (d.kind !== "switch" && d.kind !== "router") return false;
        if (!d.switchConfig || !isPowered(infra.rack, d.id)) return false;
        if (!d.switchConfig.vlans.includes(vlan)) return false;
        const i = d.switchConfig.interfaces.find((x) => x.name === port);
        return !!i && i.accessVlan === vlan && i.up;
      });
    },
  },

  "net-rack-webserver": {
    id: "net-rack-webserver",
    category: "Network & Routing",
    difficulty: "Tier_3_Hard",
    track: "netops",
    severity: "high",
    priority: "P2",
    slaDuration: 55 * 60,
    responseSeconds: 12 * 60,
    xpReward: 580,
    personaId: "persona-marcus-calm",
    tags: ["rack", "server", "provisioning", "cabling", "ping"],
    origin: "dashboard",
    summary: "A new web server must be racked, cabled, addressed and proven reachable.",
    hints: [
      "Rack the UPS/PDU first — nothing powers on without it",
      "Rack a switch and two servers; power each from the UPS/PDU (Cabling → Power)",
      "Patch both servers into the switch (Cabling → Data), then set IPs in the same subnet",
      "Enable the web service, then run the Ping test between the two servers",
    ],
    playable: true,
    makeContext: () => ({ rackIpv4: "10.20.30.10", rackNetmask: "255.255.255.0" }),
    title: (ctx) => `Provision the new web server in Rack A (${ctx.rackIpv4})`,
    description: (ctx) =>
      `Project request:\nBuild out the **new customer-facing web server** in Rack A, end to end.\n\nHardware:\n• Rack a **UPS or PDU**, a **switch**, and **two servers** (the web host plus the app host it talks to)\n• Power every device from the UPS/PDU\n• Patch both servers into the switch\n\nConfiguration:\n• Address the web server as **${ctx.rackIpv4} / ${ctx.rackNetmask}**\n• Give the second server another address **in the same subnet**\n• Start the **web service** on the new host\n\nSign-off:\n• Prove it with the **Ping tool** — the ticket only closes on a successful test`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "Site Reliability Engineer", email: `marcus.feld@${mailDomain(org)}`, department: "IT" }),
    win: (infra, ctx) => {
      const rack = infra.rack;
      const web = rack.devices.find(
        (d) => d.kind === "server" && d.serverConfig?.ipv4.trim() === String(ctx.rackIpv4),
      );
      if (!web || !web.serverConfig) return false;
      if (!web.serverConfig.services.web) return false;
      if (!isPowered(rack, web.id) || !uplinkOf(rack, web.id)) return false;
      // A recorded, successful ping involving the new host proves the whole
      // chain end to end (power + patching + VLAN + addressing).
      return rack.tests.some((t) => t.ok && (t.fromName === web.name || t.toName === web.name));
    },
  },

  // ── Active Directory administration (ADUC-driven) ─────────────────────────

  "sw-ad-pw-reset": {
    id: "sw-ad-pw-reset",
    category: "Identity & Access",
    difficulty: "Tier_1_Easy",
    track: "helpdesk",
    severity: "medium",
    priority: "P3",
    slaDuration: 20 * 60,
    responseSeconds: 5 * 60,
    xpReward: 180,
    personaId: "persona-tara-calm",
    tags: ["active-directory", "password", "lockout"],
    origin: "dashboard",
    summary: "A user is locked out and has forgotten their password.",
    hints: [
      "RDP to the domain controller → Active Directory Users and Computers",
      "Find the user, right-click → Reset Password",
      "Set the temporary password from this ticket and tick 'must change at next logon'",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const dc = findPrimaryDC(infra);
      const ad = dc?.activeDirectory;
      if (!dc || !ad) return null;
      const pool = ad.users.filter((u) => u.enabled && u.samAccountName !== "a.smith");
      const locked = pool.filter((u) => u.locked);
      const u = locked.length ? locked[int(rng, 0, locked.length - 1)] : pool[int(rng, 0, pool.length - 1)];
      if (!u) return null;
      return {
        targetNodeId: dc.nodeId,
        targetHostname: dc.hostname,
        targetUserId: u.samAccountName,
        targetUserName: u.displayName,
        department: u.department,
        tempPassword: `Temp-${pick(rng, ["Falcon", "Harbor", "Cobalt", "Quartz", "Summit"])}-${int(rng, 1000, 9999)}!`,
      };
    },
    title: (ctx) => `Password reset — ${ctx.targetUserName} is locked out`,
    description: (ctx) =>
      `User request:\n"I've forgotten my password and now I'm **locked out**." — ${ctx.targetUserName} (${ctx.department})\n\nAccount:\n• Logon name: **${ctx.targetUserId}**\n• Domain controller: ${ctx.targetHostname}\n\nObjective:\n• Reset the password to **${ctx.tempPassword}**\n• Tick **"User must change password at next logon"** so they pick their own\n• Resetting also clears the lockout`,
    requester: (ctx, org) => ({
      name: ctx.targetUserName ?? "Staff User", role: "Employee",
      email: `${ctx.targetUserId}@${mailDomain(org)}`, department: ctx.department ?? "Operations",
    }),
    injectFault: (infra, ctx) => {
      const dc = infra.nodes[ctx.targetNodeId as NodeId] as WindowsNodeState | undefined;
      const u = dc?.activeDirectory?.users.find((x) => x.samAccountName === ctx.targetUserId);
      if (u) { u.locked = true; u.badPwdCount = 8; }
    },
    win: (infra, ctx) => {
      const u = findPrimaryDC(infra)?.activeDirectory?.users.find((x) => x.samAccountName === ctx.targetUserId);
      return !!u && !u.locked && u.password === ctx.tempPassword && u.mustChangePassword === true;
    },
  },

  "sw-ad-onboard": {
    id: "sw-ad-onboard",
    category: "Identity & Access",
    difficulty: "Tier_2_Medium",
    track: "helpdesk",
    severity: "medium",
    priority: "P3",
    slaDuration: 30 * 60,
    responseSeconds: 8 * 60,
    xpReward: 320,
    personaId: "persona-marcus-calm",
    tags: ["active-directory", "onboarding", "provisioning"],
    origin: "dashboard",
    summary: "A new Marketing hire needs an AD account provisioned.",
    hints: [
      "ADUC → New User (create the object in the Marketing OU)",
      "Set the exact job title from the ticket and an initial password",
      "Add the account to the Marketing_RW security group",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const dc = findPrimaryDC(infra);
      const ad = dc?.activeDirectory;
      if (!dc || !ad) return null;
      if (!ad.ous.some((o) => o.name === "Marketing")) return null;
      const first = pick(rng, ["Nadia", "Priya", "Owen", "Marta", "Felix", "Iris"]);
      const last = pick(rng, ["Whitfield", "Okafor", "Lindqvist", "Moreau", "Vance", "Bergstrom"]);
      let sam = `${first[0].toLowerCase()}.${last.toLowerCase()}`;
      if (ad.users.some((u) => u.samAccountName === sam)) sam = `${sam}${int(rng, 2, 9)}`;
      return {
        targetNodeId: dc.nodeId,
        targetHostname: dc.hostname,
        newUserSam: sam,
        newUserName: `${first} ${last}`,
        department: "Marketing",
        targetTitle: "Marketing Associate",
        targetGroup: "Marketing_RW",
      };
    },
    title: (ctx) => `Onboard new Marketing hire — ${ctx.newUserName} starts Monday`,
    description: (ctx) =>
      `User request:\nHR: "**${ctx.newUserName}** starts in Marketing on Monday and needs an account before day one."\n\nCreate this account:\n• Full name: **${ctx.newUserName}**\n• Logon name: **${ctx.newUserSam}**\n• OU: **Marketing**\n• Job title: **${ctx.targetTitle}**\n• Set an initial password and tick "must change at next logon"\n• Add to **${ctx.targetGroup}** so they can reach the Marketing share`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "People Ops Partner", email: `marcus.feld@${mailDomain(org)}`, department: "HR" }),
    win: (infra, ctx) => {
      const u = findPrimaryDC(infra)?.activeDirectory?.users.find(
        (x) => x.samAccountName.toLowerCase() === String(ctx.newUserSam).toLowerCase(),
      );
      if (!u) return false;
      return (
        u.enabled &&
        u.department === "Marketing" &&
        u.title.trim().toLowerCase() === String(ctx.targetTitle).toLowerCase() &&
        u.memberOf.includes(String(ctx.targetGroup)) &&
        !!u.password
      );
    },
  },

  "sw-ad-transfer": {
    id: "sw-ad-transfer",
    category: "Identity & Access",
    difficulty: "Tier_2_Medium",
    track: "helpdesk",
    severity: "medium",
    priority: "P3",
    slaDuration: 30 * 60,
    responseSeconds: 8 * 60,
    xpReward: 340,
    personaId: "persona-marcus-calm",
    tags: ["active-directory", "transfer", "groups", "rbac"],
    origin: "dashboard",
    summary: "An employee transferring departments needs their AD access moved.",
    hints: [
      "ADUC → find the user → Properties → General: change Department and Job title",
      "Member Of tab: remove the old department's groups",
      "Add the new department's groups (IT and IT_RW), then Apply",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const dc = findPrimaryDC(infra);
      const ad = dc?.activeDirectory;
      if (!dc || !ad) return null;
      const sales = ad.users.filter((u) => u.enabled && !u.locked && u.department === "Sales");
      if (sales.length === 0) return null;
      const u = sales[int(rng, 0, sales.length - 1)];
      return {
        targetNodeId: dc.nodeId,
        targetHostname: dc.hostname,
        targetUserId: u.samAccountName,
        targetUserName: u.displayName,
        fromDepartment: "Sales",
        department: "IT",
        targetTitle: "Support Technician",
        targetGroup: "IT_RW",
      };
    },
    title: (ctx) => `Department transfer — ${ctx.targetUserName} moves from Sales to IT`,
    description: (ctx) =>
      `User request:\nHR: "**${ctx.targetUserName}** moves from ${ctx.fromDepartment} to IT today — please move their access."\n\nAccount: **${ctx.targetUserId}**\n\nObjective:\n• Set department to **IT** and job title to **${ctx.targetTitle}**\n• **Remove** the old groups: Sales and Sales_RW (no lingering pipeline access)\n• **Add** the new groups: IT and **${ctx.targetGroup}**`,
    requester: (_ctx, org) => ({ name: "Marcus Feld", role: "People Ops Partner", email: `marcus.feld@${mailDomain(org)}`, department: "HR" }),
    win: (infra, ctx) => {
      const u = findPrimaryDC(infra)?.activeDirectory?.users.find((x) => x.samAccountName === ctx.targetUserId);
      if (!u) return false;
      const has = (g: string) => u.memberOf.includes(g);
      return (
        u.department === "IT" &&
        u.title.trim().toLowerCase() === String(ctx.targetTitle).toLowerCase() &&
        has("IT") && has(String(ctx.targetGroup)) &&
        !has("Sales") && !has("Sales_RW")
      );
    },
  },

  "net-t3-dns": {
    id: "net-t3-dns",
    category: "Network & Routing",
    difficulty: "Tier_3_Hard",
    track: "secops",
    severity: "critical",
    priority: "P1",
    slaDuration: 10 * 60,
    responseSeconds: 3 * 60,
    xpReward: 560,
    personaId: "persona-soc-panicked",
    tags: ["dns", "spoofing", "routing-hijack"],
    origin: "mail",
    summary: "Internal DNS is being hijacked to a rogue resolver.",
    hints: [
      "Analyze the routing/resolver config — internal names resolve to wrong IPs",
      "Flush the DNS cache and re-point resolvers at the correct primary DC",
    ],
    playable: false,
    makeContext: (infra, rng) => {
      const dc = findPrimaryDC(infra);
      return dc ? { targetNodeId: dc.nodeId, targetHostname: dc.hostname, maliciousIp: externalIp(rng) } : null;
    },
    title: (ctx) => `DNS spoofing — internal names resolving to ${ctx.maliciousIp}`,
    description: (ctx) =>
      `Internal hostnames are resolving to an attacker-controlled resolver (${ctx.maliciousIp}). Users are being silently redirected. Flush caches and re-point all resolvers at the legitimate primary DC (${ctx.targetHostname}).`,
    requester: (_ctx, org) => ({ name: "SOC On-Call", role: "Detection & Response", email: `soc-noreply@${mailDomain(org)}`, department: "Security" }),
    emailThread: (ctx, org) => [
      { from: "SOC Automated Alerting", fromEmail: `soc-noreply@${mailDomain(org)}`, subject: `[CRITICAL] DNS answers diverging from authoritative`, body: `Multiple internal FQDNs are resolving to ${ctx.maliciousIp}, which is outside our space. Possible cache poisoning / rogue resolver on the segment.`, ageMin: 8 },
      { from: "SOC On-Call", fromEmail: `soc-noreply@${mailDomain(org)}`, subject: `Re: [CRITICAL] DNS hijack — contain now`, body: `Confirmed spoofing. Need caches flushed and resolvers forced back to ${ctx.targetHostname}. P1 open.`, ageMin: 4 },
    ],
    win: (infra) => infra.security.dnsFixed,
  },

  // ═══ C. System & Web Services ═══════════════════════════════════════════
  "sys-t1-502": {
    id: "sys-t1-502",
    category: "System & Web Services",
    difficulty: "Tier_1_Easy",
    track: "sysadmin",
    severity: "high",
    priority: "P2",
    slaDuration: 15 * 60,
    responseSeconds: 5 * 60,
    xpReward: 350,
    personaId: "persona-priya-stressed",
    tags: ["nginx", "reverse-proxy", "revenue-impact"],
    origin: "dashboard",
    summary: "nginx returns 502 because its upstream app worker crashed.",
    hints: [
      "curl -I localhost — confirm the 502",
      "systemctl status app — the upstream is down",
      "systemctl start app — bring it back, re-curl for 200",
    ],
    playable: true,
    makeContext: (infra) => {
      const web = findFaultWeb(infra);
      return web ? { targetNodeId: web.nodeId, targetHostname: web.hostname, serviceName: "app" } : null;
    },
    title: (ctx) => `502 Bad Gateway on the storefront (${ctx.targetHostname})`,
    description: (ctx, org) =>
      `Customers hitting the storefront on ${ctx.targetHostname}.${org.domain} get '502 Bad Gateway'. nginx is up but the app upstream crashed (OOM). Revenue-impacting — restore the worker.`,
    requester: (_ctx, org) => ({ name: "Priya Nair", role: "E-commerce Operations Lead", email: `priya.nair@${mailDomain(org)}`, department: "Operations" }),
    win: (infra) => findFaultWeb(infra)?.services.app?.status === "active",
    healthyNode: (infra) => findFaultWeb(infra)?.nodeId,
  },

  "sys-t2-dbpool": {
    id: "sys-t2-dbpool",
    category: "System & Web Services",
    difficulty: "Tier_2_Medium",
    track: "sysadmin",
    severity: "high",
    priority: "P2",
    slaDuration: 30 * 60,
    responseSeconds: 10 * 60,
    xpReward: 360,
    personaId: "persona-priya-stressed",
    tags: ["database", "connection-pool", "config"],
    origin: "mail",
    summary: "The database connection pool is exhausted; the service is down.",
    hints: [
      "Raise max_connections / pool size in the db config",
      "Restart the database service (systemctl restart postgresql)",
    ],
    playable: true,
    makeContext: (infra) => {
      const db = nodeByRole(infra, "database");
      return db ? { targetNodeId: db.nodeId, targetHostname: db.hostname, serviceName: "postgresql" } : null;
    },
    title: (ctx) => `Database connection pool exhausted on ${ctx.targetHostname}`,
    description: (ctx) =>
      `Apps are throwing 'FATAL: remaining connection slots are reserved'. The pool on ${ctx.targetHostname} is maxed and the service has stopped accepting connections. Raise the pool limit and restart the DB.`,
    requester: (_ctx, org) => ({ name: "Priya Nair", role: "E-commerce Operations Lead", email: `priya.nair@${mailDomain(org)}`, department: "Operations" }),
    emailThread: (ctx, org) => [
      { from: "App Monitoring", fromEmail: `monitoring@${mailDomain(org)}`, subject: `DB errors spiking — connection slots exhausted`, body: `The checkout service on ${ctx.targetHostname} is logging 'too many clients already'. Error rate climbing.`, ageMin: 28 },
      { from: "Priya Nair", fromEmail: `priya.nair@${mailDomain(org)}`, subject: `Re: DB errors — this is blocking orders`, body: `We're dropping transactions. Please bump the pool and bounce the database. Escalating.`, ageMin: 14 },
    ],
    injectFault: (infra, ctx) => {
      const db = infra.nodes[ctx.targetNodeId as NodeId];
      if (db && db.os === "linux" && db.services.postgresql) db.services.postgresql.status = "failed";
    },
    win: (infra, ctx) => {
      const db = infra.nodes[ctx.targetNodeId as NodeId];
      return db?.os === "linux" && db.services.postgresql?.status === "active";
    },
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "sys-t3-disk": {
    id: "sys-t3-disk",
    category: "System & Web Services",
    difficulty: "Tier_3_Hard",
    track: "sysadmin",
    severity: "critical",
    priority: "P1",
    slaDuration: 12 * 60,
    responseSeconds: 5 * 60,
    xpReward: 520,
    personaId: "persona-priya-stressed",
    tags: ["disk", "log-rotation", "cascading-failure"],
    origin: "mail",
    summary: "A log server is out of disk, causing cascading crashes.",
    hints: [
      "Identify the bloating logs (du -sh /var/log/*)",
      "Run log rotation / cleanup to reclaim space",
    ],
    playable: false,
    makeContext: (infra, rng) => {
      const linux = Object.values(infra.nodes).filter((n) => n.os === "linux");
      const n = linux.length ? pick(rng, linux) : null;
      return n ? { targetNodeId: n.nodeId, targetHostname: n.hostname } : null;
    },
    title: (ctx) => `Disk saturation on ${ctx.targetHostname} — services crashing`,
    description: (ctx) =>
      `${ctx.targetHostname} is at 100% disk. Runaway logging filled /var/log and dependent services are crash-looping as they can't write. Reclaim space via log rotation before the whole box goes down.`,
    requester: (_ctx, org) => ({ name: "App Monitoring", role: "Observability", email: `monitoring@${mailDomain(org)}`, department: "IT" }),
    emailThread: (ctx, org) => [
      { from: "App Monitoring", fromEmail: `monitoring@${mailDomain(org)}`, subject: `[WARN] ${ctx.targetHostname} disk at 94%`, body: `Filesystem / on ${ctx.targetHostname} crossed 94%. Growth is ~2%/hour from /var/log.`, ageMin: 30 },
      { from: "App Monitoring", fromEmail: `monitoring@${mailDomain(org)}`, subject: `[CRITICAL] ${ctx.targetHostname} disk full — services failing`, body: `Disk is now 100%. Services are crash-looping on write failures. Immediate cleanup needed.`, ageMin: 9 },
    ],
    injectFault: (infra, ctx) => {
      const n = infra.nodes[ctx.targetNodeId as NodeId];
      if (n) { n.health.diskUsedPct = 100; n.health.status = "critical"; }
    },
    win: (infra, ctx) => infra.security.logsRotated.includes(ctx.targetNodeId as NodeId),
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  "sys-t1-rogue-process": {
    id: "sys-t1-rogue-process",
    category: "System & Web Services",
    difficulty: "Tier_1_Easy",
    track: "helpdesk",
    severity: "medium",
    priority: "P3",
    slaDuration: 20 * 60,
    responseSeconds: 5 * 60,
    xpReward: 190,
    personaId: "persona-tara-calm",
    tags: ["endpoint", "cpu", "task-manager"],
    origin: "dashboard",
    summary: "A runaway process is pinning an endpoint's CPU.",
    hints: [
      "ADUC → open the user → Remote Connect (RDP), or use Remote Gateway",
      "Task Manager / Activity Monitor → sort by CPU",
      "End the runaway task to restore the machine",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      // Prefer a gateway-listed workstation so the machine is reachable via the
      // Remote Gateway as well as ADUC; the fleet is ADUC-only.
      const gatewayIds = new Set(infra.gateway.map((g) => g.nodeId));
      const all = Object.values(infra.nodes).filter(
        (n) => n.role === "workstation" && (n.os === "windows" || n.os === "macos"),
      );
      const endpoints = all.filter((n) => gatewayIds.has(n.nodeId));
      const eligible = endpoints.length ? endpoints : all;
      if (eligible.length === 0) return null;
      const n = pick(rng, eligible);
      return {
        targetNodeId: n.nodeId,
        targetHostname: n.hostname,
        serviceName: n.os === "macos" ? "mediaanalysisd" : "TelemetryUpdater.exe",
      };
    },
    title: (ctx) => `${ctx.targetHostname} unresponsive — runaway process pinning CPU`,
    description: (ctx) =>
      `The user of ${ctx.targetHostname} reports the machine is crawling — the fan is at full speed and apps freeze. A process called '${ctx.serviceName}' appears to be consuming nearly all CPU. Remote in and end the task.`,
    requester: (_ctx, org) => ({
      name: "Tara Coles", role: "Front Desk", email: `tara.coles@${mailDomain(org)}`, department: "Facilities",
    }),
    injectFault: (infra, ctx) => {
      const n = infra.nodes[ctx.targetNodeId as NodeId];
      if (!n) return;
      n.processes = [
        ...n.processes,
        { pid: 66613, ppid: 1, user: n.os === "macos" ? "staff" : "user", command: ctx.serviceName!, cpu: 96.4, mem: 41.2, state: "R" },
      ];
      n.health.cpuLoad = 98;
      n.health.status = "degraded";
    },
    win: (infra, ctx) => {
      const n = infra.nodes[ctx.targetNodeId as NodeId];
      return !!n && !n.processes.some((p) => p.command === ctx.serviceName);
    },
    healthyNode: (_infra, ctx) => ctx.targetNodeId,
  },

  // ═══ D. Security & Incident ═════════════════════════════════════════════
  "sec-t1-phishing": {
    id: "sec-t1-phishing",
    category: "Security & Incident",
    difficulty: "Tier_1_Easy",
    track: "secops",
    severity: "medium",
    priority: "P3",
    slaDuration: 20 * 60,
    responseSeconds: 5 * 60,
    xpReward: 220,
    personaId: "persona-jane-irritated",
    tags: ["phishing", "email-security"],
    origin: "dashboard",
    summary: "An employee reported a phishing email; flag the malicious sender.",
    hints: [
      "CoreMail → inspect the reported message header / sender domain",
      "Flag the malicious sender domain so it's blocked org-wide",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const u = randomUser(infra, rng);
      return u ? { targetUserId: u.samAccountName, targetUserName: u.displayName, senderDomain: pick(rng, LOOKALIKE_DOMAINS), department: u.department } : null;
    },
    title: (ctx) => `Reported phishing — spoofed IT login from ${ctx.senderDomain}`,
    description: (ctx) =>
      `${ctx.targetUserName} forwarded a suspicious "password expiry" email from ${ctx.senderDomain} asking them to re-enter their credentials. Confirm it's phishing and flag the sender domain so nobody else falls for it.`,
    requester: (ctx, org) => ({ name: ctx.targetUserName!, role: `${ctx.department} staff`, email: adUserEmail(ctx, org), department: ctx.department }),
    win: (infra, ctx) => !!ctx.senderDomain && infra.security.flaggedDomains.includes(ctx.senderDomain),
  },

  "sec-t2-ransomware": {
    id: "sec-t2-ransomware",
    category: "Security & Incident",
    difficulty: "Tier_2_Medium",
    track: "secops",
    severity: "high",
    priority: "P1",
    slaDuration: 8 * 60,
    responseSeconds: 3 * 60,
    xpReward: 460,
    personaId: "persona-soc-panicked",
    tags: ["ransomware", "containment", "isolation"],
    origin: "mail",
    summary: "Ransomware is spreading from a file share — isolate the host.",
    hints: [
      "Identify the infected node from the alert",
      "NetOps Console → isolate the node (block its links) to stop lateral spread",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const candidates = Object.values(infra.nodes).filter((n) => n.role === "file-server" || n.role === "workstation");
      const n = candidates.length ? pick(rng, candidates) : findFirstWorkstation(infra);
      return n ? { targetNodeId: n.nodeId, targetHostname: n.hostname } : null;
    },
    title: (ctx) => `Ransomware footprint spreading from ${ctx.targetHostname}`,
    description: (ctx) =>
      `EDR flagged mass file-rename activity (.locked extension) originating on ${ctx.targetHostname} and reaching into the file share. Contain immediately: isolate the host from the network to stop lateral encryption.`,
    requester: (_ctx, org) => ({ name: "SOC On-Call", role: "Detection & Response", email: `soc-noreply@${mailDomain(org)}`, department: "Security" }),
    emailThread: (ctx, org) => [
      { from: "EDR Alerting", fromEmail: `edr@${mailDomain(org)}`, subject: `[HIGH] Mass file modification on ${ctx.targetHostname}`, body: `Behavioral detection: rapid file renames to '.locked' on ${ctx.targetHostname}, plus SMB writes to the share. Ransomware pattern.`, ageMin: 7 },
      { from: "SOC On-Call", fromEmail: `soc-noreply@${mailDomain(org)}`, subject: `Re: [HIGH] contain ${ctx.targetHostname} NOW`, body: `Encryption is spreading via the share. Isolate ${ctx.targetHostname} from the topology before it hits more hosts. P1.`, ageMin: 3 },
    ],
    win: (infra, ctx) => infra.security.isolatedNodeIds.includes(ctx.targetNodeId as NodeId),
  },

  "sec-t3-apt": {
    id: "sec-t3-apt",
    category: "Security & Incident",
    difficulty: "Tier_3_Hard",
    track: "secops",
    severity: "critical",
    priority: "P1",
    slaDuration: 6 * 60,
    responseSeconds: 2 * 60,
    xpReward: 700,
    personaId: "persona-soc-panicked",
    tags: ["apt", "exfiltration", "incident-response"],
    origin: "mail",
    summary: "An APT is exfiltrating data — block the C2 IP and rotate credentials.",
    hints: [
      "Analyze egress logs to identify the attacker's C2 address",
      "NetOps Console → block the malicious IP at the edge router",
      "Rotate all service-account credentials to evict the intruder",
    ],
    playable: true,
    makeContext: (infra, rng) => {
      const web = findFaultWeb(infra) ?? nodeByRole(infra, "web-server");
      return { targetNodeId: web?.nodeId, targetHostname: web?.hostname, maliciousIp: externalIp(rng) };
    },
    title: (ctx) => `APT exfiltration — sustained beacon to ${ctx.maliciousIp}`,
    description: (ctx) =>
      `A persistent threat is harvesting data from ${ctx.targetHostname ?? "a DMZ host"} and beaconing to ${ctx.maliciousIp} over TCP/443. Block the C2 address at the edge router and rotate all service-account credentials to evict them.`,
    requester: (_ctx, org) => ({ name: "SOC On-Call", role: "Detection & Response", email: `soc-noreply@${mailDomain(org)}`, department: "Security" }),
    emailThread: (ctx, org) => [
      { from: "SOC Automated Alerting", fromEmail: `soc-noreply@${mailDomain(org)}`, subject: `[CRITICAL] Sustained egress to unknown ASN (${ctx.maliciousIp})`, body: `Long-lived TLS session from the DMZ to ${ctx.maliciousIp}, low-and-slow, ~40MB exfiltrated over 6h. Matches known APT tradecraft.`, ageMin: 10 },
      { from: "SOC On-Call", fromEmail: `soc-noreply@${mailDomain(org)}`, subject: `Re: [CRITICAL] active exfil — block + rotate`, body: `We need ${ctx.maliciousIp} blocked at the edge and every service credential rotated. Assume persistence. P1.`, ageMin: 5 },
    ],
    win: (infra, ctx) =>
      !!ctx.maliciousIp && infra.security.blockedIps.includes(ctx.maliciousIp) && infra.security.credentialsRotated,
  },
};

/** Ordered template ids grouped by category (for the Toolbox / factory). */
export const TEMPLATE_IDS = Object.keys(TICKET_TEMPLATES);

export function templateFor(id: string): TicketTemplate | undefined {
  return TICKET_TEMPLATES[id];
}
