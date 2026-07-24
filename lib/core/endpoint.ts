/**
 * TriageOS — Endpoint visual + desktop models (immersion layer)
 * ============================================================
 * Per-endpoint presentation state generated once by the OrgGenerator, so every
 * Windows/Mac machine looks distinct: a wallpaper, a light/dark theme, and a
 * scattered set of department-appropriate desktop files.
 *
 * All of this is plain JSON (persisted with the world) and lives ON the node,
 * so the endpoint environments render deterministically per user.
 */

export type WallpaperKind =
  | "corp-blue"
  | "corp-teal"
  | "corp-violet"
  | "gradient-sunset"
  | "gradient-mint"
  | "abstract-waves"
  | "abstract-mesh"
  | "photo-mountain"
  | "photo-shore"
  | "default-os";

export type EndpointTheme = "light" | "dark";

/** A file/folder icon on the endpoint desktop. */
export interface DesktopItem {
  id: string;
  name: string; // "Payroll_Q3.xlsx", "Resumes"
  kind: "file" | "folder";
  /** File-type hint for iconography, e.g. "xlsx" | "csv" | "py" | "pdf". */
  ext?: string;
  /** Grid cell the icon occupies (randomized per user). */
  col: number;
  row: number;
}

export interface EndpointVisualState {
  wallpaper: WallpaperKind;
  theme: EndpointTheme;
  /** Display name of the primary logged-in user (from AD). */
  loggedInUser: string;
  /** Scattered desktop icons, department-appropriate. */
  desktop: DesktopItem[];
}

// ── Wallpaper rendering (CSS backgrounds) ────────────────────────────────────

export const WALLPAPER_CSS: Record<WallpaperKind, string> = {
  "corp-blue": "linear-gradient(135deg,#0a2547 0%,#123a63 100%)",
  "corp-teal": "linear-gradient(135deg,#052e2b 0%,#0f5b52 100%)",
  "corp-violet": "linear-gradient(135deg,#241a45 0%,#3d2a63 100%)",
  "gradient-sunset": "linear-gradient(135deg,#3a1c47 0%,#7a2f52 55%,#b8532f 100%)",
  "gradient-mint": "linear-gradient(135deg,#0b3a2e 0%,#1f7a63 100%)",
  "abstract-waves":
    "radial-gradient(circle at 20% 20%,rgba(76,194,255,0.25),transparent 45%),radial-gradient(circle at 80% 70%,rgba(16,185,129,0.2),transparent 45%),#0c1424",
  "abstract-mesh":
    "radial-gradient(circle at 70% 20%,rgba(168,85,247,0.28),transparent 40%),radial-gradient(circle at 25% 80%,rgba(56,189,248,0.22),transparent 42%),#0d1020",
  "photo-mountain": "linear-gradient(160deg,#1b2a3a 0%,#2f4a63 45%,#5a748c 100%)",
  "photo-shore": "linear-gradient(160deg,#0a2f3a 0%,#12586b 55%,#2a9db5 100%)",
  "default-os": "linear-gradient(135deg,#0a1730 0%,#123a63 100%)",
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
