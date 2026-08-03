/**
 * TriageOS — Level 0 Host Workstation & App Registry
 * ==================================================
 * Models the IT specialist's own Windows-11 workstation: the operator profile,
 * shell chrome, and the catalog of first-class host applications (ITSM, Mail,
 * Remote Gateway, Toolbox, …).
 *
 * The registry is DATA, not UI — Phase 2 maps each `HostAppId` to a real React
 * component. Keeping the catalog declarative lets the taskbar, Start menu, and
 * desktop all render from one source and lets scenarios gate app availability.
 */

export type HostAppId =
  | "itsm" // Ticket dashboard
  | "mail" // Persona conversation client (ticket dialogue threads)
  | "coremail" // Outlook-style corporate mailbox (internal + external mail)
  | "gateway" // Remote Gateway Manager (RDP/SSH launcher)
  | "hardwarelab" // Hardware Provisioning Lab & Field Dispatch
  | "assetmanager" // Hardware inventory / store room
  | "racklab" // Server rack & network infrastructure simulator
  | "netops" // Network topology console (link optimization)
  | "monitor" // Infrastructure metrics dashboard (observability)
  | "wiki" // Company Wiki / intranet documentation portal
  | "toolbox" // Per-ticket runbooks — QA/debug only, see `godModeOnly`
  | "leaderboard" // Global ranking
  | "settings" // Host settings
  | "profile"; // Account & profile management (identity layer)

export type HostAppCategory = "work" | "system";

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
  | "chevron-up";

/** Which live counter, if any, drives an app's taskbar/Start badge. */
export type HostAppBadgeSource = "unread-tickets" | "unread-mail" | "unread-coremail" | "sla-alerts";

export interface HostAppDescriptor {
  id: HostAppId;
  title: string;
  /** Key into the SVG icon set — see `AppIcon`. Kept a string so this stays data. */
  iconId: HostAppIconId;
  category: HostAppCategory;
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
  godModeOnly?: boolean;
}

export type HostAppRegistry = Record<HostAppId, HostAppDescriptor>;

/**
 * Canonical catalog of Level-0 host apps. Static data model — Phase 2 binds
 * `id` → component in a separate component registry so this stays serializable.
 */
export const HOST_APP_REGISTRY: HostAppRegistry = {
  itsm: {
    id: "itsm",
    title: "Ticket Center",
    iconId: "ticket",
    category: "work",
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
    description: "Corporate mailbox: internal staff requests, ISP notices, and vendor advisories.",
    defaultSize: { w: 1000, h: 660 },
    minSize: { w: 700, h: 460 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
    badgeSource: "unread-coremail",
  },
  netops: {
    id: "netops",
    title: "NetOps Console",
    iconId: "globe",
    category: "work",
    description: "Live network topology: link metrics, re-routing, and software firewalls.",
    defaultSize: { w: 960, h: 640 },
    minSize: { w: 680, h: 460 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  monitor: {
    id: "monitor",
    title: "Monitor",
    iconId: "activity",
    category: "work",
    description: "Live infrastructure telemetry: CPU, memory and network per host.",
    defaultSize: { w: 1040, h: 680 },
    minSize: { w: 700, h: 480 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  gateway: {
    id: "gateway",
    title: "Remote Gateway",
    iconId: "monitor",
    category: "work",
    description: "Client servers and workstations. Connect to open an RDP/SSH session.",
    defaultSize: { w: 820, h: 560 },
    minSize: { w: 560, h: 400 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  hardwarelab: {
    id: "hardwarelab",
    title: "Hardware Lab & Deployment",
    iconId: "wrench",
    category: "work",
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
    description: "Hardware inventory: stock levels, allocations and repairs.",
    defaultSize: { w: 900, h: 600 },
    minSize: { w: 640, h: 420 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  racklab: {
    id: "racklab",
    title: "Rack & Network Lab",
    iconId: "rack",
    category: "work",
    description: "Build the rack, cable it, configure switches and servers, and test connectivity.",
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
    description: "Internal IT documentation: standards, topology, conventions and SOPs.",
    defaultSize: { w: 1020, h: 660 },
    minSize: { w: 720, h: 460 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  toolbox: {
    id: "toolbox",
    title: "Tech Toolbox (debug)",
    iconId: "toolbox",
    category: "system",
    description: "Per-ticket walkthroughs and the live CLI registry. QA builds only.",
    defaultSize: { w: 900, h: 620 },
    minSize: { w: 600, h: 420 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
    godModeOnly: true,
  },
  leaderboard: {
    id: "leaderboard",
    title: "Leaderboard",
    iconId: "trophy",
    category: "work",
    description: "Global ranking by XP, SLA compliance, and escalation rate.",
    defaultSize: { w: 720, h: 560 },
    minSize: { w: 480, h: 360 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: true,
  },
  settings: {
    id: "settings",
    title: "Settings",
    iconId: "gear",
    category: "system",
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
    description: "Your operator account: identity, avatar, stats, and sign-out.",
    defaultSize: { w: 700, h: 560 },
    minSize: { w: 520, h: 420 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: true,
  },
};

/**
 * Apps the operator may see. `godMode` unlocks the debug-only tools; everything
 * else is always visible. Every surface that lists apps (desktop, Start menu,
 * taskbar) must go through this so a debug tool cannot leak into normal play.
 */
export function visibleApps(godMode: boolean): HostAppDescriptor[] {
  return (Object.values(HOST_APP_REGISTRY) as HostAppDescriptor[]).filter(
    (a) => !a.godModeOnly || godMode,
  );
}

/** Ordered list of app ids pinned to the taskbar (left → right). */
export function taskbarPinned(godMode: boolean): HostAppId[] {
  return visibleApps(godMode)
    .filter((a) => a.pinnedToTaskbar)
    .map((a) => a.id);
}

// ── Host operator & shell state ────────────────────────────────────────────

export interface HostUser {
  displayName: string;
  role: string; // "Tier-2 Systems Engineer"
  avatar: string; // emoji/asset key
  level: number;
  xp: number;
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
  clock24h: boolean;
  tray: SystemTrayState;
}
