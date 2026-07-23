"use client";

/**
 * AuthGate — protects the Host OS route.
 * --------------------------------------
 * loading   → boot splash (session being resolved / OAuth callback landing)
 * signedIn  → render the desktop
 * guest     → render the desktop (local-only session)
 * signedOut → redirect to the landing page
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (status === "signedOut") router.replace("/");
  }, [status, router]);

  if (status === "signedIn" || status === "guest") return <>{children}</>;

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#04070f] font-sans">
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-info/20 text-2xl text-info">
        ◈
      </div>
      <div className="text-sm font-semibold text-gray-300">TriageOS</div>
      <div className="text-[11px] text-gray-600">
        {status === "loading" ? "Restoring your session…" : "Redirecting…"}
      </div>
    </div>
  );
}
