"use client";

/**
 * ITQuest Admin — sidebar
 * =======================
 * Collapsible section nav.
 *
 * ── COLLAPSED STILL MEANS LABELLED ──────────────────────────────────────────
 *
 * Collapsing to icons alone is the standard move and it is how admin panels
 * become unusable for anyone who does not use them daily — six abstract
 * glyphs, no text, and the only way to find "Subscriptions" is to hover each
 * one in turn. Collapsed here keeps a native `title` on every item, and the
 * active section keeps its accent rail, so position is still readable.
 *
 * ── NOT-YET-BUILT SECTIONS SAY SO ───────────────────────────────────────────
 *
 * Phase 1 ships two working pages out of six. The other four are marked in the
 * nav rather than looking identical and then landing on an empty screen —
 * finding out a section is empty AFTER navigating is a worse experience than
 * being told before.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_SECTIONS, adminHref, sectionForPath } from "@/lib/admin/nav";
import { useAdminUi } from "@/lib/admin/ui";
import AdminIcon from "./AdminIcon";
import { LogoMark } from "@/components/ui/Logo";

export default function AdminSidebar() {
  const pathname = usePathname();
  const collapsed = useAdminUi((s) => s.collapsed);
  const active = sectionForPath(pathname);

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-edge bg-surface transition-[width] duration-200 ease-out ${
        collapsed ? "w-[3.75rem]" : "w-60"
      }`}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-edge px-4">
        <LogoMark size={20} className="shrink-0 text-brand-text" />
        {!collapsed && (
          <span className="truncate text-[13px] font-semibold tracking-tight text-gray-100">
            <span className="font-bold">IT</span>
            <span className="font-normal opacity-90">Quest</span>
            <span className="ml-1.5 rounded border border-edge px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-gray-500">
              Admin
            </span>
          </span>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto term-scroll p-2">
        {ADMIN_SECTIONS.map((s) => {
          const isActive = s.slug === active.slug;
          return (
            <Link
              key={s.slug || "index"}
              href={adminHref(s.slug)}
              title={collapsed ? `${s.label} — ${s.blurb}` : s.blurb}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-[12.5px] transition-colors ${
                isActive
                  ? "bg-brand-soft/[0.12] text-gray-50"
                  : "text-gray-400 hover:bg-surface-2 hover:text-gray-100"
              }`}
            >
              {/* The active rail survives collapse; a background tint on a 60px
                  column does not read as "you are here" at a glance. */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-1.5 left-0 w-[2px] rounded-full transition-colors ${
                  isActive ? "bg-brand-fill" : "bg-transparent"
                }`}
              />
              <AdminIcon
                id={s.iconId}
                size={16}
                className={`shrink-0 ${isActive ? "text-brand-text" : ""}`}
              />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {!s.ready && (
                    <span className="shrink-0 rounded border border-edge px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-gray-600">
                      Soon
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-edge p-2">
        <Link
          href="/desktop"
          title="Back to the simulator"
          className="flex items-center gap-3 rounded-md px-2.5 py-2 text-[12px] text-gray-500 transition-colors hover:bg-surface-2 hover:text-gray-200"
        >
          <span aria-hidden="true" className="shrink-0 font-mono text-[13px] leading-none">
            &larr;
          </span>
          {!collapsed && <span className="truncate">Back to simulator</span>}
        </Link>
      </div>
    </aside>
  );
}
