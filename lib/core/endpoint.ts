/**
 * TriageOS — Endpoint visual + desktop models (immersion layer)
 * ============================================================
 * Per-endpoint presentation state generated once by the OrgGenerator, so every
 * Windows/Mac machine looks distinct: a wallpaper (28 variations), a light/dark
 * theme, a desktop "archetype" (how tidy the user is), and a scattered set of
 * department-appropriate files + application shortcuts.
 *
 * All of this is plain JSON (persisted with the world) and lives ON the node,
 * so the endpoint environments render deterministically per user.
 */

export type WallpaperKind =
  // Corporate branded solids-ish gradients
  | "corp-blue"
  | "corp-teal"
  | "corp-violet"
  | "corp-slate"
  | "corp-crimson"
  | "corp-emerald"
  | "corp-indigo"
  | "corp-amber"
  // Scenic / photo-style gradients
  | "gradient-sunset"
  | "gradient-mint"
  | "gradient-ocean"
  | "gradient-dusk"
  | "gradient-rose"
  | "gradient-forest"
  | "photo-mountain"
  | "photo-shore"
  // Abstract geometric CSS patterns
  | "abstract-waves"
  | "abstract-mesh"
  | "abstract-grid"
  | "abstract-conic"
  | "abstract-stripes"
  | "abstract-dots"
  | "abstract-aurora"
  // Muted dark solids
  | "solid-graphite"
  | "solid-midnight"
  | "solid-plum"
  // Muted light solids
  | "solid-fog"
  | "solid-sand"
  // OS default
  | "default-os";

export type EndpointTheme = "light" | "dark";

/**
 * How the user keeps their desktop. Drives icon placement:
 *   clean     → a handful of icons, tidy top-left column
 *   organized → every icon clustered neatly on the left, filled top-to-bottom
 *   messy     → icons scattered randomly across the whole grid, with gaps
 */
export type DesktopArchetype = "clean" | "organized" | "messy";

/** Application shortcuts placed on endpoint desktops. */
export type EndpointAppId =
  | "recycle-bin"
  | "edge"
  | "company-portal"
  | "coreteams"
  | "codestudio"
  | "financeerp"
  | "designsuite";

/**
 * A node in the interactive endpoint file system. Folders nest via `children`;
 * files carry `content` for the unified viewers. Locked items require a
 * password (found via email clues / sticky notes / AD resets) before they open.
 */
export interface EndpointFsItem {
  id: string;
  name: string;
  isFolder: boolean;
  /** File-type hint for iconography + viewer selection ("txt"|"csv"|"png"|…). */
  ext?: string;
  /** Locked archive/folder — double-click raises a credential prompt. */
  isLocked?: boolean;
  passwordHint?: string;
  /** The secret that unlocks it (discoverable in-world). Never shown directly. */
  password?: string;
  /** Text/CSV body for the viewers (files only). */
  content?: string;
  /** Folder contents (folders only). */
  children?: EndpointFsItem[];
}

/**
 * A desktop icon: an app shortcut, or a file-system item placed on the grid.
 * Extends the FS-item fields so a desktop folder/file behaves identically to
 * one opened from This PC / Finder.
 */
export interface DesktopItem {
  id: string;
  name: string; // "Payroll_Q3.xlsx", "Resumes", "FinanceERP"
  kind: "file" | "folder" | "app";
  /** File-type hint for iconography, e.g. "xlsx" | "csv" | "py" | "pdf". */
  ext?: string;
  /** App identity when kind === "app" (drives the SVG icon). */
  app?: EndpointAppId;
  /** Grid cell the icon occupies (placement depends on archetype). */
  col: number;
  row: number;
  // ── Interactive file-system fields (kind file/folder) ──
  isLocked?: boolean;
  passwordHint?: string;
  password?: string;
  content?: string;
  children?: EndpointFsItem[];
}

// ── Network file shares (SMB/NFS mapped drives) ──────────────────────────────

export type MappedDriveStatus = "connected" | "disconnected" | "auth_error";

export interface MappedDrive {
  /** Windows drive letter ("Z:") or macOS mount label ("Finance"). */
  letter: string;
  /** UNC / URL, e.g. "\\\\HELI-FS-08\\Finance" or "smb://heli-fs-08/Finance". */
  remotePath: string;
  /** Backing file-server node id (drives live status resolution). */
  serverNodeId?: string;
  /** Share name on the server ("Finance"). */
  shareName?: string;
  /** Last-known status; the live status is derived from the server node. */
  status: MappedDriveStatus;
}

export interface EndpointVisualState {
  wallpaper: WallpaperKind;
  theme: EndpointTheme;
  /** How tidy the desktop is (icon placement strategy). */
  archetype: DesktopArchetype;
  /** Display name of the primary logged-in user (from AD). */
  loggedInUser: string;
  /** Desktop icons: department files/folders + app shortcuts. */
  desktop: DesktopItem[];
  /** This PC / Finder user-profile folders. */
  documents?: EndpointFsItem[];
  downloads?: EndpointFsItem[];
  /** Total local disk capacity in GB (usage comes from node.health.diskUsedPct). */
  diskTotalGb?: number;
}

// ── Wallpaper rendering (CSS backgrounds) ────────────────────────────────────

export const WALLPAPER_CSS: Record<WallpaperKind, string> = {
  // Corporate branded
  "corp-blue": "linear-gradient(135deg,#0a2547 0%,#123a63 100%)",
  "corp-teal": "linear-gradient(135deg,#052e2b 0%,#0f5b52 100%)",
  "corp-violet": "linear-gradient(135deg,#241a45 0%,#3d2a63 100%)",
  "corp-slate": "linear-gradient(135deg,#1c2430 0%,#333f52 100%)",
  "corp-crimson": "linear-gradient(135deg,#3a0f1c 0%,#6e1f34 100%)",
  "corp-emerald": "linear-gradient(135deg,#06281c 0%,#0f5136 100%)",
  "corp-indigo": "linear-gradient(135deg,#161a3d 0%,#2a2f6b 100%)",
  "corp-amber": "linear-gradient(135deg,#3a2708 0%,#6e4c14 100%)",
  // Scenic
  "gradient-sunset": "linear-gradient(135deg,#3a1c47 0%,#7a2f52 55%,#b8532f 100%)",
  "gradient-mint": "linear-gradient(135deg,#0b3a2e 0%,#1f7a63 100%)",
  "gradient-ocean": "linear-gradient(135deg,#04243a 0%,#0a4a6b 50%,#1583a8 100%)",
  "gradient-dusk": "linear-gradient(135deg,#1a1140 0%,#452a63 55%,#8a4a72 100%)",
  "gradient-rose": "linear-gradient(135deg,#3a1230 0%,#7a2f57 55%,#b0567e 100%)",
  "gradient-forest": "linear-gradient(160deg,#0a2417 0%,#1c4a2e 55%,#3a6e47 100%)",
  "photo-mountain": "linear-gradient(160deg,#1b2a3a 0%,#2f4a63 45%,#5a748c 100%)",
  "photo-shore": "linear-gradient(160deg,#0a2f3a 0%,#12586b 55%,#2a9db5 100%)",
  // Abstract geometric
  "abstract-waves":
    "radial-gradient(circle at 20% 20%,rgba(76,194,255,0.25),transparent 45%),radial-gradient(circle at 80% 70%,rgba(16,185,129,0.2),transparent 45%),#0c1424",
  "abstract-mesh":
    "radial-gradient(circle at 70% 20%,rgba(168,85,247,0.28),transparent 40%),radial-gradient(circle at 25% 80%,rgba(56,189,248,0.22),transparent 42%),#0d1020",
  "abstract-grid":
    "linear-gradient(rgba(88,166,255,0.10) 1px,transparent 1px),linear-gradient(90deg,rgba(88,166,255,0.10) 1px,transparent 1px),#0b1220",
  "abstract-conic":
    "conic-gradient(from 210deg at 30% 30%,#12233f,#243a63,#3a2a5e,#12233f)",
  "abstract-stripes":
    "repeating-linear-gradient(135deg,#101a2e 0px,#101a2e 22px,#14213a 22px,#14213a 44px)",
  "abstract-dots":
    "radial-gradient(rgba(255,255,255,0.07) 1.5px,transparent 1.5px),#0c1424",
  "abstract-aurora":
    "linear-gradient(120deg,rgba(56,189,248,0.20),transparent 40%),linear-gradient(240deg,rgba(52,211,153,0.20),transparent 40%),linear-gradient(0deg,rgba(168,85,247,0.18),transparent 45%),#0a1020",
  // Muted dark solids
  "solid-graphite": "linear-gradient(180deg,#22262d 0%,#1a1e24 100%)",
  "solid-midnight": "linear-gradient(180deg,#161d2e 0%,#101627 100%)",
  "solid-plum": "linear-gradient(180deg,#281f2e 0%,#1e1824 100%)",
  // Muted light solids (mid-tone, so white labels stay legible with a shadow)
  "solid-fog": "linear-gradient(180deg,#8a94a6 0%,#727d90 100%)",
  "solid-sand": "linear-gradient(180deg,#a89a86 0%,#8f8371 100%)",
  // OS default
  "default-os": "linear-gradient(135deg,#0a1730 0%,#123a63 100%)",
};

/** Background sizes for the tiled/patterned wallpapers (else default cover). */
export const WALLPAPER_SIZE: Partial<Record<WallpaperKind, string>> = {
  "abstract-grid": "28px 28px, 28px 28px, auto",
  "abstract-dots": "18px 18px, auto",
};

/** File-type → emoji glyph for desktop / explorer icons. */
export const FILE_GLYPH: Record<string, string> = {
  xlsx: "📊",
  csv: "📈",
  docx: "📄",
  pdf: "📕",
  pptx: "📙",
  py: "🐍",
  js: "📜",
  sh: "🖥️",
  txt: "📃",
  zip: "🗜️",
  png: "🖼️",
  key: "🔑",
  folder: "📁",
  default: "📄",
};

export function fileGlyph(item: { kind: string; ext?: string }): string {
  if (item.kind === "folder") return FILE_GLYPH.folder;
  return FILE_GLYPH[item.ext ?? "default"] ?? FILE_GLYPH.default;
}
