/**
 * ITQuest — Enterprise share seed (v0.5.0)
 * =========================================
 * The share layout a real file server accumulates: one departmental area per
 * team, a couple of cross-cutting shares that several teams need, and a public
 * drop everyone can read.
 *
 * DELIBERATELY IMPERFECT. Two things are seeded wrong on purpose, because a
 * perfectly-ACL'd estate has nothing to teach:
 *
 *   - a cross-department share (Board_Reports) whose access list names one
 *     group only, so a legitimate request from another team needs BOTH a
 *     membership change and an ACL change;
 *   - an explicit Deny left behind by a predecessor, which is the single most
 *     common reason a user who IS in the right group still cannot get in.
 *
 * Group names come from the generated directory so the two always agree —
 * inventing share groups here would create a second, drifting source of truth.
 */

import type { ActiveDirectoryState, FileShare, PolicyState, ShareAce, TargetNode } from "@/lib/core";
import { DOMAIN_ROOT } from "@/lib/core";
import { pick, int, type Rng } from "@/lib/org/rng";

/** Shares every estate has, expressed against whatever departments exist. */
interface SharePlan {
  name: string;
  description: string;
  owner: string;
  sizeGb: [number, number];
  /** Groups granted access, resolved against the live directory. */
  grants: { group: string; access: "read" | "change" | "full"; deny?: boolean }[];
}

/** The `<Dept>_RW` resource group the generator makes for a department. */
const rwGroup = (dept: string) => `${dept.replace(/\s+/g, "")}_RW`;

export function seedShares(
  ad: ActiveDirectoryState,
  server: TargetNode,
  rng: Rng,
): FileShare[] {
  const host = server.hostname.toLowerCase();
  const departments = ad.ous.map((o) => o.name);
  const has = (g: string) => ad.groups.some((x) => x.name === g);

  const plans: SharePlan[] = [];

  // One area per department, granted to that department's resource group.
  for (const dept of departments) {
    plans.push({
      name: `${dept.replace(/\s+/g, "")}_Share`,
      description: `${dept} working area`,
      owner: dept,
      sizeGb: [40, 400],
      grants: [
        { group: rwGroup(dept), access: "change" },
        { group: "Domain Admins", access: "full" },
      ],
    });
  }

  // Everyone reads this one. It is the control case: when a user cannot open
  // Public, the fault is the server, not the ACL.
  plans.push({
    name: "Public",
    description: "Company-wide read-only drop",
    owner: "IT",
    sizeGb: [10, 60],
    grants: [
      { group: "Domain Users", access: "read" },
      { group: "Domain Admins", access: "full" },
    ],
  });

  // The cross-cutting share. Finance owns it; anyone else who needs it needs
  // a membership change AND an entry here.
  const financeish = departments.find((d) => /finance/i.test(d)) ?? departments[0];
  plans.push({
    name: "Board_Reports",
    description: "Quarterly board pack — restricted",
    owner: financeish,
    sizeGb: [5, 40],
    grants: [
      { group: rwGroup(financeish), access: "change" },
      { group: "Domain Admins", access: "full" },
    ],
  });

  // The inherited mistake: a stale Deny that outranks every grant.
  const legacyDept = departments.find((d) => /market|sales|ops/i.test(d)) ?? departments[departments.length - 1];
  plans.push({
    name: "Archive",
    description: "Retired project archive (migrated 2019)",
    owner: "IT",
    sizeGb: [200, 900],
    grants: [
      { group: "Domain Users", access: "read" },
      { group: rwGroup(legacyDept), access: "change", deny: true },
      { group: "Domain Admins", access: "full" },
    ],
  });

  return plans.map((plan, i) => {
    const acl: ShareAce[] = plan.grants
      .filter((g) => has(g.group))
      .map((g) => ({ groupName: g.group, access: g.access, ...(g.deny ? { deny: true } : {}) }));
    return {
      id: `share-${host}-${i + 1}`,
      name: plan.name,
      path: `\\\\${host}\\${plan.name}`,
      serverNodeId: server.nodeId,
      description: plan.description,
      acl,
      sizeGb: int(rng, plan.sizeGb[0], plan.sizeGb[1]),
      owner: plan.owner,
    };
  });
}

/** A department other than the one that owns the share — for ticket prose. */
export function otherDepartment(ad: ActiveDirectoryState, owner: string, rng: Rng): string {
  const others = ad.ous.map((o) => o.name).filter((d) => d !== owner);
  return others.length ? pick(rng, others) : owner;
}

// ── Fleet Policies (v0.8.0) ─────────────────────────────────────────────────

/**
 * The policy set a competent predecessor would have left: one domain-wide
 * baseline and nothing else.
 *
 * Deliberately thin. A fully-configured policy tree has nothing to teach, and
 * the tickets that follow are all about ADDING targeted policy — a strict
 * password rule for Finance, a USB block for a regulated team, a drive
 * mapping for a department. Starting with one baseline also means the first
 * time a learner sees precedence bite, it is because of something they did.
 */
export function seedPolicies(): PolicyState {
  const now = Date.now();
  return {
    policies: [
      {
        id: "cfp-baseline",
        name: "Default Domain Baseline",
        description: "Applies to every account in the domain. The floor, not the ceiling.",
        enabled: true,
        settings: {
          passwordMinLength: 10,
          passwordComplexity: true,
          passwordMaxAgeDays: 180,
          lockoutThreshold: 5,
          lockoutDurationMins: 15,
          screenLockMins: 15,
          firewallEnabled: true,
        },
        links: [{ target: DOMAIN_ROOT, enforced: false, enabled: true }],
        updatedAt: now,
      },
    ],
    blockedOus: [],
  };
}
