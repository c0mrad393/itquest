"use client";

/**
 * Footer — brand section, legal links and copyright.
 *
 * Carries a slightly larger logo variant (h-11 vs the nav's h-9) paired with
 * the tagline. Same next/image sizing discipline as the nav: explicit width
 * and height reserve the box, so nothing below shifts as the bitmap resolves.
 *
 * Opening a legal document is the page's concern (it owns the modal state), so
 * that arrives as a callback rather than being duplicated here.
 */

import Image from "next/image";
import Link from "next/link";
import { CONTACT, LOGO_ALT, LOGO_INTRINSIC, LOGO_SRC, TAGLINE, type LegalDoc } from "./brand";

interface FooterProps {
  onOpenLegal: (doc: LegalDoc) => void;
}

export default function Footer({ onOpenLegal }: FooterProps) {
  return (
    <footer className="relative z-10 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <Link
              href="/"
              aria-label="IT Quest — home"
              className="inline-flex items-center gap-3 rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]/50"
            >
              <Image
                src={LOGO_SRC}
                alt={LOGO_ALT}
                width={LOGO_INTRINSIC}
                height={LOGO_INTRINSIC}
                className="h-11 w-11"
              />
              <span className="text-[17px] font-semibold tracking-tight text-white">ITQuest</span>
            </Link>
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">{TAGLINE}</p>
          </div>

          {/* Links */}
          <nav aria-label="Footer" className="flex flex-col gap-2.5 text-[13px] sm:items-end">
            <button
              onClick={() => onOpenLegal("privacy")}
              className="text-slate-400 transition-colors hover:text-white sm:text-right"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => onOpenLegal("terms")}
              className="text-slate-400 transition-colors hover:text-white sm:text-right"
            >
              Terms of Service
            </button>
            <a href={`mailto:${CONTACT}`} className="text-slate-400 transition-colors hover:text-white sm:text-right">
              Contact
            </a>
          </nav>
        </div>

        <div className="mt-8 border-t border-white/5 pt-6">
          <p className="text-[12px] text-slate-500">
            &copy; 2026 IT Quest. {TAGLINE}.
          </p>
        </div>
      </div>
    </footer>
  );
}
