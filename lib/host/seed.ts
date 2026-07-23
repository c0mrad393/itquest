/**
 * TriageOS — Host workstation seed
 * ================================
 * The operator's Level-0 workstation profile. (The ticket queue is now minted
 * by the procedural TicketFactory in lib/tickets/factory.ts.)
 */

import type { HostWorkstationState } from "@/lib/core";

export function createHostWorkstation(): HostWorkstationState {
  return {
    user: {
      displayName: "O. Kharebashvili",
      role: "Tier-2 Systems Engineer",
      avatar: "🧑‍💻",
      level: 4,
      xp: 6420,
    },
    wallpaper: "bloom",
    clock24h: true,
    tray: { networkConnected: true, volume: 65, notifications: 3 },
  };
}
