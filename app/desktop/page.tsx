import HostDesktop from "@/components/host/HostDesktop";

/**
 * /desktop — the Level-0 host workstation.
 *
 * No gate: v0.7.0 removed the authentication layer, so there is nothing to
 * sign in to and nothing to protect. The desktop hydrates the local save on
 * mount and gets on with it.
 */
export default function DesktopPage() {
  return <HostDesktop />;
}
