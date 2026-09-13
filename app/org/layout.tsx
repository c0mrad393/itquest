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
/*
 * NOT INDEXED, and that is the honest form of the curtain.
 *
 * These consoles are statically prerendered and publicly reachable — there is
 * no sign-in yet to put in front of them, and a password prompt with no server
 * behind it would be theatre that reads as security to anyone who met it.
 *
 * What IS true and worth acting on: neither page should turn up in a search
 * result, where it would be found out of context by someone with no reason to
 * know the figures are invented. The banners say so on the page; this keeps
 * the page from being met without them.
 *
 * When accounts arrive this becomes a real gate and the directive can stay —
 * an internal console has no business in an index either way.
 */
export const metadata: Metadata = {
  title: "ITQuest for Institutions",
  description: "Cohort progress, assignments and outcomes for an ITQuest institution.",
  robots: { index: false, follow: false },
};

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-sunken text-gray-200">{children}</div>;
}
