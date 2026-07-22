# TriageOS — IT Operations & Cybersecurity Simulator

A gamified, nested-OS simulation of enterprise IT work. You play an IT/security
engineer at a Windows-11-style **host workstation** (Level 0), receiving tickets
and mail from AI customer personas, then opening nested **RDP/SSH sessions**
(Level 1) into simulated client machines — a Linux web server with a fully
interactive terminal, and Windows nodes with working ADUC, services.msc,
Control Panel, and Event Viewer — to diagnose and fix incidents.

Everything is driven by one authoritative, in-browser **InfrastructureState**:
fixing a fault from the CLI or the GUI mutates the same model, auto-resolves the
bound ticket, moves the customer's emotional state, and scores you (SLA × CSAT
→ XP).

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS**
- **Zustand** for all simulation state (host shell, infrastructure, tickets,
  dialogue, SLA clock)
- No backend required — the entire simulation runs client-side
  (Supabase integration planned for persistence/leaderboard sync)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000  (or: next dev -p <port>)
```

Useful scripts: `npm run typecheck` · `npm run build` · `npm run lint`

## Architecture map

| Layer | Path | Role |
|---|---|---|
| Domain types | `lib/core/` | Canonical model: nodes (Linux/Windows union), `InfrastructureState`, tickets/SLA, host app registry, `SessionState` root |
| CLI engine | `lib/vm/` | Sandboxed command interpreter (tokenizer, pipes, ~20 realistic commands) — never shells out |
| Infrastructure | `lib/infra/` | Multi-node store + seed topology; bridges the interpreter onto Linux nodes; Windows GUI mutations |
| Scenarios | `lib/scenario/` | Authored scenario registry (win-conditions) + SLA×CSAT→XP scoring |
| Dialogue | `lib/dialogue/` | Personas, branching dialogue trees, per-ticket emotion/CSAT store |
| SLA | `lib/sla/` | Live shared clock + warning/breach tracking |
| Host shell | `components/host/` | Win11 desktop, taskbar, Start menu, window manager, Ticket Center, Mail, Remote Gateway |
| Nested sessions | `components/host/remote/` | Reusable RDP/SSH session container + per-OS node environments |

## Current scenario pack (Acme Financial)

- `prod-nginx-srv` — Linux web server carrying a 502 Bad Gateway incident
  (fix: bring the crashed upstream back via terminal)
- `dc-01` — Windows Server 2022 DC with a locked-out AD account
  (fix: ADUC → Unlock)
- `client-win-01` — Windows 11 workstation (services / control panel surface)

Built iteratively in phases (types → host shell → nested windowing → node
environments → scenario/dialogue/SLA engines). Phase 6 (persistence,
leaderboard, polish) is in progress.
