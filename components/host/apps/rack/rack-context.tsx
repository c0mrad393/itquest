"use client";

/**
 * Which rack the Datacenter Floor is currently showing.
 *
 * Every rack action is now addressed to a specific rack, and the cabling,
 * console, ping and telemetry panels all operate on "the one in front of me".
 * Threading a rackId prop through four levels of panel would put the same
 * value in a dozen signatures for no gain, so the selection lives in context —
 * it is genuinely ambient UI state, not data.
 */

import { createContext, useContext } from "react";
import type { RackState } from "@/lib/core";

interface RackSelection {
  rackId: string;
  rack: RackState;
}

const RackContext = createContext<RackSelection | null>(null);

export const RackProvider = RackContext.Provider;

/** The rack on screen. Throws in development if a panel renders outside one. */
export function useSelectedRack(): RackSelection {
  const value = useContext(RackContext);
  if (!value) throw new Error("Rack panel rendered outside a RackProvider");
  return value;
}
