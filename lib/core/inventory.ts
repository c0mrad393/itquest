/**
 * TriageOS — Hardware inventory models
 * ====================================
 * The IT store room: every physical asset the operator can allocate, from
 * mice and patch cables to switches and rack servers. Lives inside
 * InfrastructureState so it persists with the world and so ticket
 * win-conditions can read stock/allocation levels directly.
 *
 * v0.2.2 turns this from a stock count into an asset LEDGER. Units are held
 * in four explicit lifecycle buckets rather than a total minus deductions,
 * because "how many are on the shelf" and "how many are dead in a drawer"
 * are different questions and the old `total - deployed - inRepair` could not
 * answer either without ambiguity.
 */

export type AssetCategory =
  | "workstation" // laptops, desktops
  | "peripheral" // mice, keyboards, monitors, docks
  | "memory" // DIMMs
  | "storage" // disks and SSDs
  | "component" // PSUs, GPUs, NICs
  | "cable" // RJ45 patch, power leads
  | "network" // switches, routers, firewalls
  | "server" // rack servers
  | "power" // UPS, PDU
  | "panel"; // patch panels

/** Rack-mountable device kinds (assets with a `deviceKind` can be racked). */
export type RackDeviceKind =
  | "server"
  | "switch"
  | "router"
  | "firewall"
  | "patch-panel"
  | "ups"
  | "pdu"
  /** Cooling: airflow booster and in-rack air conditioner. */
  | "fan-tray"
  | "crac";

/** Where a unit is in its life. Every owned unit sits in exactly one. */
export type AssetStatus = "spare" | "deployed" | "in-transit" | "faulty";

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  spare: "Spare",
  deployed: "Deployed",
  "in-transit": "In Transit",
  faulty: "Faulty",
};

// ── Technical traits (the compatibility mechanic) ───────────────────────────

export type MemoryType = "DDR4" | "DDR5";
export type BusInterface = "SATA" | "SAS" | "NVMe" | "PCIe" | "USB";

/**
 * Machine-readable specification. The Hardware Lab matches these against a
 * job's `HardwareRequirement`, so buying the wrong generation of memory is a
 * real (and expensive) mistake rather than a cosmetic label difference.
 */
export interface HardwareTraits {
  memoryType?: MemoryType;
  /** Transfers per second, e.g. 3200 for DDR4-3200. */
  speedMts?: number;
  ecc?: boolean;
  busInterface?: BusInterface;
  /** "DIMM", "SODIMM", "M.2 2280", "U.2", "2.5in", "3.5in". */
  formFactor?: string;
  capacityGb?: number;
  hotSwap?: boolean;
  /** Watts, for PSUs. */
  watts?: number;
}

/** What a specific job needs fitted. Unset fields are "don't care". */
export interface HardwareRequirement {
  memoryType?: MemoryType;
  minSpeedMts?: number;
  ecc?: boolean;
  busInterface?: BusInterface;
  formFactor?: string;
  minCapacityGb?: number;
  hotSwap?: boolean;
}

/**
 * Why a part cannot be fitted, in the engineer's words — or null if it fits.
 * Returns the FIRST failing constraint so the message names one concrete
 * reason rather than a list the player has to decode.
 */
export function incompatibilityReason(
  traits: HardwareTraits | undefined,
  req: HardwareRequirement | undefined,
): string | null {
  if (!req) return null;
  const t = traits ?? {};

  if (req.memoryType && t.memoryType && t.memoryType !== req.memoryType) {
    return `This board takes ${req.memoryType} — that module is ${t.memoryType}. The slots are keyed differently; it will not seat.`;
  }
  if (req.ecc === true && t.ecc === false) {
    return "This platform requires ECC memory. Non-ECC will not post.";
  }
  if (req.minSpeedMts && t.speedMts && t.speedMts < req.minSpeedMts) {
    return `Rated ${t.speedMts} MT/s, below the ${req.minSpeedMts} MT/s this job specifies.`;
  }
  if (req.busInterface && t.busInterface && t.busInterface !== req.busInterface) {
    return `The bay is ${req.busInterface} — that drive is ${t.busInterface}. Wrong connector.`;
  }
  if (req.formFactor && t.formFactor && t.formFactor !== req.formFactor) {
    return `Needs a ${req.formFactor} part; that one is ${t.formFactor}.`;
  }
  if (req.minCapacityGb && t.capacityGb && t.capacityGb < req.minCapacityGb) {
    return `${t.capacityGb} GB is under the ${req.minCapacityGb} GB this job specifies.`;
  }
  if (req.hotSwap === true && t.hotSwap === false) {
    return "This bay is hot-swap; that part is not rated for it and would require downtime.";
  }
  return null;
}

/** One-line human spec for catalogue cards, built from the traits. */
export function specLine(item: AssetItem): string {
  const t = item.traits ?? {};
  const bits: string[] = [];
  if (t.capacityGb) bits.push(t.capacityGb >= 1024 ? `${t.capacityGb / 1024} TB` : `${t.capacityGb} GB`);
  if (t.memoryType) bits.push(`${t.memoryType}-${t.speedMts ?? ""}`.replace(/-$/, ""));
  if (t.ecc !== undefined) bits.push(t.ecc ? "ECC" : "non-ECC");
  if (t.busInterface) bits.push(t.busInterface);
  if (t.formFactor) bits.push(t.formFactor);
  if (t.watts) bits.push(`${t.watts}W`);
  if (t.hotSwap) bits.push("hot-swap");
  return bits.join(" · ") || item.model;
}

// ── Assets ──────────────────────────────────────────────────────────────────

export interface AssetItem {
  /** Stable SKU id, e.g. "sku-sw-24p". */
  id: string;
  name: string;
  /** Fictional enterprise vendor, e.g. "Kinetix". */
  brand: string;
  category: AssetCategory;
  model: string;

  // ── Lifecycle buckets. total = spare + deployed + inTransit + faulty ──
  /** On the shelf, ready to fit. This is what `availableOf` reports. */
  spare: number;
  /** Fitted into a machine or racked. */
  deployed: number;
  /** Ordered and not yet delivered. */
  inTransit: number;
  /** Pulled out broken. Owned, counted, and useless. */
  faulty: number;

  /** Rack height in U — present only on rack-mountable assets. */
  uSize?: number;
  /** Set when this asset can be mounted in the rack simulator. */
  deviceKind?: RackDeviceKind;
  /**
   * Unit price in IT Budget credits. Present on everything the Procurement
   * app can restock; absent means the item is not purchasable.
   */
  price?: number;
  /** Machine-readable specification for the compatibility check. */
  traits?: HardwareTraits;
}

export function totalOwned(item: AssetItem): number {
  return item.spare + item.deployed + item.inTransit + item.faulty;
}

/** Units on the shelf right now — the only ones that can actually be fitted. */
export function availableOf(item: AssetItem): number {
  return Math.max(0, item.spare);
}

// ── Shipping ────────────────────────────────────────────────────────────────

export type ShippingMethod = "standard" | "express";

export interface ShippingOption {
  id: ShippingMethod;
  label: string;
  /** Multiplier applied to the line total. */
  surcharge: number;
  /** Ticket resolutions the order waits for. 0 = arrives immediately. */
  ticketsToWait: number;
  blurb: string;
}

export const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: "standard",
    label: "Standard freight",
    surcharge: 0,
    ticketsToWait: 2,
    blurb: "No charge. Arrives after two further incidents are closed.",
  },
  {
    id: "express",
    label: "Express courier",
    surcharge: 0.65,
    ticketsToWait: 0,
    blurb: "+65% on the line. On the bench immediately.",
  },
];

export function shippingOption(id: ShippingMethod): ShippingOption {
  return SHIPPING_OPTIONS.find((s) => s.id === id) ?? SHIPPING_OPTIONS[0];
}

/** An order in flight. Delivered orders are removed, not archived. */
export interface PurchaseOrder {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  method: ShippingMethod;
  /** Total charged, including any surcharge. */
  paid: number;
  placedAt: number;
  /** Counts down on each ticket resolution; delivered at zero. */
  ticketsRemaining: number;
}

export interface AssetAllocation {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  /** Ticket this allocation was booked against, if any. */
  ticketId?: string;
  ticketCode?: string;
  /** Free-text destination: a user, a hostname, or "Rack A / U12". */
  assignedTo: string;
  at: number;
}

export interface InventoryState {
  items: AssetItem[];
  /** Newest first. */
  allocations: AssetAllocation[];
  /** Orders awaiting delivery. */
  orders: PurchaseOrder[];
}

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  workstation: "Workstations",
  peripheral: "Peripherals",
  memory: "Memory",
  storage: "Storage",
  component: "Components",
  cable: "Cables",
  network: "Network",
  server: "Servers",
  power: "Power",
  panel: "Patch panels",
};
