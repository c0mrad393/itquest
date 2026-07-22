/**
 * TriageOS — Filesystem helpers
 * -----------------------------
 * Pure path-resolution and node-lookup utilities over the FsNode tree.
 * These never mutate; command implementations clone + mutate through the store.
 */

import type { FsNode, VMState } from "./types";

/** Split a path into normalized segments, resolving "." and "..". */
export function normalizeSegments(path: string, cwd: string): string[] {
  const start = path.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  const segments = [...start];
  for (const raw of path.split("/")) {
    if (raw === "" || raw === ".") continue;
    if (raw === "..") {
      segments.pop();
      continue;
    }
    segments.push(raw);
  }
  return segments;
}

/** Resolve a (possibly relative) path to a canonical absolute path string. */
export function resolvePath(path: string, cwd: string): string {
  const segs = normalizeSegments(path, cwd);
  return "/" + segs.join("/");
}

/** Walk the tree to the node at `absPath`. Returns null if any segment is missing. */
export function getNode(root: FsNode, absPath: string): FsNode | null {
  const segs = absPath.split("/").filter(Boolean);
  let node: FsNode = root;
  for (const seg of segs) {
    if (node.type !== "dir" || !node.children || !node.children[seg]) {
      return null;
    }
    node = node.children[seg];
  }
  return node;
}

/** Resolve then fetch in one step, relative to the VM's cwd. */
export function nodeAt(vm: VMState, path: string): FsNode | null {
  return getNode(vm.filesystem, resolvePath(path, vm.cwd));
}

/** Get the parent node + basename for a path (for create/delete/mv operations). */
export function getParentAndName(
  root: FsNode,
  absPath: string,
): { parent: FsNode | null; name: string } {
  const segs = absPath.split("/").filter(Boolean);
  const name = segs.pop() ?? "";
  const parentPath = "/" + segs.join("/");
  return { parent: getNode(root, parentPath), name };
}

/** Directory listing (basenames). Excludes hidden unless `all`. */
export function listDir(node: FsNode, all = false): string[] {
  if (node.type !== "dir" || !node.children) return [];
  return Object.keys(node.children)
    .filter((name) => all || (!name.startsWith(".") && !node.children![name].hidden))
    .sort();
}

/** POSIX-ish permission check for the acting user (simplified: owner/group/other). */
export function canRead(node: FsNode, user: string, groups: string[]): boolean {
  const [o, g, other] = triads(node.mode);
  if (user === "root") return true;
  if (node.owner === user) return o.includes("r");
  if (groups.includes(node.group)) return g.includes("r");
  return other.includes("r");
}

export function canWrite(node: FsNode, user: string, groups: string[]): boolean {
  const [o, g, other] = triads(node.mode);
  if (user === "root") return true;
  if (node.owner === user) return o.includes("w");
  if (groups.includes(node.group)) return g.includes("w");
  return other.includes("w");
}

/** Split "rwxr-xr--" into ["rwx","r-x","r--"]. Tolerates leading type char. */
function triads(mode: string): [string, string, string] {
  const m = mode.length === 10 ? mode.slice(1) : mode; // drop leading d/-/l
  return [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)];
}

/** Render a mode + type as `ls -l` style, e.g. "drwxr-xr-x". */
export function formatMode(node: FsNode): string {
  const t = node.type === "dir" ? "d" : node.type === "symlink" ? "l" : "-";
  return t + (node.mode.length === 10 ? node.mode.slice(1) : node.mode);
}
