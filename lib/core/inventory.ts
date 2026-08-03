/**
 * TriageOS — Hardware inventory models
 * ====================================
 * The IT store room: every physical asset the operator can allocate, from
 * mice and patch cables to switches and rack servers. Lives inside
 * InfrastructureState so it persists with the world and so ticket
 * win-conditions can read stock/allocation levels directly.
 */

export type AssetCategory =
  | "workstation" // laptops, desktops
  | "peripheral" // mice, keyboards, monitors, docks
  | "cable" // RJ45 patch, power leads
  | "network" // switches, routers, firewalls
  | "server" // rack servers
  | "power" // UPS, PDU
  | "panel"; // patch panels

/** Rack-mountable device kinds (assets with a `deviceKind` can be racked). */
export type RackDeviceKind = "server" | "switch" | "router" | "firewall" | "patch-panel" | "ups" | "pdu";

export interface AssetItem {
  /** Stable SKU id, e.g. "sku-sw-24p". */
  id: string;
  name: string;
  category: AssetCategory;
  model: string;
  /** Total units the company owns. available = total - deployed - inRepair. */
  total: number;
  deployed: number;
  inRepair: number;
  /** Rack height in U — present only on rack-mountable assets. */
  uSize?: number;
  /** Set when this asset can be mounted in the rack simulator. */
  deviceKind?: RackDeviceKind;
  /**
   * Unit price in IT Budget credits. Present on everything the Procurement
   * app can restock; absent means the item is not purchasable.
   */
  price?: number;
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
}

/** Units on the shelf right now. */
export function availableOf(item: AssetItem): number {
  return Math.max(0, item.total - item.deployed - item.inRepair);
}

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  workstation: "Workstations",
  peripheral: "Peripherals",
  cable: "Cables",
  network: "Network",
  server: "Servers",
  power: "Power",
  panel: "Patch panels",
};
