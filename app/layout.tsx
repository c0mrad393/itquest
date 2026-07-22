import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
