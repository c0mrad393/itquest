"use client";

/** Live taskbar clock (self-ticking, no store churn). Win11 stacked time/date. */

import { useEffect, useState } from "react";

export default function Clock({ h24 = true }: { h24?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date()); // set after mount to avoid SSR hydration mismatch
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: !h24,
      })
    : "--:--";
  const date = now
    ? now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "--/--/----";

  return (
    <div className="flex flex-col items-end justify-center px-2 text-right leading-tight text-gray-200">
      <span className="text-xs tabular-nums">{time}</span>
      <span className="text-[10px] text-gray-400 tabular-nums">{date}</span>
    </div>
  );
}
