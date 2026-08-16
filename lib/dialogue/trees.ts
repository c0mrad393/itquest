/**
 * ITQuest — Dialogue trees (authored per scenario)
 * =================================================
 * The customer opens with `start`; each operator option advances to another
 * customer node (or null to await the technical resolution). `meter`/`csat`
 * deltas move the persona's emotional state. Good technical/empathetic replies
 * calm the customer; dismissive ones inflame them.
 */

import type { DialogueTree } from "./types";

export const DIALOGUE_TREES: Record<string, DialogueTree> = {
  // ── TCK-4821 · Priya · 502 ────────────────────────────────────────────────
  "scn-nginx-502": {
    start: "p0",
    nodes: {
      p0: {
        id: "p0",
        text: "Our storefront is throwing 502 errors and customers can't check out. We're losing sales by the minute — how soon can you fix this?",
        options: [
          {
            id: "p0a",
            label: "I'm on it now — checking the web server's upstream first.",
            tone: "technical",
            meter: 8,
            csat: 6,
            next: "p1",
          },
          {
            id: "p0b",
            label: "Have you tried clearing your browser cache?",
            tone: "blunt",
            meter: -14,
            csat: -18,
            next: "pbad",
          },
          {
            id: "p0c",
            label: "That's not my area — I'll escalate to another team.",
            tone: "blunt",
            meter: -8,
            csat: -12,
            next: "pesc",
          },
        ],
      },
      p1: {
        id: "p1",
        text: "Thank you — please hurry. Our checkout has been down for nearly fifteen minutes.",
        options: [
          {
            id: "p1a",
            label: "Found it: the app worker crashed (out of memory). Restarting it now.",
            tone: "technical",
            meter: 7,
            csat: 6,
            next: "p2",
          },
          {
            id: "p1b",
            label: "I understand the urgency. I'll keep you posted every step.",
            tone: "empathetic",
            meter: 5,
            csat: 5,
            next: "p2",
          },
        ],
      },
      p2: {
        id: "p2",
        text: "Okay — I'm watching the storefront. Tell me the moment it's back.",
        options: [
          { id: "p2a", label: "Will do. Standby.", meter: 2, csat: 1, next: null },
        ],
      },
      pbad: {
        id: "pbad",
        text: "This isn't a browser problem — your server is literally returning a 502! Please take this seriously.",
        options: [
          {
            id: "pbada",
            label: "You're right, apologies — that was the wrong call. Checking the server now.",
            tone: "empathetic",
            meter: 6,
            csat: 4,
            next: "p1",
          },
        ],
      },
      pesc: {
        id: "pesc",
        text: "Escalate? We don't have time for hand-offs. Can you at least look before passing it on?",
        options: [
          {
            id: "pesca",
            label: "Fair enough — let me investigate before escalating.",
            tone: "empathetic",
            meter: 5,
            csat: 3,
            next: "p1",
          },
        ],
      },
    },
  },

  // ── TCK-4822 · Jane · AD lockout ──────────────────────────────────────────
  "scn-ad-lockout": {
    start: "j0",
    nodes: {
      j0: {
        id: "j0",
        text: "I can't sign in — it says my account is locked. I have a quarter-end filing due within the hour. Can you unlock it?",
        options: [
          {
            id: "j0a",
            label: "Absolutely. Verifying your account in Enterprise Directory Services now.",
            tone: "empathetic",
            meter: 8,
            csat: 7,
            next: "j1",
          },
          {
            id: "j0b",
            label: "You probably typed your password wrong too many times.",
            tone: "blunt",
            meter: -12,
            csat: -15,
            next: "jbad",
          },
        ],
      },
      j1: {
        id: "j1",
        text: "Thank you. Do you know why it locked? I don't want it happening again mid-filing.",
        options: [
          {
            id: "j1a",
            label: "I'll check the lockout source in the security log after I unlock you.",
            tone: "technical",
            meter: 6,
            csat: 5,
            next: "j2",
          },
          {
            id: "j1b",
            label: "Let's get you working first, then I'll investigate the cause.",
            tone: "empathetic",
            meter: 4,
            csat: 4,
            next: "j2",
          },
        ],
      },
      j2: {
        id: "j2",
        text: "Okay — I'll try signing in again once you've unlocked it.",
        options: [{ id: "j2a", label: "Unlocking now. One moment.", meter: 2, csat: 1, next: null }],
      },
      jbad: {
        id: "jbad",
        text: "I know how to type my password. The account locked on its own. Are you going to help or not?",
        options: [
          {
            id: "jbada",
            label: "Sorry — that came out wrong. Unlocking your account right now.",
            tone: "empathetic",
            meter: 6,
            csat: 4,
            next: "j2",
          },
        ],
      },
    },
  },

  // ── Lighter generic trees ─────────────────────────────────────────────────
  "scn-dns-forwarder": {
    start: "m0",
    nodes: {
      m0: {
        id: "m0",
        text: "Hey — hosts on the branch subnet keep failing to resolve internal names. External sites are fine. Any ideas?",
        options: [
          { id: "m0a", label: "Sounds like a resolver issue. I'll compare working vs failing lookups.", tone: "technical", meter: 5, csat: 4, next: "m1" },
          { id: "m0b", label: "Probably just needs a reboot.", tone: "blunt", meter: -8, csat: -10, next: "m1" },
        ],
      },
      m1: {
        id: "m1",
        text: "Appreciate it — ping me if you need anything from our side.",
        options: [{ id: "m1a", label: "Will do, thanks Marcus.", meter: 2, csat: 2, next: null }],
      },
    },
  },

  "scn-idmz-exfil": {
    start: "s0",
    nodes: {
      s0: {
        id: "s0",
        text: "We have sustained outbound 443 from an IDMZ host to an unknown ASN. This looks like active exfiltration — we need containment NOW.",
        options: [
          { id: "s0a", label: "Understood. Investigating the egress path and preparing to isolate the host.", tone: "technical", meter: 7, csat: 6, next: "s1" },
          { id: "s0b", label: "Let's not panic — could be a false positive.", tone: "blunt", meter: -12, csat: -14, next: "s1" },
        ],
      },
      s1: {
        id: "s1",
        text: "Preserve evidence before you pull it. I want packet captures and the process list.",
        options: [{ id: "s1a", label: "Copy — capturing first, then containing.", meter: 3, csat: 3, next: null }],
      },
    },
  },

  "scn-spooler-crash": {
    start: "t0",
    nodes: {
      t0: {
        id: "t0",
        text: "Hi! The printer at reception keeps stopping — I can't print visitor badges. It works for a bit then dies.",
        options: [
          { id: "t0a", label: "No problem — I'll check the print service and set it to restart reliably.", tone: "empathetic", meter: 5, csat: 5, next: "t1" },
        ],
      },
      t1: {
        id: "t1",
        text: "Oh great, thank you so much!",
        options: [{ id: "t1a", label: "Happy to help. One moment.", meter: 2, csat: 2, next: null }],
      },
    },
  },
};
