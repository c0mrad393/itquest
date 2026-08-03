/**
 * TriageOS — Customer personas
 * ============================
 * Each ticket references one persona by id. Baseline emotion sets the opening
 * tone; the dialogue store evolves it from there.
 */

import type { Persona } from "./types";

export const PERSONAS: Record<string, Persona> = {
  "persona-priya-stressed": {
    id: "persona-priya-stressed",
    name: "Priya Nair",
    role: "E-commerce Operations Lead",
    org: "Acme Financial",
    avatar: "violet",
    baseline: "stressed",
    style: "Time-pressured, revenue-focused; calms quickly when she sees competent progress.",
  },
  "persona-jane-irritated": {
    id: "persona-jane-irritated",
    name: "Jane Doe",
    role: "Finance Analyst",
    org: "Acme Financial",
    avatar: "teal",
    baseline: "irritated",
    style: "Frustrated at being locked out before a deadline; wants a fast, no-nonsense fix.",
  },
  "persona-marcus-calm": {
    id: "persona-marcus-calm",
    name: "Marcus Feld",
    role: "Branch IT Coordinator",
    org: "Acme Financial",
    avatar: "sky",
    baseline: "calm",
    style: "Technical peer, patient and collaborative; appreciates detail.",
  },
  "persona-soc-panicked": {
    id: "persona-soc-panicked",
    name: "SOC On-Call",
    role: "Detection & Response",
    org: "Acme Financial",
    avatar: "crimson",
    baseline: "panicked",
    style: "High-adrenaline incident tone; wants containment and evidence preservation now.",
  },
  "persona-tara-calm": {
    id: "persona-tara-calm",
    name: "Tara Coles",
    role: "Front Desk",
    org: "Acme Financial",
    avatar: "slate",
    baseline: "calm",
    style: "Non-technical, friendly; just wants printing to work again.",
  },
};

export function getPersona(id: string): Persona | undefined {
  return PERSONAS[id];
}
