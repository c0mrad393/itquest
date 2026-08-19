"use client";

/**
 * Navbar — the public site header.
 *
 * The brand lockup (logo + wordmark) is the whole clickable target and routes
 * to "/" via next/link. The logo is a next/image with explicit width and
 * height: the box is reserved before the bitmap loads, so the wordmark and
 * nav links never jump on first paint (zero CLS). `priority` opts it out of
 * lazy-loading because it sits above the fold.
 *
 * State it cannot own — whether a saved game exists, and what "launch" does —
 * arrives as props from the page, which is where that state actually lives.
 */

import Image from "next/image";
import Link from "next/link";
import { LOGO_ALT, LOGO_INTRINSIC, LOGO_SRC, VERSION } from "./brand";

interface NavbarProps {
  /** A returning visitor is offered Resume instead of Launch lab. */
  saved: boolean;
  onLaunch: () => void;
}

export default function Navbar({ saved, onLaunch }: NavbarProps) {
  return (
    <header className="relative z-10 mx-auto flex max-w-6xl items-center gap-3 px-5 py-5 sm:px-8">
      <Link
        href="/"
        aria-label="IT Quest — home"
        className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]/50"
      >
        <Image
          src={LOGO_SRC}
          alt={LOGO_ALT}
          width={LOGO_INTRINSIC}
          height={LOGO_INTRINSIC}
          priority
          className="h-9 w-9"
        />
        <span className="text-[15px] font-semibold tracking-tight text-white">ITQuest</span>
      </Link>
      <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">{VERSION}</span>

      <nav className="ml-auto hidden items-center gap-6 text-[13px] text-slate-400 md:flex">
        <a href="#platform" className="transition-colors hover:text-white">Platform</a>
        <a href="#audience" className="transition-colors hover:text-white">For educators</a>
        <a href="#contact" className="transition-colors hover:text-white">Contact</a>
      </nav>

      <button
        onClick={onLaunch}
        className="ml-auto rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-[#04060d] transition-transform hover:scale-[1.03] md:ml-0"
      >
        {saved ? "Resume" : "Launch lab"}
      </button>
    </header>
  );
}
