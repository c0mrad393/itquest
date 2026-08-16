"use client";

/**
 * ITQuest — Level 0 Host Desktop (DeskOS 12)
 * ============================================
 * The operator's full-screen workstation shell: wallpaper, desktop icons, the
 * open host-app windows (managed by the host store), the Start menu, and the
 * taskbar. This is the root the user lands on; nested remote sessions (Phase 3)
 * open as additional windows inside this same surface.
 */

import { useEffect, useState } from "react";
import { useHostStore } from "@/lib/host/store";
import WindowFrame from "./WindowFrame";
import Taskbar from "./Taskbar";
import AppDrawer from "./AppDrawer";
import TicketReconciler from "./TicketReconciler";
import TicketEngine from "./TicketEngine";
import SlaEngine from "./SlaEngine";
import NetworkEngine from "./NetworkEngine";
import PersistenceManager from "./PersistenceManager";
import HardwareDispatchEngine from "./HardwareDispatchEngine";
import TelemetryEngine from "./TelemetryEngine";
import { ToastHost } from "./Notifications";
import { wallpaperById } from "@/lib/host/wallpapers";
import { applyProfileToHost, useSessionStore } from "@/lib/host/session";
import { useThemeStore } from "@/lib/host/theme";
import DebugPanel from "./DebugPanel";
import CommandPalette from "./CommandPalette";
import DesktopIcons from "./DesktopIcons";
import ContextMenu from "./ContextMenu";
import { useContextMenu } from "@/lib/host/context-menu";
import { gridFor, useDesktopIconStore } from "@/lib/host/desktop-icons";
import { IconGrid, IconSliders, IconTerminal } from "@/components/ui/icons";
import { useSkinStore } from "@/lib/host/skins";
import TutorialDirector from "./TutorialDirector";
import TutorialOverlay from "./TutorialOverlay";

export default function HostDesktop() {
  const windows = useHostStore((s) => s.windows);
  const paper = wallpaperById(useHostStore((s) => s.host.wallpaper));

  // Developer console handles (`sudo elevate debug`). Installed once on mount.
  // One local operator: read the save slot, then push the name and avatar
  // onto the desktop's user record.
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const hydrate = useSessionStore((s) => s.hydrate);
  const profile = useSessionStore((s) => s.profile);
  const ready = useSessionStore((s) => s.ready);
  useEffect(() => hydrate(), [hydrate]);
  // Reads storage, applies the class, and follows the OS while set to system.
  const initTheme = useThemeStore((s) => s.init);
  // The skin is a second, orthogonal dimension to light/dark — see
  // lib/host/skins.ts. It stamps `data-skin` on <html>, the theme stamps a
  // class, and neither can clobber the other.
  const initSkin = useSkinStore((s) => s.init);
  const resolvedTheme = useThemeStore((s) => s.resolved);

  /*
   * A wallpaper's `css` is either a gradient/url (an IMAGE) or a bare hex (a
   * COLOUR). Setting a hex as backgroundImage silently paints nothing, so the
   * two land on different properties.
   */
  const paperCss = resolvedTheme === "light" ? paper.lightCss ?? paper.css : paper.css;
  const paperStyle: React.CSSProperties = paperCss.trim().startsWith("#")
    ? { backgroundColor: paperCss }
    : { backgroundImage: paperCss, backgroundSize: paper.size ?? "cover" };
  useEffect(() => initTheme(), [initTheme]);
  useEffect(() => initSkin(), [initSkin]);
  useEffect(() => {
    if (ready) void applyProfileToHost(profile);
  }, [ready, profile]);

  /**
   * Open the Dashboard, and nothing else.
   *
   * An empty desktop with one window on it says "this is the thing to do"
   * far more clearly than any amount of onboarding copy. Guarded on there
   * being no windows at all so a restored session is left exactly as the
   * operator left it.
   */
  const openApp = useHostStore((s) => s.openApp);

  /*
   * The wallpaper's own menu.
   *
   * Built fresh on each right-click rather than memoised: "Auto-arrange" has
   * to know how many rows the desktop has RIGHT NOW, and a menu captured at
   * mount would arrange against the window size from three resizes ago.
   */
  const tidyIcons = useDesktopIconStore((s) => s.tidy);
  const onDesktopContextMenu = useContextMenu(
    () => [
      {
        id: "terminal",
        label: "Open Terminal",
        icon: <IconTerminal size={13} />,
        /*
         * There is no LOCAL terminal in this product, and that is deliberate
         * rather than missing: every shell in ITQuest is a shell ON a machine,
         * reached through the gateway. A local prompt on the ops workstation
         * would be a terminal that cannot do anything the simulation models.
         * So this opens the place terminals come from.
         */
        onSelect: () => openApp("gateway"),
      },
      {
        id: "arrange",
        label: "Auto-arrange icons",
        icon: <IconGrid size={13} />,
        onSelect: () => tidyIcons(gridFor(window.innerWidth, window.innerHeight - 48).rows),
      },
      { id: "sep-1", separator: true },
      {
        id: "personalize",
        label: "Personalize",
        icon: <IconSliders size={13} />,
        onSelect: () => openApp("appearance"),
      },
    ],
    "desktop",
  );

  useEffect(() => {
    if (useHostStore.getState().windows.length === 0) openApp("dashboard");
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none font-sans">
      {/* Wallpaper — chosen in Settings → Personalization, persisted with the save. */}
      <div
        onContextMenu={onDesktopContextMenu}
        className="absolute inset-0 transition-colors duration-200"
        // `background` (shorthand) alongside `backgroundSize` (longhand) makes
        // React warn on every re-render and can drop the size when the two are
        // patched in different commits. Only longhands are set — and the
        // `solid` family is a bare hex, which is a colour rather than an image,
        // so it has to land on the right property or the desktop goes blank.
        style={paperStyle}
      />
      {paper.overlay !== false && (
        <div
          className="absolute inset-0"
          style={{
            // The bloom is a light source. On a pale backdrop the same additive
            // blue reads as a smudge, so it drops to a fifth of its strength.
            background: `radial-gradient(circle at 50% 120%, rgba(76,194,255,${
              resolvedTheme === "light" ? 0.05 : 0.18
            }), transparent 60%)`,
          }}
        />
      )}

      {/* Brand watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="select-none text-[9vw] font-black tracking-tight text-gray-50/[0.04]">
          ITQuest
        </span>
      </div>

      {/* Headless engines. PersistenceManager first: hydrate before evaluating. */}
      <PersistenceManager />
      <DebugPanel open={devToolsOpen} onClose={() => setDevToolsOpen(false)} />
      <TicketReconciler />
      <TicketEngine />
      <SlaEngine />
      <NetworkEngine />
      <HardwareDispatchEngine />
      <TelemetryEngine />
      {/* Decides which tour is running; renders nothing itself. */}
      <TutorialDirector />

      {/* Desktop icons — draggable, grid-snapped, persisted outside the save. */}
      <DesktopIcons onContextMenu={onDesktopContextMenu} />

      {/* Windows layer */}
      {/* Windows layer. `pointer-events-none` so empty desktop space stays
          clickable (each WindowFrame re-enables events for itself) — otherwise
          this full-size div swallows every click meant for the icons below. */}
      <div className="pointer-events-none absolute inset-0 bottom-12 z-20">
        {windows.map((win) => (
          <WindowFrame key={win.instanceId} win={win} />
        ))}
      </div>

      {/* Start menu (renders above windows, below taskbar) */}
      <AppDrawer />

      {/* Cmd/Ctrl+K. Mounted at the desktop root so it works from any app,
          including inside a remote session. */}
      <CommandPalette />

      {/* Toast stack (above the taskbar, below nothing) */}
      <ToastHost />

      {/* Taskbar */}
      <Taskbar devToolsOpen={devToolsOpen} onToggleDevTools={() => setDevToolsOpen((v) => !v)} />

      {/* The spotlight sits above everything, taskbar included — it has to be
          able to dim and to highlight the Start button like anything else. */}
      <TutorialOverlay />

      {/* One menu for the whole shell. Mounted last so it paints above the
          taskbar, and driven by its own store so opening it re-renders
          nothing but itself. */}
      <ContextMenu />
    </div>
  );
}
