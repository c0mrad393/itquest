"use client";

/**
 * ITQuest Admin — resource chart
 * ==============================
 * Forty minutes of CPU and memory across the simulator fleet.
 *
 * ── INLINE SVG, NOT A CHART LIBRARY ─────────────────────────────────────────
 *
 * Two series, fourteen points, no interaction beyond a hover readout. Recharts
 * is ~90kb for that, and every charting library brings its own colour handling
 * that will not know about this codebase's token layer — so the chart would be
 * the one panel that ignores a skin change. Hand-drawn paths read `--info-*`
 * and `--violet-*` like everything else.
 *
 * ── TWO LINES, NOT A STACKED AREA ───────────────────────────────────────────
 *
 * CPU and memory are independent measurements of the same box, not parts of a
 * whole. Stacking them would draw a combined height that means nothing —
 * 74% CPU plus 86% memory is not 160% of anything.
 *
 * SVG only — no emoji.
 */

import { useId, useState } from "react";
import type { ResourceSample } from "@/lib/admin/mock-data";

const W = 640;
const H = 168;
const PAD = { top: 12, right: 8, bottom: 20, left: 30 };

export default function ResourceChart({ series }: { series: ResourceSample[] }) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (series.length - 1)) * plotW;
  const y = (pct: number) => PAD.top + (1 - pct / 100) * plotH;

  const line = (key: "cpuPct" | "memPct") =>
    series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(s[key]).toFixed(1)}`).join(" ");

  const area =
    `${line("memPct")} L${x(series.length - 1).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} ` +
    `L${x(0).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`;

  const active = hover ?? series.length - 1;
  const sample = series[active];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Readout label="CPU" value={sample.cpuPct} className="text-info-strong" dot="bg-info" />
        <Readout label="Memory" value={sample.memPct} className="text-violet-strong" dot="bg-violet" />
        <span className="ml-auto text-[11px] tabular-nums text-gray-500">
          {sample.minutesAgo === 1 ? "1 minute ago" : `${sample.minutesAgo} minutes ago`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        role="img"
        aria-label={`Fleet CPU and memory over the last ${series[0].minutesAgo} minutes. Currently ${sample.cpuPct}% CPU and ${sample.memPct}% memory.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--violet-base))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--violet-base))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines at 25% intervals, labelled. Without them a line chart is
            a shape rather than a measurement. */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(pct)}
              y2={y(pct)}
              stroke="rgb(var(--edge))"
              strokeWidth="1"
              strokeDasharray={pct === 0 ? undefined : "2 4"}
            />
            <text x={PAD.left - 6} y={y(pct) + 3} textAnchor="end" className="fill-gray-600 text-[8px]">
              {pct}
            </text>
          </g>
        ))}

        {/* The 85% pressure line the health badge keys off, so the chart and
            the KPI card visibly agree. */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(85)}
          y2={y(85)}
          stroke="rgb(var(--warn-base))"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.55"
        />

        <path d={area} fill={`url(#${gradId})`} />
        <path d={line("memPct")} fill="none" stroke="rgb(var(--violet-base))" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line("cpuPct")} fill="none" stroke="rgb(var(--info-base))" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

        {/* Hover crosshair. */}
        <line
          x1={x(active)}
          x2={x(active)}
          y1={PAD.top}
          y2={PAD.top + plotH}
          stroke="rgb(var(--edge-strong))"
          strokeWidth="1"
        />
        <circle cx={x(active)} cy={y(sample.memPct)} r="3" fill="rgb(var(--violet-base))" />
        <circle cx={x(active)} cy={y(sample.cpuPct)} r="3" fill="rgb(var(--info-base))" />

        {/* Invisible hit columns: one per sample, so the pointer never has to
            find a 2px line. */}
        {series.map((_, i) => (
          <rect
            key={i}
            x={x(i) - plotW / (series.length - 1) / 2}
            y={PAD.top}
            width={plotW / (series.length - 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
    </div>
  );
}

function Readout({
  label,
  value,
  className,
  dot,
}: {
  label: string;
  value: number;
  className: string;
  dot: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 self-center rounded-full ${dot}`} />
      <span className="text-[11px] uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`font-mono text-[13px] font-semibold tabular-nums ${className}`}>{value}%</span>
    </span>
  );
}
