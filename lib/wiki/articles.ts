/**
 * TriageOS — Company Wiki content
 * ===============================
 * The in-world IT documentation portal. Deliberately NOT a solution book:
 * articles describe standards, conventions and procedures the way a real
 * intranet does, so the operator can DEDUCE a fix. Per-ticket walkthroughs live
 * in the Tech Toolbox, which is QA-only (see lib/host/god-mode.ts).
 *
 * The line to hold when adding content:
 *   YES — "temporary passwords must force a change at next logon"
 *   NO  — "to fix TCK-4820, unlock j.doe"
 *
 * Bodies are functions of the live InfrastructureState, so the addressing plan,
 * server inventory and domain names always match the generated world. That is
 * what makes the wiki usable in Hard Mode rather than decorative.
 */

import type { InfrastructureState, TargetNode } from "@/lib/core";

export type WikiCategory =
  | "Getting started"
  | "Network"
  | "Active Directory"
  | "Servers & Services"
  | "Procedures"
  | "Reference";

export const WIKI_CATEGORIES: WikiCategory[] = [
  "Getting started",
  "Network",
  "Active Directory",
  "Servers & Services",
  "Procedures",
  "Reference",
];

export interface WikiArticle {
  id: string;
  category: WikiCategory;
  title: string;
  /** One-line teaser shown in the sidebar and search results. */
  summary: string;
  tags: string[];
  body: (infra: InfrastructureState) => string;
}

// ── helpers over the generated world ────────────────────────────────────────

const nodes = (infra: InfrastructureState): TargetNode[] => Object.values(infra.nodes);

/** Infrastructure nodes only — the fleet of staff workstations is excluded. */
const infraNodes = (infra: InfrastructureState): TargetNode[] =>
  nodes(infra).filter((n) => !n.tags?.includes("fleet-endpoint"));

function findDc(infra: InfrastructureState): TargetNode | undefined {
  return nodes(infra).find((n) => n.role === "domain-controller");
}

function adOf(infra: InfrastructureState) {
  const dc = findDc(infra);
  return dc && "activeDirectory" in dc ? dc.activeDirectory : undefined;
}

const ROLE_PURPOSE: Record<string, string> = {
  "web-server": "Public-facing HTTP front end. Terminates requests and proxies to the app tier.",
  "app-server": "Business logic tier. Never addressed directly from outside the DMZ.",
  database: "Primary data store. Replicas carry a `-r` or numeric suffix.",
  "load-balancer": "Distributes traffic across the web tier. Health-checks members.",
  "domain-controller": "Active Directory, DNS and Kerberos. The identity root of the estate.",
  "file-server": "SMB shares and mapped drives. Runs the LanmanServer service.",
  workstation: "Staff endpoint. Managed by GPO, reachable over RDP for support.",
  firewall: "Segment boundary enforcement.",
  router: "Inter-subnet routing.",
  hypervisor: "Virtualisation host.",
};

// ── articles ────────────────────────────────────────────────────────────────

export const WIKI_ARTICLES: WikiArticle[] = [
  // ── Getting started ───────────────────────────────────────────────────────
  {
    id: "welcome",
    category: "Getting started",
    title: "Welcome to the IT Service Desk",
    summary: "How the desk runs, what you own, and where everything lives.",
    tags: ["onboarding", "overview", "start"],
    body: (infra) => {
      const org = infra.org;
      return `
# ${org.name} — IT Service Desk Handbook

You are on the internal support desk for **${org.name}**, a ${org.employeeCount.toLocaleString()}-person
${org.sector} organisation running a ${org.topologyKind.replace(/-/g, " ")} network.

This wiki is the reference the desk runs on. It documents **how the estate is
built and how we work** — it will not tell you which button to press on a given
incident. That is the job: read the standards, look at the live system, and work
out what is wrong.

## Where things are

| Tool | What it is for |
| --- | --- |
| Ticket Center | The incident queue. SLA clocks start when you accept. |
| Conversations | The human on the other end. Tone moves CSAT, CSAT moves XP. |
| CoreMail | Inbound mail. Tier-2/3 incidents arrive here before the board. |
| Remote Gateway | RDP/SSH into servers and workstations. |
| NetOps Console | Live link metrics, re-routing, and incident containment. |
| Hardware Lab | Physical builds, imaging, and field dispatch. |
| Rack & Network Lab | Rack, cable and configure new infrastructure. |

## How you are scored

XP scales with SLA compliance and the requester's satisfaction, and is reduced
by any guidance you reveal on the ticket. Committing a ticket to **Hard Mode**
hides that guidance entirely and locks in the full reward.

> This wiki costs nothing to read. It is the intended way to work a Hard Mode
> ticket — the answers are derivable from the standards documented here.
`;
    },
  },
  {
    id: "sla-policy",
    category: "Getting started",
    title: "Service level targets",
    summary: "Response and resolution windows by severity, and what a breach costs.",
    tags: ["sla", "priority", "severity", "escalation"],
    body: () => `
# Service level targets

Every ticket carries a severity that sets the clock. The countdown shown on a
ticket is the **resolution** target; it starts when you accept the ticket, not
when it arrives.

| Severity | Priority | Response | Resolution | Typical example |
| --- | --- | --- | --- | --- |
| Critical | P1 | 5 min | 30 min | Active intrusion, estate-wide outage |
| High | P2 | 15 min | 1 hour | A production service is down |
| Medium | P3 | 30 min | 4 hours | One team blocked, workaround exists |
| Low | P4 | 4 hours | 1 business day | Single user, no business impact |

## Breaches

A resolution breach halves the XP awarded for the ticket and is recorded
against your SLA compliance rate on the leaderboard. The requester is told
automatically, and their satisfaction drops — which compounds the loss.

## Escalation

Escalate when the fix requires access or authority you do not have, **not**
when it is merely difficult. Escalations are counted, and a ticket you could
have solved reflects worse than a slow one you did.
`,
  },

  // ── Network ───────────────────────────────────────────────────────────────
  {
    id: "addressing-plan",
    category: "Network",
    title: "IP addressing plan",
    summary: "Which subnet carries what, and how to tell where a host belongs.",
    tags: ["ip", "subnet", "vlan", "cidr", "addressing", "network"],
    body: (infra) => {
      const rows = infra.subnets
        .map((s) => {
          const hosts = infraNodes(infra).filter((n) =>
            n.network.interfaces.some((i) => i.ipv4?.startsWith(s.cidr.split(".").slice(0, 3).join("."))),
          );
          return `| \`${s.cidr}\` | ${s.label} | ${hosts.length || "—"} |`;
        })
        .join("\n");

      // Walk the octets of a real subnet so the worked example matches the
      // world the operator is actually looking at.
      const sample = (infra.subnets[0]?.cidr ?? "10.0.1.0/24").split("/")[0].split(".");

      return `
# IP addressing plan

The estate is segmented by function. A host's third octet tells you which
segment it belongs to, and therefore which rules apply to it.

| CIDR | Segment | Infra hosts |
| --- | --- | --- |
${rows}

## Reading an address

\`\`\`
${sample[0]} . ${sample[1]} . ${sample[2]} . 10
${" ".repeat(sample[0].length)}   ${" ".repeat(sample[1].length)}   ${" ".repeat(sample[2].length)}  └── host
${" ".repeat(sample[0].length)}   ${" ".repeat(sample[1].length)}   └──${"─".repeat(sample[2].length)}── segment (see table above)
${" ".repeat(sample[0].length)}   └──${"─".repeat(sample[1].length)}──${"─".repeat(sample[2].length)}── site
└──${"─".repeat(sample[0].length)}──${"─".repeat(sample[1].length)}──${"─".repeat(sample[2].length)}── private range (RFC1918)
\`\`\`

## Conventions

- The **.1** address in every subnet is the gateway. It is never assigned to a server.
- Infrastructure servers are numbered from **.10** upward, statically assigned.
- Staff workstations take DHCP leases from **.100** upward.
- A host answering on the wrong segment is a misconfiguration, not a coincidence —
  check its static address and mask before anything else.

> When a ticket names a subnet, everything on that subnet is in scope. Use the
> NetOps Console to see which links currently carry it.
`;
    },
  },
  {
    id: "topology",
    category: "Network",
    title: "Network topology & links",
    summary: "How segments connect, what re-routing does, and how link health is measured.",
    tags: ["topology", "links", "latency", "packet loss", "routing", "firewall"],
    body: (infra) => `
# Network topology

${infra.org.name} runs a **${infra.org.topologyKind.replace(/-/g, " ")}** topology with
${infra.links.length} monitored links across ${infra.subnets.length} segments.

## Link health

Every link is sampled continuously for three values:

| Metric | Healthy | Degraded | What it means |
| --- | --- | --- | --- |
| Utilisation | < 70% | > 85% | Share of the link's bandwidth in use |
| Packet loss | < 0.5% | > 1% | Frames dropped in transit |
| Latency | < 5 ms | > 15 ms | Round-trip delay |

**A node's health is the health of its worst attached link.** A server that looks
sick with no local fault is usually downstream of a saturated link.

## The three link controls

- **Re-route** moves a link onto a different segment. This sheds utilisation and
  clears loss — the standard remedy for congestion.
- **Software firewall** adds a small latency cost but dampens loss spikes. Use it
  to stabilise a link you cannot re-route.
- **Block** severs the link entirely. This is *containment*, not tuning — it is
  for cutting off a compromised host, and it will take services down.

> Congestion and a bad firewall rule look similar from a user's desk ("it's slow")
> but not on the console: congestion shows high utilisation, a bad rule shows a
> blocked link with traffic at zero.
`,
  },
  {
    id: "connectivity-triage",
    category: "Network",
    title: "Connectivity triage order",
    summary: "The layer-by-layer order to test when something 'cannot connect'.",
    tags: ["troubleshooting", "ping", "dns", "gateway", "connectivity"],
    body: () => `
# Connectivity triage order

Work upward. Most reported outages resolve in the first three steps, and
skipping a layer is how an afternoon disappears.

1. **Physical / link** — is the interface up? Is the cable in the right port?
2. **Addressing** — does the host have a valid IPv4, mask and gateway for the
   segment it is plugged into?
3. **Segment** — are the two endpoints actually in the same VLAN? A switch port
   in the wrong VLAN fails exactly like a dead cable.
4. **Routing** — can it reach its gateway? Can the gateway reach the far side?
5. **Name resolution** — does the hostname resolve, and to the *right* address?
6. **Service** — is the daemon on the far end actually listening?

## Useful checks

\`\`\`bash
ip addr / ipconfig      # addressing
ping <gateway>          # local segment + routing
nslookup <host>         # resolution, and what it resolves TO
curl -I http://<host>   # service is answering, and with what status
systemctl status <svc>  # the daemon's own view
\`\`\`

> A name that resolves to an *unexpected* address is not a DNS outage — it is a
> DNS integrity problem. Compare what you get back against the addressing plan.
`,
  },

  // ── Active Directory ──────────────────────────────────────────────────────
  {
    id: "ad-overview",
    category: "Active Directory",
    title: "Domain overview",
    summary: "The forest, the DCs, and what depends on them.",
    tags: ["ad", "domain", "kerberos", "dns", "identity"],
    body: (infra) => {
      const ad = adOf(infra);
      const dcs = nodes(infra).filter((n) => n.role === "domain-controller");
      return `
# Domain overview

| Property | Value |
| --- | --- |
| DNS domain | \`${ad?.domainDns ?? infra.org.domain}\` |
| NetBIOS name | \`${infra.org.netbios}\` |
| Domain controllers | ${dcs.map((d) => `\`${d.hostname}\``).join(", ") || "—"} |
| Directory size | ${ad?.users.length.toLocaleString() ?? "—"} user accounts |

## What breaks when AD breaks

The domain controllers are not just for logins. They also serve **DNS** and
**Kerberos** for the whole estate, so a DC problem presents as:

- users cannot sign in, or sign in with cached credentials only
- name resolution fails estate-wide
- machines report a **broken trust relationship** with the domain
- mapped drives disconnect (SMB authentication depends on the domain)

> A machine whose computer account has fallen out of sync must be removed from
> the domain and rejoined — resetting the *user's* password does nothing.
`;
    },
  },
  {
    id: "ad-naming",
    category: "Active Directory",
    title: "Naming conventions",
    summary: "How accounts, hostnames, groups and OUs are named. Deviations are bugs.",
    tags: ["naming", "convention", "sam", "hostname", "ou", "groups"],
    body: (infra) => {
      const ad = adOf(infra);
      const sample = ad?.users[0];
      return `
# Naming conventions

These are enforced by policy. Anything that does not match is either a mistake
or something built by hand outside process — both are worth a second look.

## User accounts

| Element | Format | Example |
| --- | --- | --- |
| Logon name (sAMAccountName) | \`<first-initial>.<lastname>\` lowercase | \`${sample?.samAccountName ?? "j.doe"}\` |
| Display name | \`<First> <Last>\` | \`${sample?.displayName ?? "Jane Doe"}\` |
| Email | \`<first>.<last>@<domain>\` | \`${sample?.email ?? `jane.doe@${infra.org.domain}`}\` |
| UPN | \`<sam>@${ad?.domainDns ?? infra.org.domain}\` | — |

Collisions take a middle initial, never a number.

## Machines

- Windows workstations: \`WS-<nnn>\`
- Mac workstations: \`MAC-<nnn>\`
- Servers: \`<NETBIOS-prefix>-<ROLE>-<nn>\`, e.g. \`${infra.org.netbios.slice(0, 4)}-PDC-05\`

## Groups and OUs

Every department has **two** groups, and both matter:

- \`<Department>\` — the identity group. Marks who someone is.
- \`<Department>_RW\` — the resource group. Grants write access to that
  department's shares and systems.

Every account also holds **Domain Users** as its primary group; it cannot be
removed.

Users live in an OU named for their department:

\`\`\`
OU=<Department>,DC=${(ad?.domainDns ?? infra.org.domain).split(".").join(",DC=")}
\`\`\`

> Moving someone between departments means all four things: the OU, the identity
> group, the resource group, and the job title. Leaving the old resource group
> attached is how people keep access they should have lost.
`;
    },
  },
  {
    id: "ad-account-lifecycle",
    category: "Active Directory",
    title: "Account lifecycle SOP",
    summary: "Standards for joiners, movers, leavers, lockouts and password resets.",
    tags: ["sop", "onboarding", "offboarding", "lockout", "password", "transfer"],
    body: () => `
# Account lifecycle SOP

## Joiners

A new account is not complete until **all** of these are true:

1. Logon name follows the convention and does not collide.
2. The account sits in the OU for its department.
3. Job title is set — HR reporting reads this field, so it must be exact.
4. The department identity group **and** its \`_RW\` resource group are attached.
5. An initial password is set and flagged to change at next logon.

## Movers (department transfer)

Treat a transfer as a leaver and a joiner against the same object. The old
department's groups must be **removed**, not merely supplemented, and the OU
must move with them. Access that survives a transfer is an audit finding.

## Lockouts

Accounts lock after repeated failed authentications. Before unlocking, note
*why* it locked — a lockout with no user at the keyboard means credentials are
being tried from somewhere else.

Unlocking clears the lock. It does not enable a **disabled** account: those are
two separate flags, and an account can be both.

## Password resets

Every desk-issued password is temporary:

- Set the new password on the account.
- Tick **User must change password at next logon**. Non-negotiable — a password
  the desk knows is not a credential.
- A reset also clears an existing lock and the bad-password counter.

> Never send a password through the same channel as the account name.
`,
  },

  // ── Servers & Services ────────────────────────────────────────────────────
  {
    id: "server-inventory",
    category: "Servers & Services",
    title: "Server roles & inventory",
    summary: "What each server in the estate does and how to reach it.",
    tags: ["servers", "roles", "inventory", "hosts", "rdp", "ssh"],
    body: (infra) => {
      const servers = infraNodes(infra).filter((n) => n.role !== "workstation");
      const rows = servers
        .map((n) => {
          const ip = n.network.interfaces.find((i) => i.ipv4)?.ipv4 ?? "—";
          return `| \`${n.hostname}\` | ${n.role} | ${n.os} | \`${ip}\` | ${n.connection.protocol.toUpperCase()} |`;
        })
        .join("\n");

      const roles = Array.from(new Set(servers.map((s) => s.role)))
        .map((r) => `- **${r}** — ${ROLE_PURPOSE[r] ?? "See the service catalogue."}`)
        .join("\n");

      return `
# Server roles & inventory

| Host | Role | OS | Address | Access |
| --- | --- | --- | --- | --- |
${rows}

## What the roles mean

${roles}

## Access

Windows hosts are reached over **RDP**, Linux over **SSH**. A protocol mismatch
is refused at the gateway rather than failing silently — if a connection is
rejected, check the host's OS before assuming it is down.

> Staff workstations are not listed here. They are reachable through Active
> Directory: find the user, open their assigned device.
`;
    },
  },
  {
    id: "service-catalogue",
    category: "Servers & Services",
    title: "Service catalogue",
    summary: "The services we run, what depends on them, and how each one fails.",
    tags: ["services", "nginx", "smb", "dns", "systemctl", "outage"],
    body: () => `
# Service catalogue

| Service | Runs on | Depends on | Failure signature |
| --- | --- | --- | --- |
| \`nginx\` | Web tier | App tier upstream | **502 Bad Gateway** — nginx is up, the thing behind it is not |
| \`app\` | Web/app tier | Database | 502 at the front end; OOM kills in the local log |
| \`postgres\` / \`mysql\` | Database | Disk | Connection pool exhaustion, timeouts |
| \`LanmanServer\` | File server | Domain auth | Mapped drives show disconnected estate-wide |
| \`DNS\` | Domain controller | — | Names fail, or resolve to the wrong address |
| \`Netlogon\` | Domain controller | — | Trust relationship failures, logon problems |

## Reading a 502 correctly

A 502 from nginx means **the proxy is healthy and the upstream is not**. Restarting
nginx achieves nothing. Find the upstream service and look at why it stopped —
usually it was killed, and usually the log says why.

\`\`\`bash
systemctl status app     # is it running, and what killed it
journalctl -u app        # the reason
systemctl start app      # only after you know the reason
curl -I localhost        # confirm 200 before closing
\`\`\`

## Disk pressure

A volume above **98%** stops behaving like a nearly-full disk and starts behaving
like a broken one: services fail to write, logs stop, and databases refuse
connections. Log rotation is the first remedy, not deleting data.
`,
  },
  {
    id: "storage-shares",
    category: "Servers & Services",
    title: "Storage & mapped drives",
    summary: "Drive letter standards and why a share disconnects.",
    tags: ["smb", "shares", "drives", "storage", "file server"],
    body: (infra) => {
      const fs = nodes(infra).find((n) => n.role === "file-server");
      return `
# Storage & mapped drives

Shares are hosted on ${fs ? `\`${fs.hostname}\`` : "the file server"} and mapped by GPO at logon.

| Letter | Share | Scope |
| --- | --- | --- |
| \`S:\` | \\\\<file-server>\\Shared | Everyone |
| \`H:\` | \\\\<file-server>\\HR | HR |
| \`Z:\` | \\\\<file-server>\\Finance | Finance |
| \`L:\` | \\\\<file-server>\\Legal | Legal |
| \`I:\` | \\\\<file-server>\\IT | IT |
| \`M:\` | \\\\<file-server>\\Marketing | Marketing |

## Why a drive shows disconnected

Drive status is derived live from the host serving it. In order of likelihood:

1. **LanmanServer is stopped** on the file server — every mapped drive on every
   workstation drops at once. Estate-wide symptoms, single-host cause.
2. The file server is **offline or unreachable**.
3. The user's session lost domain authentication.

> One user's drive missing is a client problem. *Everyone's* drives missing is a
> server problem — do not start with the user's desk.
`;
    },
  },

  // ── Procedures ────────────────────────────────────────────────────────────
  {
    id: "sop-hardware",
    category: "Procedures",
    title: "Hardware build standard",
    summary: "Specs, the build sequence, and the safety steps that are not optional.",
    tags: ["sop", "hardware", "build", "ram", "ssd", "raid", "bios", "imaging"],
    body: () => `
# Hardware build standard

## Issue specification

| Class | Memory | Storage | Notes |
| --- | --- | --- | --- |
| Standard desk | 16 GB | 512 GB SSD | Office and line-of-business apps |
| Engineering | 32 GB | 1 TB SSD | Local builds, containers, VMs |
| Executive laptop | 32 GB | 1 TB SSD | Battery service life checked at issue |
| Rack server | Per role | 2 × SSD, RAID 1 | Mirrored boot, hot-swap bays |

A machine that cannot hold the workload is a **replacement**, not a repair.
8 GB against a build toolchain is the classic example.

## Build sequence

1. **Prep** — power down, disconnect the battery on portables, remove the baffle
   on rack chassis. Working a live board is how you destroy one.
2. **Swap** — extract the faulty component, seat the replacement fully.
3. **Cable** — every data and power route reconnected to the correct port.
4. **Fasten** — all screws. A board left loose fails intermittently later, which
   is worse than failing now.
5. **Close** — panel on before power on.

> Skipping the battery disconnect, the cabling or the screws produces a unit that
> passes assembly and then fails during imaging with a hardware interrupt. The
> fault is real and it is yours.

## Firmware

Enter setup during POST. Standard settings:

- **Secure Boot** — enabled
- **SATA mode** — AHCI, except mirrored server volumes which use RAID
- **Boot order** — internal disk first, network second

A machine that boots to "no bootable device" after a rebuild has either a boot
order problem or a missing EFI partition.

## Imaging

Partition in order — **EFI → MSR → primary**. Deploy over PXE, address the host
statically per the addressing plan, then join the domain with the deployment
account.
`,
  },
  {
    id: "sop-dispatch",
    category: "Procedures",
    title: "Field dispatch",
    summary: "When a job leaves your desk and what must be true before it does.",
    tags: ["sop", "dispatch", "field", "swap", "logistics"],
    body: () => `
# Field dispatch

Anything requiring hands on hardware at the user's desk or in the rack goes to a
field technician. Remote work cannot reseat a DIMM.

## Preconditions

A dispatch is only accepted once the replacement unit is **fully provisioned** —
assembled, firmware configured, imaged, and joined. Dispatching an incomplete
build sends a technician to do a desk-side rebuild in front of the user.

## Sequence

1. Complete every provisioning stage in the Hardware Lab.
2. Raise the dispatch against the ticket.
3. The technician collects, swaps and returns the faulty unit.
4. The ticket closes automatically when the replacement reports healthy.

> The SLA clock does not pause for dispatch. Provision early.
`,
  },
  {
    id: "sop-security",
    category: "Procedures",
    title: "Security incident response",
    summary: "Containment order for intrusion, ransomware and phishing.",
    tags: ["sop", "security", "incident", "ransomware", "phishing", "containment", "apt"],
    body: () => `
# Security incident response

**Contain first, investigate second, remediate third.** An investigation running
against a live intrusion is just observation.

## Containment order

1. **Block the attacker at the edge** — stop the traffic before anything else.
2. **Isolate affected hosts** — cut the compromised machine off the network. It
   stays powered on; you lose memory evidence if you pull the plug.
3. **Rotate every service credential** — assume anything the host could reach has
   been read. Partial rotation is not rotation.
4. **Preserve logs** before rotating them.

## Ransomware

Encrypted endpoints are never cleaned in place. Isolate, then rebuild from bare
metal: full wipe, fresh image, rejoin. Restore data from backup, never from the
affected volume.

## Phishing

Report and flag the **sender domain**, not the individual message. Flagging the
domain blocks it estate-wide; deleting the mail protects one mailbox and leaves
everyone else exposed.

> Credentials that have been typed into a phishing page are compromised whether
> or not the account shows suspicious activity. Reset them.
`,
  },
  {
    id: "sop-change",
    category: "Procedures",
    title: "Change control",
    summary: "What needs approval, and how to recognise a bad change.",
    tags: ["sop", "change", "maintenance", "rollback", "firewall"],
    body: () => `
# Change control

## Windows

Standard changes go in the overnight window. Emergency changes are allowed to
restore service and are reviewed afterward — not skipped.

## Recognising a bad change

The strongest signal in triage is **timing**. A fault that began immediately
after a maintenance window is almost always the change, not a coincidence.

Ask three questions:

1. What changed, and when exactly?
2. Does the blast radius match the change's scope? A rule meant for one segment
   that took out two was written too broadly.
3. Can it be reverted cleanly?

> "It worked yesterday" plus a change window last night is a rollback, not an
> investigation.
`,
  },

  // ── Reference ─────────────────────────────────────────────────────────────
  {
    id: "ref-errors",
    category: "Reference",
    title: "Error code glossary",
    summary: "HTTP, Windows and Linux codes you will meet on the desk.",
    tags: ["errors", "codes", "http", "502", "glossary", "reference"],
    body: () => `
# Error code glossary

## HTTP

| Code | Meaning | Points at |
| --- | --- | --- |
| 200 | OK | Service healthy |
| 301 / 302 | Redirect | Normal unless it loops |
| 401 | Unauthorised | Credentials missing or wrong |
| 403 | Forbidden | Authenticated but not permitted |
| 404 | Not found | Wrong path, or wrong host answering |
| 500 | Internal error | The application itself threw |
| **502** | **Bad gateway** | **Proxy is up, upstream is down** |
| 503 | Service unavailable | Overloaded or deliberately drained |
| 504 | Gateway timeout | Upstream too slow, not dead |

## Windows

| Symptom | Meaning |
| --- | --- |
| Trust relationship failed | Machine account out of sync — unjoin and rejoin |
| No bootable device | Boot order, or a missing/corrupt EFI partition |
| Account locked out | Repeated failed authentications |
| Account disabled | Deliberately switched off — a different flag from locked |
| Access denied on a share | Group membership, or the share's host is unavailable |

## Linux

| Symptom | Meaning |
| --- | --- |
| \`Failed to start\` | Unit crashed at startup — read the journal |
| \`Out of memory: Killed process\` | OOM killer; the box is undersized or leaking |
| \`No space left on device\` | Volume full — rotate logs before deleting data |
| \`Connection refused\` | Nothing is listening on that port |
| \`No route to host\` | Layer 3 — addressing, gateway or a blocked link |
`,
  },
  {
    id: "ref-cli",
    category: "Reference",
    title: "Command reference",
    summary: "The commands that answer the most common questions fastest.",
    tags: ["cli", "commands", "bash", "powershell", "cisco", "reference"],
    body: () => `
# Command reference

## Linux

\`\`\`bash
systemctl status <svc>        # is it running, and why did it stop
systemctl start|restart <svc> # act on it
journalctl -u <svc>           # the unit's log
curl -I http://localhost      # status code without the body
df -h                         # disk usage by volume
free -m                       # memory pressure
ss -tulpn                     # what is actually listening
ip addr / ifconfig            # addressing
ping / nslookup <host>        # reachability and resolution
\`\`\`

## Switch configuration

\`\`\`
enable                        # privileged mode
configure terminal            # global config
vlan 20                       # create a VLAN
interface gi0/3               # select a port
switchport access vlan 20     # put the port in it
no shutdown                   # bring it up
show vlan brief               # verify membership
show ip interface brief       # verify addressing and state
write memory                  # persist
\`\`\`

> A VLAN that exists but has no ports assigned carries no traffic. Both halves
> are needed, and \`show vlan brief\` proves it.
`,
  },
  {
    id: "ref-glossary",
    category: "Reference",
    title: "Glossary",
    summary: "House terminology, decoded.",
    tags: ["glossary", "terms", "definitions", "reference"],
    body: () => `
# Glossary

| Term | Meaning |
| --- | --- |
| **DMZ** | Segment exposed to untrusted networks. Web tier only. |
| **Upstream** | The service a proxy forwards to. A 502 is an upstream fault. |
| **Blast radius** | How much breaks when one thing does. |
| **OU** | Organisational Unit — the AD container an object lives in. |
| **sAMAccountName** | The short logon name, e.g. \`j.doe\`. |
| **UPN** | User Principal Name — \`user@domain\`, the modern logon form. |
| **GPO** | Group Policy Object. Pushes settings and drive maps at logon. |
| **PXE** | Network boot, used to deploy images to bare metal. |
| **EFI partition** | Small boot partition. Missing it means no bootable device. |
| **RAID 1** | Two disks mirrored. Survives one failing. |
| **Hot-swap** | Replaceable while powered. Applies to drives and PSUs, not memory. |
| **LanmanServer** | The Windows service that publishes SMB shares. |
| **CSAT** | Customer satisfaction, 0-100. Driven by tone and speed. |
| **Containment** | Stopping spread. Comes before diagnosis in security work. |
`,
  },
];

/** Full-text index for the wiki search box. */
export function searchArticles(
  articles: WikiArticle[],
  infra: InfrastructureState,
  query: string,
): WikiArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles;
  return articles.filter((a) => {
    const hay = `${a.title} ${a.summary} ${a.tags.join(" ")} ${a.body(infra)}`.toLowerCase();
    return hay.includes(q);
  });
}
