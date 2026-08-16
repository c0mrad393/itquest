"use client";

/**
 * ITQuest — Appearance
 * ====================
 * Skin, theme, wallpaper and desktop shortcuts, in one place.
 *
 * Personalization used to live inside Settings between the save status and the
 * danger zone, which put "choose a wallpaper" two scroll-lengths from "wipe
 * everything". Splitting it out is not tidying: the two screens answer
 * different questions and are visited at completely different rates.
 *
 * The skin grid shows a live SWATCH rather than a name alone, because "Clean
 * Corporate" tells an operator nothing about what will happen to their screen.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { HOST_APP_REGISTRY, type HostAppId } from "@/lib/core";
import { useHostStore } from "@/lib/host/store";
import { useThemeStore, type ThemePreference } from "@/lib/host/theme";
import { SKINS, useSkinStore } from "@/lib/host/skins";
import { useDesktopIconStore, gridFor } from "@/lib/host/desktop-icons";
import { HOST_WALLPAPERS } from "@/lib/host/wallpapers";
import { AppHeader, Segmented } from "./AppChrome";
import { AppIcon } from "@/components/ui/app-icons";
import { IconCheck, IconGrid, IconPlus, IconX } from "@/components/ui/icons";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function AppearanceApp() {
  const skin = useSkinStore((s) => s.skin);
  const setSkin = useSkinStore((s) => s.setSkin);
  const themePref = useThemeStore((s) => s.preference);
  const setTheme = useThemeStore((s) => s.setPreference);
  const wallpaper = useHostStore((s) => s.host.wallpaper);
  const setWallpaper = useHostStore((s) => s.setWallpaper);
  const level = useHostStore((s) => s.host.user.level);

  const icons = useDesktopIconStore((s) => s.icons);
  const addIcon = useDesktopIconStore((s) => s.add);
  const removeIcon = useDesktopIconStore((s) => s.remove);
  const tidy = useDesktopIconStore((s) => s.tidy);
  const resetIcons = useDesktopIconStore((s) => s.reset);

  const onDesktop = new Set(icons.map((i) => i.app));
  const grid = typeof window === "undefined" ? { cols: 12, rows: 7 } : gridFor(window.innerWidth, window.innerHeight - 48);

  return (
    <div className="flex h-full flex-col overflow-y-auto term-scroll bg-panel text-sm text-gray-200">
      <AppHeader iconId="gear" title="Appearance" subtitle="Skin, theme and desktop" />

      <div className="flex flex-col gap-4 p-4">
        {/* ── Skin ──────────────────────────────────────────────────────── */}
        <Section
          title="Skin"
          blurb="Changes the chrome — brand colour, corners, taskbar and edges. It does not override light or dark; those stay yours."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SKINS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSkin(s.id)}
                aria-pressed={skin === s.id}
                className={`flex items-start gap-3 rounded-wm border p-3 text-left transition ${
                  skin === s.id
                    ? "border-brand-fill bg-brand-soft/10"
                    : "border-edge hover:border-edge-strong hover:bg-panelalt"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-8 w-8 shrink-0 overflow-hidden rounded-wm border border-edge"
                >
                  <span className="h-full w-1/2" style={{ background: s.swatch[0] }} />
                  <span className="h-full w-1/2" style={{ background: s.swatch[1] }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-100">
                    {s.label}
                    {skin === s.id && <IconCheck size={12} className="text-brand-text" />}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">{s.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Theme ─────────────────────────────────────────────────────── */}
        <Section
          title="Light and dark"
          blurb="System follows your operating system and keeps following it — if it flips at sunset, so does this."
        >
          <Segmented value={themePref} onChange={(v) => setTheme(v as ThemePreference)} options={THEME_OPTIONS} />
        </Section>

        {/* ── Desktop shortcuts ─────────────────────────────────────────── */}
        <Section
          title="Desktop shortcuts"
          blurb="Drag icons anywhere on the desktop; they snap to the grid. Unlocked apps only."
        >
          <div className="mb-2.5 flex flex-wrap gap-2">
            <button
              onClick={() => tidy(grid.rows)}
              className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 text-[11px] font-medium text-gray-200 transition hover:bg-panelalt"
            >
              <IconGrid size={12} /> Tidy up
            </button>
            <button
              onClick={resetIcons}
              className="rounded-md border border-edge px-2.5 py-1.5 text-[11px] text-gray-300 transition hover:bg-panelalt"
            >
              Reset to defaults
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(Object.keys(HOST_APP_REGISTRY) as HostAppId[]).map((id) => {
              const meta = HOST_APP_REGISTRY[id];
              const on = onDesktop.has(id);
              return (
                <button
                  key={id}
                  onClick={() => (on ? removeIcon(id) : addIcon(id, grid.cols, grid.rows))}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition ${
                    on ? "border-brand-fill/50 bg-brand-soft/[0.08]" : "border-edge hover:bg-panelalt"
                  }`}
                >
                  <AppIcon id={meta.iconId} size={14} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-gray-200">{meta.title}</span>
                  <span className={on ? "text-brand-text" : "text-gray-500"}>
                    {on ? <IconX size={11} /> : <IconPlus size={11} />}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Wallpaper ─────────────────────────────────────────────────── */}
        <Section title="Wallpaper">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {HOST_WALLPAPERS.map((w) => (
              <button
                key={w.id}
                onClick={() => setWallpaper(w.id)}
                title={w.label}
                aria-pressed={wallpaper === w.id}
                className={`relative h-12 overflow-hidden rounded-wm border transition ${
                  wallpaper === w.id ? "border-brand-fill ring-1 ring-brand-fill/40" : "border-edge hover:border-edge-strong"
                }`}
                style={
                  w.css.trim().startsWith("#")
                    ? { backgroundColor: w.css }
                    : { backgroundImage: w.css, backgroundSize: w.size ?? "cover" }
                }
              >
                <span className="sr-only">{w.label}</span>
              </button>
            ))}
          </div>
        </Section>

        <p className="text-[10px] text-gray-600">
          Operator level {level}. Locked apps can be added to the desktop but will refuse to open until unlocked.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-wm border border-edge bg-panelalt p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</div>
      {blurb && <p className="mb-3 text-[11px] leading-relaxed text-gray-500">{blurb}</p>}
      {children}
    </section>
  );
}
