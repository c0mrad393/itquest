/**
 * TriageOS — Procedural Organization Generator
 * ============================================
 * Builds a complete, unique world from a single seed: company profile, scale
 * matrix, node fleet (3 → 12 machines), randomized hostnames/IP schemas, a
 * network topology with live link metrics, a 100+ user Active Directory, and
 * the gateway roster. Pure function of the seed — regenerate bit-identically.
 *
 * Scenario contract: generated worlds ALWAYS contain (a) a Linux web server
 * carrying the crashed `app` upstream (the 502 case, cloned from the rich VM
 * seed), (b) a primary DC whose directory includes the pinned, locked user
 * j.doe, and (c) at least one Windows workstation — so the role-addressed
 * scenario pack binds cleanly to every org.
 */

import { createSeedVM } from "@/lib/vm/seed";
import {
  SCALE_META,
  SECTOR_META,
  type ActiveDirectoryState,
  type ADComputer,
  type ADUser,
  type FsNode,
  type GatewayEntry,
  type InfrastructureState,
  type LinuxNodeState,
  type NetworkLink,
  type NodeId,
  type NodeRole,
  type OrgScale,
  type OrganizationProfile,
  type Sector,
  type SubnetDef,
  type TargetNode,
  type TopologyKind,
  type WindowsNodeState,
  type WindowsService,
} from "@/lib/core";
import { chance, int, mulberry32, pick, sample, type Rng } from "./rng";
import { COMPANY_PARTS, DEPARTMENTS, FIRST_NAMES, LAST_NAMES } from "./namegen";

const now = Date.now();
const DAY = 86_400_000;

// ── Small builders ──────────────────────────────────────────────────────────

function dir(children: Record<string, FsNode>): FsNode {
  return { type: "dir", children, owner: "root", group: "root", mode: "rwxr-xr-x", mtime: now };
}
function file(content: string): FsNode {
  return { type: "file", content, owner: "root", group: "root", mode: "rw-r--r--", mtime: now };
}

const winSvc = (
  rng: Rng,
  name: string,
  displayName: string,
  running = true,
): WindowsService => ({
  name,
  displayName,
  status: running ? "Running" : "Stopped",
  startupType: "Automatic",
  logOnAs: "LocalSystem",
  pid: running ? int(rng, 900, 7000) : null,
  dependencies: [],
});

// ── Org profile ─────────────────────────────────────────────────────────────

function generateProfile(seed: number, rng: Rng): OrganizationProfile {
  const sector = pick(rng, Object.keys(SECTOR_META) as Sector[]);
  const parts = COMPANY_PARTS[sector];
  const name = `${pick(rng, parts.pre)} ${pick(rng, parts.post)}`;
  const scale = pick(rng, ["small", "midmarket", "enterprise"] as OrgScale[]);
  const slug = name.split(" ")[0].toLowerCase();
  return {
    id: `org-${seed.toString(16)}`,
    seed,
    name,
    sector,
    scale,
    domain: `${slug}.internal`,
    netbios: slug.toUpperCase().slice(0, 10),
    employeeCount: int(rng, ...SCALE_META[scale].employeeRange),
    foundedYear: int(rng, 1978, 2019),
    topologyKind: pick(rng, ["star", "hybrid-mesh", "segmented-vlan", "multi-subnet"] as TopologyKind[]),
  };
}

// ── Directory (100+ users) ──────────────────────────────────────────────────

function generateDirectory(rng: Rng, org: OrganizationProfile): ActiveDirectoryState {
  const ouDn = (dept: string) => `OU=${dept},DC=${org.domain.split(".").join(",DC=")}`;
  const users: ADUser[] = [];
  const seenSams = new Set<string>();

  const makeUser = (
    first: string,
    last: string,
    dept: { name: string; titles: string[] },
    overrides: Partial<ADUser> = {},
  ): ADUser => {
    let sam = `${first[0].toLowerCase()}.${last.toLowerCase()}`;
    let n = 2;
    while (seenSams.has(sam)) sam = `${first[0].toLowerCase()}.${last.toLowerCase()}${n++}`;
    seenSams.add(sam);
    const locked = overrides.locked ?? chance(rng, 0.02);
    return {
      sid: `S-1-5-21-${int(rng, 1e8, 9e8)}-${int(rng, 1e8, 9e8)}-${int(rng, 1000, 9999)}`,
      samAccountName: sam,
      upn: `${sam}@${org.domain}`,
      displayName: `${first} ${last}`,
      title: pick(rng, dept.titles),
      department: dept.name,
      email: `${sam}@${org.domain.replace(".internal", ".com")}`,
      ou: ouDn(dept.name),
      memberOf: ["Domain Users", dept.name],
      enabled: overrides.enabled ?? chance(rng, 0.96),
      locked,
      passwordExpired: chance(rng, 0.05),
      mustChangePassword: chance(rng, 0.03),
      badPwdCount: locked ? int(rng, 5, 11) : int(rng, 0, 2),
      lastLogon: now - int(rng, 1, 21) * DAY + int(rng, 0, 86_400_000),
      passwordExpiresAt: chance(rng, 0.9) ? now + int(rng, -5, 90) * DAY : null,
      ...overrides,
    };
  };

  // Scenario-pinned accounts (dialogue coherence): the locked j.doe + an admin.
  const finance = DEPARTMENTS[0];
  const it = DEPARTMENTS.find((d) => d.name === "IT")!;
  users.push(
    makeUser("Jane", "Doe", finance, {
      locked: true,
      enabled: true,
      badPwdCount: 7,
      title: "Finance Analyst",
      description: "Finance Analyst",
    }),
    makeUser("Alan", "Smith", it, {
      locked: false,
      enabled: true,
      memberOf: ["Domain Users", "IT", "Domain Admins"],
      title: "Systems Administrator",
      description: "Systems Administrator",
    }),
  );

  for (let i = users.length; i < org.employeeCount; i++) {
    users.push(makeUser(pick(rng, FIRST_NAMES), pick(rng, LAST_NAMES), pick(rng, DEPARTMENTS)));
  }

  return {
    domainDns: org.domain,
    netbios: org.netbios,
    functionalLevel: "2016",
    ous: DEPARTMENTS.map((d) => ({ dn: ouDn(d.name), name: d.name })),
    users,
    groups: [
      { sid: "S-1-5-21-...-513", name: "Domain Users", scope: "Global" as const, category: "Security" as const, members: [] },
      { sid: "S-1-5-21-...-512", name: "Domain Admins", scope: "Global" as const, category: "Security" as const, members: ["a.smith"] },
      ...DEPARTMENTS.map((d, i) => ({
        sid: `S-1-5-21-...-${1700 + i}`,
        name: d.name,
        scope: "Global" as const,
        category: "Security" as const,
        members: [] as string[],
      })),
    ],
    computers: [],
  };
}

// ── Node builders ───────────────────────────────────────────────────────────

interface NodeSpec {
  role: NodeRole;
  os: "linux" | "windows";
  hostname: string;
  ip: string;
  subnet: string;
}

function baseConnection(spec: NodeSpec, rng: Rng) {
  return {
    protocol: (spec.os === "linux" ? "ssh" : "rdp") as "ssh" | "rdp",
    ip: spec.ip,
    port: spec.os === "linux" ? 22 : 3389,
    reachable: true,
    online: true,
    requiresCredentials: true,
    authenticated: false,
    latencyMs: Math.round(rng() * 40 + 3) / 10,
  };
}

function baseNetwork(spec: NodeSpec, org: OrganizationProfile) {
  const gw = spec.ip.replace(/\.\d+$/, ".1");
  return {
    interfaces: [
      {
        name: spec.os === "linux" ? "eth0" : "Ethernet0",
        up: true,
        ipv4: spec.ip,
        netmask: "255.255.255.0",
        mac: "02:42:" + spec.ip.split(".").map((o) => (+o).toString(16).padStart(2, "0")).slice(0, 4).join(":"),
        carrier: true,
      },
    ],
    routes: [{ destination: "default", gateway: gw, iface: spec.os === "linux" ? "eth0" : "Ethernet0", metric: 100 }],
    dnsServers: [spec.ip.replace(/\.\d+\.\d+$/, ".1.10")],
    hostsTable: { [spec.hostname]: spec.ip, [`${spec.hostname}.${org.domain}`]: spec.ip },
    firewall: [],
    reachableHosts: { "1.1.1.1": { ip: "1.1.1.1", latencyMs: 12.3, open: [443] } },
  };
}

function health(rng: Rng, status: "healthy" | "degraded" = "healthy") {
  return {
    status,
    cpuLoad: int(rng, 3, 30),
    memUsedPct: int(rng, 35, 80),
    diskUsedPct: int(rng, 25, 85),
    uptimeSeconds: int(rng, 1, 90) * 86_400,
  };
}

/** The primary web server — clones the rich VM seed (carries the 502 fault). */
function makeFaultWebNode(rng: Rng, org: OrganizationProfile, spec: NodeSpec): LinuxNodeState {
  const vm = createSeedVM();
  vm.hostname = spec.hostname;
  vm.network.interfaces = baseNetwork(spec, org).interfaces;
  vm.network.hostsTable = { localhost: "127.0.0.1", [spec.hostname]: "127.0.0.1", [`${spec.hostname}.${org.domain}`]: spec.ip };
  return {
    nodeId: spec.hostname,
    hostname: spec.hostname,
    displayName: `Prod Web · nginx`,
    role: spec.role,
    domain: org.domain,
    connection: baseConnection(spec, rng),
    network: vm.network,
    health: health(rng, "degraded"),
    tags: ["production", "web", "dmz"],
    os: "linux",
    distro: "Ubuntu 22.04.3 LTS",
    kernel: vm.kernel,
    filesystem: vm.filesystem,
    users: vm.users,
    services: vm.services,
    processes: vm.processes,
    logs: vm.logs,
    packages: [{ name: "nginx", version: "1.18.0", status: "installed" }],
    session: { cwd: vm.cwd, user: vm.currentUser, env: vm.env, history: [] },
    nextPid: vm.nextPid,
  };
}

/** Generic Linux node (db / load balancer / secondary web / file). */
function makeLinuxNode(rng: Rng, org: OrganizationProfile, spec: NodeSpec, label: string): LinuxNodeState {
  const svcMap: Record<string, LinuxNodeState["services"]> = {
    database: {
      postgresql: { name: "postgresql", status: "active", enabled: true, pid: int(rng, 400, 900), ports: [5432], lastMessage: "database system is ready to accept connections" },
      ssh: { name: "ssh", status: "active", enabled: true, pid: int(rng, 300, 400), ports: [22] },
    },
    "load-balancer": {
      haproxy: { name: "haproxy", status: "active", enabled: true, pid: int(rng, 400, 900), ports: [80, 443], lastMessage: "Proxy web_front started." },
      ssh: { name: "ssh", status: "active", enabled: true, pid: int(rng, 300, 400), ports: [22] },
    },
    web: {
      nginx: { name: "nginx", status: "active", enabled: true, pid: int(rng, 400, 900), ports: [80], lastMessage: "Started nginx." },
      ssh: { name: "ssh", status: "active", enabled: true, pid: int(rng, 300, 400), ports: [22] },
    },
  };
  const kind = spec.role === "database" ? "database" : spec.role === "load-balancer" ? "load-balancer" : "web";
  const user = "okhare";
  return {
    nodeId: spec.hostname,
    hostname: spec.hostname,
    displayName: label,
    role: spec.role,
    domain: org.domain,
    connection: baseConnection(spec, rng),
    network: baseNetwork(spec, org),
    health: health(rng),
    tags: [kind],
    os: "linux",
    distro: pick(rng, ["Ubuntu 22.04.3 LTS", "Debian 12", "Rocky Linux 9.3"]),
    kernel: pick(rng, ["5.15.0-91-generic", "6.1.0-13-amd64", "5.14.0-362.el9"]),
    filesystem: dir({
      etc: dir({ hostname: file(`${spec.hostname}\n`) }),
      var: dir({ log: dir({ syslog: file("") }) }),
      home: dir({ [user]: dir({}) }),
    }),
    users: [
      { username: "root", uid: 0, groups: ["root"], home: "/root", shell: "/bin/bash", locked: false, failedLogins: 0, scope: "local" },
      { username: user, uid: 1000, groups: [user, "sudo"], home: `/home/${user}`, shell: "/bin/bash", locked: false, failedLogins: 0, scope: "local" },
    ],
    services: svcMap[kind],
    processes: [{ pid: 1, ppid: 0, user: "root", command: "/sbin/init", cpu: 0, mem: 0.1, state: "S" }],
    logs: {},
    packages: [],
    session: {
      cwd: `/home/${user}`,
      user,
      env: { HOME: `/home/${user}`, USER: user, PATH: "/usr/sbin:/usr/bin:/sbin:/bin", SHELL: "/bin/bash", PWD: `/home/${user}`, LANG: "en_US.UTF-8" },
      history: [],
    },
    nextPid: 2000,
  };
}

/** Windows node: primary/backup DC, file server, or workstation. */
function makeWindowsNode(
  rng: Rng,
  org: OrganizationProfile,
  spec: NodeSpec,
  label: string,
  opts: { directory?: ReturnType<typeof generateDirectory>; isPrimaryDc?: boolean } = {},
): WindowsNodeState {
  const isDc = spec.role === "domain-controller";
  const services: Record<string, WindowsService> = isDc
    ? {
        NTDS: winSvc(rng, "NTDS", "Active Directory Domain Services"),
        DNS: winSvc(rng, "DNS", "DNS Server"),
        Netlogon: winSvc(rng, "Netlogon", "Netlogon"),
        W32Time: winSvc(rng, "W32Time", "Windows Time"),
      }
    : spec.role === "file-server"
      ? {
          LanmanServer: winSvc(rng, "LanmanServer", "Server (SMB)"),
          Spooler: winSvc(rng, "Spooler", "Print Spooler"),
          W32Time: winSvc(rng, "W32Time", "Windows Time"),
        }
      : {
          Spooler: winSvc(rng, "Spooler", "Print Spooler"),
          Dnscache: winSvc(rng, "Dnscache", "DNS Client"),
          wuauserv: winSvc(rng, "wuauserv", "Windows Update", false),
        };

  return {
    nodeId: spec.hostname.toLowerCase(),
    hostname: spec.hostname,
    displayName: label,
    role: spec.role,
    domain: org.domain,
    connection: baseConnection(spec, rng),
    network: baseNetwork(spec, org),
    health: health(rng),
    tags: isDc ? ["domain-controller", "critical-infra"] : [spec.role],
    os: "windows",
    edition: isDc || spec.role === "file-server" ? "Windows Server 2022 Standard" : "Windows 11 Pro",
    build: isDc || spec.role === "file-server" ? "20348.2402" : "22631.4317",
    isDomainController: isDc,
    filesystem: dir({ "C:": dir({ Windows: dir({ System32: dir({}) }), Users: dir({}) }) }),
    services,
    registry: [],
    firewall: {
      profiles: { Domain: { enabled: true }, Private: { enabled: true }, Public: { enabled: true } },
      rules: [
        { name: "Remote Desktop (TCP-In)", direction: "Inbound", action: "Allow", protocol: "TCP", localPort: 3389, profiles: ["Domain"], enabled: true },
      ],
    },
    eventLogs: {
      System: [],
      Application: [],
      Security: opts.isPrimaryDc
        ? [{ ts: now - 3 * 3600_000, channel: "Security", level: "Warning", eventId: 4740, source: "Microsoft-Windows-Security-Auditing", message: "A user account was locked out. Target: j.doe." }]
        : [],
      Setup: [],
    },
    localUsers: [{ name: "Administrator", enabled: true, groups: ["Administrators"], sid: "S-1-5-21-...-500" }],
    sessions: [],
    activeDirectory: opts.isPrimaryDc ? opts.directory : undefined,
    groupPolicy: opts.isPrimaryDc
      ? {
          gpos: [
            {
              guid: "{31B2F340-016D-11D2-945F-00C04FB984F9}",
              name: "Default Domain Policy",
              enabled: true,
              enforced: true,
              linkedOus: [`DC=${org.domain.split(".").join(",DC=")}`],
              scope: "Both",
              settings: [
                { category: "Account Lockout Policy", key: "AccountLockoutThreshold", value: 5, compliant: true },
                { category: "Password Policy", key: "MinimumPasswordLength", value: int(rng, 8, 14), compliant: chance(rng, 0.7) },
              ],
            },
          ],
        }
      : undefined,
    nextPid: 5000,
  };
}

// ── Topology ────────────────────────────────────────────────────────────────

function generateSubnets(rng: Rng, kind: TopologyKind): SubnetDef[] {
  const a = int(rng, 12, 98);
  const base = (b: number) => `10.${a}.${b}.0/24`;
  const core = { cidr: base(1), label: "Core VLAN" };
  const dmz = { cidr: base(2), label: "DMZ" };
  const user = { cidr: base(3), label: "User VLAN" };
  const storage = { cidr: base(4), label: "Storage VLAN" };
  switch (kind) {
    case "star":
      return [core, dmz, user];
    case "hybrid-mesh":
      return [core, dmz, user, storage];
    case "segmented-vlan":
      return [core, dmz, user, storage, { cidr: base(5), label: "Mgmt VLAN" }];
    case "multi-subnet":
      return [core, dmz, user, storage, { cidr: base(6), label: `Branch Subnet` }];
  }
}

function ipIn(rng: Rng, subnet: SubnetDef, host: number): string {
  return subnet.cidr.replace(/\.0\/24$/, `.${host}`);
}

// ── The generator ───────────────────────────────────────────────────────────

export function generateWorld(seed: number): InfrastructureState {
  const rng = mulberry32(seed);
  const org = generateProfile(seed, rng);
  const subnets = generateSubnets(rng, org.topologyKind);
  const sub = (label: string) => subnets.find((s) => s.label.startsWith(label)) ?? subnets[0];
  const directory = generateDirectory(rng, org);

  const nodes: Record<NodeId, TargetNode> = {};
  const add = (n: TargetNode) => (nodes[n.nodeId] = n);
  const suffix = () => String(int(rng, 1, 9)).padStart(2, "0");

  // Always: primary DC + fault web + a workstation (scenario contract).
  const pdc = makeWindowsNode(
    rng, org,
    { role: "domain-controller", os: "windows", hostname: `${org.netbios.slice(0, 4)}-PDC-${suffix()}`, ip: ipIn(rng, sub("Core"), 10), subnet: sub("Core").cidr },
    "Primary Domain Controller",
    { directory, isPrimaryDc: true },
  );
  add(pdc);

  const web = makeFaultWebNode(rng, org, {
    role: "web-server", os: "linux", hostname: `web-dmz-${suffix()}`, ip: ipIn(rng, sub("DMZ"), int(rng, 11, 60)), subnet: sub("DMZ").cidr,
  });
  add(web);

  const ws1 = makeWindowsNode(
    rng, org,
    { role: "workstation", os: "windows", hostname: `WS-${int(rng, 100, 499)}`, ip: ipIn(rng, sub("User"), int(rng, 20, 240)), subnet: sub("User").cidr },
    "Staff Workstation",
  );
  add(ws1);

  if (org.scale !== "small") {
    add(makeLinuxNode(rng, org, { role: "database", os: "linux", hostname: `sql-${suffix()}`, ip: ipIn(rng, sub("Storage"), 21), subnet: sub("Storage").cidr }, "Database · PostgreSQL"));
    add(makeWindowsNode(rng, org, { role: "file-server", os: "windows", hostname: `${org.netbios.slice(0, 4)}-FS-${suffix()}`, ip: ipIn(rng, sub("Storage"), 30), subnet: sub("Storage").cidr }, "File Server"));
    if (org.scale === "midmarket" && chance(rng, 0.5)) {
      add(makeWindowsNode(rng, org, { role: "workstation", os: "windows", hostname: `WS-${int(rng, 500, 899)}`, ip: ipIn(rng, sub("User"), int(rng, 20, 240)), subnet: sub("User").cidr }, "Staff Workstation"));
    }
  }

  if (org.scale === "enterprise") {
    add(makeWindowsNode(rng, org, { role: "domain-controller", os: "windows", hostname: `${org.netbios.slice(0, 4)}-BDC-${suffix()}`, ip: ipIn(rng, sub("Core"), 11), subnet: sub("Core").cidr }, "Backup Domain Controller"));
    add(makeLinuxNode(rng, org, { role: "load-balancer", os: "linux", hostname: `lb-${suffix()}`, ip: ipIn(rng, sub("DMZ"), 5), subnet: sub("DMZ").cidr }, "Load Balancer · HAProxy"));
    add(makeLinuxNode(rng, org, { role: "web-server", os: "linux", hostname: `web-dmz-${int(rng, 20, 49)}`, ip: ipIn(rng, sub("DMZ"), int(rng, 61, 120)), subnet: sub("DMZ").cidr }, "Web · nginx (cluster)"));
    add(makeLinuxNode(rng, org, { role: "database", os: "linux", hostname: `sql-replica-${suffix()}`, ip: ipIn(rng, sub("Storage"), 22), subnet: sub("Storage").cidr }, "Database Replica"));
    const extraWs = int(rng, 0, 2);
    for (let i = 0; i < extraWs; i++) {
      add(makeWindowsNode(rng, org, { role: "workstation", os: "windows", hostname: `WS-${int(rng, 500, 999)}`, ip: ipIn(rng, sub("User"), int(rng, 20, 240)), subnet: sub("User").cidr }, "Staff Workstation"));
    }
  }

  // Register machines in AD.
  directory.computers = Object.values(nodes)
    .filter((n) => n.os === "windows")
    .map(
      (n): ADComputer => ({
        name: n.hostname,
        dn: `CN=${n.hostname},OU=Computers,DC=${org.domain.split(".").join(",DC=")}`,
        enabled: true,
        os: (n as WindowsNodeState).edition,
        lastLogon: now - int(rng, 0, 3) * DAY,
      }),
    );

  // ── Links ──
  const links: NetworkLink[] = [];
  let linkSeq = 1;
  const mkLink = (from: NodeId, to: NodeId | "internet", via: string, hot = false): NetworkLink => ({
    id: `lnk-${linkSeq++}`,
    from,
    to,
    via,
    latencyMs: Math.round((rng() * 2.5 + 0.3) * 10) / 10,
    bandwidthMbps: pick(rng, [100, 1000, 1000, 10000]),
    utilizationPct: hot ? int(rng, 88, 96) : int(rng, 15, 65),
    packetLossPct: hot ? int(rng, 30, 80) / 10 : Math.round(rng() * 8) / 10,
    blocked: false,
    softwareFirewall: false,
  });

  const nodeList = Object.values(nodes);
  const hub = pdc.nodeId;
  for (const n of nodeList) {
    if (n.nodeId === hub) continue;
    links.push(mkLink(n.nodeId, hub, (n as { role: NodeRole }).role === "web-server" || n.role === "load-balancer" ? sub("DMZ").cidr : sub("Core").cidr));
  }
  // Internet egress via the DMZ (LB if present, else the web node).
  const egress = nodeList.find((n) => n.role === "load-balancer") ?? web;
  links.push(mkLink(egress.nodeId, "internet", sub("DMZ").cidr));
  // Topology flavor: mesh/multi-subnet add cross-links.
  if (org.topologyKind === "hybrid-mesh" || org.topologyKind === "multi-subnet") {
    const extras = sample(rng, nodeList.filter((n) => n.nodeId !== hub), Math.min(3, nodeList.length - 1));
    for (let i = 0; i + 1 < extras.length; i++) {
      links.push(mkLink(extras[i].nodeId, extras[i + 1].nodeId, pick(rng, subnets).cidr));
    }
  }
  // One congested link out of the box — the NetOps optimization hook.
  const victim = pick(rng, links);
  victim.utilizationPct = int(rng, 88, 96);
  victim.packetLossPct = int(rng, 30, 80) / 10;

  // ── Gateway ──
  const gateway: GatewayEntry[] = nodeList.map((n) => ({
    nodeId: n.nodeId,
    label: n.displayName,
    protocol: n.connection.protocol,
    ip: n.connection.ip,
    reachable: true,
  }));

  return {
    scenarioId: null,
    clientOrg: org.name,
    org,
    nodes,
    links,
    subnets,
    gateway,
    loadedAt: now,
  };
}

// ── Role-addressed lookups (scenario binding) ───────────────────────────────

export function findPrimaryDC(infra: InfrastructureState): WindowsNodeState | undefined {
  return Object.values(infra.nodes).find(
    (n): n is WindowsNodeState => n.os === "windows" && !!n.activeDirectory,
  );
}

/** The web server carrying the `app` upstream (the 502 scenario target). */
export function findFaultWeb(infra: InfrastructureState): LinuxNodeState | undefined {
  return Object.values(infra.nodes).find(
    (n): n is LinuxNodeState => n.os === "linux" && !!n.services.app,
  );
}

export function findFirstWorkstation(infra: InfrastructureState): WindowsNodeState | undefined {
  return Object.values(infra.nodes).find(
    (n): n is WindowsNodeState => n.os === "windows" && n.role === "workstation",
  );
}
