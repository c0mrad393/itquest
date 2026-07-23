"use client";

/**
 * TriageOS — Windows 11 Taskbar
 * -----------------------------
 * Centered app cluster (Win11 layout): Start button + pinned apps (from
 * HOST_APP_REGISTRY) with running/active indicators, plus a right-aligned
 * system tray and clock. Pinned apps launch; running apps activate/minimize.
 */

import {
  HOST_APP_REGISTRY,
  TASKBAR_PINNED,
  type HostAppId,
} from "@/lib/core";
import { useHostStore } from "@/lib/host/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useMailStore } from "@/lib/mail/store";
import Clock from "./Clock";

export default function Taskbar() {
  const windows = useHostStore((s) => s.windows);
  const startMenuOpen = useHostStore((s) => s.startMenuOpen);
  const toggleStartMenu = useHostStore((s) => s.toggleStartMenu);
  const openApp = useHostStore((s) => s.openApp);
  const taskbarActivate = useHostStore((s) => s.taskbarActivate);
  const host = useHostStore((s) => s.host);

  const openTickets = useTicketStore((s) =>
    s.tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length,
  );
  const unreadMail = useDialogueStore((s) =>
    Object.values(s.conversations).reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0),
  );
  const unreadCoreMail = useMailStore((s) => s.messages.filter((m) => !m.read).length);

  const topZ = windows.length ? Math.max(...windows.map((w) => w.z)) : 0;

  // Which app windows are currently open (for running indicators).
  const appInstances = windows.filter((w) => w.kind === "app");

  function badgeFor(appId: HostAppId): number | null {
    const src = HOST_APP_REGISTRY[appId].badgeSource;
    if (src === "unread-tickets") return openTickets || null;
    if (src === "unread-mail") return unreadMail || null;
    if (src === "unread-coremail") return unreadCoreMail || null;
    if (src === "sla-alerts") return host.tray.notifications || null;
    return null;
  }

  return (
    <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[9999] flex h-12 items-center border-t border-white/10 bg-black/50 px-3 backdrop-blur-xl">
      {/* Left spacer to keep the cluster centered */}
      <div className="flex-1" />

      {/* Centered cluster */}
      <div className="flex items-center gap-1">
        {/* Start button */}
        <button
          onClick={toggleStartMenu}
          aria-label="Start"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition hover:bg-white/10 ${
            startMenuOpen ? "bg-white/10" : ""
          }`}
        >
          <WindowsLogo />
        </button>

        {TASKBAR_PINNED.map((appId) => {
          const meta = HOST_APP_REGISTRY[appId];
          const instances = appInstances.filter(
            (w) => w.kind === "app" && w.appId === appId,
          );
          const running = instances.length > 0;
          const active =
            running && instances.some((w) => w.z === topZ && w.mode !== "minimized");
          const badge = badgeFor(appId);

          return (
            <button
              key={appId}
              onClick={() =>
                running ? taskbarActivate(instances[0].instanceId) : openApp(appId)
              }
              title={meta.title}
              className={`relative flex h-9 w-9 items-center justify-center rounded-md text-lg transition hover:bg-white/10 ${
                active ? "bg-white/15" : ""
              }`}
            >
              <span>{meta.icon}</span>
              {badge != null && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                  {badge}
                </span>
              )}
              {/* Running indicator */}
              {running && (
                <span
                  className={`absolute -bottom-0.5 h-1 rounded-full bg-info transition-all ${
                    active ? "w-4" : "w-1.5"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Right: system tray + clock */}
      <div className="flex flex-1 items-center justify-end gap-1">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1 text-gray-300 hover:bg-white/10">
          <NetIcon on={host.tray.networkConnected} />
          <VolIcon />
        </div>
        <Clock h24={host.clock24h} />
      </div>
    </div>
  );
}

function WindowsLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="0" y="0" width="8" height="8" fill="#4cc2ff" />
      <rect x="10" y="0" width="8" height="8" fill="#4cc2ff" />
      <rect x="0" y="10" width="8" height="8" fill="#4cc2ff" />
      <rect x="10" y="10" width="8" height="8" fill="#4cc2ff" />
    </svg>
  );
}

function NetIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className={on ? "text-gray-200" : "text-gray-600"}>
      <path
        d="M8 3c2.5 0 4.8 1 6.5 2.6l-1 1C12 5.2 10.1 4.4 8 4.4S4 5.2 2.5 6.6l-1-1C3.2 4 5.5 3 8 3z"
        fill="currentColor"
      />
      <path d="M8 6.2c1.6 0 3.1.6 4.2 1.7l-1 1C10.4 8.1 9.2 7.6 8 7.6s-2.4.5-3.2 1.3l-1-1C4.9 6.8 6.4 6.2 8 6.2z" fill="currentColor" />
      <circle cx="8" cy="11.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function VolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="text-gray-200">
      <path d="M3 6h2l3-2.5v9L5 10H3V6z" fill="currentColor" />
      <path d="M10 5.5c1 .8 1 3.2 0 5" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M11.8 4c1.8 1.4 1.8 5.6 0 8" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}
