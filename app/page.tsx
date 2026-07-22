import HostDesktop from "@/components/host/HostDesktop";

/**
 * TriageOS root — the Level-0 host workstation.
 * The prior single-node CLI/GUI workspace lives at /node-demo and becomes the
 * nested remote-session content in Phase 3–4.
 */
export default function Page() {
  return <HostDesktop />;
}
