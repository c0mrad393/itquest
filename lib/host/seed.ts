/**
 * TriageOS — Host workstation seed
 * ================================
 * The operator's Level-0 workstation profile. (The ticket queue is now minted
 * by the procedural TicketFactory in lib/tickets/factory.ts.)
 */

import type { HostWorkstationState } from "@/lib/core";
import { GOD_MODE_USERNAME, GOD_MODE_XP, isGodMode } from "./god-mode";
import { levelForXp } from "@/lib/scenario/scoring";

export function createHostWorkstation(): HostWorkstationState {
  // God Mode (QA) starts fully progressed so nothing is level-gated.
  const god = isGodMode();
  return {
    user: god
      ? {
          displayName: GOD_MODE_USERNAME,
          role: "QA / Test Engineer",
          avatar: "amber",
          level: levelForXp(GOD_MODE_XP),
          xp: GOD_MODE_XP,
        }
      : {
          displayName: "O. Kharebashvili",
          role: "Tier-2 Systems Engineer",
          avatar: "indigo",
          level: 4,
          xp: 6420,
        },
    wallpaper: "bloom",
    clock24h: true,
    tray: { networkConnected: true, volume: 65, notifications: 3 },
  };
}
