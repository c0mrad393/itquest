/**
 * ITQuest — Name & data pools (procedural generation)
 * ====================================================
 * Word banks the OrgGenerator draws from: company names per sector, human
 * names, departments/titles, and mail flavor text.
 */

import type { Sector } from "@/lib/core";

export const COMPANY_PARTS: Record<Sector, { pre: string[]; post: string[] }> = {
  finance: {
    pre: ["Nova", "Sterling", "Apex", "Meridian", "Crest", "Vault", "Ledger", "Argent"],
    post: ["Bank", "Capital", "Financial", "Trust", "Holdings", "Mutual"],
  },
  healthcare: {
    pre: ["Vita", "Helix", "Mercy", "Beacon", "Cascade", "Aegis", "Lumen", "Clara"],
    post: ["Health", "Medical", "Care Group", "Clinics", "Biolabs", "Diagnostics"],
  },
  tech: {
    pre: ["Quantum", "Vertex", "Nimbus", "Octo", "Synth", "Parallax", "Kite", "Forge"],
    post: ["Systems", "Labs", "Software", "Dynamics", "Cloud", "Robotics"],
  },
  retail: {
    pre: ["Urban", "Prime", "Cedar", "Atlas", "Bright", "Harbor", "Maple", "Summit"],
    post: ["Retail", "Marketplace", "Goods Co", "Commerce", "Outfitters", "Supply"],
  },
};

export const FIRST_NAMES = [
  "Liam", "Noah", "Elena", "Sofia", "Mateo", "Ava", "Ethan", "Maya", "Lucas", "Zara",
  "Omar", "Nina", "Felix", "Iris", "Hugo", "Lena", "Ravi", "Tara", "Jonas", "Amara",
  "Diego", "Chloe", "Ivan", "Freya", "Kenji", "Priya", "Marco", "Alina", "Samir", "Ruth",
  "Tomas", "Ingrid", "Andre", "Yara", "Viktor", "Salma", "Bruno", "Petra", "Dario", "Wren",
];

export const LAST_NAMES = [
  "Okafor", "Ivanova", "Tanaka", "Weber", "Haddad", "Silva", "Novak", "Kim", "Rossi", "Larsen",
  "Moreau", "Kaur", "Berg", "Castillo", "Novotny", "Ali", "Fischer", "Diallo", "Sato", "Petrov",
  "Hansen", "Vargas", "Kowalski", "Nguyen", "Duarte", "Molina", "Egede", "Farouk", "Lindqvist", "Adeyemi",
  "Mbeki", "Sorensen", "Takeda", "Villanueva", "Andersen", "Rahman", "Costa", "Zhou", "Bakker", "Ferreira",
];

export const DEPARTMENTS: { name: string; titles: string[] }[] = [
  { name: "Finance", titles: ["Financial Analyst", "Accounts Payable Specialist", "Controller", "Payroll Coordinator"] },
  { name: "Sales", titles: ["Account Executive", "Sales Development Rep", "Regional Sales Manager"] },
  { name: "Marketing", titles: ["Marketing Manager", "Content Strategist", "Brand Designer"] },
  { name: "Operations", titles: ["Operations Coordinator", "Logistics Manager", "Facilities Supervisor"] },
  { name: "HR", titles: ["HR Generalist", "Recruiter", "People Ops Manager"] },
  { name: "IT", titles: ["Systems Administrator", "Support Technician", "Network Engineer", "Security Analyst"] },
  { name: "Legal", titles: ["Paralegal", "Compliance Officer", "Contracts Manager"] },
  { name: "Customer Success", titles: ["Support Specialist", "Customer Success Manager", "Onboarding Lead"] },
];

/** Ambient internal-complaint subjects (CoreMail flavor). */
export const INTERNAL_MAIL_SEEDS: { subject: string; body: string }[] = [
  { subject: "VPN keeps dropping every ~20 minutes", body: "Since Monday my VPN session dies roughly every twenty minutes and I have to reconnect. It's killing my call recordings. Can someone take a look at my profile or the concentrator?" },
  { subject: "Shared drive is painfully slow today", body: "Opening anything on the shared drive takes 30+ seconds. Copying a 10MB file just timed out. Is the file server okay?" },
  { subject: "Printer on floor 2 jamming constantly", body: "The Canon by the kitchen has jammed four times this morning. We have contracts to send out today — please advise." },
  { subject: "Calendar invites arriving hours late", body: "External invites are landing in my inbox 3-4 hours after they're sent. A client thought I no-showed. Can you check mail flow?" },
  { subject: "Password reset didn't take?", body: "I reset my password yesterday like the reminder said, but this morning half my apps still want the old one and now I'm worried about locking myself out." },
  { subject: "Laptop fan screaming after update", body: "Ever since last night's update my laptop sounds like a jet engine and everything is slow. Task manager shows something called 'telemetry' at 90% CPU." },
  { subject: "Can't access the finance share", body: "Getting 'access denied' on \\\\files\\finance since this morning. I had access on Friday. Quarter close is this week." },
  { subject: "Wi-Fi dead in the east wing", body: "The whole east wing has no Wi-Fi since about 9am. Wired ports work. People are tethering to phones." },
];

/** External senders (ISP / vendors) — ambient + scenario hooks. */
export const EXTERNAL_MAIL_SEEDS: { from: string; email: string; subject: string; body: string }[] = [
  {
    from: "TransitWave ISP — NOC",
    email: "noc@transitwave.net",
    subject: "Notice: sustained utilization above committed rate (95th percentile)",
    body: "Our monitoring shows your uplink exceeding the committed information rate for 6 of the last 24 hours. Per your service agreement, sustained overage may result in throttling to 50% of burst capacity during peak windows. Consider re-balancing internal traffic or upgrading the circuit.",
  },
  {
    from: "PatchStream Security Advisories",
    email: "advisories@patchstream.io",
    subject: "[CRITICAL] Zero-day in OpenSSH-compatible daemons (CVE pending) — patch window recommended",
    body: "A remotely exploitable flaw affecting SSH daemons in common LTS distributions is being actively exploited. Vendors are shipping fixes within 48h. Recommended: restrict management-plane exposure, verify DMZ segmentation, and schedule an emergency patch window for internet-facing Linux hosts.",
  },
  {
    from: "CertWatch",
    email: "expiry@certwatch.app",
    subject: "TLS certificate for your public storefront expires in 14 days",
    body: "Automated reminder: the certificate presented by your public web endpoint expires in 14 days. Renew and deploy before expiry to avoid browser trust warnings.",
  },
];
