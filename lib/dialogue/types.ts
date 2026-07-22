/**
 * TriageOS — Dialogue & persona types
 * ===================================
 * Customer personas hold an emotional state that shifts with the operator's
 * responses, SLA pressure, and incident resolution. Dialogue is a small
 * branching tree; system events (accepted / resolved / SLA) inject scripted
 * lines outside the tree.
 */

export type Emotion = "relieved" | "calm" | "stressed" | "irritated" | "panicked" | "angry";

export interface Persona {
  id: string;
  name: string;
  role: string;
  org: string;
  avatar: string;
  baseline: Emotion;
  /** Short voice/style note (author guidance). */
  style: string;
}

/** A selectable operator reply. */
export interface DialogueOption {
  id: string;
  label: string; // what the operator says
  next: string | null; // next customer node id; null = await resolution
  /** Effect on the emotion meter (−15…+10) and CSAT (−20…+10). */
  meter?: number;
  csat?: number;
  /** Only shown once this gate is met. */
  requires?: "accepted" | "resolved";
  tone?: "empathetic" | "technical" | "blunt";
}

export interface DialogueNode {
  id: string;
  text: string; // customer line
  options?: DialogueOption[];
}

export interface DialogueTree {
  start: string;
  nodes: Record<string, DialogueNode>;
}

export type MessageFrom = "customer" | "you" | "system";

export interface Message {
  id: number;
  from: MessageFrom;
  text: string;
  ts: number;
}

export interface Conversation {
  ticketId: string;
  personaId: string;
  scenarioId: string;
  messages: Message[];
  /** Current customer node awaiting an operator reply (null while idle). */
  currentNodeId: string | null;
  /** 0-100 emotion meter; mapped to an Emotion label. */
  meter: number;
  /** 0-100 running customer satisfaction. */
  csat: number;
  emotion: Emotion;
  unread: number;
  closed: boolean;
}

// ── Emotion presentation + math ─────────────────────────────────────────────

export const EMOTION_BASE: Record<Emotion, number> = {
  relieved: 92,
  calm: 72,
  stressed: 52,
  irritated: 36,
  panicked: 22,
  angry: 12,
};

export const EMOTION_META: Record<Emotion, { label: string; icon: string; color: string }> = {
  relieved: { label: "Relieved", icon: "😌", color: "text-emerald-300 bg-emerald-500/15" },
  calm: { label: "Calm", icon: "🙂", color: "text-sky-300 bg-sky-500/15" },
  stressed: { label: "Stressed", icon: "😟", color: "text-amber-300 bg-amber-500/15" },
  irritated: { label: "Irritated", icon: "😠", color: "text-orange-300 bg-orange-500/15" },
  panicked: { label: "Panicked", icon: "😰", color: "text-rose-300 bg-rose-500/15" },
  angry: { label: "Angry", icon: "😡", color: "text-red-300 bg-red-500/15" },
};

/** Map a 0-100 meter value to the nearest emotion label. */
export function meterToEmotion(m: number): Emotion {
  if (m >= 84) return "relieved";
  if (m >= 62) return "calm";
  if (m >= 45) return "stressed";
  if (m >= 30) return "irritated";
  if (m >= 18) return "panicked";
  return "angry";
}
