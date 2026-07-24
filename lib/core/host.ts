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
  | "netops" // Network topology console (link optimization)
  | "toolbox" // Tech Toolbox & Documentation Center
  | "leaderboard" // Global ranking
  | "settings" // Host settings
  | "profile"; // Account & profile management (identity layer)

export type HostAppCategory = "work" | "system";

/** Which live counter, if any, drives an app's taskbar/Start badge. */
export type HostAppBadgeSource = "unread-tickets" | "unread-mail" | "unread-coremail" | "sla-alerts";

export interface HostAppDescriptor {
  id: HostAppId;
  title: string;
  /** Emoji/glyph placeholder; Phase 2 may swap for an SVG asset key. */
  icon: string;
  category: HostAppCategory;
  description: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Only one instance may be open at a time. */
  singleton: boolean;
  pinnedToTaskbar: boolean;
  showOnDesktop: boolean;
  badgeSource?: HostAppBadgeSource;
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
    icon: "🎫",
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
    icon: "💬",
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
    icon: "📧",
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
    icon: "🌐",
    category: "work",
    description: "Live network topology: link metrics, re-routing, and software firewalls.",
    defaultSize: { w: 960, h: 640 },
    minSize: { w: 680, h: 460 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  gateway: {
    id: "gateway",
    title: "Remote Gateway",
    icon: "🖥️",
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
    icon: "🔧",
    category: "work",
    description: "Provision hardware, image endpoints, and dispatch field teams for physical swaps.",
    defaultSize: { w: 940, h: 640 },
    minSize: { w: 680, h: 480 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  toolbox: {
    id: "toolbox",
    title: "Tech Toolbox",
    icon: "🧰",
    category: "work",
    description: "Searchable runbooks, network diagrams, and command references.",
    defaultSize: { w: 900, h: 620 },
    minSize: { w: 600, h: 420 },
    singleton: true,
    pinnedToTaskbar: true,
    showOnDesktop: true,
  },
  leaderboard: {
    id: "leaderboard",
    title: "Leaderboard",
    icon: "🏆",
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
    icon: "⚙️",
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
    icon: "🪪",
    category: "system",
    description: "Your operator account: identity, avatar, stats, and sign-out.",
    defaultSize: { w: 700, h: 560 },
    minSize: { w: 520, h: 420 },
    singleton: true,
    pinnedToTaskbar: false,
    showOnDesktop: true,
  },
};

/** Ordered list of app ids pinned to the taskbar (left → right). */
export const TASKBAR_PINNED: HostAppId[] = (
  Object.values(HOST_APP_REGISTRY) as HostAppDescriptor[]
)
  .filter((a) => a.pinnedToTaskbar)
  .map((a) => a.id);

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
  clock24h: boolean;
  tray: SystemTrayState;
}
