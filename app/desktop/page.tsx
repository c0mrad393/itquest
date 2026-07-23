import HostDesktop from "@/components/host/HostDesktop";
import AuthGate from "@/components/auth/AuthGate";

/**
 * /desktop — the Level-0 host workstation, gated by authentication.
 * The Google OAuth redirect also lands here; the auth store detects the
 * session in the URL (PKCE) and the gate opens once it resolves.
 */
export default function DesktopPage() {
  return (
    <AuthGate>
      <HostDesktop />
    </AuthGate>
  );
}
