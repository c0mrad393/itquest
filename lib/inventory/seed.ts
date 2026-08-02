/**
 * TriageOS — Store-room seed
 * ==========================
 * The starting asset catalogue and an empty rack. Quantities are deliberately
 * tight on the parts tickets consume (patch cables, switches, servers) so
 * allocation decisions actually matter.
 */

import type { AssetItem, InventoryState, RackState } from "@/lib/core";
import { RACK_SIZE_U } from "@/lib/core";

const catalogue: AssetItem[] = [
  // Workstations
  { id: "sku-laptop-14", name: "UltraBook 14\" i7", category: "workstation", model: "NB-1470", total: 8, deployed: 3, inRepair: 1 },
  { id: "sku-desktop-sff", name: "Desktop SFF i5", category: "workstation", model: "DT-540S", total: 12, deployed: 7, inRepair: 0 },
  // Peripherals
  { id: "sku-mouse", name: "USB Optical Mouse", category: "peripheral", model: "PM-100", total: 24, deployed: 9, inRepair: 0 },
  { id: "sku-keyboard", name: "USB Keyboard (UK)", category: "peripheral", model: "KB-210", total: 18, deployed: 8, inRepair: 1 },
  { id: "sku-monitor", name: "24\" IPS Monitor", category: "peripheral", model: "MN-241", total: 10, deployed: 6, inRepair: 0 },
  { id: "sku-dock", name: "USB-C Docking Station", category: "peripheral", model: "DK-300", total: 6, deployed: 2, inRepair: 0 },
  // Cables
  { id: "sku-rj45-1m", name: "RJ45 Patch Cable 1m", category: "cable", model: "Cat6 / blue", total: 40, deployed: 6, inRepair: 0 },
  { id: "sku-rj45-3m", name: "RJ45 Patch Cable 3m", category: "cable", model: "Cat6 / grey", total: 25, deployed: 4, inRepair: 0 },
  { id: "sku-power-c13", name: "Power Lead C13", category: "cable", model: "IEC C13", total: 30, deployed: 8, inRepair: 0 },
  // Network
  { id: "sku-sw-24p", name: "24-Port Gigabit Switch", category: "network", model: "CS-2400", total: 3, deployed: 1, inRepair: 0, uSize: 1, deviceKind: "switch" },
  { id: "sku-router", name: "Edge Router", category: "network", model: "ER-800", total: 2, deployed: 1, inRepair: 0, uSize: 1, deviceKind: "router" },
  { id: "sku-fw", name: "Firewall Appliance", category: "network", model: "FW-450", total: 1, deployed: 0, inRepair: 0, uSize: 1, deviceKind: "firewall" },
  // Panels
  { id: "sku-patch-24", name: "24-Port Patch Panel", category: "panel", model: "PP-24", total: 4, deployed: 1, inRepair: 0, uSize: 1, deviceKind: "patch-panel" },
  // Servers
  { id: "sku-srv-1u", name: "Rack Server 1U", category: "server", model: "RS-100", total: 4, deployed: 1, inRepair: 0, uSize: 1, deviceKind: "server" },
  { id: "sku-srv-2u", name: "Rack Server 2U (storage)", category: "server", model: "RS-220", total: 2, deployed: 0, inRepair: 0, uSize: 2, deviceKind: "server" },
  // Power
  { id: "sku-ups-2u", name: "UPS 1500VA", category: "power", model: "UPS-1500", total: 2, deployed: 0, inRepair: 0, uSize: 2, deviceKind: "ups" },
  { id: "sku-pdu-1u", name: "Rack PDU 8-way", category: "power", model: "PDU-8", total: 3, deployed: 0, inRepair: 0, uSize: 1, deviceKind: "pdu" },
];

export function createInventory(): InventoryState {
  return { items: catalogue.map((i) => ({ ...i })), allocations: [] };
}

export function createRack(): RackState {
  return { sizeU: RACK_SIZE_U, devices: [], cables: [], tests: [] };
}
