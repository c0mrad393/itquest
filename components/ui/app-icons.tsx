/**
 * TriageOS — Host app icon mapper
 * ===============================
 * The single bridge between the serializable `HostAppIconId` keys stored in the
 * app registry / window manager and the React SVG components that draw them.
 *
 * Why a mapper rather than putting components in the registry: SessionState and
 * every open window must stay plain JSON (they are persisted and structurally
 * cloned), so state carries a STRING and only the render layer knows about JSX.
 *
 * Sizes are standardised so the shell stays visually aligned:
 *   desktop 24 · taskbar 20 · Start menu 24 · window title bar 14
 */

import type { HostAppIconId, NodeOs } from "@/lib/core";
import type { EmotionIconId } from "@/lib/dialogue/types";
import {
  IconAlert,
  IconApple,
  IconChevronUp,
  IconActivity,
  IconBattery,
  IconBuilding,
  IconCable,
  IconChartBar,
  IconCode,
  IconCompass,
  IconDisk,
  IconEye,
  IconFileChart,
  IconFileCode,
  IconFileImage,
  IconFileKey,
  IconFilePdf,
  IconFileSheet,
  IconFileSlides,
  IconFileText,
  IconFileZip,
  IconFolder,
  IconFolderLocked,
  IconGrid,
  IconLink,
  IconList,
  IconMinus,
  IconMouse,
  IconPanel,
  IconPen,
  IconPlus,
  IconPolicy,
  IconPower,
  IconRecycle,
  IconRouter,
  IconSearch,
  IconSliders,
  IconSwitch,
  IconTrash,
  IconUser,
  IconX,
  IconBank,
  IconHealth,
  IconStore,
  IconFaceAngry,
  IconFaceCalm,
  IconFaceIrritated,
  IconFacePanicked,
  IconFaceRelieved,
  IconFaceStressed,
  IconBan,
  IconBook,
  IconBoxes,
  IconCheck,
  IconClock,
  IconCpu,
  IconGear,
  IconGlobe,
  IconHeadset,
  IconIdCard,
  IconInbox,
  IconKey,
  IconKeyboard,
  IconLaptop,
  IconLinux,
  IconLock,
  IconMail,
  IconMessages,
  IconMonitor,
  IconPackage,
  IconPlug,
  IconRack,
  IconSend,
  IconServer,
  IconShield,
  IconTerminal,
  IconTicket,
  IconToolbox,
  IconTrophy,
  IconTruck,
  IconUsers,
  IconWindows,
  IconWrench,
  type IconProps,
} from "./icons";

/** Canonical sizes for each place the shell draws an app icon. */
export const APP_ICON_SIZE = {
  desktop: 24,
  taskbar: 20,
  start: 24,
  titlebar: 14,
} as const;

/**
 * Resolve an icon key to its glyph. The switch is exhaustive over
 * `HostAppIconId`, so adding a key without a glyph fails the build; the
 * `default` only catches ids widened to `string` by older persisted state.
 */
export function AppIcon({ id, ...props }: IconProps & { id: HostAppIconId | EmotionIconId | string }) {
  switch (id as HostAppIconId | EmotionIconId) {
    case "ticket":
      return <IconTicket {...props} />;
    case "messages":
      return <IconMessages {...props} />;
    case "mail":
      return <IconMail {...props} />;
    case "globe":
      return <IconGlobe {...props} />;
    case "monitor":
      return <IconMonitor {...props} />;
    case "wrench":
      return <IconWrench {...props} />;
    case "boxes":
      return <IconBoxes {...props} />;
    case "rack":
      return <IconRack {...props} />;
    case "toolbox":
      return <IconToolbox {...props} />;
    case "trophy":
      return <IconTrophy {...props} />;
    case "gear":
      return <IconGear {...props} />;
    case "id-card":
      return <IconIdCard {...props} />;
    case "os-linux":
      return <IconLinux {...props} />;
    case "os-windows":
      return <IconWindows {...props} />;
    case "os-macos":
      return <IconApple {...props} />;
    case "headset":
      return <IconHeadset {...props} />;
    case "shield":
      return <IconShield {...props} />;
    case "inbox":
      return <IconInbox {...props} />;
    case "send":
      return <IconSend {...props} />;
    case "book":
      return <IconBook {...props} />;
    case "keyboard":
      return <IconKeyboard {...props} />;
    case "terminal":
      return <IconTerminal {...props} />;
    case "clock":
      return <IconClock {...props} />;
    case "cpu":
      return <IconCpu {...props} />;
    case "truck":
      return <IconTruck {...props} />;
    case "key":
      return <IconKey {...props} />;
    case "users":
      return <IconUsers {...props} />;
    case "lock":
      return <IconLock {...props} />;
    case "ban":
      return <IconBan {...props} />;
    case "check":
      return <IconCheck {...props} />;
    case "alert":
      return <IconAlert {...props} />;
    case "plug":
      return <IconPlug {...props} />;
    case "server":
      return <IconServer {...props} />;
    case "laptop":
      return <IconLaptop {...props} />;
    case "package":
      return <IconPackage {...props} />;
    case "bank":
      return <IconBank {...props} />;
    case "health":
      return <IconHealth {...props} />;
    case "store":
      return <IconStore {...props} />;
    case "face-relieved":
      return <IconFaceRelieved {...props} />;
    case "face-calm":
      return <IconFaceCalm {...props} />;
    case "face-stressed":
      return <IconFaceStressed {...props} />;
    case "face-irritated":
      return <IconFaceIrritated {...props} />;
    case "face-panicked":
      return <IconFacePanicked {...props} />;
    case "face-angry":
      return <IconFaceAngry {...props} />;
    case "folder":
      return <IconFolder {...props} />;
    case "folder-locked":
      return <IconFolderLocked {...props} />;
    case "file-text":
      return <IconFileText {...props} />;
    case "file-sheet":
      return <IconFileSheet {...props} />;
    case "file-chart":
      return <IconFileChart {...props} />;
    case "file-pdf":
      return <IconFilePdf {...props} />;
    case "file-slides":
      return <IconFileSlides {...props} />;
    case "file-code":
      return <IconFileCode {...props} />;
    case "file-image":
      return <IconFileImage {...props} />;
    case "file-zip":
      return <IconFileZip {...props} />;
    case "file-key":
      return <IconFileKey {...props} />;
    case "disk":
      return <IconDisk {...props} />;
    case "compass":
      return <IconCompass {...props} />;
    case "list":
      return <IconList {...props} />;
    case "chart-bar":
      return <IconChartBar {...props} />;
    case "code":
      return <IconCode {...props} />;
    case "pen":
      return <IconPen {...props} />;
    case "policy":
      return <IconPolicy {...props} />;
    case "user":
      return <IconUser {...props} />;
    case "building":
      return <IconBuilding {...props} />;
    case "grid":
      return <IconGrid {...props} />;
    case "recycle":
      return <IconRecycle {...props} />;
    case "eye":
      return <IconEye {...props} />;
    case "search":
      return <IconSearch {...props} />;
    case "sliders":
      return <IconSliders {...props} />;
    case "activity":
      return <IconActivity {...props} />;
    case "power":
      return <IconPower {...props} />;
    case "trash":
      return <IconTrash {...props} />;
    case "switch":
      return <IconSwitch {...props} />;
    case "panel":
      return <IconPanel {...props} />;
    case "battery":
      return <IconBattery {...props} />;
    case "router":
      return <IconRouter {...props} />;
    case "cable":
      return <IconCable {...props} />;
    case "mouse":
      return <IconMouse {...props} />;
    case "link":
      return <IconLink {...props} />;
    case "x":
      return <IconX {...props} />;
    case "plus":
      return <IconPlus {...props} />;
    case "minus":
      return <IconMinus {...props} />;
    case "chevron-up":
      return <IconChevronUp {...props} />;
    default:
      // Unknown key (e.g. a window restored from an older session) — a neutral
      // glyph beats a blank gap or a crash.
      return <IconPackage {...props} />;
  }
}

/** OS → icon key, for remote sessions and the gateway node list. */
export const OS_ICON_ID: Record<NodeOs, HostAppIconId> = {
  linux: "os-linux",
  windows: "os-windows",
  macos: "os-macos",
};
