"use client";

/**
 * ITQuest — Toasts + Action Center
 * =================================
 * `ToastHost` slides Windows-style toasts in from the bottom-right, above the
 * taskbar. `ActionCenter` is the panel behind the taskbar bell, listing the
 * notification history.
 *
 * SVG icons only — no emoji.
 */

import { useNotificationStore, unreadCount, type AppNotification } from "@/lib/host/notifications-store";
import { IconAlert, IconCheck, IconX } from "@/components/ui/icons";

function kindIcon(kind: AppNotification["kind"], size = 14) {
  if (kind === "success") return <IconCheck size={size} />;
  if (kind === "warning") return <IconAlert size={size} />;
  return <IconAlert size={size} />;
}
function kindTone(kind: AppNotification["kind"]) {
  return kind === "success" ? "text-emerald-300" : kind === "warning" ? "text-amber-300" : "text-info";
}

/** Bottom-right toast stack. Rendered above the taskbar. */
export function ToastHost() {
  const items = useNotificationStore((s) => s.items);
  const toasts = useNotificationStore((s) => s.toasts);
  const dismiss = useNotificationStore((s) => s.dismissToast);

  const shown = toasts
    .map((id) => items.find((i) => i.id === id))
    .filter((x): x is AppNotification => !!x)
    .slice(-3);

  if (shown.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-16 right-4 z-[10000] flex w-80 flex-col gap-2">
      {shown.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto animate-[toastIn_220ms_ease-out] overflow-hidden rounded-lg border border-edge bg-panel/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div className="flex items-start gap-2.5 p-3">
            <span className={`mt-0.5 ${kindTone(n.kind)}`}>{kindIcon(n.kind, 16)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-semibold text-gray-100">{n.title}</span>
                {n.badge && (
                  <span className="shrink-0 rounded-full bg-info/20 px-1.5 py-0.5 text-[10px] font-semibold text-info">
                    {n.badge}
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-400">{n.body}</p>
            </div>
            <button
              onClick={() => dismiss(n.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-500/15 hover:text-gray-200"
            >
              <IconX size={12} />
            </button>
          </div>
          <div className="h-0.5 w-full bg-gradient-to-r from-info/70 to-transparent" />
        </div>
      ))}
    </div>
  );
}

/** Action Center panel — opened from the taskbar bell. */
export function ActionCenter({ onClose }: { onClose: () => void }) {
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clear = useNotificationStore((s) => s.clear);

  return (
    <div
      className="absolute bottom-14 right-3 z-[10000] w-80 overflow-hidden rounded-xl border border-edge bg-panel/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <span className="text-xs font-semibold text-gray-100">Notifications</span>
        <span className="rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold text-info">
          {unreadCount(items)} new
        </span>
        <button onClick={markAllRead} className="ml-auto text-[10px] text-gray-400 hover:text-gray-100">
          Mark all read
        </button>
        <button onClick={clear} className="text-[10px] text-gray-400 hover:text-danger">Clear</button>
        <button onClick={onClose} aria-label="Close" className="rounded p-0.5 text-gray-500 hover:bg-gray-500/15 hover:text-gray-200">
          <IconX size={12} />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 && (
          <div className="px-3 py-8 text-center text-[11px] text-gray-600">
            No notifications yet. Resolve a ticket to see it here.
          </div>
        )}
        {items.map((n) => (
          <div key={n.id} className={`flex items-start gap-2.5 border-b border-edge/50 px-3 py-2 ${n.read ? "opacity-60" : ""}`}>
            <span className={`mt-0.5 ${kindTone(n.kind)}`}>{kindIcon(n.kind)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[11px] font-semibold text-gray-100">{n.title}</span>
                {n.badge && (
                  <span className="shrink-0 rounded-full bg-info/15 px-1.5 py-0.5 text-[9px] font-semibold text-info">
                    {n.badge}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-[10px] leading-snug text-gray-400">{n.body}</p>
              <span className="text-[9px] text-gray-600">{new Date(n.at).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
