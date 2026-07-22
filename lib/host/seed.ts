/**
 * TriageOS — Host seed data
 * =========================
 * The operator's workstation profile and a starter queue of tickets spanning
 * all four tracks. These tickets conform to the Phase-1 `Ticket` model; the
 * live SLA countdown + scenario binding activate in Phase 5.
 */

import type { HostWorkstationState, Ticket } from "@/lib/core";

export function createHostWorkstation(): HostWorkstationState {
  return {
    user: {
      displayName: "O. Kharebashvili",
      role: "Tier-2 Systems Engineer",
      avatar: "🧑‍💻",
      level: 7,
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

/** Starter ticket queue for the Ticket Center. */
export function createSeedTickets(): Ticket[] {
  return [
    {
      id: "t-4821",
      code: "TCK-4821",
      title: "Production website returning 502 Bad Gateway",
      description:
        "Customers report the storefront at web-01.corp.internal is down with a '502 Bad Gateway' error. Started ~15 minutes ago. Revenue-impacting — please prioritize.",
      track: "sysadmin",
      severity: "high",
      priority: "P2",
      status: "new",
      clientOrg: "Acme Financial",
      requester: {
        name: "Priya Nair",
        role: "E-commerce Operations Lead",
        email: "priya.nair@acme-financial.com",
        department: "Operations",
      },
      targetNodeIds: ["prod-nginx-srv"],
      scenarioId: "scn-nginx-502",
      personaId: "persona-priya-stressed",
      sla: { responseSeconds: 15 * 60, resolutionSeconds: 2 * HOUR },
      clock: {
        startedAt: null,
        respondedAt: null,
        resolvedAt: null,
        responseBreached: false,
        resolutionBreached: false,
      },
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
      clientOrg: "Acme Financial",
      requester: {
        name: "Jane Doe",
        role: "Finance Analyst",
        email: "j.doe@corp.internal",
        department: "Finance",
      },
      targetNodeIds: ["dc-01", "client-win-01"],
      scenarioId: "scn-ad-lockout",
      personaId: "persona-jane-irritated",
      sla: { responseSeconds: 30 * 60, resolutionSeconds: 4 * HOUR },
      clock: {
        startedAt: null,
        respondedAt: null,
        resolvedAt: null,
        responseBreached: false,
        resolutionBreached: false,
      },
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
        "Hosts on 10.20.7.0/24 intermittently fail to resolve internal names. External browsing works. Suspect resolver/forwarder misconfig after last night's change window.",
      track: "netops",
      severity: "medium",
      priority: "P3",
      status: "accepted",
      clientOrg: "Acme Financial",
      requester: {
        name: "Marcus Feld",
        role: "Branch IT Coordinator",
        email: "marcus.feld@acme-financial.com",
        department: "IT",
      },
      targetNodeIds: ["dc-01"],
      scenarioId: "scn-dns-forwarder",
      personaId: "persona-marcus-calm",
      sla: { responseSeconds: 30 * 60, resolutionSeconds: 4 * HOUR },
      clock: {
        startedAt: ago(20),
        respondedAt: ago(18),
        resolvedAt: null,
        responseBreached: false,
        resolutionBreached: false,
      },
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
        "Security monitoring flagged sustained outbound TCP/443 from an Industrial DMZ host to an unrecognized ASN. Investigate, confirm compromise, and isolate if warranted. Preserve evidence.",
      track: "secops",
      severity: "critical",
      priority: "P1",
      status: "new",
      clientOrg: "Acme Financial",
      requester: {
        name: "SOC Automated Alerting",
        role: "Detection & Response",
        email: "soc-noreply@acme-financial.com",
        department: "Security",
      },
      targetNodeIds: ["prod-nginx-srv", "dc-01"],
      scenarioId: "scn-idmz-exfil",
      personaId: "persona-soc-panicked",
      sla: { responseSeconds: 5 * 60, resolutionSeconds: 1 * HOUR },
      clock: {
        startedAt: null,
        respondedAt: null,
        resolvedAt: null,
        responseBreached: false,
        resolutionBreached: false,
      },
      createdAt: ago(4),
      tags: ["exfiltration", "idmz", "incident-response", "containment"],
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
      clientOrg: "Acme Financial",
      requester: {
        name: "Tara Coles",
        role: "Front Desk",
        email: "tara.coles@acme-financial.com",
        department: "Facilities",
      },
      targetNodeIds: ["client-win-01"],
      scenarioId: "scn-spooler-crash",
      personaId: "persona-tara-calm",
      sla: { responseSeconds: 60 * 60, resolutionSeconds: 8 * HOUR },
      clock: {
        startedAt: ago(180),
        respondedAt: ago(176),
        resolvedAt: ago(120),
        responseBreached: false,
        resolutionBreached: false,
      },
      createdAt: ago(200),
      assignee: "O. Kharebashvili",
      tags: ["print-spooler", "windows-services"],
      xpReward: 120,
      escalationCount: 0,
    },
  ];
}
