"use client";

/**
 * ITQuest — public landing page (itquest.org)
 * ===========================================
 * The public entry point: prospective learners, institutions evaluating the
 * platform, and reviewers who will judge it in about fifteen seconds.
 *
 * The page's job is to make one claim legible fast: ITQuest is not a website
 * ABOUT IT work, it is a virtual operating system you work INSIDE. So the
 * centrepiece is a mock OS window — real window chrome, a taskbar-style tab
 * rail, a status bar — that foreshadows the actual application.
 *
 * ── FOUR THINGS HERE ARE LOAD-BEARING ───────────────────────────────────────
 *
 * 1. `theme-dark` is stamped on the page ROOT. This page paints its own ground
 *    (#04060d) and is the one surface a visitor sees before any theme
 *    preference exists. Custom properties inherit, so without the pin a
 *    light-mode visitor gets the inverting neutral ramp over a near-black
 *    background — dark ink on dark, unreadable.
 *
 * 2. ACCENT holds LITERAL HEX, not ramp tokens. In this design system
 *    `cyan`, `sky`, `indigo` and `blue` all collapse onto `--info-*`, so a
 *    multi-colour module grid written with Tailwind colour names renders as a
 *    set of identical cards. Every accent below is a literal so it survives.
 *
 * 3. The root must NOT carry `overflow-x-hidden`. CSS computes the other axis
 *    to `auto` when one axis is `hidden`, which silently turns the page into a
 *    nested scroll container. The ambient blur wrapper clips its own blobs.
 *
 * 4. The saved-game path is real. A returning visitor is offered Resume rather
 *    than being silently dropped into a new estate, and the check runs AFTER
 *    mount because localStorage does not exist during SSR.
 *
 * No emoji anywhere — the project's standing rule. Every glyph is an SVG icon.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSavedGame, savedProfile, useSessionStore } from "@/lib/host/session";
import {
  IconBolt,
  IconCable,
  IconChartBar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCloudNodes,
  IconContrast,
  IconDisk,
  IconGrid,
  IconIdCard,
  IconLaptop,
  IconLinux,
  IconMonitor,
  IconPanel,
  IconPolicy,
  IconRecycle,
  IconRemoteIn,
  IconRouter,
  IconServer,
  IconShield,
  IconSignal,
  IconSliders,
  IconStore,
  IconTerminal,
  IconTicket,
  IconTrophy,
  IconUsers,
  IconWindows,
  IconWrench,
} from "@/components/ui/icons";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { CONTACT, type LegalDoc } from "./brand";

/** See the header note: literal hex, because the ramp would collapse these. */
const ACCENT = {
  webos: { text: "text-[#67e8f9]", dot: "bg-[#22d3ee]", glow: "bg-[#22d3ee]/20", chip: "bg-[#22d3ee]/10 border-[#22d3ee]/30 text-[#a5f3fc]" },
  helpdesk: { text: "text-[#fcd34d]", dot: "bg-[#f59e0b]", glow: "bg-[#f59e0b]/20", chip: "bg-[#f59e0b]/10 border-[#fbbf24]/30 text-[#fde68a]" },
  server: { text: "text-[#a5b4fc]", dot: "bg-[#6366f1]", glow: "bg-[#6366f1]/25", chip: "bg-[#6366f1]/10 border-[#818cf8]/30 text-[#c7d2fe]" },
  infra: { text: "text-[#6ee7b7]", dot: "bg-[#10b981]", glow: "bg-[#10b981]/20", chip: "bg-[#10b981]/10 border-[#34d399]/30 text-[#a7f3d0]" },
  progress: { text: "text-[#c4b5fd]", dot: "bg-[#8b5cf6]", glow: "bg-[#8b5cf6]/20", chip: "bg-[#8b5cf6]/10 border-[#a78bfa]/30 text-[#ddd6fe]" },
} as const;

type AccentKey = keyof typeof ACCENT;

interface Capability {
  icon: React.ReactNode;
  title: string;
  body: string;
}

interface ModuleTab {
  id: string;
  /** Short label for the taskbar-style rail. */
  label: string;
  icon: React.ReactNode;
  accent: AccentKey;
  headline: string;
  lede: string;
  capabilities: Capability[];
  /** Optional console transcript — shown where CLI fluency is the point. */
  console?: { title: string; lines: { prompt?: string; text: string; tone?: "in" | "out" | "ok" | "warn" }[] };
}

const MODULES: ModuleTab[] = [
  {
    id: "webos",
    label: "Web-OS Core",
    icon: <IconMonitor size={15} />,
    accent: "webos",
    headline: "Not a website about IT. An operating system you work inside.",
    lede: "ITQuest boots a complete desktop environment in the browser — windows you drag, resize, stack and minimise, a live taskbar, a start menu, notifications and a system tray. Nothing to install, no virtual machine to provision. The realism is the point: you learn the shape of the work, not a diagram of it.",
    capabilities: [
      {
        icon: <IconPanel size={17} />,
        title: "Real window management",
        body: "Draggable, resizable, focus-stacked windows with a taskbar, start menu and system tray — the interaction model of a desktop OS, running in a tab.",
      },
      {
        icon: <IconSliders size={17} />,
        title: "Customisable workspace",
        body: "Arrange your desktop, pin the apps you use, tune the layout and open a command palette to jump anywhere by keyboard.",
      },
      {
        icon: <IconContrast size={17} />,
        title: "Light and dark themes",
        body: "A full token-driven theming system across every window and applet, following your system preference until you override it.",
      },
      {
        icon: <IconGrid size={17} />,
        title: "A suite of real applications",
        body: "Helpdesk, directory, gateway, storage, hardware bench and more — each a working tool with its own state, not a screenshot.",
      },
    ],
  },
  {
    id: "helpdesk",
    label: "Helpdesk & Economy",
    icon: <IconTicket size={15} />,
    accent: "helpdesk",
    headline: "Tickets arrive on a clock. Budget is finite. Choose well.",
    lede: "Work reaches you the way it reaches a real technician: as a queue of tickets with deadlines, written by users who describe symptoms rather than causes. Every fix costs money and time, so triage is a genuine decision — and the economy makes it one.",
    capabilities: [
      {
        icon: <IconClock size={17} />,
        title: "Time-bound ticket queue",
        body: "Dynamic tickets carry SLA deadlines. Let one expire and you feel it in satisfaction and budget, exactly as an under-staffed desk does.",
      },
      {
        icon: <IconTicket size={17} />,
        title: "Symptoms, not answers",
        body: "Tickets report what the user sees. Diagnosis is yours: read the estate, form a hypothesis, verify it, then fix the actual cause.",
      },
      {
        icon: <IconStore size={17} />,
        title: "Procurement and the shop",
        body: "Buy hardware, licences and services from a virtual catalogue. Stock, lead time and price are all real constraints on your plan.",
      },
      {
        icon: <IconChartBar size={17} />,
        title: "Budget and resource allocation",
        body: "Run the department to a budget. Over-provision and you burn capital; under-provision and the estate degrades until tickets cascade.",
      },
    ],
  },
  {
    id: "server",
    label: "Server & Directory",
    icon: <IconServer size={15} />,
    accent: "server",
    headline: "Remote into the estate. Windows Server, Linux, GUI and shell.",
    lede: "Open a simulated RDP session and land on a real server desktop — nested inside your own, with its own windows and its own tools. Administer the domain from the directory console or from a terminal, then drill down from a user object straight into that employee's client machine to fix what they actually reported.",
    capabilities: [
      {
        icon: <IconRemoteIn size={17} />,
        title: "Simulated RDP sessions",
        body: "Connect into Windows Server and Linux hosts. Each session is a live environment with its own state, not a static mock-up.",
      },
      {
        icon: <IconUsers size={17} />,
        title: "Active Directory and domain controllers",
        body: "Create and manage users, groups and organisational units; promote and troubleshoot domain controllers; resolve join failures at their cause.",
      },
      {
        icon: <IconPolicy size={17} />,
        title: "Group Policy with real precedence",
        body: "Author GPOs and link them at the right scope. Inheritance and precedence are modelled, so a policy applied at the wrong level genuinely misbehaves.",
      },
      {
        icon: <IconLaptop size={17} />,
        title: "Drill down to the client",
        body: "Go from a directory object to the employee's desktop and remote in — profile faults, mapped drives, stale credentials and all.",
      },
      {
        icon: <IconTerminal size={17} />,
        title: "PowerShell and Bash",
        body: "Every task has a shell path as well as a GUI path. Both drive the same underlying state, so either route is a legitimate solution.",
      },
      {
        icon: <IconWindows size={17} />,
        title: "Cross-platform estate",
        body: "Windows and Linux hosts side by side, with the service models, file permissions and tooling that actually differ between them.",
      },
    ],
    console: {
      title: "Terminal — dc01",
      lines: [
        { prompt: "PS C:\\>", text: "Get-ADUser -Filter {Enabled -eq $false} | Select Name", tone: "in" },
        { text: "j.okafor    Disabled 14d ago", tone: "out" },
        { text: "m.laurent   Disabled  3d ago", tone: "out" },
        { prompt: "[ops@edge ~]$", text: "systemctl status nginx", tone: "in" },
        { text: "Active: failed (Result: exit-code)", tone: "warn" },
        { prompt: "[ops@edge ~]$", text: "nginx -t && systemctl restart nginx", tone: "in" },
        { text: "configuration file test is successful", tone: "ok" },
      ],
    },
  },
  {
    id: "infra",
    label: "Cloud, Network & BDR",
    icon: <IconCloudNodes size={15} />,
    accent: "infra",
    headline: "From the patch panel to the cloud console — and back from disaster.",
    lede: "Infrastructure is modelled physically and logically. Route the cable, patch the port, budget the PoE, then climb the stack to firewall rules, NAT, DHCP and cloud services. When something catastrophic lands, your recovery is only as good as the backup policy you set up beforehand.",
    capabilities: [
      {
        icon: <IconCable size={17} />,
        title: "Physical networking",
        body: "Cable routing, switch patching, PoE power budgets and camera-to-NVR topology — with the constraints that bite in a real comms room.",
      },
      {
        icon: <IconRouter size={17} />,
        title: "Software-defined troubleshooting",
        body: "An enterprise edge gateway with firewall rules, NAT and port forwarding, DHCP scopes and reservations, and intrusion detection.",
      },
      {
        icon: <IconCloudNodes size={17} />,
        title: "Cloud services",
        body: "Monitor, manage and troubleshoot simulated cloud workloads alongside on-premise systems, in one hybrid estate.",
      },
      {
        icon: <IconDisk size={17} />,
        title: "Backup and disaster recovery",
        body: "Schedule backups across storage tiers, manage snapshots and prove your retention actually covers what you would need.",
      },
      {
        icon: <IconRecycle size={17} />,
        title: "Recover from catastrophe",
        body: "Ransomware and total-loss events really compromise the estate. Restoring is a procedure you carry out, not a button that undoes it.",
      },
      {
        icon: <IconSignal size={17} />,
        title: "Live monitoring",
        body: "Telemetry, traffic graphs and health dashboards update continuously, so you can watch a fault propagate and a fix take hold.",
      },
    ],
  },
  {
    id: "progress",
    label: "Ranks & Progression",
    icon: <IconTrophy size={15} />,
    accent: "progress",
    headline: "Measured on the things the job is actually measured on.",
    lede: "Progression tracks resolution speed, diagnostic accuracy and budget efficiency — the three axes a real IT department is judged by. Rank up, unlock harder infrastructure, and compare where you stand against everyone else working the same estate.",
    capabilities: [
      {
        icon: <IconTrophy size={17} />,
        title: "Global leaderboards",
        body: "Ranked on resolution speed, accuracy and budget efficiency, so a fast guess never outscores a correct diagnosis.",
      },
      {
        icon: <IconIdCard size={17} />,
        title: "Profile and levelling",
        body: "Level your technician, shape a specialism and carry a profile that reflects what you have actually proven you can do.",
      },
      {
        icon: <IconBolt size={17} />,
        title: "Progressive unlocks",
        body: "The estate grows with you. New sites, racks and systems arrive as your capability does, so complexity never lands all at once.",
      },
      {
        icon: <IconWrench size={17} />,
        title: "Scenario library",
        body: "Multi-stage incidents with cascading consequences, drawn from real failure patterns — each with one findable root cause.",
      },
    ],
  },
];

interface Audience {
  title: string;
  body: string;
  points: string[];
}

const AUDIENCES: Audience[] = [
  {
    title: "Students & Self-Learners",
    body: "Learn by doing, through practical exercises that map directly onto the work.",
    points: ["Build a PC from bare parts", "Diagnose faults with real symptoms", "Job-ready hardware and OS skills"],
  },
  {
    title: "Universities, Colleges & Academies",
    body: "Scalable, browser-based lab infrastructure for a modern IT curriculum.",
    points: ["No hardware budget per seat", "Consistent scenarios across a cohort", "Runs in any modern browser"],
  },
  {
    title: "Practitioners & Job Seekers",
    body: "Refine hardware and sysadmin skills against realistic enterprise workflows.",
    points: ["Enterprise domain and directory tasks", "Perimeter firewall and NAT work", "Interview-ready practical fluency"],
  },
];

/** Qualitative descriptors, not invented metrics. */
const PILLARS = [
  { icon: <IconMonitor size={15} />, label: "Full Web-OS", sub: "Nothing to install" },
  { icon: <IconTerminal size={15} />, label: "GUI + CLI", sub: "PowerShell and Bash" },
  { icon: <IconLinux size={15} />, label: "Windows + Linux", sub: "One hybrid estate" },
  { icon: <IconShield size={15} />, label: "Risk-free", sub: "Break anything safely" },
];

export default function LandingPage() {
  const router = useRouter();
  const startNewGame = useSessionStore((s) => s.startNewGame);
  const [saved, setSaved] = useState<{ level: number; username: string } | null>(null);
  const [legal, setLegal] = useState<LegalDoc | null>(null);
  const [tab, setTab] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);

  // After mount: localStorage does not exist during SSR, and reading it in
  // render would make the server and client markup disagree.
  useEffect(() => {
    if (!hasSavedGame()) return;
    const p = savedProfile();
    setSaved({ level: p.level, username: p.username });
  }, []);

  // Escape closes a legal modal — a dialog that traps the reader is worse than
  // no dialog, and reviewers will press Escape.
  useEffect(() => {
    if (!legal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLegal(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [legal]);

  // Keep the selected tab visible in the rail. On narrow screens the rail
  // scrolls, and a tab chosen by keyboard can otherwise sit off-screen.
  //
  // Two deliberate choices: this drives the RAIL's own scrollLeft rather than
  // scrollIntoView, which would also move the page vertically; and it assigns
  // scrollLeft directly instead of scrollTo({behavior:"smooth"}), which is
  // silently a no-op in some engines and is dropped outright for readers who
  // ask for reduced motion — leaving the selected tab off-screen either way.
  useEffect(() => {
    const rail = railRef.current;
    const el = tabRefs.current[tab];
    if (!rail || !el) return;
    const left = el.offsetLeft - (rail.clientWidth - el.clientWidth) / 2;
    rail.scrollLeft = Math.max(0, left);
  }, [tab]);

  // Arrow-key traversal is what makes a tablist a tablist to a screen reader
  // and to anyone not using a mouse.
  const onTabKey = useCallback((e: React.KeyboardEvent) => {
    const last = MODULES.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = tab === last ? 0 : tab + 1;
    else if (e.key === "ArrowLeft") next = tab === 0 ? last : tab - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  }, [tab]);

  function launch() {
    if (!saved) startNewGame();
    router.push("/desktop");
  }

  const active = MODULES[tab];
  const activeAccent = ACCENT[active.accent];

  return (
    <div className="landing-root theme-dark relative min-h-screen bg-[#04060d] font-sans text-slate-200 antialiased">
      {/* Ambient field. Pointer-events off so it can never eat a CTA click, and
          it clips its own blobs so the ROOT needs no overflow rule. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#22d3ee]/10 blur-[120px]" />
        <div className="absolute -right-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-[#6366f1]/10 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 h-[24rem] w-[24rem] rounded-full bg-[#8b5cf6]/10 blur-[120px]" />
        {/* Desktop-wallpaper dot grid — foreshadows the OS aesthetic. */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.10) 1px, transparent 0)",
            backgroundSize: "38px 38px",
          }}
        />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <Navbar saved={!!saved} onLaunch={launch} />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-5 pb-14 pt-10 text-center sm:px-8 sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/10 px-3.5 py-1.5 text-[11px] font-medium text-[#a5f3fc]">
          {/* A pulsing dot, not a construction emoji — house rule. */}
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22d3ee] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#67e8f9]" />
          </span>
          Project in Active Development · Public Beta
        </span>

        <h1 className="mt-7 text-balance text-[2rem] font-bold leading-[1.12] tracking-tight text-white sm:text-[2.9rem] lg:text-[3.4rem]">
          Master IT Infrastructure &amp; Hardware Through{" "}
          <span className="bg-gradient-to-r from-[#67e8f9] via-[#a5b4fc] to-[#c4b5fd] bg-clip-text text-transparent">
            Hands-On Interactive Simulation
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-[15px] leading-relaxed text-slate-400 sm:text-[16px]">
          A complete virtual operating system in your browser. ITQuest is built for IT students,
          universities, colleges, tech academies and practitioners to assemble hardware, configure
          BIOS and operating systems, run an enterprise domain and troubleshoot live networks — in a
          risk-free lab that behaves like the real thing.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={launch}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[14px] font-semibold text-[#04060d] transition-transform hover:scale-[1.03] sm:w-auto"
          >
            Launch Interactive Lab
            <span className="transition-transform group-hover:translate-x-0.5">
              <IconChevronRight size={15} />
            </span>
          </button>
          <a
            href="#platform"
            className="flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-[14px] font-semibold text-slate-200 transition-colors hover:border-white/30 hover:bg-white/10 sm:w-auto"
          >
            View Curriculum
          </a>
        </div>

        {saved && (
          <p className="mt-4 text-[12px] text-slate-500">
            Welcome back, <span className="text-slate-300">{saved.username}</span> — level {saved.level}.
          </p>
        )}

        <ul className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {PILLARS.map((p) => (
            <li key={p.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center">
              <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-[#67e8f9]">
                {p.icon}
              </span>
              <span className="mt-2 block text-[12px] font-semibold text-white">{p.label}</span>
              <span className="mt-0.5 block text-[10.5px] text-slate-500">{p.sub}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Platform explorer, dressed as an OS window ──────────────────── */}
      <section id="platform" className="relative z-10 mx-auto max-w-6xl scroll-mt-16 px-5 py-14 sm:px-8">
        <SectionHead
          eyebrow="The platform"
          title="An entire IT department, running in a browser tab"
          sub="Five module families, each a working system with modelled state. Select one to see what it actually does."
        />

        <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e17]/90 shadow-2xl shadow-black/40 backdrop-blur">
          {/* Window title bar */}
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </span>
            <span className="ml-2 truncate font-mono text-[11px] text-slate-400">
              itquest — platform modules
            </span>
            <span className="ml-auto hidden items-center gap-1.5 font-mono text-[10px] text-slate-500 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${activeAccent.dot}`} />
              {String(tab + 1).padStart(2, "0")} / {String(MODULES.length).padStart(2, "0")}
            </span>
          </div>

          {/* Taskbar-style tab rail. Scrolls horizontally on narrow screens
              inside its OWN container, so the page never scrolls sideways. */}
          <div
            ref={railRef}
            role="tablist"
            aria-label="Platform modules"
            onKeyDown={onTabKey}
            className="relative flex gap-1 overflow-x-auto border-b border-white/10 bg-black/20 px-2 py-2"
          >
            {MODULES.map((m, i) => {
              const on = i === tab;
              const a = ACCENT[m.accent];
              return (
                <button
                  key={m.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  role="tab"
                  id={`tab-${m.id}`}
                  aria-selected={on}
                  aria-controls={`panel-${m.id}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setTab(i)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors ${
                    on ? `bg-white/10 text-white` : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <span className={on ? a.text : "text-slate-500"}>{m.icon}</span>
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div
            role="tabpanel"
            id={`panel-${active.id}`}
            aria-labelledby={`tab-${active.id}`}
            tabIndex={0}
            className="relative p-5 focus:outline-none sm:p-7"
          >
            <div className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl ${activeAccent.glow}`} />

            <div className="relative max-w-3xl">
              <h3 className="text-balance text-[19px] font-semibold leading-snug text-white sm:text-[22px]">
                {active.headline}
              </h3>
              <p className="mt-3 text-pretty text-[13.5px] leading-relaxed text-slate-400">{active.lede}</p>
            </div>

            <div className="relative mt-7 grid gap-3 sm:grid-cols-2">
              {active.capabilities.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 ${activeAccent.text}`}>
                      {c.icon}
                    </span>
                    <h4 className="text-[13.5px] font-semibold text-white">{c.title}</h4>
                  </div>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-slate-400">{c.body}</p>
                </div>
              ))}
            </div>

            {active.console && (
              <div className="relative mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-2 text-slate-500">
                  <IconTerminal size={13} />
                  <span className="font-mono text-[10.5px]">{active.console.title}</span>
                </div>
                <div className="overflow-x-auto px-3.5 py-3">
                  <pre className="font-mono text-[11.5px] leading-[1.75]">
                    {active.console.lines.map((l, i) => (
                      <div key={i} className="whitespace-pre">
                        {l.prompt && <span className="text-[#6ee7b7]">{l.prompt} </span>}
                        <span
                          className={
                            l.tone === "ok"
                              ? "text-[#6ee7b7]"
                              : l.tone === "warn"
                                ? "text-[#fcd34d]"
                                : l.tone === "in"
                                  ? "text-slate-200"
                                  : "text-slate-500"
                          }
                        >
                          {l.text}
                        </span>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-3 border-t border-white/10 bg-black/25 px-4 py-2 font-mono text-[10px] text-slate-500">
            <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 ${activeAccent.chip}`}>
              {active.label}
            </span>
            <span className="hidden sm:inline">{active.capabilities.length} capabilities</span>
            <span className="ml-auto inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
              simulation online
            </span>
          </div>
        </div>
      </section>

      {/* ── Audience ────────────────────────────────────────────────────── */}
      <section id="audience" className="relative z-10 mx-auto max-w-6xl scroll-mt-16 px-5 py-14 sm:px-8">
        <SectionHead
          eyebrow="Built for tech education"
          title="One platform, three kinds of learner"
          sub="The same simulation serves a first-year student, a cohort of forty, and a practitioner brushing up before an interview."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((aud) => (
            <article
              key={aud.title}
              className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6 transition-colors hover:border-white/20"
            >
              <h3 className="text-[15px] font-semibold text-white">{aud.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{aud.body}</p>
              <ul className="mt-4 space-y-2">
                {aud.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[12.5px] text-slate-300">
                    <span className="mt-0.5 shrink-0 text-[#6ee7b7]">
                      <IconCheck size={13} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* ── Contact ─────────────────────────────────────────────────────── */}
      <section id="contact" className="relative z-10 mx-auto max-w-4xl scroll-mt-16 px-5 py-14 sm:px-8">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center sm:p-10">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#22d3ee]/15 text-[#67e8f9]">
            <IconShield size={20} />
          </span>
          <h2 className="mt-4 text-[20px] font-semibold text-white">Institutional &amp; support enquiries</h2>
          <p className="mx-auto mt-2 max-w-lg text-[13.5px] leading-relaxed text-slate-400">
            For curriculum partnerships, pilot programmes, accessibility requests or platform
            support, reach the team directly. We reply to institutional enquiries first.
          </p>
          <a
            href={`mailto:${CONTACT}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-mono text-[13px] text-white transition-colors hover:border-[#22d3ee]/40 hover:bg-[#22d3ee]/10"
          >
            {CONTACT}
          </a>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <Footer onOpenLegal={setLegal} />

      {legal && <LegalModal doc={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#67e8f9]">{eyebrow}</span>
      <h2 className="mt-3 text-balance text-[24px] font-bold tracking-tight text-white sm:text-[30px]">{title}</h2>
      <p className="mx-auto mt-3 text-pretty text-[14px] leading-relaxed text-slate-400">{sub}</p>
    </div>
  );
}

/**
 * Legal text.
 *
 * Written plainly and kept honest about what the platform is: a beta that
 * stores progress locally. Claiming more than that on a compliance page is
 * both wrong and, for an EdTech reviewer, exactly the thing that gets checked.
 */
const LEGAL: Record<LegalDoc, { title: string; updated: string; sections: { h: string; p: string }[] }> = {
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: 2026",
    sections: [
      {
        h: "What we store",
        p: "Simulation progress — your estate, level and completed scenarios — is stored locally in your own browser. It is not uploaded to a server and is removed when you clear your browser storage.",
      },
      {
        h: "Accounts",
        p: "The public beta does not require an account. No name, email address or payment detail is collected to use the lab.",
      },
      {
        h: "Analytics",
        p: "We may collect aggregate, non-identifying usage data — which modules are opened and where sessions end — to prioritise development. It is never sold, and never linked to an individual.",
      },
      {
        h: "Contact and correspondence",
        p: `Email sent to ${CONTACT} is used only to answer your enquiry, and is retained no longer than needed to do so.`,
      },
      {
        h: "Learners under 18",
        p: "The platform is designed for classroom use and collects no personal data from learners. Institutions deploying it to under-18 cohorts can request a written data statement at the contact address.",
      },
      {
        h: "Your control",
        p: "Because progress lives in your browser, you can erase everything at any time by clearing site data. Requests about analytics can be sent to the contact address.",
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "Last updated: 2026",
    sections: [
      {
        h: "Beta status",
        p: "ITQuest is in active development. Features may change, and simulation state may be reset by an update. Do not rely on it as a system of record for coursework you cannot reproduce.",
      },
      {
        h: "Permitted use",
        p: "The platform is provided for education, training and evaluation. You may use it in a classroom, a course, or on your own, including for assessment, provided learners are not charged for access to the beta.",
      },
      {
        h: "Simulation, not advice",
        p: "Scenarios model real systems but are simplified for teaching. Nothing here is a substitute for vendor documentation or professional judgement when working on production equipment.",
      },
      {
        h: "Intellectual property",
        p: "The platform, its curriculum, source code, simulation models and artwork remain the property of ITQuest. Product names used in scenarios are fictional; any resemblance to real vendors is for teaching familiarity only and implies no affiliation.",
      },
      {
        h: "Acceptable use",
        p: "Do not attempt to disrupt the service, misrepresent it as your own, or use it to host or distribute unrelated content.",
      },
      {
        h: "No warranty",
        p: "The beta is provided as is, without warranty. To the extent permitted by law, ITQuest is not liable for loss arising from its use.",
      },
    ],
  },
};

function LegalModal({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const d = LEGAL[doc];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={d.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0a0e17] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-white">{d.title}</h2>
            <p className="text-[11px] text-slate-500">{d.updated}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-slate-300 transition-colors hover:bg-white/10"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {d.sections.map((s) => (
            <section key={s.h} className="mb-5 last:mb-0">
              <h3 className="text-[13px] font-semibold text-white">{s.h}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{s.p}</p>
            </section>
          ))}
          <p className="mt-6 border-t border-white/10 pt-4 text-[12px] text-slate-500">
            Questions about this document?{" "}
            <a href={`mailto:${CONTACT}`} className="text-[#67e8f9] hover:underline">
              {CONTACT}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
