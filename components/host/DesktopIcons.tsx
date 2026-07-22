"use client";

/**
 * TriageOS — Desktop icons
 * ------------------------
 * Top-left icon column for apps flagged `showOnDesktop` in HOST_APP_REGISTRY.
 * Single-click selects; double-click launches (Windows behavior).
 */

import { useState } from "react";
import { HOST_APP_REGISTRY, type HostAppDescriptor, type HostAppId } from "@/lib/core";
import { useHostStore } from "@/lib/host/store";

export default function DesktopIcons() {
  const openApp = useHostStore((s) => s.openApp);
  const [selected, setSelected] = useState<HostAppId | null>(null);

  const desktopApps = (Object.values(HOST_APP_REGISTRY) as HostAppDescriptor[]).filter(
    (a) => a.showOnDesktop,
  );

  return (
    <div
      className="absolute left-2 top-2 z-0 flex flex-col gap-1"
      onClick={() => setSelected(null)}
    >
      {desktopApps.map((app) => (
        <button
          key={app.id}
          onClick={(e) => {
            e.stopPropagation();
            setSelected(app.id);
          }}
          onDoubleClick={() => openApp(app.id)}
          className={`flex w-20 flex-col items-center gap-1 rounded p-2 text-center transition ${
            selected === app.id ? "bg-info/25 ring-1 ring-info/40" : "hover:bg-white/10"
          }`}
        >
          <span className="text-3xl drop-shadow">{app.icon}</span>
          <span className="text-[10px] leading-tight text-gray-100 drop-shadow">
            {app.title}
          </span>
        </button>
      ))}
    </div>
  );
}
