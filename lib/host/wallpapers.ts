/**
 * TriageOS — Desktop wallpaper catalogue (personalization)
 * =======================================================
 * The operator's own workstation background. Pure data: each entry is a CSS
 * `background` value, so a wallpaper is just a string on `HostWorkstationState`
 * and persists with the save like any other host state.
 *
 * Three families:
 *   gradient — multi-stop colour fields (the default look)
 *   solid    — flat, low-distraction surfaces for long sessions
 *   pattern  — inline-SVG textures (data URIs, so nothing is fetched)
 *
 * `overlay` controls the soft radial bloom the shell paints on top; patterns
 * turn it off so the texture stays crisp.
 */

export type WallpaperFamily = "gradient" | "solid" | "pattern";

export interface HostWallpaper {
  id: string;
  label: string;
  family: WallpaperFamily;
  /** Any valid CSS `background` shorthand. */
  css: string;
  /** Extra CSS applied alongside (e.g. background-size for tiled patterns). */
  size?: string;
  /** Paint the shell's radial bloom over this wallpaper. Default true. */
  overlay?: boolean;
}

/** Inline SVG → data URI, so patterns never hit the network. */
function svg(body: string, w = 40, h = 40): string {
  const doc = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(doc)}")`;
}

export const HOST_WALLPAPERS: HostWallpaper[] = [
  // ── Gradients ─────────────────────────────────────────────────────────────
  {
    id: "bloom",
    label: "Bloom",
    family: "gradient",
    css: "linear-gradient(135deg, #0a1730 0%, #0d2145 38%, #123a63 70%, #0a2a4d 100%)",
  },
  {
    id: "midnight",
    label: "Midnight",
    family: "gradient",
    css: "linear-gradient(160deg, #05070f 0%, #0b1224 55%, #131c38 100%)",
  },
  {
    id: "aurora",
    label: "Aurora",
    family: "gradient",
    css: "linear-gradient(150deg, #05131a 0%, #0a2f3a 40%, #10504f 72%, #0b3a4a 100%)",
  },
  {
    id: "ember",
    label: "Ember",
    family: "gradient",
    css: "linear-gradient(145deg, #180a10 0%, #2f1220 45%, #4a1c2c 78%, #23101a 100%)",
  },
  {
    id: "violet-dusk",
    label: "Violet Dusk",
    family: "gradient",
    css: "linear-gradient(140deg, #120a24 0%, #23134a 45%, #3a1f6b 75%, #1b1038 100%)",
  },
  {
    id: "forest",
    label: "Forest",
    family: "gradient",
    css: "linear-gradient(155deg, #06120c 0%, #0d2a1b 45%, #16452c 78%, #0b2517 100%)",
  },

  // ── Solids ────────────────────────────────────────────────────────────────
  { id: "graphite", label: "Graphite", family: "solid", css: "#14171c" },
  { id: "ink", label: "Ink", family: "solid", css: "#0b0f19" },
  { id: "slate", label: "Slate", family: "solid", css: "#1b2430" },
  { id: "espresso", label: "Espresso", family: "solid", css: "#1a1512" },

  // ── SVG patterns ──────────────────────────────────────────────────────────
  {
    id: "blueprint",
    label: "Blueprint",
    family: "pattern",
    css: `${svg(
      "<path d='M40 0H0v40' fill='none' stroke='rgba(120,180,255,0.10)' stroke-width='1'/>",
    )}, linear-gradient(160deg, #071322 0%, #0a1c30 100%)`,
    size: "40px 40px, auto",
    overlay: false,
  },
  {
    id: "carbon",
    label: "Carbon",
    family: "pattern",
    css: `${svg(
      "<circle cx='3' cy='3' r='1' fill='rgba(255,255,255,0.05)'/>",
      14,
      14,
    )}, linear-gradient(160deg, #0f1116 0%, #171b22 100%)`,
    size: "14px 14px, auto",
    overlay: false,
  },
  {
    id: "topography",
    label: "Topography",
    family: "pattern",
    css: `${svg(
      "<path d='M0 60 Q30 30 60 60 T120 60' fill='none' stroke='rgba(90,200,190,0.09)' stroke-width='1.4'/><path d='M0 90 Q30 60 60 90 T120 90' fill='none' stroke='rgba(90,200,190,0.06)' stroke-width='1.4'/>",
      120,
      120,
    )}, linear-gradient(150deg, #071615 0%, #0c2523 100%)`,
    size: "120px 120px, auto",
    overlay: false,
  },
  {
    id: "circuit",
    label: "Circuit",
    family: "pattern",
    css: `${svg(
      "<g fill='none' stroke='rgba(140,160,255,0.11)' stroke-width='1'><path d='M10 0v14h14M50 60V46H36'/><path d='M0 40h18M60 20H42'/></g><circle cx='24' cy='14' r='2' fill='rgba(140,160,255,0.18)'/><circle cx='36' cy='46' r='2' fill='rgba(140,160,255,0.18)'/>",
      60,
      60,
    )}, linear-gradient(150deg, #0a0d1c 0%, #121734 100%)`,
    size: "60px 60px, auto",
    overlay: false,
  },
];

export const DEFAULT_WALLPAPER = "bloom";

export function wallpaperById(id: string): HostWallpaper {
  return HOST_WALLPAPERS.find((w) => w.id === id) ?? HOST_WALLPAPERS[0];
}
