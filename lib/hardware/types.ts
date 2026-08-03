/**
 * TriageOS — Hardware Provisioning models (v2)
 * ============================================
 * A hyper-realistic, multi-stage provisioning pipeline. Each hardware/software
 * ticket maps to a HardwareJob whose `stages` drive the Workshop:
 *   assembly → device-specific teardown (screws, cables, battery, baffle)
 *   bios     → text BIOS (Secure Boot / SATA mode / boot order / RAID)
 *   imaging  → manual partitioning → TCP/IP → domain join
 */

import type { AssetCategory, HardwareRequirement } from "@/lib/core";

export type ComponentKind = "ram" | "hdd" | "ssd" | "psu" | "gpu" | "nic";
export type DeviceArchetype = "desktop" | "laptop" | "server";
export type WorkshopStage = "assembly" | "bios" | "imaging";
export type ImagingPhase = "partition" | "network" | "domain";
export type PartitionKind = "EFI" | "MSR" | "WINDOWS" | "LINUX";



/** Component-swap + physical-teardown requirements for the Assembly stage. */
export interface AssemblySpec {
  archetype: DeviceArchetype;
  defective: ComponentKind;
  /** Human label for the part needed, shown on the work order. */
  replacementLabel: string;
  /**
   * Machine-readable spec the fitted part must satisfy. The bench checks the
   * chosen SKU's traits against this, so ordering DDR4 for a DDR5 board is a
   * real, expensive mistake rather than a naming difference.
   */
  requirement: HardwareRequirement;
  /** SKU the extracted faulty unit is booked back against. */
  defectiveSkuId?: string;
  /** How many replacement units to seat (2 = RAID pair). */
  count: number;
  /** Laptop: battery must be disconnected before, reconnected after. */
  battery: boolean;
  /** Server: air baffle must be removed to reach the tray. */
  baffle: boolean;
  /** Number of chassis screws to drive (hold-to-fasten). */
  screws: number;
  /** Internal cable routes to connect (source port → destination port). */
  cabling: { from: string; to: string }[];
}

/** BIOS/UEFI states a ticket requires before imaging can succeed. */
export interface BiosSpec {
  requireSecureBoot?: boolean; // must equal this value
  requireSataMode?: "AHCI" | "RAID";
  requireBootOrder?: "PXE" | "Disk";
  /** Build a mirrored array across two disks in BIOS. */
  requireRaid?: "RAID1";
}

export interface ImagingSpec {
  os: "windows" | "linux";
  phases: ImagingPhase[];
  /** Partition set the player must create (order-independent). */
  requiredPartitions: PartitionKind[];
  /** "repair" = existing box, unjoin then rejoin (trust-relationship fix). */
  mode: "install" | "repair";
}

export interface HardwareJob {
  ticketId: string;
  targetNodeId: string;
  targetHostname: string;
  title: string;
  stages: WorkshopStage[];
  assembly?: AssemblySpec;
  bios?: BiosSpec;
  imaging?: ImagingSpec;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const LAB_DOMAIN = "triageos.corp";
/** High-privilege deployment credential (shown in the in-app vault card). */
export const LAB_ADMIN = { user: "administrator", password: "Depl0y!Adm1n" };

export const STAGE_LABEL: Record<WorkshopStage, string> = {
  assembly: "Bench assembly",
  bios: "BIOS / UEFI",
  imaging: "OS imaging",
};

const COMPONENT_META: Record<ComponentKind, string> = {
  ram: "Memory (DIMM)", hdd: "Hard Drive", ssd: "SSD", psu: "Power Supply", gpu: "Graphics Card", nic: "Network Card",
};
export const componentLabel = (k: ComponentKind) => COMPONENT_META[k];

/**
 * Which part of the asset catalogue a component kind draws from. The bench
 * lists real store-room SKUs for that class rather than a hardcoded parts
 * list, so brands, specs and stock levels are all one source of truth.
 */
export const COMPONENT_CATEGORY: Record<ComponentKind, AssetCategory> = {
  ram: "memory",
  hdd: "storage",
  ssd: "storage",
  psu: "component",
  gpu: "component",
  nic: "component",
};

// ── Job derivation ───────────────────────────────────────────────────────────

export function isHardwareTicket(templateId: string): boolean {
  return templateId.startsWith("hw-") || templateId.startsWith("sw-v2-");
}

type Ctx = { id: string; templateId: string; title?: string; dynamicContext: { targetNodeId?: string; targetHostname?: string } };

export function jobForTicket(t: Ctx): HardwareJob | null {
  const targetNodeId = t.dynamicContext.targetNodeId;
  const targetHostname = t.dynamicContext.targetHostname ?? "UNKNOWN";
  if (!targetNodeId) return null;
  const base = { ticketId: t.id, targetNodeId, targetHostname, title: t.title ?? "" };

  switch (t.templateId) {
    case "hw-t1-ram-upgrade":
      return {
        ...base,
        stages: ["assembly", "bios", "imaging"],
        assembly: { archetype: "desktop", defective: "ram", replacementLabel: "32GB DDR5", requirement: { memoryType: "DDR5", ecc: true, minCapacityGb: 32 }, defectiveSkuId: "sku-ram-8", count: 1, battery: false, baffle: false, screws: 3, cabling: [] },
        bios: { requireSecureBoot: true, requireBootOrder: "Disk" },
        imaging: { os: "windows", phases: ["partition", "network", "domain"], requiredPartitions: ["EFI", "MSR", "WINDOWS"], mode: "install" },
      };
    case "hw-t2-rack-disk":
      return {
        ...base,
        stages: ["assembly"],
        assembly: { archetype: "server", defective: "hdd", replacementLabel: "2TB Enterprise SAS", requirement: { busInterface: "SAS", minCapacityGb: 2048, hotSwap: true }, defectiveSkuId: "sku-sas-2", count: 1, battery: false, baffle: true, screws: 2, cabling: [{ from: "SAS-B", to: "Backplane-2" }] },
      };
    case "hw-v2-raid-rebuild":
      return {
        ...base,
        stages: ["assembly", "bios", "imaging"],
        assembly: { archetype: "desktop", defective: "hdd", replacementLabel: "2TB Enterprise SAS", requirement: { busInterface: "SAS", minCapacityGb: 2048, hotSwap: true }, defectiveSkuId: "sku-sas-2", count: 2, battery: false, baffle: false, screws: 4, cabling: [{ from: "SATA-PWR", to: "PSU-Rail" }, { from: "SATA-DATA", to: "Board-SATA0" }] },
        bios: { requireSataMode: "RAID", requireRaid: "RAID1", requireSecureBoot: true },
        imaging: { os: "windows", phases: ["partition", "network", "domain"], requiredPartitions: ["EFI", "MSR", "WINDOWS"], mode: "install" },
      };
    case "sw-v2-domain-trust":
      return {
        ...base,
        stages: ["imaging"],
        imaging: { os: "windows", phases: ["domain"], requiredPartitions: [], mode: "repair" },
      };
    case "hw-v2-ceo-laptop":
      return {
        ...base,
        stages: ["assembly", "bios", "imaging"],
        assembly: { archetype: "laptop", defective: "ssd", replacementLabel: "1TB NVMe SSD", requirement: { busInterface: "NVMe", formFactor: "M.2 2280", minCapacityGb: 1024 }, defectiveSkuId: "sku-ssd-500", count: 1, battery: true, baffle: false, screws: 6, cabling: [] },
        bios: { requireSecureBoot: true, requireBootOrder: "Disk" },
        imaging: { os: "windows", phases: ["partition", "domain"], requiredPartitions: ["EFI", "MSR", "WINDOWS"], mode: "install" },
      };
    case "hw-v2-web-node-crash":
      return {
        ...base,
        stages: ["assembly", "bios", "imaging"],
        assembly: { archetype: "server", defective: "ssd", replacementLabel: "2TB Enterprise NVMe", requirement: { busInterface: "NVMe", formFactor: "U.2", minCapacityGb: 2048, hotSwap: true }, defectiveSkuId: "sku-nvme-1", count: 2, battery: false, baffle: true, screws: 4, cabling: [{ from: "NVMe-A", to: "Backplane-1" }, { from: "NVMe-B", to: "Backplane-2" }] },
        bios: { requireSataMode: "RAID", requireRaid: "RAID1" },
        imaging: { os: "linux", phases: ["partition", "network"], requiredPartitions: ["EFI", "LINUX"], mode: "install" },
      };
    case "sw-v2-ransomware-wipe":
      return {
        ...base,
        stages: ["imaging"],
        imaging: { os: "windows", phases: ["partition", "domain"], requiredPartitions: ["EFI", "MSR", "WINDOWS"], mode: "install" },
      };
    case "hw-v2-mobo-swap":
      return {
        ...base,
        stages: ["assembly", "bios", "imaging"],
        assembly: { archetype: "desktop", defective: "ram", replacementLabel: "32GB DDR5", requirement: { memoryType: "DDR5", ecc: true, minCapacityGb: 32 }, defectiveSkuId: "sku-ram-8", count: 1, battery: false, baffle: false, screws: 4, cabling: [{ from: "24pin-ATX", to: "Board-PWR" }, { from: "CPU-8pin", to: "Board-CPU" }] },
        bios: { requireBootOrder: "Disk" },
        imaging: { os: "windows", phases: ["partition", "network", "domain"], requiredPartitions: ["EFI", "MSR", "WINDOWS"], mode: "install" },
      };
    case "sw-v2-efi-repair":
      return {
        ...base,
        stages: ["bios", "imaging"],
        bios: { requireBootOrder: "Disk" },
        imaging: { os: "windows", phases: ["partition"], requiredPartitions: ["EFI"], mode: "repair" },
      };
    default:
      return null;
  }
}
