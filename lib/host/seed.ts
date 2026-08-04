/**
 * TriageOS — Host workstation seed
 * ================================
 * The operator's Level-0 workstation profile. (The ticket queue is now minted
 * by the procedural TicketFactory in lib/tickets/factory.ts.)
 */

import type { HostWorkstationState } from "@/lib/core";
import { GOD_MODE_USERNAME, GOD_MODE_XP, isGodMode } from "./god-mode";
import { levelForXp } from "@/lib/scenario/scoring";
import { EMPTY_SKILLS } from "@/lib/progression/tracks";

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
          budget: 999_999,
          skills: { hardware: 9000, networking: 9000, systems: 9000, security: 9000, identity: 9000, cloud: 9000 },
        }
      : {
          displayName: "O. Kharebashvili",
          // Title is DERIVED from level + skills at render time (see
          // lib/progression/tracks.ts). This is only the day-one seed.
          role: "IT Intern",
          avatar: "indigo",
          level: 1,
          xp: 0,
          // An intern's float: one memory module and a couple of cables.
          budget: 400,
          skills: { ...EMPTY_SKILLS },
        },
    wallpaper: "bloom",
    soundEnabled: true,
    licenses: [],
    clock24h: true,
    tray: { networkConnected: true, volume: 65, notifications: 3 },
  };
}
