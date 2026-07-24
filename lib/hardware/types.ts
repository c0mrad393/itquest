/**
 * TriageOS — Hardware Provisioning models
 * =======================================
 * Data for the Hardware Lab: replaceable components, stock inventory, and the
 * per-ticket "job" that maps a hardware ticket to the workshop steps required
 * before a field team can be dispatched.
 */

export type ComponentKind = "ram" | "hdd" | "ssd" | "psu" | "gpu" | "nic";

export interface HardwareComponent {
  id: string;
  kind: ComponentKind;
  label: string; // "16GB DDR4", "Failed HDD"
  /** Renders the flashing-red "defective" treatment and is the extract target. */
  defective?: boolean;
}

export interface StockItem {
  id: string;
  kind: ComponentKind;
  label: string; // "32GB DDR5"
  spec: string; // "PC5-44800 · ECC"
}

export type WorkshopStep = "assembly" | "os-install";
export type HardwareJobKind = "workstation-rebuild" | "server-disk-swap";

export interface HardwareJob {
  ticketId: string;
  targetNodeId: string;
  targetHostname: string;
  kind: HardwareJobKind;
  /** Component the player must extract + replace in the Assembly sim. */
  defective: ComponentKind;
  /** The replacement the player must snap in (correct stock item). */
  replacementLabel: string;
  requiredSteps: WorkshopStep[];
  /** Chassis flavor for the Assembly blueprint. */
  chassis: "desktop" | "rack";
}

const COMPONENT_META: Record<ComponentKind, { label: string; glyph: string }> = {
  ram: { label: "Memory (DIMM)", glyph: "▤" },
  hdd: { label: "Hard Drive", glyph: "▥" },
  ssd: { label: "Solid State Drive", glyph: "▤" },
  psu: { label: "Power Supply", glyph: "▧" },
  gpu: { label: "Graphics Card", glyph: "▦" },
  nic: { label: "Network Card", glyph: "▤" },
};

export function componentLabel(kind: ComponentKind): string {
  return COMPONENT_META[kind].label;
}
export function componentGlyph(kind: ComponentKind): string {
  return COMPONENT_META[kind].glyph;
}

/** Stock shelves the player picks a replacement from (per component kind). */
export const STOCK_INVENTORY: Record<ComponentKind, StockItem[]> = {
  ram: [
    { id: "ram-8", kind: "ram", label: "8GB DDR4", spec: "PC4-25600" },
    { id: "ram-16", kind: "ram", label: "16GB DDR4", spec: "PC4-25600" },
    { id: "ram-32", kind: "ram", label: "32GB DDR5", spec: "PC5-44800 · ECC" },
  ],
  hdd: [
    { id: "hdd-1", kind: "hdd", label: "1TB 7.2K SATA", spec: "Consumer" },
    { id: "hdd-2", kind: "hdd", label: "2TB Enterprise SAS", spec: "Hot-swap · 12Gb/s" },
    { id: "ssd-nvme", kind: "hdd", label: "1TB NVMe SSD", spec: "M.2 · not hot-swap" },
  ],
  ssd: [{ id: "ssd-1", kind: "ssd", label: "1TB NVMe SSD", spec: "M.2 Gen4" }],
  psu: [{ id: "psu-1", kind: "psu", label: "750W Platinum", spec: "Redundant" }],
  gpu: [{ id: "gpu-1", kind: "gpu", label: "Pro GPU 16GB", spec: "Workstation" }],
  nic: [{ id: "nic-1", kind: "nic", label: "10GbE NIC", spec: "Dual-port" }],
};

/** Map a hardware ticket (by templateId) to its provisioning job. */
export function jobForTicket(t: {
  id: string;
  templateId: string;
  dynamicContext: { targetNodeId?: string; targetHostname?: string };
}): HardwareJob | null {
  const targetNodeId = t.dynamicContext.targetNodeId;
  const targetHostname = t.dynamicContext.targetHostname ?? "UNKNOWN";
  if (!targetNodeId) return null;

  if (t.templateId === "hw-t1-ram-upgrade") {
    return {
      ticketId: t.id,
      targetNodeId,
      targetHostname,
      kind: "workstation-rebuild",
      defective: "ram",
      replacementLabel: "32GB DDR5",
      requiredSteps: ["assembly", "os-install"],
      chassis: "desktop",
    };
  }
  if (t.templateId === "hw-t2-rack-disk") {
    return {
      ticketId: t.id,
      targetNodeId,
      targetHostname,
      kind: "server-disk-swap",
      defective: "hdd",
      replacementLabel: "2TB Enterprise SAS",
      requiredSteps: ["assembly"],
      chassis: "rack",
    };
  }
  return null;
}

/** True when a ticket is a Hardware Lab deployment ticket. */
export function isHardwareTicket(templateId: string): boolean {
  return templateId.startsWith("hw-");
}
