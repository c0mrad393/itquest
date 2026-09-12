/**
 * ITQuest Admin — navigation model
 * ================================
 * The sections, as DATA.
 *
 * The sidebar renders it, the breadcrumbs resolve against it, and the page
 * titles come from it. Three views of one list rather than three hand-written
 * copies that drift — the usual failure being a section renamed in the sidebar
 * and still carrying its old name in the breadcrumb two clicks deeper.
 */

export interface AdminSection {
  /** Route segment under /admin. Empty string is the index. */
  slug: string;
  label: string;
  /** Shown under the page title, and as the sidebar tooltip when collapsed. */
  blurb: string;
  iconId: AdminIconId;
  /**
   * Does this section have a screen?
   *
   * Every section does now. Kept because the sidebar still reads it, and the
   * next section added will be false before it is true.
   */
  ready: boolean;
}

export type AdminIconId =
  | "dashboard"
  | "users"
  | "simulator"
  | "tickets"
  | "subscriptions"
  | "settings";

export const ADMIN_SECTIONS: AdminSection[] = [
  { slug: "", label: "Dashboard", blurb: "Fleet health, activity and load at a glance", iconId: "dashboard", ready: true },
  { slug: "users", label: "User Management", blurb: "Accounts, roles and access across every org", iconId: "users", ready: true },
  { slug: "simulator", label: "Simulator Controls", blurb: "Running scenarios, fault injection and run state", iconId: "simulator", ready: true },
  { slug: "tickets", label: "Ticketing System", blurb: "Support requests raised by operators in training", iconId: "tickets", ready: true },
  { slug: "subscriptions", label: "Enterprise Subscriptions", blurb: "B2B accounts, seats and renewals", iconId: "subscriptions", ready: true },
  { slug: "settings", label: "Global Settings", blurb: "Platform defaults, retention and integrations", iconId: "settings", ready: true },
];

export const adminHref = (slug: string) => (slug ? `/admin/${slug}` : "/admin");

/**
 * Which section a path belongs to.
 *
 * Longest match first, so `/admin/users/1041` resolves to User Management
 * rather than to the index — the index's empty slug would otherwise match
 * every path under /admin.
 */
export function sectionForPath(pathname: string): AdminSection {
  const withSlug = ADMIN_SECTIONS.filter((s) => s.slug).sort((a, b) => b.slug.length - a.slug.length);
  return (
    withSlug.find((s) => pathname === adminHref(s.slug) || pathname.startsWith(`${adminHref(s.slug)}/`)) ??
    ADMIN_SECTIONS[0]
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumbs for a path. The last crumb is the current page and has no href. */
export function crumbsForPath(pathname: string): Crumb[] {
  const section = sectionForPath(pathname);
  const crumbs: Crumb[] = [{ label: "Admin", href: "/admin" }];
  if (section.slug) crumbs.push({ label: section.label });
  else crumbs[0] = { label: "Admin" };
  return crumbs;
}
