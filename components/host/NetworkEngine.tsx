"use client";

/**
 * NetworkEngine — headless live-metrics ticker (NetOps layer)
 * -----------------------------------------------------------
 * Random-walks each link's utilization and packet loss every ~2s and lets
 * node health follow its worst attached link. This is what makes the topology
 * feel alive and gives the player something to optimize in the NetOps Console.
 */

import { useEffect } from "react";
import { useInfraStore } from "@/lib/infra/store";

const TICK_MS = 2000;

export default function NetworkEngine() {
  useEffect(() => {
    const id = setInterval(() => useInfraStore.getState().tickNetworkMetrics(), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return null;
}
