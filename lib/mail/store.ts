/**
 * TriageOS — CoreMail store (corporate mailbox)
 * =============================================
 * The Outlook-style inbox. Two mail sources:
 *   - Internal: generated from the org's 100+ directory (staff IT requests).
 *   - External: ISPs (bandwidth throttling) and vendors (zero-day advisories).
 *
 * Scenario integration: some threads are `actionable` — they carry a
 * `scenarioId`/ticket link and can be advanced entirely by email (accept →
 * reply → the ITSM ticket is created/resolved through the mail loop, no
 * dashboard required). Ambient mail is pure flavor + world-building.
 */

"use client";

import { create } from "zustand";
import { useInfraStore } from "@/lib/infra/store";
import { mulberry32, int, pick } from "@/lib/org/rng";
import { EXTERNAL_MAIL_SEEDS, INTERNAL_MAIL_SEEDS } from "@/lib/org/namegen";
import type { InfrastructureState } from "@/lib/core";
import { findPrimaryDC } from "@/lib/org/generator";

export type MailFolder = "inbox" | "external" | "sent";
export type MailKind = "internal" | "external" | "sent";

export interface MailReply {
  id: string;
  label: string; // the operator's outbound line
  /** Optional effect: link/accept a ticket, or resolve one via the mail loop. */
  effect?: "accept-linked-ticket" | "acknowledge";
  responseText: string; // the sender's follow-up
}

export interface MailMessage {
  id: string;
  kind: MailKind;
  from: string;
  fromEmail: string;
  subject: string;
  body: string;
  ts: number;
  read: boolean;
  starred: boolean;
  /** Directory department, for internal mail (grouping/filtering). */
  department?: string;
  /** Actionable mail carries a scenario/ticket hook + reply options. */
  scenarioId?: string;
  linkedTicketId?: string;
  replies?: MailReply[];
  /** Appended follow-ups once the operator replies. */
  thread: { from: "you" | "them"; text: string; ts: number }[];
}

interface MailStore {
  messages: MailMessage[];
  selectedId: string | null;
  folder: MailFolder;

  select: (id: string | null) => void;
  setFolder: (f: MailFolder) => void;
  markRead: (id: string) => void;
  toggleStar: (id: string) => void;
  reply: (id: string, replyId: string) => void;
}

const now = Date.now();
const ago = (mins: number) => now - mins * 60_000;

function buildMailbox(infra: InfrastructureState): MailMessage[] {
  const org = infra.org;
  const rng = mulberry32(org.seed ^ 0x5eed);
  const mailDomain = org.domain.replace(".internal", ".com");
  const dir = findPrimaryDC(infra)?.activeDirectory;
  const staff = dir?.users ?? [];
  const msgs: MailMessage[] = [];

  // ── Actionable email-loop ticket: the ISP bandwidth throttle (NetOps) ──
  msgs.push({
    id: "mail-isp-throttle",
    kind: "external",
    from: EXTERNAL_MAIL_SEEDS[0].from,
    fromEmail: EXTERNAL_MAIL_SEEDS[0].email,
    subject: EXTERNAL_MAIL_SEEDS[0].subject,
    body: `${EXTERNAL_MAIL_SEEDS[0].body}\n\nAccount: ${org.name} (${mailDomain})\nCircuit: primary business fiber`,
    ts: ago(9),
    read: false,
    starred: false,
    thread: [],
  });

  // ── External advisories (ambient world-building) ──
  msgs.push(
    {
      id: "mail-zeroday",
      kind: "external",
      from: EXTERNAL_MAIL_SEEDS[1].from,
      fromEmail: EXTERNAL_MAIL_SEEDS[1].email,
      subject: EXTERNAL_MAIL_SEEDS[1].subject,
      body: EXTERNAL_MAIL_SEEDS[1].body,
      ts: ago(26),
      read: false,
      starred: true,
      thread: [],
    },
    {
      id: "mail-cert",
      kind: "external",
      from: EXTERNAL_MAIL_SEEDS[2].from,
      fromEmail: EXTERNAL_MAIL_SEEDS[2].email,
      subject: EXTERNAL_MAIL_SEEDS[2].subject,
      body: EXTERNAL_MAIL_SEEDS[2].body,
      ts: ago(70),
      read: true,
      starred: false,
      thread: [],
    },
  );

  // ── Internal staff mail: sampled from the real directory ──
  const senders = staff.filter((u) => u.enabled).slice(0, 200);
  const count = Math.min(14, senders.length);
  for (let i = 0; i < count; i++) {
    const u = senders[int(rng, 0, senders.length - 1)];
    const seed = pick(rng, INTERNAL_MAIL_SEEDS);
    msgs.push({
      id: `mail-int-${i}`,
      kind: "internal",
      from: u.displayName,
      fromEmail: u.email,
      subject: seed.subject,
      body: `${seed.body}\n\n— ${u.displayName}\n${u.title}, ${u.department}\n${org.name}`,
      ts: ago(int(rng, 3, 600)),
      read: i > 5,
      starred: false,
      department: u.department,
      thread: [],
    });
  }

  return msgs.sort((a, b) => b.ts - a.ts);
}

export const useMailStore = create<MailStore>((set, get) => ({
  messages: buildMailbox(useInfraStore.getState().infra),
  selectedId: null,
  folder: "inbox",

  select: (id) => set({ selectedId: id }),
  setFolder: (folder) => set({ folder }),

  markRead: (id) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, read: true } : m)) })),

  toggleStar: (id) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m)) })),

  reply: (id, replyId) => {
    const msg = get().messages.find((m) => m.id === id);
    const opt = msg?.replies?.find((r) => r.id === replyId);
    if (!msg || !opt) return;

    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? {
              ...m,
              replies: undefined, // consumed
              read: true,
              thread: [
                ...m.thread,
                { from: "you", text: opt.label, ts: Date.now() },
                { from: "them", text: opt.responseText, ts: Date.now() + 1 },
              ],
            }
          : m,
      ),
    }));
  },
}));
