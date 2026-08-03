/**
 * TriageOS — Store-room seed
 * ==========================
 * The starting asset catalogue and an empty rack.
 *
 * SCARCITY IS THE POINT (v0.2.1). The desk opens with a nearly bare store
 * room: enough to start one job, not enough to finish the week. Spare parts
 * — memory, disks, patch cables — are the binding constraint, because the
 * Hardware Lab draws from this catalogue and refuses to fit what is not on
 * the shelf. Restocking means opening Procurement and spending IT Budget,
 * which is why resolving tickets now pays in budget as well as XP.
 *
 * `price` is the per-unit Procurement cost; items without one cannot be
 * bought (they are company fixtures, not consumables).
 */

import type { AssetItem, InventoryState, RackState } from "@/lib/core";
import { RACK_SIZE_U } from "@/lib/core";

const catalogue: AssetItem[] = [
  // ── Workstations (issued to staff; the desk rarely buys these) ───────────
  { id: "sku-laptop-14", name: "UltraBook 14\" i7", category: "workstation", model: "NB-1470", total: 8, deployed: 7, inRepair: 1, price: 1450 },
  { id: "sku-desktop-sff", name: "Desktop SFF i5", category: "workstation", model: "DT-540S", total: 12, deployed: 11, inRepair: 0, price: 980 },

  // ── Spare parts — the Hardware Lab consumes these ────────────────────────
  // Deliberately thin: one memory kit, one disk, nothing spare.
  { id: "sku-ram-8", name: "8GB DDR4 Module", category: "peripheral", model: "PC4-25600", total: 1, deployed: 0, inRepair: 0, price: 60 },
  { id: "sku-ram-16", name: "16GB DDR4 Module", category: "peripheral", model: "PC4-25600", total: 0, deployed: 0, inRepair: 0, price: 110 },
  { id: "sku-ram-32", name: "32GB DDR5 Module (ECC)", category: "peripheral", model: "PC5-44800", total: 1, deployed: 0, inRepair: 0, price: 240 },
  { id: "sku-hdd-1", name: "1TB 7.2K SATA Disk", category: "peripheral", model: "Consumer", total: 0, deployed: 0, inRepair: 0, price: 70 },
  { id: "sku-hdd-2", name: "2TB Enterprise SAS Disk", category: "peripheral", model: "Hot-swap 12Gb/s", total: 1, deployed: 0, inRepair: 0, price: 320 },
  { id: "sku-hdd-nvme", name: "1TB NVMe SSD (M.2)", category: "peripheral", model: "M.2 Gen3", total: 0, deployed: 0, inRepair: 0, price: 150 },
  { id: "sku-ssd-500", name: "500GB SATA SSD", category: "peripheral", model: "Consumer", total: 1, deployed: 0, inRepair: 0, price: 85 },
  { id: "sku-ssd-1", name: "1TB NVMe SSD (Gen4)", category: "peripheral", model: "M.2 Gen4", total: 0, deployed: 0, inRepair: 0, price: 190 },
  { id: "sku-ssd-2", name: "2TB Enterprise NVMe", category: "peripheral", model: "U.2 mixed-use", total: 0, deployed: 0, inRepair: 0, price: 480 },
  { id: "sku-psu-750", name: "750W Platinum PSU", category: "power", model: "Redundant", total: 0, deployed: 0, inRepair: 0, price: 260 },
  { id: "sku-gpu-pro", name: "Pro GPU 16GB", category: "peripheral", model: "Workstation", total: 0, deployed: 0, inRepair: 0, price: 1600 },
  { id: "sku-nic-10g", name: "10GbE NIC (dual-port)", category: "peripheral", model: "Dual-port", total: 0, deployed: 0, inRepair: 0, price: 340 },

  // ── Peripherals ─────────────────────────────────────────────────────────
  { id: "sku-mouse", name: "USB Optical Mouse", category: "peripheral", model: "PM-100", total: 4, deployed: 2, inRepair: 0, price: 18 },
  { id: "sku-keyboard", name: "USB Keyboard (UK)", category: "peripheral", model: "KB-210", total: 3, deployed: 2, inRepair: 1, price: 24 },
  { id: "sku-monitor", name: "24\" IPS Monitor", category: "peripheral", model: "MN-241", total: 2, deployed: 2, inRepair: 0, price: 210 },
  { id: "sku-dock", name: "USB-C Docking Station", category: "peripheral", model: "DK-300", total: 1, deployed: 1, inRepair: 0, price: 175 },

  // ── Cables — the rack lab consumes one per connection ────────────────────
  { id: "sku-rj45-1m", name: "RJ45 Patch Cable 1m", category: "cable", model: "Cat6 / blue", total: 4, deployed: 1, inRepair: 0, price: 6 },
  { id: "sku-rj45-3m", name: "RJ45 Patch Cable 3m", category: "cable", model: "Cat6 / grey", total: 3, deployed: 1, inRepair: 0, price: 9 },
  { id: "sku-power-c13", name: "Power Lead C13", category: "cable", model: "IEC C13", total: 4, deployed: 1, inRepair: 0, price: 7 },

  // ── Network / rack hardware ─────────────────────────────────────────────
  { id: "sku-sw-24p", name: "24-Port Gigabit Switch", category: "network", model: "CS-2400", total: 1, deployed: 0, inRepair: 0, uSize: 1, deviceKind: "switch", price: 1250 },
  { id: "sku-router", name: "Edge Router", category: "network", model: "ER-800", total: 1, deployed: 1, inRepair: 0, uSize: 1, deviceKind: "router", price: 2100 },
  { id: "sku-fw", name: "Firewall Appliance", category: "network", model: "FW-450", total: 0, deployed: 0, inRepair: 0, uSize: 1, deviceKind: "firewall", price: 3400 },
  { id: "sku-patch-24", name: "24-Port Patch Panel", category: "panel", model: "PP-24", total: 1, deployed: 0, inRepair: 0, uSize: 1, deviceKind: "patch-panel", price: 320 },
  { id: "sku-srv-1u", name: "Rack Server 1U", category: "server", model: "RS-100", total: 1, deployed: 0, inRepair: 0, uSize: 1, deviceKind: "server", price: 4200 },
  { id: "sku-srv-2u", name: "Rack Server 2U (storage)", category: "server", model: "RS-220", total: 0, deployed: 0, inRepair: 0, uSize: 2, deviceKind: "server", price: 6800 },
  { id: "sku-ups-2u", name: "UPS 1500VA", category: "power", model: "UPS-1500", total: 1, deployed: 0, inRepair: 0, uSize: 2, deviceKind: "ups", price: 890 },
  { id: "sku-pdu-1u", name: "Rack PDU 8-way", category: "power", model: "PDU-8", total: 1, deployed: 0, inRepair: 0, uSize: 1, deviceKind: "pdu", price: 410 },
];

export function createInventory(): InventoryState {
  return { items: catalogue.map((i) => ({ ...i })), allocations: [] };
}

export function createRack(): RackState {
  return { sizeU: RACK_SIZE_U, devices: [], cables: [], tests: [] };
}
