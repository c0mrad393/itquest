"use client";

/**
 * TriageOS — "God Mode" QA profile
 * ================================
 * A tester identity that bypasses normal progression so any ticket can be
 * QA'd without playing up through the tiers:
 *
 *   • the ticket factory emits EVERY template at once (not the curated
 *     4×T1 / 2×T2 / 2×T3 starter spread)
 *   • XP/level gating is bypassed — the operator starts maxed
 *
 * It is opt-in and sticky per browser (localStorage), so a QA session survives
 * reloads. Enable from the landing page, the Settings app, or the console:
 *
 *   TriageOS.godMode(true)   // then reload
 */

import { useEffect, useState } from "react";

const KEY = "triageos-god-mode";

export const GOD_MODE_USERNAME = "QA Tester";
/** Level/XP handed to the QA profile so nothing is progression-locked. */
export const GOD_MODE_XP = 999_999;

export function isGodMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Flip the flag. Returns true when the mode actually CHANGED — callers use that
 * to wipe the save slot, because a God Mode world (every template at once) and
 * a normal world are not interchangeable in either direction.
 */
export function setGodMode(on: boolean): boolean {
  const changed = isGodMode() !== on;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — QA mode simply stays off */
    return false;
  }
  return changed;
}

/**
 * React-safe read of the flag.
 *
 * `isGodMode()` touches localStorage, which does not exist during SSR — reading
 * it straight in render would make the server and client markup disagree. This
 * always returns false on the first paint and settles after mount, so the shell
 * hydrates cleanly and debug-only apps simply appear a tick later.
 */
export function useGodMode(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isGodMode()), []);
  return on;
}

/**
 * Developer elevation — `sudo elevate debug` in the browser console.
 *
 * v0.3.0 put progression behind gameplay, which makes late-game systems
 * unreachable for testing without grinding. This unlocks everything IN THE
 * LIVE SESSION (no reload): max level, budget, every licence, every app, and
 * the full ticket library.
 *
 * Deliberately console-only and undocumented in the UI: a player who finds it
 * has gone looking, and there is no button to press by accident.
 */
export function installGodModeConsoleApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { TriageOS?: Record<string, unknown>; sudo?: unknown };

  w.TriageOS = {
    ...(w.TriageOS ?? {}),
    godMode: (on = true) => {
      setGodMode(on);
      return `God Mode ${on ? "enabled" : "disabled"} — reload to apply.`;
    },
    isGodMode,
    elevate: () => elevateNow(),
    /**
     * Suspend the v0.3.1 datacentre physics for testing. With unlimited power
     * the PDU never trips; with unlimited cooling the rack sits at ambient
     * whatever is mounted. Both persist in the save, so a QA world stays a QA
     * world across a reload.
     */
    power: (unlimited = true) => setRackOverride({ unlimitedPower: unlimited }),
    cooling: (unlimited = true) => setRackOverride({ unlimitedCooling: unlimited }),
    physics: (on = true) =>
      setRackOverride({ unlimitedPower: !on, unlimitedCooling: !on }),
  };

  /**
   * `sudo elevate debug` — a bare identifier so it reads like a shell command.
   * Chained getters make each word evaluate without parentheses; the final one
   * performs the elevation and returns the banner the console prints.
   */
  Object.defineProperty(w, "sudo", {
    configurable: true,
    get() {
      return {
        get elevate() {
          return {
            get debug() {
              return elevateNow();
            },
            toString: () => "usage: sudo elevate debug",
          };
        },
        toString: () => "usage: sudo elevate debug",
      };
    },
  });
}

/**
 * Toggle the rack physics overrides. Lazy import for the same reason as
 * `elevateNow` — the host seed pulls this module in, so a static store import
 * would be a module-init cycle.
 */
function setRackOverride(patch: { unlimitedPower?: boolean; unlimitedCooling?: boolean }): string {
  void (async () => {
    const { useInfraStore } = await import("@/lib/infra/store");
    useInfraStore.getState().rackSetOverrides(patch);
  })();
  const bits = Object.entries(patch).map(
    ([k, v]) => `  ${k === "unlimitedPower" ? "power  " : "cooling"}    ${v ? "unlimited" : "physical"}`,
  );
  return ["[TriageOS] rack physics", ...bits].join("\n");
}

/** Apply full elevation to the running session. */
function elevateNow(): string {
  setGodMode(true);
  // Imported lazily: this module is pulled in by the host seed, and a static
  // import of the stores here would create a cycle at module-init time.
  void (async () => {
    const [{ useHostStore }, { useTicketStore }, { useInfraStore }, { LICENSES }, { levelForXp }] =
      await Promise.all([
        import("@/lib/host/store"),
        import("@/lib/host/tickets-store"),
        import("@/lib/infra/store"),
        import("@/lib/economy/licenses"),
        import("@/lib/scenario/scoring"),
      ]);

    useHostStore.setState((st) => ({
      host: {
        ...st.host,
        licenses: LICENSES.map((l) => l.id),
        user: {
          ...st.host.user,
          xp: GOD_MODE_XP,
          level: levelForXp(GOD_MODE_XP),
          budget: 999_999,
          skills: {
            hardware: 9000,
            networking: 9000,
            systems: 9000,
            security: 9000,
            identity: 9000,
            cloud: 9000,
          },
        },
      },
    }));

    // Open every tier so the late-game content is reachable immediately.
    useTicketStore
      .getState()
      .spawnForTiers(
        ["Tier_2_Medium", "Tier_3_Hard", "Tier_4_Expert"],
        useInfraStore.getState().infra,
      );
  })();

  return [
    "[TriageOS] elevation granted",
    "  level      max",
    "  budget     999,999 Cr",
    "  licences   all",
    "  apps       all unlocked",
    "  tickets    every tier spawned",
    "",
    "  TriageOS.power(true)    unlimited PDU capacity",
    "  TriageOS.cooling(true)  rack pinned to ambient",
    "  TriageOS.physics(true)  restore both to physical",
  ].join("\n");
}
