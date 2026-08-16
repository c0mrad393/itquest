/**
 * ITQuest — Company expansion (v0.6.0)
 * =====================================
 * What actually happens when the company reaches a milestone.
 *
 * ADDITIVE, NEVER A REGENERATION. This walks the world the player already has
 * and adds to it: new staff in the directory, new organizational units, new
 * resource groups, new departmental shares. Every rack they cabled, every ACL
 * they set and every ticket they closed is untouched. Rebuilding the estate at
 * level 5 would delete the only thing the first five levels produced.
 *
 * THE COMPANY HIRES; THE PLAYER SCALES. Nothing here provisions a rack, fits
 * cooling or widens a subnet. It hires people, which consumes IP addresses,
 * disk and power — and then the reconciler files a project ticket asking the
 * operator to deal with the consequences. Auto-provisioning the fix would
 * remove the entire reason the milestone exists.
 */

import type {
  ADUser,
  GrowthEvent,
  GrowthPhase,
  InfrastructureState,
  WindowsNodeState,
} from "@/lib/core";
import { phaseSpec } from "@/lib/core";
import { DEPARTMENTS, FIRST_NAMES, LAST_NAMES } from "./namegen";
import { departmentsFor } from "./generator";
import { seedShares } from "@/lib/directory/seed";
import { int, pick, type Rng } from "./rng";

export interface GrowthSummary {
  phase: GrowthPhase;
  hired: number;
  departmentsAdded: string[];
  /** Headcount before and after, for the notification. */
  from: number;
  to: number;
}

/** The domain controller that owns the directory, if the estate has one. */
function directoryHost(infra: InfrastructureState): WindowsNodeState | undefined {
  const dc = Object.values(infra.nodes).find((n) => n.os === "windows" && !!n.activeDirectory);
  return dc && dc.os === "windows" ? dc : undefined;
}

/** A login that does not collide with anyone already in the directory. */
function uniqueSam(taken: Set<string>, first: string, last: string): string {
  const stem = `${first[0]}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 400; n++) {
    const candidate = `${stem}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}${taken.size}`;
}

/**
 * Grow the estate to `phase`, mutating a DRAFT of the infrastructure.
 *
 * Returns null when there is nothing to do — the phase has already been
 * applied, or the world has no directory to hire into. Idempotence matters
 * here: a save restore, a double promotion or a debug force must never hire
 * the same 115 people twice.
 */
export function applyGrowth(
  draft: InfrastructureState,
  phase: GrowthPhase,
  rng: Rng,
): GrowthSummary | null {
  if (draft.growth.applied.includes(phase)) return null;

  const spec = phaseSpec(phase);
  const dc = directoryHost(draft);
  if (!dc?.activeDirectory) return null;
  const ad = dc.activeDirectory;

  const from = ad.users.length;

  // ── New departments ──────────────────────────────────────────────────────
  const wanted = departmentsFor(phase);
  const existing = new Set(ad.ous.map((o) => o.name));
  const added = wanted.filter((d) => !existing.has(d.name));

  const ouDn = (name: string) =>
    `OU=${name},${ad.domainDns.split(".").map((p) => `DC=${p}`).join(",")}`;

  for (const dept of added) {
    ad.ous.push({ dn: ouDn(dept.name), name: dept.name });
    // Both the identity group and the resource group, matching what the
    // generator makes — a department with no `_RW` group cannot be given a
    // share, and the access-request tickets would have nothing to grant.
    ad.groups.push({
      sid: `S-1-5-21-...-${1700 + ad.groups.length}`,
      name: dept.name,
      scope: "Global",
      category: "Security",
      members: [],
    });
    ad.groups.push({
      sid: `S-1-5-21-...-${1800 + ad.groups.length}`,
      name: `${dept.name.replace(/\s+/g, "")}_RW`,
      scope: "DomainLocal",
      category: "Security",
      members: [],
      description: `Read/write access to the ${dept.name} file share`,
    });
  }

  // ── The hiring ───────────────────────────────────────────────────────────
  const target = spec.employees;
  const taken = new Set(ad.users.map((u) => u.samAccountName));
  const mailDomain = ad.domainDns.replace(".internal", ".com");
  let hired = 0;

  while (ad.users.length < target) {
    const dept = pick(rng, wanted);
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const sam = uniqueSam(taken, first, last);
    taken.add(sam);

    const user: ADUser = {
      sid: `S-1-5-21-...-${3000 + ad.users.length}`,
      samAccountName: sam,
      upn: `${sam}@${ad.domainDns}`,
      displayName: `${first} ${last}`,
      title: pick(rng, dept.titles),
      department: dept.name,
      email: `${sam}@${mailDomain}`,
      ou: ouDn(dept.name),
      // New starters land in their department's groups, the same way the
      // generator seeds everyone else.
      memberOf: ["Domain Users", dept.name, `${dept.name.replace(/\s+/g, "")}_RW`],
      enabled: true,
      locked: false,
      passwordExpired: false,
      mustChangePassword: false,
      badPwdCount: 0,
      lastLogon: Date.now() - int(rng, 1, 72) * 3_600_000,
      passwordExpiresAt: Date.now() + int(rng, 20, 90) * 86_400_000,
      description: pick(rng, dept.titles),
    };
    ad.users.push(user);
    hired++;
  }

  // ── Shares for the new departments ───────────────────────────────────────
  // Re-seeding produces areas for departments that did not exist before. Only
  // genuinely NEW shares are appended; an operator's edits to the existing
  // access lists are exactly the thing this must not trample.
  const fs = Object.values(draft.nodes).find((n) => n.role === "file-server");
  if (fs && added.length) {
    const proposed = seedShares(ad, fs, rng);
    const have = new Set((fs.shares ?? []).map((sh) => sh.name));
    fs.shares = [...(fs.shares ?? []), ...proposed.filter((sh) => !have.has(sh.name))];
  }

  // ── Record it ────────────────────────────────────────────────────────────
  const event: GrowthEvent = {
    phase,
    at: Date.now(),
    from,
    to: ad.users.length,
    departmentsAdded: added.map((d) => d.name),
  };
  draft.growth = {
    phase: Math.max(draft.growth.phase, phase) as GrowthPhase,
    employees: ad.users.length,
    applied: [...draft.growth.applied, phase],
    history: [...draft.growth.history, event],
  };
  draft.org = { ...draft.org, employeeCount: ad.users.length };

  return { phase, hired, departmentsAdded: event.departmentsAdded, from, to: event.to };
}

/** Every department name the game knows, for debug tooling. */
export const ALL_DEPARTMENTS = DEPARTMENTS.map((d) => d.name);
