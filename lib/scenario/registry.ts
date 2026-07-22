/**
 * TriageOS — Scenario registry (Phase 5)
 * ======================================
 * Authored scenario definitions: the declarative generalization of the Phase-4
 * hardcoded win-conditions. Each scenario binds a fault (seeded into the infra)
 * to a win predicate, diagnostic hints, and the node whose health clears on
 * resolution. The reconciler evaluates these against live InfrastructureState.
 */

import type {
  InfrastructureState,
  LinuxNodeState,
  NodeId,
  TicketSeverity,
  TicketTrack,
  WindowsNodeState,
} from "@/lib/core";

export interface ScenarioDef {
  id: string;
  title: string;
  track: TicketTrack;
  severity: TicketSeverity;
  targetNodeIds: NodeId[];
  summary: string;
  /** Operator-facing troubleshooting hints (surfaced in the Toolbox later). */
  hints: string[];
  /** True once the incident is resolved, evaluated against live infra. */
  win: (infra: InfrastructureState) => boolean;
  /** Node forced back to "healthy" when the scenario resolves. */
  healthyNodeOnResolve?: NodeId;
}

const linux = (infra: InfrastructureState, id: NodeId) =>
  infra.nodes[id]?.os === "linux" ? (infra.nodes[id] as LinuxNodeState) : undefined;
const windows = (infra: InfrastructureState, id: NodeId) =>
  infra.nodes[id]?.os === "windows" ? (infra.nodes[id] as WindowsNodeState) : undefined;

export const SCENARIOS: Record<string, ScenarioDef> = {
  "scn-nginx-502": {
    id: "scn-nginx-502",
    title: "web-01 · 502 Bad Gateway",
    track: "sysadmin",
    severity: "high",
    targetNodeIds: ["prod-nginx-srv"],
    summary:
      "nginx is up but its upstream app worker crashed (OOM), so every request returns 502.",
    hints: [
      "curl -I localhost — confirm the 502 is server-side",
      "tail /var/log/nginx/error.log — 'connect() failed (111)' points at a dead upstream",
      "systemctl status app — the gunicorn worker exited",
      "systemctl start app — bring the upstream back, then re-curl for 200",
    ],
    win: (infra) => linux(infra, "prod-nginx-srv")?.services.app?.status === "active",
    healthyNodeOnResolve: "prod-nginx-srv",
  },

  "scn-ad-lockout": {
    id: "scn-ad-lockout",
    title: "AD account lockout · j.doe",
    track: "helpdesk",
    severity: "medium",
    targetNodeIds: ["dc-01", "client-win-01"],
    summary:
      "j.doe is locked out after repeated failed sign-ins. Unlock the account and confirm it is enabled.",
    hints: [
      "Event Viewer → Security: Event 4740 shows the lockout source",
      "ADUC → Finance OU → Jane Doe → Unlock account",
      "Confirm the account is Enabled after unlocking",
    ],
    win: (infra) => {
      const u = windows(infra, "dc-01")?.activeDirectory?.users.find(
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
    targetNodeIds: ["dc-01"],
    summary: "Intermittent internal-name resolution failures on the branch subnet.",
    hints: [
      "Compare working vs. failing resolutions with nslookup",
      "Check the DNS forwarder / conditional forwarder configuration on dc-01",
    ],
    // Fix path is authored in a later content pass; not yet satisfiable.
    win: () => false,
  },

  "scn-idmz-exfil": {
    id: "scn-idmz-exfil",
    title: "IDMZ data exfiltration",
    track: "secops",
    severity: "critical",
    targetNodeIds: ["prod-nginx-srv", "dc-01"],
    summary:
      "Sustained outbound TCP/443 from an IDMZ host to an unknown ASN — investigate and contain.",
    hints: [
      "Correlate egress against the firewall/reachability model",
      "Isolate the host by disabling its adapter or blocking egress, preserving evidence",
    ],
    win: () => false,
  },

  "scn-spooler-crash": {
    id: "scn-spooler-crash",
    title: "Print Spooler crash loop",
    track: "helpdesk",
    severity: "low",
    targetNodeIds: ["client-win-01"],
    summary: "The Print Spooler service keeps stopping on the reception workstation.",
    hints: ["services.msc → Print Spooler → ensure Running with Automatic startup"],
    win: (infra) => windows(infra, "client-win-01")?.services.Spooler?.status === "Running",
  },
};

export function scenarioWin(scenarioId: string, infra: InfrastructureState): boolean {
  return SCENARIOS[scenarioId]?.win(infra) ?? false;
}
