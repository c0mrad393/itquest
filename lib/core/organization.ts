/**
 * ITQuest — Organization & topology models (procedural world)
 * ============================================================
 * Every user gets a generated org: identity, scale, and a network topology.
 * The OrganizationProfile is embedded in InfrastructureState so it persists
 * with the world and can be regenerated bit-identically from `seed`.
 */

import type { HostAppIconId } from "./host";

export type Sector = "finance" | "healthcare" | "tech" | "retail";

export type OrgScale = "small" | "midmarket" | "enterprise";

export type TopologyKind = "star" | "hybrid-mesh" | "segmented-vlan" | "multi-subnet";

export interface OrganizationProfile {
  id: string; // "org-<seed hex>"
  /** PRNG seed — the whole world is a pure function of this. */
  seed: number;
  name: string; // "Novabank Capital"
  sector: Sector;
  scale: OrgScale;
  /** Internal AD DNS zone, e.g. "novabank.internal". */
  domain: string;
  netbios: string; // "NOVABANK"
  employeeCount: number; // directory size (>= 100 for all scales)
  foundedYear: number;
  topologyKind: TopologyKind;
}

export const SECTOR_META: Record<Sector, { label: string; iconId: HostAppIconId }> = {
  finance: { label: "Financial Services", iconId: "bank" },
  healthcare: { label: "Healthcare", iconId: "health" },
  tech: { label: "Technology", iconId: "cpu" },
  retail: { label: "Retail & E-commerce", iconId: "store" },
};

export const SCALE_META: Record<
  OrgScale,
  { label: string; nodeRange: [number, number]; employeeRange: [number, number] }
> = {
  small: { label: "Small Business", nodeRange: [3, 3], employeeRange: [100, 140] },
  midmarket: { label: "Mid-Market", nodeRange: [5, 6], employeeRange: [160, 260] },
  enterprise: { label: "Large Enterprise", nodeRange: [7, 12], employeeRange: [300, 480] },
};
