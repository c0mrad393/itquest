"use client";

/**
 * Event Viewer — read-only Windows event logs.
 * Useful for diagnosis (e.g. Event 4740 on the DC shows the j.doe lockout
 * source), reading the shared WindowsNodeState.eventLogs.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { EventLevel, EventLogChannel, WindowsNodeState } from "@/lib/core";

const CHANNELS: EventLogChannel[] = ["System", "Application", "Security", "Setup"];

const LEVEL_STYLE: Record<EventLevel, string> = {
  Information: "text-sky-300",
  Warning: "text-amber-300",
  Error: "text-danger",
  Critical: "text-red-400",
};

export default function EventViewer({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const [channel, setChannel] = useState<EventLogChannel>("Security");
  if (!node) return null;

  const events = node.eventLogs[channel] ?? [];

  return (
    <div className="flex h-full bg-panel text-sm text-gray-200">
      <div className="w-40 shrink-0 border-r border-edge">
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Windows Logs
        </div>
        {CHANNELS.map((c) => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs ${
              channel === c ? "bg-info/15 text-info" : "hover:bg-panelalt"
            }`}
          >
            <span>{c}</span>
            <span className="text-[10px] text-gray-500">{node.eventLogs[c]?.length ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto term-scroll">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-600">
            No events in {channel}.
          </div>
        ) : (
          events.map((e, i) => (
            <div key={i} className="border-b border-edge/60 px-4 py-2.5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`font-semibold ${LEVEL_STYLE[e.level]}`}>{e.level}</span>
                <span className="text-gray-500">Event {e.eventId}</span>
                <span className="text-gray-500">· {e.source}</span>
                <span className="ml-auto text-gray-600">{new Date(e.ts).toLocaleTimeString()}</span>
              </div>
              <div className="mt-1 text-xs leading-relaxed text-gray-300">{e.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
