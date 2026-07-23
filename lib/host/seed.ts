/**
 * TriageOS — Host seed data (world-bound)
 * =======================================
 * The operator's workstation profile and the starter ticket queue. With
 * procedural worlds, tickets are BOUND to the generated org at creation:
 * target nodes resolve by scenario role, requester identities/emails come from
 * the org domain, and the lockout ticket's requester IS the pinned directory
 * user j.doe.
 */

import type { HostWorkstationState, InfrastructureState, Ticket } from "@/lib/core";
import { SCENARIOS } from "@/lib/scenario/registry";
import { findPrimaryDC } from "@/lib/org/generator";

export function createHostWorkstation(): HostWorkstationState {
  return {
    user: {
      displayName: "O. Kharebashvili",
      role: "Tier-2 Systems Engineer",
      avatar: "🧑‍💻",
      level: 4,
      xp: 6420,
    },
    wallpaper: "bloom",
    clock24h: true,
    tray: { networkConnected: true, volume: 65, notifications: 3 },
  };
}

const HOUR = 3600;
const now = Date.now();
const ago = (mins: number) => now - mins * 60_000;

/** Starter ticket queue, bound to a generated organization. */
export function createSeedTickets(infra: InfrastructureState): Ticket[] {
  const org = infra.org;
  const mailDomain = org.domain.replace(".internal", ".com");
  const targets = (scenarioId: string) => SCENARIOS[scenarioId]?.targets(infra) ?? [];
  const jdoe = findPrimaryDC(infra)?.activeDirectory?.users.find(
    (u) => u.samAccountName === "j.doe",
  );
  const faultHost = targets("scn-nginx-502")[0] ?? "the web server";

  return [
    {
      id: "t-4821",
      code: "TCK-4821",
      title: "Production website returning 502 Bad Gateway",
      description: `Customers report the storefront on ${faultHost}.${org.domain} is down with a '502 Bad Gateway' error. Started ~15 minutes ago. Revenue-impacting — please prioritize.`,
      track: "sysadmin",
      severity: "high",
      priority: "P2",
      status: "new",
      clientOrg: org.name,
      requester: {
        name: "Priya Nair",
        role: "E-commerce Operations Lead",
        email: `priya.nair@${mailDomain}`,
        department: "Operations",
      },
      targetNodeIds: targets("scn-nginx-502"),
      scenarioId: "scn-nginx-502",
      personaId: "persona-priya-stressed",
      sla: { responseSeconds: 15 * 60, resolutionSeconds: 2 * HOUR },
      clock: { startedAt: null, respondedAt: null, resolvedAt: null, responseBreached: false, resolutionBreached: false },
      createdAt: ago(14),
      tags: ["nginx", "reverse-proxy", "revenue-impact"],
      xpReward: 350,
      escalationCount: 0,
    },
    {
      id: "t-4822",
      code: "TCK-4822",
      title: "Locked out of my account before quarter-end close",
      description:
        "User j.doe cannot sign in — 'account is locked'. She has a finance deadline in an hour. Needs an AD unlock and a check on the lockout source.",
      track: "helpdesk",
      severity: "medium",
      priority: "P3",
      status: "new",
      clientOrg: org.name,
      requester: {
        name: jdoe?.displayName ?? "Jane Doe",
        role: jdoe?.title ?? "Finance Analyst",
        email: jdoe?.email ?? `j.doe@${mailDomain}`,
        department: jdoe?.department ?? "Finance",
      },
      targetNodeIds: targets("scn-ad-lockout"),
      scenarioId: "scn-ad-lockout",
      personaId: "persona-jane-irritated",
      sla: { responseSeconds: 30 * 60, resolutionSeconds: 4 * HOUR },
      clock: { startedAt: null, respondedAt: null, resolvedAt: null, responseBreached: false, resolutionBreached: false },
      createdAt: ago(38),
      tags: ["active-directory", "account-lockout"],
      xpReward: 180,
      escalationCount: 0,
    },
    {
      id: "t-4823",
      code: "TCK-4823",
      title: "Intermittent DNS resolution failures on branch subnet",
      description:
        "Hosts on a user subnet intermittently fail to resolve internal names. External browsing works. Suspect resolver/forwarder misconfig after last night's change window.",
      track: "netops",
      severity: "medium",
      priority: "P3",
      status: "accepted",
      clientOrg: org.name,
      requester: {
        name: "Marcus Feld",
        role: "Branch IT Coordinator",
        email: `marcus.feld@${mailDomain}`,
        department: "IT",
      },
      targetNodeIds: targets("scn-dns-forwarder"),
      scenarioId: "scn-dns-forwarder",
      personaId: "persona-marcus-calm",
      sla: { responseSeconds: 30 * 60, resolutionSeconds: 4 * HOUR },
      clock: { startedAt: ago(20), respondedAt: ago(18), resolvedAt: null, responseBreached: false, resolutionBreached: false },
      createdAt: ago(52),
      assignee: "O. Kharebashvili",
      tags: ["dns", "forwarder", "change-window"],
      xpReward: 260,
      escalationCount: 0,
    },
    {
      id: "t-4824",
      code: "TCK-4824",
      title: "SIEM alert: possible data exfiltration from IDMZ host",
      description:
        "Security monitoring flagged sustained outbound TCP/443 from a DMZ host to an unrecognized ASN. Investigate, confirm compromise, and isolate if warranted. Preserve evidence.",
      track: "secops",
      severity: "critical",
      priority: "P1",
      status: "new",
      clientOrg: org.name,
      requester: {
        name: "SOC Automated Alerting",
        role: "Detection & Response",
        email: `soc-noreply@${mailDomain}`,
        department: "Security",
      },
      targetNodeIds: targets("scn-idmz-exfil"),
      scenarioId: "scn-idmz-exfil",
      personaId: "persona-soc-panicked",
      sla: { responseSeconds: 5 * 60, resolutionSeconds: 1 * HOUR },
      clock: { startedAt: null, respondedAt: null, resolvedAt: null, responseBreached: false, resolutionBreached: false },
      createdAt: ago(4),
      tags: ["exfiltration", "idmz", "incident-response"],
      xpReward: 600,
      escalationCount: 0,
    },
    {
      id: "t-4820",
      code: "TCK-4820",
      title: "Print spooler crashes repeatedly on reception workstation",
      description:
        "Reception PC's print spooler service keeps stopping; users can't print visitor badges. Restarting works temporarily but it recurs.",
      track: "helpdesk",
      severity: "low",
      priority: "P4",
      status: "resolved",
      clientOrg: org.name,
      requester: {
        name: "Tara Coles",
        role: "Front Desk",
        email: `tara.coles@${mailDomain}`,
        department: "Facilities",
      },
      targetNodeIds: targets("scn-spooler-crash"),
      scenarioId: "scn-spooler-crash",
      personaId: "persona-tara-calm",
      sla: { responseSeconds: 60 * 60, resolutionSeconds: 8 * HOUR },
      clock: { startedAt: ago(180), respondedAt: ago(176), resolvedAt: ago(120), responseBreached: false, resolutionBreached: false },
      createdAt: ago(200),
      assignee: "O. Kharebashvili",
      tags: ["print-spooler", "windows-services"],
      xpReward: 120,
      escalationCount: 0,
    },
  ];
}
