"use client";

/**
 * HardwareDispatchEngine — headless 1 Hz clock for field dispatches.
 * Decrements every in-progress dispatch; on completion the store flips the
 * target node online + healthy, and the TicketReconciler resolves the ticket.
 */

import { useEffect } from "react";
import { useFieldOpsStore } from "@/lib/hardware/store";

export default function HardwareDispatchEngine() {
  useEffect(() => {
    const id = setInterval(() => useFieldOpsStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}
