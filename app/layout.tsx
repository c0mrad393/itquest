import type { Metadata } from "next";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/host/theme";

const DESCRIPTION =
  "A gamified IT Operations & Cybersecurity simulation platform with a dual CLI/GUI troubleshooting workspace.";

export const metadata: Metadata = {
  // Resolves the file-convention icon and og:image paths to absolute URLs for
  // crawlers, and silences Next's metadataBase warning.
  metadataBase: new URL("https://itquest.org"),
  title: "ITQuest — IT Operations & Cyber Simulation",
  description: DESCRIPTION,
  // The favicon (app/icon.png), Apple touch icon (app/apple-icon.png) and
  // social preview (app/opengraph-image.png) are supplied by Next's file
  // conventions in this directory, so they are not re-declared here.
  openGraph: {
    title: "ITQuest — IT Operations & Cyber Simulation",
    description: DESCRIPTION,
    siteName: "IT Quest",
    type: "website",
    url: "https://itquest.org",
  },
  twitter: {
    card: "summary_large_image",
    title: "ITQuest — IT Operations & Cyber Simulation",
    description: DESCRIPTION,
  },
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
