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
  <Svg {...p}><path d="M15.8 8.2a4.2 4.2 0 01-5.3-5.3l2.6 2.6 2.1-.5.5-2.1-2.6-2.6a4.2 4.2 0 015.3 5.3l5.1 5.1-2.6 2.6z" transform="translate(-1.2 1.6)" /><path d="M11.4 11.4l-7.6 7.6a2 2 0 002.8 2.8l7.6-7.6" /></Svg>
);
export const IconBoxes = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></Svg>
);
export const IconChevronRight = (p: IconProps) => (<Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>);

// ── Host application glyphs (Level-0 shell: desktop, taskbar, Start) ────────

export const IconTicket = (p: IconProps) => (
  <Svg {...p}><path d="M3 8V6a1 1 0 011-1h16a1 1 0 011 1v2a2.5 2.5 0 000 5v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3a2.5 2.5 0 000-5z" /><path d="M14 5v3M14 11.5v1M14 16v3" /></Svg>
);
export const IconMessages = (p: IconProps) => (
  <Svg {...p}><path d="M8 13H5.5a2 2 0 01-2-2V5.5a2 2 0 012-2h9a2 2 0 012 2V8" /><path d="M20.5 18.5a2 2 0 01-2 2H12l-3.5 2.5V12a2 2 0 012-2h7.5a2 2 0 012 2z" /></Svg>
);
export const IconMail = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M3 7l8.2 5.6a1.5 1.5 0 001.6 0L21 7" /></Svg>
);
export const IconGlobe = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></Svg>
);
export const IconRack = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="2.5" width="16" height="19" rx="1.5" /><path d="M7 6.5h10M7 10.5h10M7 14.5h10M7 18.5h10" /></Svg>
);
export const IconToolbox = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="8" width="19" height="12" rx="2" /><path d="M8.5 8V6a2 2 0 012-2h3a2 2 0 012 2v2" /><path d="M2.5 13h19M10 11.5v3M14 11.5v3" /></Svg>
);
export const IconTrophy = (p: IconProps) => (
  <Svg {...p}><path d="M7 4h10v5a5 5 0 01-10 0z" /><path d="M7 6H4.5v1.5A3.5 3.5 0 008 11M17 6h2.5v1.5A3.5 3.5 0 0116 11" /><path d="M12 14v3M8.5 20.5h7M9.5 20.5c0-2 1-3.5 2.5-3.5s2.5 1.5 2.5 3.5" /></Svg>
);
export const IconGear = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" /></Svg>
);
export const IconIdCard = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="4.5" width="19" height="15" rx="2" /><circle cx="8.5" cy="11" r="2.2" /><path d="M5 16.5c.6-1.6 1.9-2.4 3.5-2.4s2.9.8 3.5 2.4" /><path d="M15 9.5h4M15 13h4" /></Svg>
);

export const IconHeadset = (p: IconProps) => (
  <Svg {...p}><path d="M4 14v-2a8 8 0 0116 0v2" /><rect x="2.5" y="13.5" width="4.5" height="6" rx="1.5" /><rect x="17" y="13.5" width="4.5" height="6" rx="1.5" /><path d="M19 19.5v.5a2.5 2.5 0 01-2.5 2.5H13" /></Svg>
);
export const IconInbox = (p: IconProps) => (
  <Svg {...p}><path d="M3 13l2.5-8h13L21 13v5a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></Svg>
);
export const IconSend = (p: IconProps) => (
  <Svg {...p}><path d="M21.5 3.5L10.5 14" /><path d="M21.5 3.5l-7 17-3.5-7.5L3.5 9.5z" /></Svg>
);
export const IconBook = (p: IconProps) => (
  <Svg {...p}><path d="M4 4.5A2 2 0 016 2.5h13.5v15H6a2 2 0 00-2 2z" /><path d="M4 19.5a2 2 0 002 2h13.5v-4" /></Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></Svg>
);
export const IconCpu = (p: IconProps) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9.5" y="9.5" width="5" height="5" rx="0.5" /><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3" /></Svg>
);
export const IconTruck = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 6.5h11v10h-11z" /><path d="M13.5 10h4l3.5 3v3.5h-7.5" /><circle cx="7" cy="18.5" r="2" /><circle cx="17" cy="18.5" r="2" /></Svg>
);
export const IconKey = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8L20 3M17 6l2.5 2.5M14.5 8.5L17 11" /></Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.7-3.4 3.2-5.2 6.5-5.2s5.8 1.8 6.5 5.2" /><path d="M16 5.2a3.5 3.5 0 010 6.6M17.5 14.9c2.3.5 3.7 2.1 4.2 4.6" /></Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 018 0v3.5" /><path d="M12 14.5v2.5" /></Svg>
);
export const IconBan = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></Svg>
);

export const IconBank = (p: IconProps) => (
  <Svg {...p}><path d="M3 9.5L12 4l9 5.5" /><path d="M5 9.5v9M9.7 9.5v9M14.3 9.5v9M19 9.5v9" /><path d="M2.5 21.5h19" /></Svg>
);
export const IconHealth = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="6" width="18" height="14" rx="2.5" /><path d="M12 10v6M9 13h6" /><path d="M8.5 6V4.5A1.5 1.5 0 0110 3h4a1.5 1.5 0 011.5 1.5V6" /></Svg>
);
export const IconStore = (p: IconProps) => (
  <Svg {...p}><path d="M4 4h16l1.2 4.6a3 3 0 01-5.8 1.2 3 3 0 01-5.8 0 3 3 0 01-5.8-1.2z" /><path d="M4.5 10.8V20h15v-9.2" /><path d="M9.5 20v-5.5h5V20" /></Svg>
);

// ── Persona emotion faces ───────────────────────────────────────────────────
// One circle, two eyes, and a mouth curve per state — the curve carries the
// meaning, so they stay readable at the 11px used in ticket rows.

const Face = ({ mouth, brows, ...p }: IconProps & { mouth: string; brows?: string }) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 10h.01M15 10h.01" />
    {brows && <path d={brows} />}
    <path d={mouth} />
  </Svg>
);

export const IconFaceRelieved = (p: IconProps) => (
  <Face {...p} mouth="M8 14.5c1.1 1.6 2.5 2.4 4 2.4s2.9-.8 4-2.4" brows="M7.2 8.2c.6-.5 1.3-.7 2-.6M14.8 7.6c.7-.1 1.4.1 2 .6" />
);
export const IconFaceCalm = (p: IconProps) => (
  <Face {...p} mouth="M8.5 14.6c1 1.1 2.2 1.6 3.5 1.6s2.5-.5 3.5-1.6" />
);
export const IconFaceStressed = (p: IconProps) => (
  <Face {...p} mouth="M9 16h6" brows="M7.2 7.4l2 1M16.8 7.4l-2 1" />
);
export const IconFaceIrritated = (p: IconProps) => (
  <Face {...p} mouth="M8.5 16.4c1-.9 2.2-1.4 3.5-1.4s2.5.5 3.5 1.4" brows="M7 7.6l2.2 1.2M17 7.6l-2.2 1.2" />
);
export const IconFacePanicked = (p: IconProps) => (
  <Face {...p} mouth="M12 14.2c1.4 0 2.5.9 2.5 2s-1.1 2-2.5 2-2.5-.9-2.5-2 1.1-2 2.5-2z" brows="M6.8 8.4l2.4-1.4M17.2 8.4l-2.4-1.4" />
);
export const IconFaceAngry = (p: IconProps) => (
  <Face {...p} mouth="M8.2 16.8c1.1-1.2 2.4-1.8 3.8-1.8s2.7.6 3.8 1.8" brows="M6.6 6.8l2.8 1.8M17.4 6.8l-2.8 1.8" />
);

// ── Operating-system marks (remote sessions / gateway) ──────────────────────

export const IconLinux = (p: IconProps) => (
  <Svg {...p}><path d="M9 3.5c0-1 1.3-1.5 3-1.5s3 .5 3 1.5v3.9c0 1.4.7 2.3 1.7 3.6 1.2 1.6 2 3 2 4.7 0 3.2-3 5.8-6.7 5.8S5.3 19 5.3 15.8c0-1.7.8-3.1 2-4.7C8.3 9.8 9 8.9 9 7.4z" /><path d="M10.3 6.2h.01M13.7 6.2h.01" /><path d="M10.6 9.4c.9.7 1.9.7 2.8 0" /></Svg>
);
export const IconWindows = (p: IconProps) => (
  <Svg {...p}><path d="M3.5 6.4l7.2-1v6.1H3.5zM12.2 5.2l8.3-1.2v7.5h-8.3zM3.5 12.5h7.2v6.1l-7.2-1zM12.2 12.5h8.3V20l-8.3-1.2z" /></Svg>
);
export const IconApple = (p: IconProps) => (
  <Svg {...p}><path d="M16.2 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.8 2.3 1.1 0 1.5-.7 2.9-.7s1.7.7 2.9.7 2-1.1 2.7-2.2c.9-1.2 1.2-2.4 1.2-2.5 0 0-2.3-.9-2.3-3.7z" /><path d="M13.9 5.3c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.6-1.3z" /></Svg>
);

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
