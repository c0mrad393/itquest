/**
 * TriageOS — Infrastructure seed (mixed client topology)
 * ======================================================
 * Builds the first client environment (Acme Financial):
 *   - prod-nginx-srv  Linux web server  (SSH)  — carries the 502 scenario
 *   - client-win-01   Windows 11 workstation   (RDP) — domain-joined
 *   - dc-01           Windows Server 2022 DC    (RDP) — hosts ADUC/GPMC
 *
 * The Linux node REUSES the Phase-1 VM seed (single source of the filesystem,
 * services, logs) and wraps it as a LinuxNodeState, proving the migration path.
 */

import { createSeedVM } from "@/lib/vm/seed";
import type {
  ActiveDirectoryState,
  FsNode,
  GroupPolicyState,
  InfrastructureState,
  LinuxNodeState,
  WindowsEventLogs,
  WindowsFirewallState,
  WindowsNodeState,
  WindowsService,
} from "@/lib/core";

const now = Date.now();

// ── Linux node (reuses the rich VM seed) ────────────────────────────────────

function createLinuxWebNode(): LinuxNodeState {
  const vm = createSeedVM();
  return {
    nodeId: "prod-nginx-srv",
    hostname: vm.hostname, // web-01
    displayName: "Prod Web · nginx",
    role: "web-server",
    domain: "corp.internal",
    connection: {
      protocol: "ssh",
      ip: "10.20.4.11",
      port: 22,
      reachable: true,
      online: true,
      requiresCredentials: true,
      authenticated: false,
      latencyMs: 0.6,
    },
    network: vm.network,
    // Degraded: nginx is up but the app upstream crashed (the 502 ticket).
    health: { status: "degraded", cpuLoad: 9, memUsedPct: 82, diskUsedPct: 41, uptimeSeconds: 5230 },
    tags: ["production", "web", "public-facing"],

    os: "linux",
    distro: "Ubuntu 22.04.3 LTS",
    kernel: vm.kernel,
    filesystem: vm.filesystem,
    users: vm.users,
    services: vm.services,
    processes: vm.processes,
    logs: vm.logs,
    packages: [
      { name: "nginx", version: "1.18.0-6ubuntu14.4", status: "installed" },
      { name: "openssh-server", version: "1:8.9p1-3", status: "installed" },
      { name: "postgresql-14", version: "14.10-0ubuntu0.22.04.1", status: "installed" },
    ],
    session: { cwd: vm.cwd, user: vm.currentUser, env: vm.env, history: [] },
    nextPid: vm.nextPid,
  };
}

// ── Windows helpers ─────────────────────────────────────────────────────────

function wdir(children: Record<string, FsNode>): FsNode {
  return { type: "dir", children, owner: "SYSTEM", group: "SYSTEM", mode: "rwxr-xr-x", mtime: now };
}
function wfile(content: string): FsNode {
  return { type: "file", content, owner: "SYSTEM", group: "SYSTEM", mode: "rw-r--r--", mtime: now };
}

function emptyEventLogs(): WindowsEventLogs {
  return { System: [], Application: [], Security: [], Setup: [] };
}

function defaultFirewall(): WindowsFirewallState {
  return {
    profiles: { Domain: { enabled: true }, Private: { enabled: true }, Public: { enabled: true } },
    rules: [
      { name: "Remote Desktop (TCP-In)", direction: "Inbound", action: "Allow", protocol: "TCP", localPort: 3389, profiles: ["Domain", "Private"], enabled: true },
      { name: "File and Printer Sharing (SMB-In)", direction: "Inbound", action: "Allow", protocol: "TCP", localPort: 445, profiles: ["Domain"], enabled: true },
    ],
  };
}

const svc = (
  name: string,
  displayName: string,
  status: WindowsService["status"],
  startupType: WindowsService["startupType"],
  extra: Partial<WindowsService> = {},
): WindowsService => ({
  name,
  displayName,
  status,
  startupType,
  logOnAs: "LocalSystem",
  pid: status === "Running" ? Math.floor(1000 + Math.random() * 6000) : null,
  dependencies: [],
  ...extra,
});

// ── Domain controller: dc-01 ────────────────────────────────────────────────

function createDomainController(): WindowsNodeState {
  const activeDirectory: ActiveDirectoryState = {
    domainDns: "corp.internal",
    netbios: "CORP",
    functionalLevel: "2016",
    ous: [
      { dn: "OU=Finance,DC=corp,DC=internal", name: "Finance" },
      { dn: "OU=IT,DC=corp,DC=internal", name: "IT" },
      { dn: "OU=Workstations,DC=corp,DC=internal", name: "Workstations" },
    ],
    users: [
      {
        sid: "S-1-5-21-1004336348-1177238915-682003330-1601",
        samAccountName: "j.doe",
        upn: "j.doe@corp.internal",
        displayName: "Jane Doe",
        ou: "OU=Finance,DC=corp,DC=internal",
        memberOf: ["Domain Users", "Finance"],
        enabled: true,
        locked: true, // the TCK-4822 lockout
        passwordExpired: false,
        mustChangePassword: false,
        badPwdCount: 7,
        lastLogon: now - 3 * 3600_000,
        description: "Finance Analyst",
      },
      {
        sid: "S-1-5-21-1004336348-1177238915-682003330-1602",
        samAccountName: "a.smith",
        upn: "a.smith@corp.internal",
        displayName: "Alan Smith",
        ou: "OU=IT,DC=corp,DC=internal",
        memberOf: ["Domain Users", "IT-Admins", "Domain Admins"],
        enabled: true,
        locked: false,
        passwordExpired: false,
        mustChangePassword: false,
        badPwdCount: 0,
        lastLogon: now - 1800_000,
        description: "Systems Administrator",
      },
    ],
    groups: [
      { sid: "S-1-5-21-...-513", name: "Domain Users", scope: "Global", category: "Security", members: ["j.doe", "a.smith"] },
      { sid: "S-1-5-21-...-512", name: "Domain Admins", scope: "Global", category: "Security", members: ["a.smith"] },
      { sid: "S-1-5-21-...-1701", name: "Finance", scope: "Global", category: "Security", members: ["j.doe"] },
      { sid: "S-1-5-21-...-1702", name: "IT-Admins", scope: "Global", category: "Security", members: ["a.smith"] },
    ],
    computers: [
      { name: "CLIENT-WIN-01", dn: "CN=CLIENT-WIN-01,OU=Workstations,DC=corp,DC=internal", enabled: true, os: "Windows 11 Pro", lastLogon: now - 600_000 },
    ],
  };

  const groupPolicy: GroupPolicyState = {
    gpos: [
      {
        guid: "{31B2F340-016D-11D2-945F-00C04FB984F9}",
        name: "Default Domain Policy",
        enabled: true,
        enforced: true,
        linkedOus: ["DC=corp,DC=internal"],
        scope: "Both",
        settings: [
          { category: "Account Lockout Policy", key: "AccountLockoutThreshold", value: 5, compliant: true },
          { category: "Account Lockout Policy", key: "AccountLockoutDuration", value: 30, compliant: true },
          { category: "Password Policy", key: "MinimumPasswordLength", value: 8, compliant: false },
        ],
      },
    ],
  };

  return {
    nodeId: "dc-01",
    hostname: "DC-01",
    displayName: "Domain Controller · dc-01",
    role: "domain-controller",
    domain: "corp.internal",
    connection: {
      protocol: "rdp",
      ip: "10.20.0.10",
      port: 3389,
      reachable: true,
      online: true,
      requiresCredentials: true,
      authenticated: false,
      latencyMs: 1.1,
    },
    network: {
      interfaces: [{ name: "Ethernet0", up: true, ipv4: "10.20.0.10", netmask: "255.255.255.0", mac: "00:15:5d:01:0a:10", carrier: true }],
      routes: [{ destination: "default", gateway: "10.20.0.1", iface: "Ethernet0", metric: 0 }],
      dnsServers: ["127.0.0.1"],
      hostsTable: { "dc-01": "10.20.0.10", "dc-01.corp.internal": "10.20.0.10" },
      firewall: [],
      reachableHosts: {},
    },
    health: { status: "healthy", cpuLoad: 6, memUsedPct: 54, diskUsedPct: 38, uptimeSeconds: 1_209_600 },
    tags: ["domain-controller", "critical-infra"],

    os: "windows",
    edition: "Windows Server 2022 Standard",
    build: "20348.2402",
    isDomainController: true,
    filesystem: wdir({
      "C:": wdir({
        Windows: wdir({ NTDS: wdir({ "ntds.dit": wfile("<binary AD database>") }), System32: wdir({}) }),
        Users: wdir({ Administrator: wdir({}) }),
      }),
    }),
    services: {
      NTDS: svc("NTDS", "Active Directory Domain Services", "Running", "Automatic"),
      DNS: svc("DNS", "DNS Server", "Running", "Automatic"),
      W32Time: svc("W32Time", "Windows Time", "Running", "Automatic"),
      Netlogon: svc("Netlogon", "Netlogon", "Running", "Automatic"),
    },
    registry: [
      { hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\NTDS\\Parameters", values: [{ name: "DSA Database file", type: "REG_SZ", data: "C:\\Windows\\NTDS\\ntds.dit" }] },
    ],
    firewall: defaultFirewall(),
    eventLogs: {
      ...emptyEventLogs(),
      Security: [
        { ts: now - 3 * 3600_000, channel: "Security", level: "Warning", eventId: 4740, source: "Microsoft-Windows-Security-Auditing", message: "A user account was locked out. Target: j.doe. Caller Computer: CLIENT-WIN-01." },
      ],
    },
    localUsers: [
      { name: "Administrator", enabled: true, groups: ["Administrators"], sid: "S-1-5-21-...-500" },
    ],
    sessions: [{ user: "a.smith", sessionId: 2, state: "Disconnected", logonType: "RemoteInteractive" }],
    activeDirectory,
    groupPolicy,
    nextPid: 5000,
  };
}

// ── Workstation: client-win-01 ──────────────────────────────────────────────

function createWorkstation(): WindowsNodeState {
  return {
    nodeId: "client-win-01",
    hostname: "CLIENT-WIN-01",
    displayName: "Reception WS · client-win-01",
    role: "workstation",
    domain: "corp.internal",
    connection: {
      protocol: "rdp",
      ip: "10.20.7.24",
      port: 3389,
      reachable: true,
      online: true,
      requiresCredentials: true,
      authenticated: false,
      latencyMs: 3.4,
    },
    network: {
      interfaces: [{ name: "Ethernet", up: true, ipv4: "10.20.7.24", netmask: "255.255.255.0", mac: "00:15:5d:07:18:24", carrier: true }],
      routes: [{ destination: "default", gateway: "10.20.7.1", iface: "Ethernet", metric: 0 }],
      dnsServers: ["10.20.0.10"],
      hostsTable: { "client-win-01": "10.20.7.24" },
      firewall: [],
      reachableHosts: {},
    },
    health: { status: "healthy", cpuLoad: 14, memUsedPct: 61, diskUsedPct: 72, uptimeSeconds: 86_400 },
    tags: ["workstation", "reception"],

    os: "windows",
    edition: "Windows 11 Pro",
    build: "22631.4317",
    isDomainController: false,
    filesystem: wdir({
      "C:": wdir({
        Windows: wdir({ System32: wdir({ spool: wdir({ PRINTERS: wdir({}) }) }) }),
        Users: wdir({ "t.coles": wdir({ Desktop: wdir({}), Documents: wdir({}) }) }),
      }),
    }),
    services: {
      Spooler: svc("Spooler", "Print Spooler", "Running", "Automatic", { description: "Manages print jobs" }),
      Dnscache: svc("Dnscache", "DNS Client", "Running", "Automatic"),
      BITS: svc("BITS", "Background Intelligent Transfer Service", "Running", "Manual"),
      wuauserv: svc("wuauserv", "Windows Update", "Stopped", "Manual"),
    },
    registry: [
      { hive: "HKLM", path: "SYSTEM\\CurrentControlSet\\Services\\Spooler", values: [{ name: "Start", type: "REG_DWORD", data: 2 }] },
    ],
    firewall: defaultFirewall(),
    eventLogs: {
      ...emptyEventLogs(),
      System: [
        { ts: now - 2 * 3600_000, channel: "System", level: "Error", eventId: 7031, source: "Service Control Manager", message: "The Print Spooler service terminated unexpectedly. It has done this 3 time(s)." },
      ],
    },
    localUsers: [
      { name: "t.coles", fullName: "Tara Coles", enabled: true, groups: ["Users", "Remote Desktop Users"], sid: "S-1-5-21-...-1108" },
      { name: "Administrator", enabled: false, groups: ["Administrators"], sid: "S-1-5-21-...-500" },
    ],
    sessions: [{ user: "t.coles", sessionId: 1, state: "Active", logonType: "Interactive" }],
    nextPid: 4000,
  };
}

// ── Assemble the infrastructure ─────────────────────────────────────────────

export function createInfrastructure(): InfrastructureState {
  const linux = createLinuxWebNode();
  const dc = createDomainController();
  const ws = createWorkstation();

  return {
    scenarioId: null,
    clientOrg: "Acme Financial",
    nodes: {
      [linux.nodeId]: linux,
      [dc.nodeId]: dc,
      [ws.nodeId]: ws,
    },
    links: [
      { from: "client-win-01", to: "dc-01", via: "10.20.0.0/16", latencyMs: 2.1, blocked: false },
      { from: "prod-nginx-srv", to: "internet", via: "10.20.4.1", latencyMs: 8.0, blocked: false },
      { from: "dc-01", to: "internet", via: "10.20.0.1", latencyMs: 9.2, blocked: false },
    ],
    gateway: [
      { nodeId: "prod-nginx-srv", label: "Prod Web · nginx", protocol: "ssh", ip: "10.20.4.11", reachable: true },
      { nodeId: "dc-01", label: "Domain Controller · dc-01", protocol: "rdp", ip: "10.20.0.10", reachable: true },
      { nodeId: "client-win-01", label: "Reception WS · client-win-01", protocol: "rdp", ip: "10.20.7.24", reachable: true },
    ],
    loadedAt: now,
  };
}
