"use client";

/**
 * TriageOS — Windows 11 Start Menu
 * --------------------------------
 * Frosted floating panel above the taskbar: search field, a "Pinned" grid of
 * all host apps (from HOST_APP_REGISTRY), and a footer with the operator
 * profile and a (decorative) power control. Clicking an app launches it.
 */

import { useState } from "react";
import { HOST_APP_REGISTRY, type HostAppDescriptor, type HostAppId } from "@/lib/core";
import { useHostStore } from "@/lib/host/store";
import Avatar from "./Avatar";

export default function StartMenu() {
  const open = useHostStore((s) => s.startMenuOpen);
  const setStartMenu = useHostStore((s) => s.setStartMenu);
  const openApp = useHostStore((s) => s.openApp);
  const host = useHostStore((s) => s.host);
  const [query, setQuery] = useState("");

  if (!open) return null;

  const apps = (Object.values(HOST_APP_REGISTRY) as HostAppDescriptor[]).filter((a) =>
    a.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function launch(id: HostAppId) {
    openApp(id);
    setQuery("");
  }

  return (
    <>
      {/* Click-away backdrop */}
      <div className="absolute inset-0 z-[9990]" onClick={() => setStartMenu(false)} />

      <div className="absolute bottom-14 left-1/2 z-[9991] w-[560px] max-w-[92vw] -translate-x-1/2 rounded-2xl border border-white/10 bg-panel/95 p-5 shadow-2xl shadow-black/70 backdrop-blur-2xl">
        {/* Search */}
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps"
          className="mb-4 w-full rounded-full border border-edge bg-panelalt px-4 py-2 text-sm text-gray-200 outline-none placeholder:text-gray-500 focus:border-info"
        />

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-300">Pinned</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => launch(app.id)}
              className="flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition hover:bg-white/10"
            >
              <span className="text-2xl">{app.icon}</span>
              <span className="text-[11px] leading-tight text-gray-200">{app.title}</span>
            </button>
          ))}
          {apps.length === 0 && (
            <div className="col-span-4 py-6 text-center text-xs text-gray-600">
              No apps match “{query}”.
            </div>
          )}
        </div>

        {/* Footer: profile + power */}
        <div className="mt-4 flex items-center gap-3 border-t border-edge pt-3">
          <Avatar value={host.user.avatar} className="h-9 w-9 text-lg" />
          <div className="leading-tight">
            <div className="text-sm text-gray-100">{host.user.displayName}</div>
            <div className="text-[11px] text-gray-500">
              {host.user.role} · Lvl {host.user.level}
            </div>
          </div>
          <button
            aria-label="Power"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-white/10"
            title="Power (decorative)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M4.5 4.5a5 5 0 107 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
