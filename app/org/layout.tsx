import type { Metadata } from "next";

/**
 * THREE CONSOLES, NOT ONE WEARING HATS.
 *
 * `/admin` is the PLATFORM console — every organisation, billing, system
 * health. It belongs to the people who run ITQuest.
 *
 * `/org` is an INSTITUTION's console. It belongs to an instructor, and it can
 * only ever see their own cohort. That is not a permission filter bolted onto
 * the platform panel: it is a different product with a different question at
 * its centre — not "is the fleet healthy" but "can my class do this exercise".
 *
 * Conflating the two is what made the admin area feel like a pile of features.
 * Separate route trees keep them honestly separate, the same way `/admin` is
 * kept away from the simulator's window manager.
 */
export const metadata: Metadata = {
  title: "ITQuest for Institutions",
  description: "Cohort progress, assignments and outcomes for an ITQuest institution.",
};

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-sunken text-gray-200">{children}</div>;
}
