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

/**
 * `fan` is the cooling module (QA2).
 *
 * Added rather than folded into `component`, because the thermal cascade asks
 * the operator to replace a specific part and the bench has to name it
 * correctly. Mapping it onto "PSU" would have been quicker and would have had
 * the work order tell the player to swap a power supply to fix a heat problem.
 */
export type ComponentKind = "ram" | "hdd" | "ssd" | "psu" | "gpu" | "nic" | "fan";
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
  ram: "Memory (DIMM)", hdd: "Hard Drive", ssd: "SSD", psu: "Power Supply", gpu: "Graphics Card", nic: "Network Card", fan: "Cooling module",
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
  fan: "component",
};

// ── Job derivation ───────────────────────────────────────────────────────────

/**
 * Tags that mean "somebody has to physically touch a machine".
 *
 * TAGS, NOT ID PREFIXES — and that change is the whole bug fix.
 *
 * This used to be `templateId.startsWith("hw-")`, which recognised the nine
 * hand-authored hardware scenarios and none of the THIRTY-TWO procedural
 * families, whose ids all look like `gen-ram-upgrade-1-2`. So a player given a
 * procedurally generated RAM upgrade opened the Hardware Lab and found it
 * empty — the ticket asked for a part swap that the app responsible for part
 * swaps did not believe existed.
 *
 * The ambient engine made this far worse, because it draws mostly from the
 * procedural library. Recognition now asks what the ticket NEEDS rather than
 * what it is called, so any template tagged for physical work appears, and a
 * family added next month appears without touching this file.
 */
export const HARDWARE_TAGS = [
  "hardware",
  "ram",
  "disk",
  "ssd",
  "raid",
  "storage",
  "bios",
  "imaging",
  "peripheral",
  "thermal-module",
] as const;

export function isHardwareTicket(templateId: string, tags: string[] = []): boolean {
  if (templateId.startsWith("hw-") || templateId.startsWith("sw-v2-")) return true;
  return tags.some((t) => (HARDWARE_TAGS as readonly string[]).includes(t));
}

type Ctx = {
  id: string;
  templateId: string;
  title?: string;
  tags?: string[];
  dynamicContext: { targetNodeId?: string; targetHostname?: string };
};

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
      // Not a hand-authored set-piece — derive one from what the ticket asks
      // for. See `derivedJob`.
      return derivedJob(t, base);
  }
}

/**
 * A workshop job built from a ticket's TAGS and its target node.
 *
 * WHY THIS EXISTS. The switch above is a lookup table of nine bespoke
 * scenarios, each with hand-tuned parts and BIOS requirements. That is the
 * right shape for a set-piece and hopeless as the only shape: the procedural
 * generator emits thirty-two families and nobody is going to hand-write a job
 * for each variant of each of them.
 *
 * So anything not in the table gets a job assembled from what it needs. The
 * result is deliberately simpler than the bespoke ones — one defective part,
 * the stages that part actually requires — because a derived job that invented
 * BIOS constraints the ticket never mentioned would be fiction the player
 * cannot reason about.
 *
 * Returns null only when there is genuinely nothing physical to do, which is
 * what keeps non-hardware tickets out of the Lab.
 */
function derivedJob(t: Ctx, base: { ticketId: string; targetNodeId: string; targetHostname: string; title: string }): HardwareJob | null {
  const tags = t.tags ?? [];
  const has = (x: string) => tags.includes(x);

  // The part comes from the tag that names it. Order matters: a ticket tagged
  // both `raid` and `disk` is a disk job, and calling it memory would send the
  // player to the bench with the wrong tray open.
  const component: ComponentKind | null = has("thermal-module") || has("cooling")
    ? "fan"
    : has("ram")
    ? "ram"
    : has("ssd") || has("raid")
      ? "ssd"
      : has("disk") || has("storage")
        ? "hdd"
        : has("nic")
          ? "nic"
          : has("psu")
            ? "psu"
            : null;

  const wantsBios = has("bios") || has("boot");
  const wantsImaging = has("imaging") || has("reimage") || has("os");

  if (!component && !wantsBios && !wantsImaging) return null;

  const stages: WorkshopStage[] = [];
  if (component) stages.push("assembly");
  if (wantsBios) stages.push("bios");
  if (wantsImaging) stages.push("imaging");

  // A server chassis and a laptop are opened differently, and the bench draws
  // the right one — inferred from the hostname the ticket already carries
  // rather than stored a second time.
  const host = base.targetHostname.toUpperCase();
  const archetype: DeviceArchetype = /^(MAC|WS|LT|LAP)/.test(host)
    ? host.startsWith("MAC") || host.startsWith("LT") || host.startsWith("LAP")
      ? "laptop"
      : "desktop"
    : /FS|PDC|BDC|SQL|WEB|NVR|SRV/.test(host)
      ? "server"
      : "desktop";

  return {
    ...base,
    stages: stages.length ? stages : ["assembly"],
    assembly: component
      ? {
          archetype,
          defective: component,
          replacementLabel: componentLabel(component),
          /*
           * An OPEN requirement: any store-room SKU of the right class fits.
           *
           * The bespoke scenarios pin exact specs — DDR5, ECC, 32GB minimum —
           * because those tickets are ABOUT getting the spec right. A generic
           * procedural upgrade is not, and inventing a constraint the ticket
           * never stated would fail the player for a rule they were never told.
           */
          requirement: {},
          count: 1,
          battery: archetype === "laptop",
          baffle: archetype === "server",
          screws: archetype === "server" ? 4 : 3,
          cabling: [],
        }
      : undefined,
    bios: wantsBios ? { requireBootOrder: "Disk" } : undefined,
    imaging: wantsImaging
      ? { os: "windows", phases: ["partition", "network"], requiredPartitions: ["EFI", "WINDOWS"], mode: "install" }
      : undefined,
  };
}
