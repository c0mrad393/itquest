/**
 * ITQuest — Jargon glossary (v0.9.1)
 * ===================================
 * One sentence per term, in the words an experienced colleague would actually
 * use while leaning over your desk. Not a dictionary: every entry answers
 * "what is it" and, where it matters more, "why do I care right now".
 *
 * WHY THIS IS DATA. The definitions live in one file rather than inline at
 * each call site so the same term reads identically in the Admin Center, in a
 * ticket, and in the wiki. A product that explains "OU" three slightly
 * different ways teaches the reader that they misunderstood it the first two
 * times.
 *
 * HOUSE STYLE, because it is what makes these useful rather than decorative:
 *   - `short` is the definition. One or two sentences. No forward references
 *     to other jargon the reader has not met yet.
 *   - `why` is optional and states the CONSEQUENCE — the thing that makes the
 *     term matter in play. "Nested groups are why a user can have access
 *     nobody granted them directly" teaches more than any definition does.
 *   - Parody names (EDS, CFP, ServerOS) are defined as themselves, with the
 *     real-world equivalent named, since the point is transferable knowledge.
 */

export interface GlossaryEntry {
  term: string;
  short: string;
  why?: string;
}

const ENTRIES = {
  // ── Directory ────────────────────────────────────────────────────────────
  eds: {
    term: "EDS",
    short:
      "Enterprise Directory Services — the company's central list of who exists, what they are allowed to use, and which machines belong to the company.",
    why: "Almost every access problem ends here, because this is where the answer to 'who are you' is stored.",
  },
  ou: {
    term: "OU",
    short:
      "Organizational Unit — a folder inside the directory holding users or computers, usually one per department or site.",
    why: "Policies attach to OUs, so which folder an account sits in decides what rules land on it.",
  },
  dn: {
    term: "Distinguished Name",
    short:
      "The full address of an object in the directory, written from the object outward: the account, then its OU, then the domain.",
  },
  samaccountname: {
    term: "Login name",
    short:
      "The short name someone actually types to sign in, as distinct from their display name.",
    why: "Two people can share a display name; the login name is the one that must be unique.",
  },
  securitygroup: {
    term: "Security group",
    short:
      "A named bag of accounts. Permissions are granted to the group, and everyone in it inherits them.",
    why: "Granting access to a person instead of a group is how estates become impossible to audit.",
  },
  domainjoin: {
    term: "Domain-joined",
    short:
      "A computer that has its own account in the directory, so company sign-ins and policies work on it.",
    why: "A machine that is not joined will ignore every policy you set, which looks exactly like the policy being broken.",
  },

  // ── Policy ───────────────────────────────────────────────────────────────
  cfp: {
    term: "CFP",
    short:
      "Centralized Fleet Policies — the system that pushes settings (password rules, drive mappings, lock screens) to many machines at once. The real-world equivalent is Group Policy.",
  },
  policylink: {
    term: "Link",
    short:
      "Attaching a policy to a container. A policy that exists but is not linked anywhere does nothing at all.",
    why: "'I created the policy' and 'the policy applies' are two different claims, and this is the gap between them.",
  },
  enforced: {
    term: "Enforced",
    short:
      "A link marked enforced wins over policies closer to the object, and pushes through blocked inheritance.",
    why: "It reverses the usual 'closest wins' rule, which is why an enforced link can override a setting you edited five seconds ago.",
  },
  blockinheritance: {
    term: "Block inheritance",
    short:
      "Tells an OU to ignore policies coming from above it. Enforced links ignore the block.",
  },
  precedence: {
    term: "Precedence",
    short:
      "The order policies are applied in. The one applied closest to the object normally wins, unless something above it is enforced.",
  },

  // ── Network ──────────────────────────────────────────────────────────────
  ip: {
    term: "IP address",
    short: "A machine's numeric address on the network — how traffic finds it.",
  },
  subnet: {
    term: "Subnet",
    short:
      "A slice of the network that a group of machines shares. Devices in the same subnet reach each other directly; crossing between subnets needs a router.",
    why: "Two machines with addresses that look similar can still be unable to see each other if the subnets differ.",
  },
  vlan: {
    term: "VLAN",
    short:
      "A logical network laid over the physical one, so machines on the same switch can be kept apart.",
  },
  gateway: {
    term: "Default gateway",
    short: "The router a machine sends traffic to when the destination is not on its own subnet.",
    why: "A wrong gateway looks like 'the internet is down' while the local network works perfectly.",
  },
  dhcp: {
    term: "DHCP",
    short: "The service that hands out IP addresses automatically as machines come online.",
    why: "When its pool runs out, new machines get no address at all and simply fail to connect.",
  },
  dns: {
    term: "DNS",
    short: "Translates names people type into the numeric addresses machines use.",
  },
  tor: {
    term: "ToR switch",
    short:
      "Top-of-Rack switch — the switch at the top of a rack that every server in that rack plugs into.",
    why: "Lose it and every machine in the rack goes dark at once, which reads as a mass outage rather than one failed part.",
  },
  uplink: {
    term: "Uplink",
    short: "The cable carrying a rack's traffic out to the rest of the network.",
  },
  latency: {
    term: "Latency",
    short: "How long a round trip to a machine takes, in milliseconds. Lower is better.",
  },

  // ── Datacenter ───────────────────────────────────────────────────────────
  rackunit: {
    term: "U",
    short:
      "Rack unit — the height measure for rack hardware. 1U is one slot; U1 is the top of the rack.",
  },
  pdu: {
    term: "PDU",
    short:
      "Power Distribution Unit — the rack's power strip, with a breaker and a finite budget in watts.",
    why: "Fill a rack past its budget and the breaker trips, taking down healthy machines that did nothing wrong.",
  },
  breaker: {
    term: "Breaker",
    short: "The cutout that kills power to a rack when it draws more than it should.",
  },
  thermal: {
    term: "Thermal load",
    short:
      "Heat produced by the hardware in a rack. Hot air rises, so the top of a rack runs warmer than the bottom.",
  },

  // ── Service desk ─────────────────────────────────────────────────────────
  sla: {
    term: "SLA",
    short:
      "Service Level Agreement — the promised time to respond to and resolve a ticket, set by its severity.",
    why: "Breaching it costs reputation and score even if you eventually fix the problem perfectly.",
  },
  triage: {
    term: "Triage",
    short:
      "Deciding what to work on first based on impact and urgency, rather than on what arrived first.",
  },
  escalation: {
    term: "Escalation",
    short: "Handing a ticket to someone with more access or expertise when it exceeds your scope.",
  },
  csat: {
    term: "CSAT",
    short:
      "Customer satisfaction — how the person who raised the ticket rated the experience, not just the fix.",
    why: "A technically correct fix delivered rudely or late still scores badly, which is the point.",
  },
  rdp: {
    term: "RDP",
    short:
      "Remote Desktop Protocol — connect to a Windows machine and use its desktop as though you were sitting at it.",
  },
  ssh: {
    term: "SSH",
    short: "A secure text-only remote connection, the usual way into a Linux server.",
  },

  // ── Services ─────────────────────────────────────────────────────────────
  service: {
    term: "Service",
    short:
      "A program that runs in the background on a server, with no window, started automatically at boot.",
  },
  smb: {
    term: "SMB share",
    short: "A folder on a server that other machines can open over the network as a drive.",
  },
  uptime: {
    term: "Uptime",
    short: "How long a machine has been running since its last restart.",
  },
} as const;

/*
 * Typed as Record<Key, GlossaryEntry> rather than left as the inferred literal
 * union: with `as const` alone, TypeScript narrows each entry to its own exact
 * shape, so reading `.why` off a lookup fails for every entry that happens not
 * to define one. The annotation keeps `why` optional-but-present in the type
 * while `keyof typeof ENTRIES` still gives compile-time checking of the keys.
 */
export const GLOSSARY: Record<keyof typeof ENTRIES, GlossaryEntry> = ENTRIES;

export type GlossaryKey = keyof typeof ENTRIES;
