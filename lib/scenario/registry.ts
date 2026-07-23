/**
 * TriageOS — Scenario registry (role-addressed)
 * =============================================
 * Authored scenario definitions. With procedural worlds, scenarios no longer
 * reference fixed node ids — they resolve their targets BY ROLE against the
 * live InfrastructureState (findFaultWeb / findPrimaryDC / findFirstWorkstation),
 * so the same pack binds to every generated organization.
 */

import type {
  InfrastructureState,
  NodeId,
  TicketSeverity,
  TicketTrack,
} from "@/lib/core";
import {
  findFaultWeb,
  findFirstWorkstation,
  findPrimaryDC,
} from "@/lib/org/generator";

export interface ScenarioDef {
  id: string;
  title: string;
  track: TicketTrack;
  severity: TicketSeverity;
  summary: string;
  /** Operator-facing troubleshooting hints (surfaced in the Toolbox). */
  hints: string[];
  /** Resolve the nodes this scenario touches in a given world. */
  targets: (infra: InfrastructureState) => NodeId[];
  /** True once the incident is resolved, evaluated against live infra. */
  win: (infra: InfrastructureState) => boolean;
  /** Node forced back to "healthy" when the scenario resolves. */
  healthyNodeOnResolve?: (infra: InfrastructureState) => NodeId | undefined;
}

export const SCENARIOS: Record<string, ScenarioDef> = {
  "scn-nginx-502": {
    id: "scn-nginx-502",
    title: "502 Bad Gateway on the production storefront",
    track: "sysadmin",
    severity: "high",
    summary:
      "nginx is up but its upstream app worker crashed (OOM), so every request returns 502.",
    hints: [
      "curl -I localhost — confirm the 502 is server-side",
      "tail /var/log/nginx/error.log — 'connect() failed (111)' points at a dead upstream",
      "systemctl status app — the gunicorn worker exited",
      "systemctl start app — bring the upstream back, then re-curl for 200",
    ],
    targets: (infra) => [findFaultWeb(infra)?.nodeId].filter(Boolean) as NodeId[],
    win: (infra) => findFaultWeb(infra)?.services.app?.status === "active",
    healthyNodeOnResolve: (infra) => findFaultWeb(infra)?.nodeId,
  },

  "scn-ad-lockout": {
    id: "scn-ad-lockout",
    title: "AD account lockout · j.doe",
    track: "helpdesk",
    severity: "medium",
    summary:
      "j.doe is locked out after repeated failed sign-ins. Unlock the account and confirm it is enabled.",
    hints: [
      "Event Viewer → Security on the primary DC: Event 4740 shows the lockout",
      "ADUC → search for the user → Unlock account",
      "Confirm the account is Enabled after unlocking",
    ],
    targets: (infra) => [findPrimaryDC(infra)?.nodeId].filter(Boolean) as NodeId[],
    win: (infra) => {
      const u = findPrimaryDC(infra)?.activeDirectory?.users.find(
        (x) => x.samAccountName === "j.doe",
      );
      return !!u && !u.locked && u.enabled;
    },
  },

  "scn-dns-forwarder": {
    id: "scn-dns-forwarder",
    title: "Branch DNS resolution failures",
    track: "netops",
    severity: "medium",
    summary: "Intermittent internal-name resolution failures on a user subnet.",
    hints: [
      "Compare working vs. failing resolutions with nslookup",
      "Check the DNS forwarder configuration on the primary DC",
    ],
    targets: (infra) => [findPrimaryDC(infra)?.nodeId].filter(Boolean) as NodeId[],
    win: () => false, // fix path arrives in a later content pass
  },

  "scn-idmz-exfil": {
    id: "scn-idmz-exfil",
    title: "IDMZ data exfiltration",
    track: "secops",
    severity: "critical",
    summary:
      "Sustained outbound TCP/443 from a DMZ host to an unknown ASN — investigate and contain.",
    hints: [
      "Correlate egress against the topology in the NetOps Console",
      "Contain by blocking the egress link or deploying a software firewall — preserve evidence first",
    ],
    targets: (infra) => [findFaultWeb(infra)?.nodeId].filter(Boolean) as NodeId[],
    win: () => false,
  },

  "scn-spooler-crash": {
    id: "scn-spooler-crash",
    title: "Print Spooler crash loop",
    track: "helpdesk",
    severity: "low",
    summary: "The Print Spooler service keeps stopping on a staff workstation.",
    hints: ["services.msc → Print Spooler → ensure Running with Automatic startup"],
    targets: (infra) => [findFirstWorkstation(infra)?.nodeId].filter(Boolean) as NodeId[],
    win: (infra) => findFirstWorkstation(infra)?.services.Spooler?.status === "Running",
  },
};

export function scenarioWin(scenarioId: string, infra: InfrastructureState): boolean {
  return SCENARIOS[scenarioId]?.win(infra) ?? false;
}
