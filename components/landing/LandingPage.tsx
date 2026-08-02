"use client";

/**
 * TriageOS — Landing page (anonymous entry)
 * -----------------------------------------
 * Marketing homepage for visitors. "Launch Simulator" opens the AuthModal for
 * anonymous users, or deep-links straight to /desktop when a session already
 * exists. Pure presentation — all auth logic lives in the auth store/modal.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import AuthModal from "./AuthModal";
import { AppIcon } from "@/components/ui/app-icons";

const FEATURES = [
  {
    iconId: "keyboard" as const,
    title: "Dual CLI / GUI Workspaces",
    body: "A real sandboxed terminal and full Windows management consoles (ADUC, services.msc, Control Panel) drive one shared infrastructure state — fix incidents whichever way a real engineer would.",
  },
  {
    iconId: "ticket" as const,
    title: "Real-World Ticket Queues",
    body: "Helpdesk, Sysadmin, NetOps and SecOps tracks with authentic faults: 502s from crashed upstreams, AD lockouts, DNS failures, IDMZ exfiltration.",
  },
  {
    iconId: "cpu" as const,
    title: "AI Customer Personas",
    body: "Every ticket has a human on the other end. Emotional states shift with your tone and your speed — CSAT and SLA pressure feed your score.",
  },
  {
    iconId: "monitor" as const,
    title: "Nested Remote Sessions",
    body: "RDP and SSH windows inside your Level-0 workstation. Connect to client nodes through a realistic gateway, handshake and all.",
  },
  {
    iconId: "clock" as const,
    title: "Live SLA Warfare",
    body: "Countdown clocks on every incident. Breach and the customer knows — resolve in time and your XP multiplies.",
  },
  {
    iconId: "trophy" as const,
    title: "Persistent Progression",
    body: "XP, levels, CSAT averages and a global leaderboard. Your record survives every reboot.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const hasSession = status === "signedIn" || status === "guest";

  function launch() {
    if (hasSession) router.push("/desktop");
    else setAuthOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#04070f] font-sans text-gray-200">
      {/* Backdrop glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.18),transparent_55%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_80%_90%,rgba(16,185,129,0.08),transparent_50%)]" />

      {/* Nav */}
      <header className="relative mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/20 text-info">◈</span>
        <span className="text-sm font-bold tracking-wide text-gray-100">TriageOS</span>
        <nav className="ml-auto flex items-center gap-4 text-xs text-gray-400">
          <a href="#features" className="hover:text-gray-100">Features</a>
          <button
            onClick={launch}
            className="rounded-md border border-edge px-3 py-1.5 text-gray-200 transition hover:border-info/60 hover:text-info"
          >
            {hasSession ? "Enter Simulator" : "Sign in"}
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <div className="mx-auto mb-5 w-fit rounded-full border border-info/30 bg-info/10 px-3 py-1 text-[11px] font-medium tracking-wide text-info">
          Tier 1 Helpdesk → Tier 4 Critical Infrastructure
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight tracking-tight text-gray-50 md:text-6xl">
          The Enterprise IT &{" "}
          <span className="bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent">
            Cyber Warfare
          </span>{" "}
          Simulator
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-gray-400 md:text-base">
          Sit at a virtual engineer&apos;s workstation. Take live tickets from AI customers, open
          nested RDP/SSH sessions into simulated Windows and Linux infrastructure, and fix real
          faults against the clock — scored on speed, skill, and how you treat people.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={launch}
            className="rounded-xl bg-info px-7 py-3 text-sm font-bold text-black shadow-lg shadow-info/25 transition hover:brightness-110"
          >
            ▶ Launch Simulator
          </button>
          <a
            href="#features"
            className="rounded-xl border border-edge px-6 py-3 text-sm text-gray-300 transition hover:border-gray-500"
          >
            See what&apos;s inside
          </a>
        </div>

        {/* Terminal teaser */}
        <div className="mx-auto mt-14 max-w-2xl overflow-hidden rounded-xl border border-edge bg-term text-left shadow-2xl shadow-black/50">
          <div className="flex items-center gap-1.5 border-b border-edge bg-panelalt px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-danger" />
            <span className="h-2.5 w-2.5 rounded-full bg-warn" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="ml-2 text-[10px] text-gray-500">ssh okhare@prod-nginx-srv</span>
          </div>
          <div className="px-4 py-3 font-mono text-[12px] leading-relaxed">
            <div><span className="text-accent">okhare@web-01:~$</span> <span className="text-gray-200">curl -I localhost</span></div>
            <div className="text-danger">HTTP/1.1 502 Bad Gateway</div>
            <div><span className="text-accent">okhare@web-01:~$</span> <span className="text-gray-200">systemctl start app</span></div>
            <div><span className="text-accent">okhare@web-01:~$</span> <span className="text-gray-200">curl -I localhost</span></div>
            <div className="text-emerald-300">HTTP/1.1 200 OK</div>
            <div className="mt-1 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-accent">
              ✔ TCK-4821 resolved within SLA · CSAT 78% · +421 XP
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="relative mx-auto max-w-6xl px-6 pb-24">
        <h2 className="mb-8 text-center text-2xl font-bold text-gray-100">
          A complete IT department, simulated
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-edge bg-panel/60 p-5 backdrop-blur transition hover:border-info/40"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-info/15 text-info">
                <AppIcon id={f.iconId} size={20} />
              </div>
              <div className="mb-1.5 text-sm font-semibold text-gray-100">{f.title}</div>
              <p className="text-xs leading-relaxed text-gray-400">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <button
            onClick={launch}
            className="rounded-xl bg-info px-7 py-3 text-sm font-bold text-black shadow-lg shadow-info/25 transition hover:brightness-110"
          >
            ▶ Launch Simulator — it&apos;s free
          </button>
        </div>
      </section>

      <footer className="relative border-t border-edge/60 py-6 text-center text-[11px] text-gray-600">
        TriageOS — training simulation. All infrastructure is simulated in your browser.
      </footer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
