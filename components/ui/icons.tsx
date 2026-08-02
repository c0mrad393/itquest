/**
 * TriageOS — SVG icon set
 * =======================
 * A small, dependency-free stroke-icon set (Lucide-style geometry) used by the
 * AssetManager and Rack Simulator. Every icon inherits `currentColor` and sizes
 * from the `size` prop, so they tint with Tailwind text colours.
 *
 * No emoji anywhere in this layer — these are the canonical UI glyphs.
 */

export interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Svg({ size = 16, className = "", strokeWidth = 1.6, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ── Asset / category glyphs ──────────────────────────────────────────────────

export const IconPackage = (p: IconProps) => (
  <Svg {...p}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></Svg>
);
export const IconLaptop = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="11" rx="1.5" /><path d="M2 20h20" /></Svg>
);
export const IconMouse = (p: IconProps) => (
  <Svg {...p}><rect x="7" y="3" width="10" height="18" rx="5" /><path d="M12 7v3" /></Svg>
);
export const IconKeyboard = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></Svg>
);
export const IconMonitor = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></Svg>
);
export const IconCable = (p: IconProps) => (
  <Svg {...p}><path d="M4 4v6a4 4 0 004 4h8a4 4 0 014 4v2" /><rect x="2" y="2" width="4" height="4" rx="1" /><rect x="18" y="18" width="4" height="4" rx="1" /></Svg>
);
export const IconServer = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="3" width="20" height="7" rx="1.5" /><rect x="2" y="14" width="20" height="7" rx="1.5" /><path d="M6 6.5h.01M6 17.5h.01" /></Svg>
);
export const IconSwitch = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="7" width="20" height="10" rx="1.5" /><path d="M6 11v2M9.5 11v2M13 11v2M16.5 11v2" /></Svg>
);
export const IconRouter = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="13" width="20" height="8" rx="1.5" /><path d="M6 17h.01M9.5 17h.01" /><path d="M12 9a4 4 0 00-4-4M12 9a4 4 0 014-4" /><path d="M12 9V3" /></Svg>
);
export const IconShield = (p: IconProps) => (
  <Svg {...p}><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /></Svg>
);
export const IconPanel = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="8" width="20" height="8" rx="1.5" /><path d="M5.5 11v2M8.5 11v2M11.5 11v2M14.5 11v2M17.5 11v2" /></Svg>
);
export const IconBattery = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="7" width="17" height="10" rx="2" /><path d="M22 11v2" /><path d="M6 11v2M9.5 11v2" /></Svg>
);
export const IconPlug = (p: IconProps) => (
  <Svg {...p}><path d="M9 2v6M15 2v6" /><path d="M6 8h12v3a6 6 0 01-12 0V8z" /><path d="M12 17v5" /></Svg>
);

// ── Action / status glyphs ───────────────────────────────────────────────────

export const IconSearch = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
);
export const IconPlus = (p: IconProps) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>);
export const IconMinus = (p: IconProps) => (<Svg {...p}><path d="M5 12h14" /></Svg>);
export const IconCheck = (p: IconProps) => (<Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>);
export const IconX = (p: IconProps) => (<Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></Svg>
);
export const IconTerminal = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 9l3 3-3 3M12.5 15H17" /></Svg>
);
export const IconSliders = (p: IconProps) => (
  <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></Svg>
);
export const IconActivity = (p: IconProps) => (
  <Svg {...p}><path d="M3 12h4l3 8 4-16 3 8h4" /></Svg>
);
export const IconLink = (p: IconProps) => (
  <Svg {...p}><path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1 1" /><path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1-1" /></Svg>
);
export const IconPower = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v9" /><path d="M6.5 6.5a8 8 0 1011 0" /></Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}><path d="M12 3l9.5 17H2.5L12 3z" /><path d="M12 10v4M12 17.5h.01" /></Svg>
);
export const IconWrench = (p: IconProps) => (
  <Svg {...p}><path d="M15 6a4 4 0 015 5l-9 9-4-4 9-9a4 4 0 01-1-1z" /><path d="M7 16l-3 3" /></Svg>
);
export const IconBoxes = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></Svg>
);
export const IconChevronRight = (p: IconProps) => (<Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>);

// ── Category → icon mapping (shared by AssetManager + Rack) ─────────────────

import type { AssetCategory, RackDeviceKind } from "@/lib/core";

export function categoryIcon(category: AssetCategory, props: IconProps = {}) {
  switch (category) {
    case "workstation": return <IconLaptop {...props} />;
    case "peripheral": return <IconMouse {...props} />;
    case "cable": return <IconCable {...props} />;
    case "network": return <IconSwitch {...props} />;
    case "server": return <IconServer {...props} />;
    case "power": return <IconBattery {...props} />;
    case "panel": return <IconPanel {...props} />;
  }
}

export function deviceIcon(kind: RackDeviceKind, props: IconProps = {}) {
  switch (kind) {
    case "server": return <IconServer {...props} />;
    case "switch": return <IconSwitch {...props} />;
    case "router": return <IconRouter {...props} />;
    case "firewall": return <IconShield {...props} />;
    case "patch-panel": return <IconPanel {...props} />;
    case "ups": return <IconBattery {...props} />;
    case "pdu": return <IconPlug {...props} />;
  }
}
