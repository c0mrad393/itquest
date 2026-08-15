"use client";

/**
 * Shared endpoint desktop primitives — used by both the Windows and macOS
 * mini environments so procedural visuals (wallpaper, theme, archetype-placed
 * department files + app shortcuts) render consistently.
 */

import { useState } from "react";
import {
  WALLPAPER_CSS,
  WALLPAPER_SIZE,
  fileGlyph,
  type DesktopItem,
  type EndpointAppId,
  type EndpointVisualState,
} from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";

/** Full-bleed procedural wallpaper for an endpoint. */
export function WallpaperLayer({ visual }: { visual: EndpointVisualState }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: WALLPAPER_CSS[visual.wallpaper],
        backgroundSize: WALLPAPER_SIZE[visual.wallpaper],
      }}
    />
  );
}

// ── App shortcut icons (distinct SVG tiles vs. emoji files) ──────────────────

const APP_TILE: Record<EndpointAppId, string> = {
  "recycle-bin": "#4b5563",
  edge: "#0f7d9c",
  "company-portal": "#4f52d6",
  coreteams: "#6b3fd4",
  codestudio: "#1f6feb",
  financeerp: "#0f8f5f",
  designsuite: "#c2417f",
};

function AppSvg({ app }: { app: EndpointAppId }) {
  const c = "#fff";
  switch (app) {
    case "recycle-bin":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12M10 10v6M14 10v6" />
        </svg>
      );
    case "edge":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.6">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.6 13.5c3-1.2 12-1.2 16.8 0M12 3.6c-2.4 2.4-3.4 12.6 0 16.8M12 3.6c2.4 2.4 3.4 12.6 0 16.8" />
        </svg>
      );
    case "company-portal":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round">
          <path d="M5 20V6l7-3 7 3v14M5 20h14M9 20v-4h6v4M8 9h1M11.5 9h1M15 9h1M8 12h1M11.5 12h1M15 12h1" />
        </svg>
      );
    case "coreteams":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round">
          <path d="M4 6h10a2 2 0 012 2v4a2 2 0 01-2 2H8l-4 3z" />
          <path d="M17 10h3a1 1 0 011 1v4a1 1 0 01-1 1l1 2-3-2h-2" />
        </svg>
      );
    case "codestudio":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 8l-4 4 4 4M15 8l4 4-4 4M13 6l-2 12" />
        </svg>
      );
    case "financeerp":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h16M7 20v-6M12 20V9M17 20v-9M6 8l5-4 3 2 4-4" />
        </svg>
      );
    case "designsuite":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />
        </svg>
      );
  }
}

function ItemIcon({ item }: { item: DesktopItem }) {
  if (item.kind === "app" && item.app) {
    return (
      <span
        className="flex h-8 w-8 items-center justify-center rounded-[9px] shadow-md shadow-black/30 ring-1 ring-white/15"
        style={{ background: APP_TILE[item.app] }}
      >
        <AppSvg app={item.app} />
      </span>
    );
  }
  // File/folder: the stroke glyph sits on a translucent tile so it stays legible
  // over any wallpaper, matching how the app tiles above are drawn.
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gray-500/20 text-white shadow-md shadow-black/30 ring-1 ring-white/15 backdrop-blur-sm">
      <AppIcon id={fileGlyph(item)} size={18} />
    </span>
  );
}

/**
 * Desktop icons placed by archetype (clean / organized / messy). Labels
 * truncate with an ellipsis; white text carries a drop-shadow so it stays
 * readable over any wallpaper. Clicking opens a lightweight preview.
 */
export function DesktopIconGrid({
  visual,
  labelColor = "text-white",
  onOpen,
}: {
  visual: EndpointVisualState;
  labelColor?: string;
  /** Double-click handler — folders/files/apps open real windows when set. */
  onOpen?: (item: DesktopItem) => void;
}) {
  const [open, setOpen] = useState<DesktopItem | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      {visual.desktop.map((item) => (
        <button
          key={item.id}
          onClick={() => (onOpen ? setSelected(item.id) : setOpen(item))}
          onDoubleClick={() => onOpen?.(item)}
          title={item.name}
          className={`group absolute flex w-[74px] flex-col items-center gap-1 rounded-md px-1 pb-1 pt-1.5 text-center transition ${
            selected === item.id ? "bg-gray-500/25 ring-1 ring-white/30" : "hover:bg-gray-500/20"
          }`}
          style={{ left: 10 + item.col * 80, top: 10 + item.row * 72 }}
        >
          <span className="flex h-8 items-center justify-center">
            <span className="relative">
              <ItemIcon item={item} />
              {item.isLocked && (
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-fill text-brand-on shadow">
                  <AppIcon id="lock" size={9} strokeWidth={2.4} />
                </span>
              )}
            </span>
          </span>
          <span className={`desktop-label w-full truncate text-[10px] leading-tight ${labelColor}`}>
            {item.name}
          </span>
        </button>
      ))}
      {open && <FilePreview item={open} user={visual.loggedInUser} onClose={() => setOpen(null)} />}
    </>
  );
}

function FilePreview({ item, user, onClose }: { item: DesktopItem; user: string; onClose: () => void }) {
  const isApp = item.kind === "app";
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-500/25 p-4" onClick={onClose}>
      <div
        className="w-[min(360px,90%)] overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-3 py-2 text-xs">
          <span className="flex items-center">
            <ItemIcon item={item} />
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-gray-200">{item.name}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-danger hover:text-danger-on"
          >
            <AppIcon id="x" size={13} />
          </button>
        </div>
        <div className="p-4 text-xs text-gray-400">
          {isApp ? (
            <>
              <div className="mb-2 text-gray-300">Application shortcut · {user}</div>
              <div className="text-gray-500">
                Launches the {item.name} client. (Interactive apps arrive in a later build.)
              </div>
            </>
          ) : item.kind === "folder" ? (
            <>
              <div className="mb-2 text-gray-300">Folder · owned by {user}</div>
              <div className="text-gray-500">
                This folder contains the user&apos;s {item.name.toLowerCase()} working files.
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 text-gray-300">{item.ext?.toUpperCase()} document · owned by {user}</div>
              <div className="rounded border border-edge bg-panelalt p-3 font-mono text-[11px] leading-relaxed text-gray-500">
                {item.ext === "csv" || item.ext === "xlsx"
                  ? "col_a,col_b,col_c\n1024,▓▓▓,2026-Q1\n…"
                  : item.ext === "py" || item.ext === "sh"
                    ? "#!/usr/bin/env\n# (contents redacted in preview)\n…"
                    : "(binary / preview unavailable)"}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Fallback visual state for nodes generated before visualState existed. */
export const DEFAULT_VISUAL: EndpointVisualState = {
  wallpaper: "default-os",
  theme: "dark",
  archetype: "organized",
  loggedInUser: "Staff User",
  desktop: [],
};
