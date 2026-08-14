import type { Metadata } from "next";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/host/theme";

export const metadata: Metadata = {
  title: "TriageOS — IT Operations & Cyber Simulation",
  description:
    "A gamified IT Operations & Cybersecurity simulation platform with a dual CLI/GUI troubleshooting workspace.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `suppressHydrationWarning` because the boot script below stamps a class
    // on <html> before React hydrates; without it every load logs a mismatch
    // for the one attribute we are deliberately setting early.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so the correct theme is already on the
            document. Without it the first frame renders in the CSS default,
            and a white flash on a dark setup is exactly what an accessibility
            pass exists to remove. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      {/*
        The shell is now a UI, not a terminal. Monospace stays where it means
        something — hostnames, IPs, watt readings, log output — and everything
        else gets a proportional face that non-professionals can read at length.
      */}
      <body className="bg-sunken font-sans text-gray-200 antialiased">{children}</body>
    </html>
  );
}
