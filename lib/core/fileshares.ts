/**
 * TriageOS — Enterprise file shares (v0.5.0)
 * ==========================================
 * Server-side SMB shares with an access control list bound to Active Directory
 * security groups. This is the other half of the access-request loop: adding a
 * user to `Finance` in ADUC does nothing on its own, and granting `Finance`
 * rights on a share does nothing for a user who is not in it. Both must be
 * true, which is exactly why real access requests get half-done.
 *
 * WHERE THIS LIVES. Shares belong to the file server that serves them —
 * `TargetNode.shares` — for the same reason workloads belong to their host. A
 * separate top-level registry would be a second copy of "which server has this
 * data", and the first outage would prove it wrong.
 *
 * NOT TO BE CONFUSED WITH `lib/infra/shares.ts`, which is the WORKSTATION side:
 * a mapped drive letter pointing at one of these. That module derives whether
 * the mapping is connected; this one owns what the share IS and who may open
 * it.
 *
 * Access resolution is PURE and shared by the UI and the ticket
 * win-conditions.
 */

import type { NodeId } from "./nodes";
import type { ActiveDirectoryState } from "./windows";
import { effectiveGroups } from "./directory";

/** NTFS-style rights, in the order an admin thinks about them. */
export type ShareAccess = "read" | "change" | "full";

export const SHARE_ACCESS_LABEL: Record<ShareAccess, string> = {
  read: "Read",
  change: "Change",
  full: "Full control",
};

/** Ranked so "the most permissive grant wins" is a comparison, not a table. */
export const SHARE_ACCESS_RANK: Record<ShareAccess, number> = { read: 1, change: 2, full: 3 };

/** One entry on a share's access control list. */
export interface ShareAce {
  /** AD security group name, e.g. "Finance". Never an individual user —
   *  per-user ACEs are how permission sprawl starts, and the estate's
   *  convention is group-based access. */
  groupName: string;
  access: ShareAccess;
  /**
   * Explicit deny. Beats every allow, the way it does in Windows — and it is
   * the single most common cause of "but they ARE in the group".
   */
  deny?: boolean;
}

export interface FileShare {
  id: string;
  /** Share name as it appears after the host, e.g. "Finance_Reports". */
  name: string;
  /** Full UNC path, e.g. "\\\\fs01\\Finance_Reports". */
  path: string;
  serverNodeId: NodeId;
  description: string;
  acl: ShareAce[];
  sizeGb: number;
  /** Department that owns the data — drives ticket prose and defaults. */
  owner: string;
}

/**
 * What a set of groups may do on a share.
 *
 * Windows semantics, deliberately: an explicit deny anywhere beats every
 * allow, and otherwise the most permissive matching grant wins. Getting this
 * wrong in a simulation would teach the opposite of the real lesson.
 */
export function accessForGroups(share: FileShare, groups: string[]): ShareAccess | null {
  const owned = new Set(groups);
  let best: ShareAccess | null = null;

  for (const ace of share.acl) {
    if (!owned.has(ace.groupName)) continue;
    if (ace.deny) return null; // deny wins outright
    if (!best || SHARE_ACCESS_RANK[ace.access] > SHARE_ACCESS_RANK[best]) best = ace.access;
  }
  return best;
}

/** What one directory user may do on a share, resolving nested groups. */
export function accessForUser(
  ad: ActiveDirectoryState,
  share: FileShare,
  sam: string,
): ShareAccess | null {
  return accessForGroups(share, effectiveGroups(ad, sam));
}

/** Does this user have AT LEAST the requested level? */
export function hasAccess(
  ad: ActiveDirectoryState,
  share: FileShare,
  sam: string,
  atLeast: ShareAccess,
): boolean {
  const got = accessForUser(ad, share, sam);
  return !!got && SHARE_ACCESS_RANK[got] >= SHARE_ACCESS_RANK[atLeast];
}

/**
 * Why this user cannot get to the share at the requested level — naming the
 * ONE thing to fix rather than listing everything that could be wrong.
 */
export function accessBlocker(
  ad: ActiveDirectoryState,
  share: FileShare,
  sam: string,
  atLeast: ShareAccess,
): string | null {
  const groups = effectiveGroups(ad, sam);
  const denied = share.acl.find((a) => a.deny && groups.includes(a.groupName));
  if (denied) {
    return `An explicit Deny on ${denied.groupName} is blocking access. Deny beats every grant — remove it, or take the user out of that group.`;
  }
  const got = accessForGroups(share, groups);
  if (!got) {
    const granted = share.acl.filter((a) => !a.deny).map((a) => a.groupName);
    return granted.length
      ? `Not a member of any group with rights here (${granted.join(", ")}). Add them in Active Directory, or grant their group access on this share.`
      : `No group has been granted anything on this share yet. Add an entry to its access list.`;
  }
  if (SHARE_ACCESS_RANK[got] < SHARE_ACCESS_RANK[atLeast]) {
    return `Only ${SHARE_ACCESS_LABEL[got]} through their groups; this needs ${SHARE_ACCESS_LABEL[atLeast]}. Raise the group's entry on the share.`;
  }
  return null;
}

/** Every share the estate serves, wherever it is hosted. */
export function allShares(nodes: Record<NodeId, { shares?: FileShare[] }>): FileShare[] {
  return Object.values(nodes).flatMap((n) => n.shares ?? []);
}

export function shareById(
  nodes: Record<NodeId, { shares?: FileShare[] }>,
  id: string,
): FileShare | undefined {
  return allShares(nodes).find((s) => s.id === id);
}
