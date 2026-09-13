/**
 * ITQuest — Level 0 Host Workstation & App Registry
 * ==================================================
 * Models the IT specialist's own Windows-11 workstation: the operator profile,
 * shell chrome, and the catalog of first-class host applications (ITSM, Mail,
 * Remote Gateway, Toolbox, …).
 *
 * The registry is DATA, not UI — Phase 2 maps each `HostAppId` to a real React
 * component. Keeping the catalog declarative lets the taskbar, Start menu, and
 * desktop all render from one source and lets scenarios gate app availability.
 *
 * NOTE: the progression gate lives in lib/progression/unlocks.ts and is
 * imported here as a TYPE-ONLY-adjacent value; unlocks imports only types back,
 * so there is no runtime cycle.
 */

import { isAppUnlocked } from "@/lib/progression/unlocks";

export type HostAppId =
  | "dashboard" // Operations home — KPIs, quick access, activity
  | "itsm" // Ticket dashboard
  | "mail" // Persona conversation client (ticket dialogue threads)
  | "coremail" // Outlook-style corporate mailbox (internal + external mail)
  | "gateway" // Remote Gateway Manager (RDP/SSH launcher)
  | "hardwarelab" // Hardware Provisioning Lab & Field Dispatch
  | "assetmanager" // Hardware inventory / store room
  | "racklab" // Datacenter floor — racks, cabling, power and heat
  | "serverman" // Server Manager — logical estate, maintenance and migration
  | "edge" // Edge Gateway Manager (pfGate) — perimeter firewall, links, telemetry
  | "switches" // Managed PoE switches, port state and IP allocation
  | "backup" // Backup policy, storage purchase and disaster recovery
  | "aethercloud" // AetherCloud Engine — hybrid cloud console
  | "procurement" // Vendor storefront — spends IT Budget
  | "wiki" // Company Wiki / intranet documentation portal
  | "leaderboard" // Global ranking
  | "settings" // Host settings
  | "appearance" // Skin, theme, wallpaper and desktop shortcuts
  | "enterprise" // Your account — plan, limits and what is left of today
  | "profile"; // Account & profile management (identity layer)

export type HostAppCategory = "work" | "system";

/**
 * How the App Drawer groups tools (v0.9.0).
 *
 * By JOB, not by subsystem. A newcomer looking for the ticket queue does not
 * know whether it counts as "ITSM" or "productivity"; they know they are here
 * to answer requests. Fifteen flat icons made them read every label.
 */
export type HostAppGroup = "support" | "infrastructure" | "knowledge" | "system";

export const HOST_APP_GROUPS: { id: HostAppGroup; label: string; blurb: string }[] = [
  { id: "support", label: "Support & Tickets", blurb: "The queue, the people, the mail" },
  { id: "infrastructure", label: "Infrastructure", blurb: "Servers, racks, network and stock" },
  { id: "knowledge", label: "Knowledge", blurb: "Documentation and standing" },
  { id: "system", label: "System", blurb: "Your account and this machine" },
];

/**
 * Stable, serializable icon KEY — never a React node and never an emoji.
 *
 * SessionState (and the window manager, which copies the key onto each open
 * window) must stay plain JSON, so the shell stores this id and resolves it to
 * an SVG component at render time via `AppIcon` in components/ui/app-icons.tsx.
 * Adding a member here without adding a case there is a type error.
 */
export type HostAppIconId =
  | "ticket"
  | "messages"
  | "mail"
  | "globe"
  | "monitor"
  | "wrench"
  | "boxes"
  | "rack"
  | "toolbox"
  | "trophy"
  | "gear"
  | "id-card"
  // OS marks — remote-session windows carry these instead of an app id.
  | "os-linux"
  | "os-windows"
  | "os-macos"
  // Shared shell glyphs (ticket tracks, mail folders, toolbox tabs, …). Same
  // mapper, so any surface of the host UI can stay emoji-free with one import.
  | "headset"
  | "shield"
  | "inbox"
  | "send"
  | "book"
  | "keyboard"
  | "terminal"
  | "clock"
  | "cpu"
  | "truck"
  | "key"
  | "users"
  | "lock"
  | "ban"
  | "check"
  | "alert"
  | "plug"
  | "server"
  | "laptop"
  | "package"
  | "bank"
  | "health"
  | "store"
  // Nested guest-OS surfaces: file types, endpoint apps, directory objects.
  | "folder"
  | "folder-locked"
  | "file-text"
  | "file-sheet"
  | "file-chart"
  | "file-pdf"
  | "file-slides"
  | "file-code"
  | "file-image"
  | "file-zip"
  | "file-key"
  | "disk"
  | "compass"
  | "list"
  | "chart-bar"
  | "code"
  | "pen"
  | "policy"
  | "user"
  | "building"
  | "grid"
  | "recycle"
  | "eye"
  | "search"
  | "sliders"
  | "activity"
  | "power"
  | "trash"
  | "switch"
  | "panel"
  | "battery"
  | "router"
  | "cable"
  | "mouse"
  | "link"
  | "x"
  | "plus"
  | "minus"
  | "chevron-up"
  | "cloud"
  | "tunnel"
  | "credit"
  | "cart"
  | "expand"
  | "collapse";

/** Which live counter, if any, drives an app's taskbar/Start badge. */
export type HostAppBadgeSource = "unread-tickets" | "unread-mail" | "unread-coremail" | "sla-alerts";

export interface HostAppDescriptor {
  id: HostAppId;
  title: string;
  /** Key into the SVG icon set — see `AppIcon`. Kept a string so this stays data. */
  iconId: HostAppIconId;
  category: HostAppCategory;
  /** Which App Drawer section this appears under. */
  group: HostAppGroup;
  description: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Only one instance may be open at a time. */
  singleton: boolean;
  pinnedToTaskbar: boolean;
  showOnDesktop: boolean;
  badgeSource?: HostAppBadgeSource;
  /**
   * Debug build only: hidden from the desktop, Start menu and taskbar unless
   * the QA "God Mode" profile is active. Used for tools that would spoil normal
   * play (per-ticket walkthroughs) but are needed to test scenarios.
   */
}

export type HostAppRegistry = Record<HostAppId, HostAppDescriptor>;

/**
 * Canonical catalog of Level-0 host apps. Static data model — Phase 2 binds
 * `id` → component in a separate component registry so this stays serializable.
 */
export const HOST_APP_REGISTRY: HostAppRegistry = {
  dashboard: {
    id: "dashboard",
    title: "Dashboard",
    iconId: "chart-bar",
    category: "work",
    group: "support",
    description: "Estate health, the queue at a glance, and everything else one click away.",
    defaultSize: { w: 1100, h: 720 },
    minSize: { w: 720, h: 520 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: false,
  },
  itsm: {
    id: "itsm",
    title: "Ticket Center",
    iconId: "ticket",
    category: "work",
    group: "support",
    description: "Incoming enterprise incidents across Helpdesk, Sysadmin, NetOps, and SecOps.",
    defaultSize: { w: 960, h: 640 },
    minSize: { w: 640, h: 420 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
    badgeSource: "unread-tickets",
  },
  mail: {
    id: "mail",
    title: "Conversations",
    iconId: "messages",
    category: "work",
    group: "support",
    description: "Direct ticket conversations with AI customer personas (emotion + CSAT).",
    defaultSize: { w: 880, h: 600 },
    minSize: { w: 560, h: 380 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
    badgeSource: "unread-mail",
  },
  coremail: {
    id: "coremail",
    title: "CoreMail",
    iconId: "mail",
    category: "work",
    group: "support",
    description: "Corporate mailbox: internal staff requests, ISP notices, and vendor advisories.",
    defaultSize: { w: 1000, h: 660 },
    minSize: { w: 700, h: 460 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
    badgeSource: "unread-coremail",
  },
  /*
   * Replaces BOTH the NetOps Console and the Monitor (v0.9.3).
   *
   * They were two windows onto one network — link metrics in one, host
   * telemetry in the other — and neither explained how it related to the
   * perimeter. The appliance GUI is where an admin actually does this work, so
   * the link table, the telemetry and the firewall rules now live behind one
   * address instead of three icons.
   */
  edge: {
    id: "edge",
    title: "Edge Gateway Manager",
    iconId: "globe",
    category: "work",
    group: "infrastructure",
    description: "pfGate appliance GUI: firewall rules, interfaces, link health and traffic.",
    defaultSize: { w: 1040, h: 680 },
    minSize: { w: 720, h: 480 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  switches: {
    id: "switches",
    title: "Network Switches",
    iconId: "switch",
    category: "work",
    group: "infrastructure",
    description: "Managed PoE switches: port state, power budget and IP allocation.",
    defaultSize: { w: 1020, h: 660 },
    minSize: { w: 760, h: 480 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: false,
  },
  backup: {
    id: "backup",
    title: "Backup & Recovery",
    iconId: "shield",
    category: "work",
    group: "infrastructure",
    description: "Backup schedules, storage capacity and disaster recovery.",
    defaultSize: { w: 900, h: 660 },
    minSize: { w: 620, h: 460 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: false,
  },
  procurement: {
    id: "procurement",
    title: "Procurement",
    iconId: "cart",
    category: "work",
    group: "infrastructure",
    description: "Vendor storefront: restock hardware, buy licences, hire contractors.",
    defaultSize: { w: 1000, h: 680 },
    minSize: { w: 720, h: 480 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  aethercloud: {
    id: "aethercloud",
    title: "AetherCloud",
    iconId: "cloud",
    category: "work",
    group: "infrastructure",
    description: "Hybrid cloud console: virtual networks, vNodes, storage, VPN and audit.",
    defaultSize: { w: 1080, h: 700 },
    minSize: { w: 760, h: 500 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  gateway: {
    id: "gateway",
    title: "Remote Desktop Connection",
    iconId: "monitor",
    category: "work",
    group: "infrastructure",
    description: "Connect to a server or workstation over RDP or SSH.",
    /*
     * Sized to the DIALOG, not to a page.
     *
     * mstsc opens as a small fixed dialog, and this app is that dialog — so the
     * window frame wraps it directly rather than centring it on a canvas. 420
     * is the dialog's natural width; the height fits the collapsed form with
     * the options drawer closed, and the frame grows if the operator opens it.
     */
    defaultSize: { w: 420, h: 468 },
    minSize: { w: 380, h: 320 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  hardwarelab: {
    id: "hardwarelab",
    title: "Hardware Lab & Deployment",
    iconId: "wrench",
    category: "work",
    group: "infrastructure",
    description: "Provision hardware, image endpoints, and dispatch field teams for physical swaps.",
    defaultSize: { w: 940, h: 640 },
    minSize: { w: 680, h: 480 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  assetmanager: {
    id: "assetmanager",
    title: "AssetManager",
    iconId: "boxes",
    category: "work",
    group: "infrastructure",
    description: "Hardware inventory: stock levels, allocations and repairs.",
    defaultSize: { w: 900, h: 600 },
    minSize: { w: 640, h: 420 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  serverman: {
    id: "serverman",
    title: "Server Manager",
    iconId: "server",
    category: "work",
    group: "infrastructure",
    description:
      "The logical estate: every server's addressing, capacity and hosted workloads, with maintenance mode and live migration.",
    defaultSize: { w: 1040, h: 660 },
    minSize: { w: 800, h: 500 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  racklab: {
    id: "racklab",
    title: "Datacenter Floor",
    iconId: "rack",
    category: "work",
    group: "infrastructure",
    description: "Every rack on the floor: mount and cable hardware, patch uplinks, and watch power and heat.",
    defaultSize: { w: 1080, h: 680 },
    minSize: { w: 820, h: 520 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  wiki: {
    id: "wiki",
    title: "Company Wiki",
    iconId: "book",
    category: "work",
    group: "knowledge",
    description: "Internal IT documentation: standards, topology, conventions and SOPs.",
    defaultSize: { w: 1020, h: 660 },
    minSize: { w: 720, h: 460 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  leaderboard: {
    id: "leaderboard",
    title: "Leaderboard",
    iconId: "trophy",
    category: "work",
    group: "knowledge",
    description: "Global ranking by XP, SLA compliance, and escalation rate.",
    defaultSize: { w: 720, h: 560 },
    minSize: { w: 480, h: 360 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: true,
  },
  enterprise: {
    id: "enterprise",
    title: "Your account",
    iconId: "building",
    category: "system",
    group: "system",
    description: "Your plan, the limits it carries, and what is left of today's shift.",
    defaultSize: { w: 760, h: 620 },
    minSize: { w: 420, h: 360 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: false,
  },
  appearance: {
    id: "appearance",
    title: "Appearance",
    iconId: "gear",
    category: "system",
    group: "system",
    description: "Skin, light and dark, wallpaper, and which shortcuts sit on the desktop.",
    defaultSize: { w: 720, h: 600 },
    minSize: { w: 460, h: 380 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: false,
  },
  settings: {
    id: "settings",
    title: "Settings",
    iconId: "gear",
    category: "system",
    group: "system",
    description: "Workstation preferences, theme, and profile.",
    defaultSize: { w: 680, h: 520 },
    minSize: { w: 480, h: 360 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: false,
  },
  profile: {
    id: "profile",
    title: "My Profile",
    iconId: "id-card",
    category: "system",
    group: "system",
    description: "Your operator account: identity, avatar, stats, and sign-out.",
    defaultSize: { w: 700, h: 560 },
    minSize: { w: 520, h: 420 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: true,
  },
};

/**
 * Apps the operator may see at this level. Every surface that lists apps
 * (desktop, Start menu, taskbar) goes through this so progression gating is
 * decided in exactly one place.
 */
export function visibleApps(level = 99): HostAppDescriptor[] {
  return (Object.values(HOST_APP_REGISTRY) as HostAppDescriptor[]).filter((a) =>
    isAppUnlocked(a.id, level),
  );
}

/** Ordered list of app ids pinned to the taskbar (left → right). */
export function taskbarPinned(level = 99): HostAppId[] {
  return visibleApps(level)
    .filter((a) => a.pinnedToTaskbar)
    .map((a) => a.id);
}

// ── Host operator & shell state ────────────────────────────────────────────

export interface HostUser {
  displayName: string;
  role: string; // "Tier-2 Systems Engineer"
  avatar: string; // palette id or https image URL
  /*
   * THERE IS NO `level` HERE, and that absence is load-bearing.
   *
   * Level is derived from `xp` and the plan's ceiling — see
   * lib/progression/standing.ts. It used to be stored, written by `awardXp`
   * with the cap already applied, and the moment a plan could cap anything
   * the estate grew two different levels: the capped one in this record, and
   * the uncapped `levelForXp(xp)` that Settings, Profile and the leaderboard
   * each computed for themselves. A free operator at the ceiling read level 4
   * in the taskbar and level 7 on their own profile.
   *
   * Storing it also broke the upgrade it was supposed to serve: raising the
   * cap left this field untouched, so the operator stayed at the old ceiling
   * until the next award happened to rewrite it.
   */
  xp: number;
  /**
   * IT Budget, in credits. The desk's spending power: earned by resolving
   * tickets, spent in Procurement on parts, licences and contractors.
   * Distinct from XP — XP measures skill, budget measures resources.
   */
  budget: number;
  /**
   * Per-discipline experience. Drives the dynamic job title — see
   * lib/progression/tracks.ts. Kept as a plain record so it persists with the
   * rest of the profile.
   */
  skills: Record<string, number>;
}

export interface SystemTrayState {
  networkConnected: boolean;
  volume: number; // 0-100
  notifications: number;
}

export interface HostWorkstationState {
  user: HostUser;
  wallpaper: string; // asset key / gradient id
  /** Personalization: master switch for the synthesised UI sound cues. */
  soundEnabled: boolean;
  /** Software licences purchased in Procurement (see lib/economy/licenses.ts). */
  licenses: string[];
  clock24h: boolean;
  tray: SystemTrayState;
}
