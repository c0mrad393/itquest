"use client";

/**
 * ITQuest — the theme control
 * ============================
 * Three states, because "follow the system" is a real preference and not a
 * missing one. The glyph shows what is ACTIVE; the tooltip says which mode is
 * selected, which are different facts whenever the mode is "system".
 *
 * ── WHY IT IS SHARED ────────────────────────────────────────────────────────
 *
 * It lived inside the Taskbar, so it existed only inside the simulator. The
 * two consoles — /admin and /org — are built on the same tokens and follow
 * the same stored preference, and AdminShell's own note says that is
 * deliberate: they are read for an hour at a time and forcing a theme on the
 * reader would be the wrong call.
 *
 * But "follows the operator's preference" was only half true there. The
 * preference could only be EXPRESSED from the simulator's taskbar, and an
 * instructor who never opens the desktop has none to follow — so the console
 * handed them whatever their OS said, permanently, with nothing to press.
 * Offering the choice is what makes the sentence true.
 */

import { IconContrast, IconMoon, IconSun } from "@/components/ui/icons";
import { useThemeStore } from "@/lib/host/theme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const pref = useThemeStore((s) => s.preference);
  const resolved = useThemeStore((s) => s.resolved);
  const cycle = useThemeStore((s) => s.cycle);

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${pref}. Click to change.`}
      title={pref === "system" ? `Theme: follow system (currently ${resolved})` : `Theme: ${pref}`}
      className={`flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-500/15 hover:text-gray-100 ${className}`}
    >
      {pref === "system" ? (
        <IconContrast size={15} />
      ) : pref === "light" ? (
        <IconSun size={15} />
      ) : (
        <IconMoon size={15} />
      )}
    </button>
  );
}
