import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";

/**
 * The admin panel is a SEPARATE ROUTE TREE from the simulator.
 *
 * `/admin/*` gets its own layout, so nothing under it mounts HostDesktop, the
 * window manager, the tutorial director or any of the headless engines — and
 * nothing in the simulator has to know the panel exists. Two products, one
 * repository, one design-token layer.
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
  title: "ITQuest Admin",
  description: "Platform administration for ITQuest — users, scenarios and subscriptions.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
