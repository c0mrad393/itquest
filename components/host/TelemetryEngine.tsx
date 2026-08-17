"use client";

/**
 * TelemetryEngine — headless sampler behind the Edge Gateway's graphs.
 * --------------------------------------------------------------------
 * Formerly fed the standalone Monitor app; that app was folded into the Edge
 * Gateway Manager (v0.9.3) and the sampler stayed, because what it produces —
 * per-node derived samples — is what the appliance's system and traffic
 * widgets read.
 *
 * Appends one derived sample per monitored node every 2s, matching the
 * NetworkEngine's cadence so link utilisation and the charts stay in step.
 *
 * Reads infra via getState() rather than subscribing: this ticks on a timer,
 * and subscribing would re-render the whole desktop on every metric change.
 */

import { useEffect } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useMonitorStore } from "@/lib/monitor/store";

const TICK_MS = 2000;

export default function TelemetryEngine() {
  useEffect(() => {
    const tick = () => useMonitorStore.getState().sample(useInfraStore.getState().infra);
    tick(); // seed a first point immediately so charts aren't empty on open
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);
  return null;
}
