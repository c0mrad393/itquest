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
export const metadata: Metadata = {
  title: "ITQuest Admin",
  description: "Platform administration for ITQuest — users, scenarios and subscriptions.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
