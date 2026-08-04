/**
 * TriageOS — Store-room seed
 * ==========================
 * The starting asset catalogue and an empty rack.
 *
 * SCARCITY IS THE POINT (v0.2.1). The desk opens with a nearly bare store
 * room: enough to start one job, not enough to finish the week. Restocking
 * means opening Procurement and spending IT Budget.
 *
 * SPECIFICITY IS THE POINT (v0.2.2). The catalogue carries fictional
 * enterprise brands and real machine-readable traits, and deliberately stocks
 * NEAR-MISSES: DDR4 beside DDR5, non-ECC beside ECC, SATA beside NVMe. The
 * Hardware Lab matches traits against the job's requirement, so ordering the
 * wrong generation is a costly mistake the player makes once.
 *
 * Units live in four lifecycle buckets (spare / deployed / inTransit /
 * faulty); `price` present means Procurement can restock it.
 */

import type { AssetItem, InventoryState, RackState } from "@/lib/core";
import { RACK_SIZE_U } from "@/lib/core";

/** Fictional enterprise vendors. No real trademarks anywhere in the estate. */
export const BRANDS = [
  "Kinetix", // memory
  "Halcyon", // storage
  "AeroSwitch", // networking
  "NexaCore", // servers & workstations
  "Voltix", // power
  "Stratos", // components (NIC/GPU)
  "Meridian", // cables & peripherals
] as const;

const catalogue: AssetItem[] = [
  // ── Workstations ────────────────────────────────────────────────────────
  { id: "sku-laptop-14", name: "UltraBook 14 i7", brand: "NexaCore", category: "workstation", model: "NB-1470",
    spare: 0, deployed: 7, inTransit: 0, faulty: 1, price: 1450,
    traits: { capacityGb: 512, busInterface: "NVMe", formFactor: "14in" } },
  { id: "sku-desktop-sff", name: "Desktop SFF i5", brand: "NexaCore", category: "workstation", model: "DT-540S",
    spare: 1, deployed: 11, inTransit: 0, faulty: 0, price: 980,
    traits: { capacityGb: 256, formFactor: "SFF" } },

  // ── Memory — the compatibility trap lives here ──────────────────────────
  { id: "sku-ram-8", name: "Kinetix 8GB DDR4-3200", brand: "Kinetix", category: "memory", model: "KX-D4-8E",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, price: 60,
    traits: { capacityGb: 8, memoryType: "DDR4", speedMts: 3200, ecc: true, formFactor: "DIMM" } },
  { id: "sku-ram-16-d4", name: "Kinetix 16GB DDR4-3200 ECC", brand: "Kinetix", category: "memory", model: "KX-D4-16E",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 110,
    traits: { capacityGb: 16, memoryType: "DDR4", speedMts: 3200, ecc: true, formFactor: "DIMM" } },
  { id: "sku-ram-16-d5", name: "Kinetix 16GB DDR5-4800 ECC", brand: "Kinetix", category: "memory", model: "KX-D5-16E",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 165,
    traits: { capacityGb: 16, memoryType: "DDR5", speedMts: 4800, ecc: true, formFactor: "DIMM" } },
  { id: "sku-ram-32-d4", name: "Kinetix 32GB DDR4-3200 non-ECC", brand: "Kinetix", category: "memory", model: "KX-D4-32U",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 190,
    traits: { capacityGb: 32, memoryType: "DDR4", speedMts: 3200, ecc: false, formFactor: "DIMM" } },
  { id: "sku-ram-32-d5", name: "Kinetix 32GB DDR5-4800 ECC", brand: "Kinetix", category: "memory", model: "KX-D5-32E",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, price: 240,
    traits: { capacityGb: 32, memoryType: "DDR5", speedMts: 4800, ecc: true, formFactor: "DIMM" } },
  { id: "sku-ram-64-d5", name: "Kinetix 64GB DDR5-5600 ECC", brand: "Kinetix", category: "memory", model: "KX-D5-64E",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 520,
    traits: { capacityGb: 64, memoryType: "DDR5", speedMts: 5600, ecc: true, formFactor: "DIMM" } },

  // ── Storage — SATA / SAS / NVMe sit side by side on purpose ─────────────
  { id: "sku-hdd-1", name: "Halcyon 1TB 7.2K SATA", brand: "Halcyon", category: "storage", model: "HC-S1000",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 70,
    traits: { capacityGb: 1024, busInterface: "SATA", formFactor: "3.5in", hotSwap: false } },
  { id: "sku-sas-2", name: "Halcyon 2TB Enterprise SAS", brand: "Halcyon", category: "storage", model: "HC-A2000",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, price: 320,
    traits: { capacityGb: 2048, busInterface: "SAS", formFactor: "2.5in", hotSwap: true } },
  { id: "sku-sas-4", name: "Halcyon 4TB Enterprise SAS", brand: "Halcyon", category: "storage", model: "HC-A4000",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 610,
    traits: { capacityGb: 4096, busInterface: "SAS", formFactor: "2.5in", hotSwap: true } },
  { id: "sku-ssd-500", name: "Halcyon 500GB SATA SSD", brand: "Halcyon", category: "storage", model: "HC-V500",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, price: 85,
    traits: { capacityGb: 512, busInterface: "SATA", formFactor: "2.5in", hotSwap: false } },
  { id: "sku-nvme-1", name: "Halcyon 1TB NVMe Gen4", brand: "Halcyon", category: "storage", model: "HC-N1000",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 190,
    traits: { capacityGb: 1024, busInterface: "NVMe", formFactor: "M.2 2280", hotSwap: false } },
  { id: "sku-nvme-2", name: "Halcyon 2TB NVMe U.2 mixed-use", brand: "Halcyon", category: "storage", model: "HC-N2000U",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 480,
    traits: { capacityGb: 2048, busInterface: "NVMe", formFactor: "U.2", hotSwap: true } },

  // ── Components ──────────────────────────────────────────────────────────
  { id: "sku-psu-750", name: "Voltix 750W Platinum", brand: "Voltix", category: "component", model: "VX-P750",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 260, traits: { watts: 750, hotSwap: true } },
  { id: "sku-psu-1200", name: "Voltix 1200W Titanium", brand: "Voltix", category: "component", model: "VX-T1200",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 480, traits: { watts: 1200, hotSwap: true } },
  { id: "sku-gpu-pro", name: "Stratos Pro GPU 16GB", brand: "Stratos", category: "component", model: "ST-G16",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 1600,
    traits: { capacityGb: 16, busInterface: "PCIe", formFactor: "dual-slot" } },
  { id: "sku-nic-10g", name: "Stratos 10GbE NIC dual-port", brand: "Stratos", category: "component", model: "ST-N10D",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 340, traits: { busInterface: "PCIe" } },

  // ── Peripherals ─────────────────────────────────────────────────────────
  { id: "sku-mouse", name: "Meridian USB Optical Mouse", brand: "Meridian", category: "peripheral", model: "PM-100",
    spare: 2, deployed: 2, inTransit: 0, faulty: 0, price: 18, traits: { busInterface: "USB" } },
  { id: "sku-keyboard", name: "Meridian USB Keyboard UK", brand: "Meridian", category: "peripheral", model: "KB-210",
    spare: 0, deployed: 2, inTransit: 0, faulty: 1, price: 24, traits: { busInterface: "USB" } },
  { id: "sku-monitor", name: "NexaCore 24in IPS Monitor", brand: "NexaCore", category: "peripheral", model: "MN-241",
    spare: 0, deployed: 2, inTransit: 0, faulty: 0, price: 210, traits: { formFactor: "24in" } },
  { id: "sku-dock", name: "Meridian USB-C Dock", brand: "Meridian", category: "peripheral", model: "DK-300",
    spare: 0, deployed: 1, inTransit: 0, faulty: 0, price: 175, traits: { busInterface: "USB" } },

  // ── Cables ──────────────────────────────────────────────────────────────
  { id: "sku-rj45-1m", name: "Meridian Cat6 Patch 1m", brand: "Meridian", category: "cable", model: "MC-C6-1",
    spare: 3, deployed: 1, inTransit: 0, faulty: 0, price: 6 },
  { id: "sku-rj45-3m", name: "Meridian Cat6 Patch 3m", brand: "Meridian", category: "cable", model: "MC-C6-3",
    spare: 2, deployed: 1, inTransit: 0, faulty: 0, price: 9 },
  { id: "sku-power-c13", name: "Voltix Power Lead C13", brand: "Voltix", category: "cable", model: "VX-C13",
    spare: 3, deployed: 1, inTransit: 0, faulty: 0, price: 7 },

  // ── Network ─────────────────────────────────────────────────────────────
  { id: "sku-sw-24p", name: "AeroSwitch 24-Port Gigabit", brand: "AeroSwitch", category: "network", model: "AS-2400",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, uSize: 1, deviceKind: "switch", price: 1250 , traits: { watts: 180 } },
  { id: "sku-sw-48p", name: "AeroSwitch 48-Port 10GbE", brand: "AeroSwitch", category: "network", model: "AS-4810",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, uSize: 1, deviceKind: "switch", price: 3900 , traits: { watts: 320 } },
  { id: "sku-router", name: "AeroSwitch Edge Router", brand: "AeroSwitch", category: "network", model: "AS-ER800",
    spare: 0, deployed: 1, inTransit: 0, faulty: 0, uSize: 1, deviceKind: "router", price: 2100 , traits: { watts: 140 } },
  { id: "sku-fw", name: "AeroSwitch Firewall Appliance", brand: "AeroSwitch", category: "network", model: "AS-FW450",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, uSize: 1, deviceKind: "firewall", price: 3400 , traits: { watts: 160 } },
  { id: "sku-patch-24", name: "Meridian 24-Port Patch Panel", brand: "Meridian", category: "panel", model: "MP-24",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, uSize: 1, deviceKind: "patch-panel", price: 320 , traits: { watts: 0 } },

  // ── Servers & power ─────────────────────────────────────────────────────
  { id: "sku-srv-1u", name: "NexaCore Rack Server 1U", brand: "NexaCore", category: "server", model: "NC-R100",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, uSize: 1, deviceKind: "server", price: 4200 , traits: { watts: 250 } },
  { id: "sku-srv-2u", name: "NexaCore Storage Server 2U", brand: "NexaCore", category: "server", model: "NC-R220",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, uSize: 2, deviceKind: "server", price: 6800 , traits: { watts: 750 } },
  { id: "sku-ups-2u", name: "Voltix UPS 1500VA", brand: "Voltix", category: "power", model: "VX-U1500",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, uSize: 2, deviceKind: "ups", price: 890 },
  { id: "sku-pdu-1u", name: "Voltix Rack PDU 8-way", brand: "Voltix", category: "power", model: "VX-PDU8",
    spare: 1, deployed: 0, inTransit: 0, faulty: 0, uSize: 1, deviceKind: "pdu", price: 410 },

  { id: "sku-pdu-30a", name: "Voltix High-Density PDU 208V/30A", brand: "Voltix", category: "power", model: "VX-PDU30",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 1850, traits: { watts: 6240 } },

  // ── Cooling (v0.3.1) ────────────────────────────────────────────────────
  // Every cooling unit is itself a load on the PDU: the CRAC removes 18C but
  // costs 450W, which is the whole tension — you cool the rack by spending the
  // power budget you were trying to use for compute.
  { id: "sku-fan-1u", name: "Voltix 1U Fan Tray", brand: "Voltix", category: "power", model: "VX-FT1",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, uSize: 1, deviceKind: "fan-tray", price: 320,
    traits: { watts: 80 } },
  { id: "sku-crac-2u", name: "Voltix 2U In-Rack CRAC", brand: "Voltix", category: "power", model: "VX-CR2",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, uSize: 2, deviceKind: "crac", price: 2650,
    traits: { watts: 450 } },
  { id: "sku-liquid-kit", name: "Voltix Liquid Cooling Kit", brand: "Voltix", category: "component", model: "VX-LQ1",
    spare: 0, deployed: 0, inTransit: 0, faulty: 0, price: 540, traits: { watts: 15 } },
];

export function createInventory(): InventoryState {
  return { items: catalogue.map((i) => ({ ...i })), allocations: [], orders: [] };
}

export function createRack(): RackState {
  return {
    sizeU: RACK_SIZE_U,
    devices: [],
    cables: [],
    tests: [],
    pduId: "pdu-20a",
    breakerTripped: false,
    trippedAt: null,
  };
}
