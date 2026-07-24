"use client";

/**
 * Shared endpoint desktop primitives — used by both the Windows and macOS
 * mini environments so procedural visuals (wallpaper, theme, scattered
 * department files) render consistently.
 */

import { useState } from "react";
import {
  WALLPAPER_CSS,
  fileGlyph,
  type DesktopItem,
  type EndpointVisualState,
} from "@/lib/core";

/** Full-bleed procedural wallpaper for an endpoint. */
export function WallpaperLayer({ visual }: { visual: EndpointVisualState }) {
  return (
    <div className="absolute inset-0" style={{ background: WALLPAPER_CSS[visual.wallpaper] }} />
  );
}

/**
 * Scattered desktop icons at per-user randomized grid cells. Double-click (or
 * click) opens a lightweight preview so the desktop feels inhabited.
 */
export function DesktopIconGrid({
  visual,
  labelColor = "text-white",
}: {
  visual: EndpointVisualState;
  labelColor?: string;
}) {
  const [open, setOpen] = useState<DesktopItem | null>(null);
  return (
    <>
      {visual.desktop.map((item) => (
        <button
          key={item.id}
          onClick={() => setOpen(item)}
          className="absolute flex w-[72px] flex-col items-center gap-0.5 rounded p-1 text-center transition hover:bg-white/10"
          style={{ left: 8 + item.col * 78, top: 8 + item.row * 68 }}
        >
          <span className="text-2xl drop-shadow">{fileGlyph(item)}</span>
          <span className={`text-[10px] leading-tight drop-shadow ${labelColor}`}>{item.name}</span>
        </button>
      ))}
      {open && <FilePreview item={open} user={visual.loggedInUser} onClose={() => setOpen(null)} />}
    </>
  );
}

function FilePreview({ item, user, onClose }: { item: DesktopItem; user: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[min(360px,80%)] overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-xs">
          <span>{fileGlyph(item)}</span>
          <span className="font-semibold text-gray-200">{item.name}</span>
          <button onClick={onClose} className="ml-auto flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-danger hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-4 text-xs text-gray-400">
          {item.kind === "folder" ? (
            <>
              <div className="mb-2 text-gray-300">Folder · owned by {user}</div>
              <div className="text-gray-500">This folder contains the user&apos;s {item.name.toLowerCase()} working files.</div>
            </>
          ) : (
            <>
              <div className="mb-2 text-gray-300">
                {item.ext?.toUpperCase()} document · owned by {user}
              </div>
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
  loggedInUser: "Staff User",
  desktop: [],
};
