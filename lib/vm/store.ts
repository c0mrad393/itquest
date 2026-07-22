/**
 * TriageOS — VM Store (Zustand)
 * -----------------------------
 * The single source of truth for one live simulated host, shared by the CLI
 * terminal and (later) the GUI window-manager. Any component that mutates the
 * machine goes through here, so both workspaces stay perfectly in sync.
 *
 * The store also owns:
 *   - the configured Interpreter instance (command registry)
 *   - terminal scrollback lines (so the terminal can re-hydrate on remount)
 *   - a win-condition evaluator hook for the scenario engine
 */

"use client";

import { create } from "zustand";
import { Interpreter } from "./interpreter";
import { baseCommands, makeHelp } from "./commands";
import { createSeedVM } from "./seed";
import type { CommandResult, VMState } from "./types";

export interface TerminalLine {
  id: number;
  /** "input" = echoed command, "output" = result, "system" = engine notice. */
  kind: "input" | "output" | "system";
  text: string;
  exitCode?: number;
}

/** Scenario win-condition: given VMState, is the incident resolved? */
export type WinCondition = (vm: VMState) => boolean;

interface VMStore {
  vm: VMState;
  interpreter: Interpreter;
  history: TerminalLine[];
  /** Command line history for up/down arrow recall. */
  commandLog: string[];
  lineSeq: number;

  winCondition: WinCondition | null;
  resolved: boolean;

  /** Execute a raw command line; updates vm + terminal history atomically. */
  execute: (line: string) => CommandResult;
  /**
   * GUI-facing service control. Runs the SAME interpreter path as the terminal
   * (`systemctl <action> <name>`), so a button click and a typed command are
   * provably equivalent — proving the shared-VMState contract.
   */
  controlService: (name: string, action: "start" | "stop" | "restart") => void;
  /** GUI-facing network adapter toggle (Control Panel → Network). */
  setInterfaceUp: (name: string, up: boolean) => void;
  /** GUI-facing AD account unlock (Active Directory console). */
  unlockUser: (username: string) => void;
  /** Replace the VM wholesale (loading a scenario / resetting). */
  loadVM: (vm: VMState, win?: WinCondition) => void;
  reset: () => void;
  pushSystem: (text: string) => void;
  clearScreen: () => void;
}

function buildInterpreter(): Interpreter {
  const interp = new Interpreter();
  interp.registerAll(baseCommands);
  interp.register(makeHelp(() => interp.list()));
  return interp;
}

/** Default win-condition for the seed "502" scenario. */
export const seed502Win: WinCondition = (vm) =>
  vm.services.app?.status === "active" && vm.services.nginx?.status === "active";

export const useVMStore = create<VMStore>((set, get) => ({
  vm: createSeedVM(),
  interpreter: buildInterpreter(),
  history: [],
  commandLog: [],
  lineSeq: 0,
  winCondition: seed502Win,
  resolved: false,

  execute: (line) => {
    const { vm, interpreter, winCondition } = get();
    const { result, next } = interpreter.run(line, vm);

    // clear is a display-only signal handled by the component; skip scrollback.
    const isClear = result.output.startsWith("\x1b[2J");

    set((s) => {
      let seq = s.lineSeq;
      const newLines: TerminalLine[] = [];
      const prompt = `${vm.currentUser}@${vm.hostname}:${shortCwd(vm)}$ ${line}`;
      newLines.push({ id: seq++, kind: "input", text: prompt });
      if (!isClear && result.output !== "") {
        newLines.push({
          id: seq++,
          kind: "output",
          text: result.output,
          exitCode: result.exitCode,
        });
      }

      const nextVm = next;
      const nowResolved =
        winCondition && !s.resolved && winCondition(nextVm) ? true : s.resolved;

      if (nowResolved && !s.resolved) {
        newLines.push({
          id: seq++,
          kind: "system",
          text: "✔ Incident resolved — service health restored. (+XP pending scoring)",
        });
      }

      return {
        vm: nextVm,
        lineSeq: seq,
        history: isClear ? [] : [...s.history, ...newLines],
        commandLog: line.trim() ? [...s.commandLog, line] : s.commandLog,
        resolved: nowResolved,
      };
    });

    return result;
  },

  controlService: (name, action) => {
    const { vm, interpreter, winCondition } = get();
    // Reuse the exact terminal code path — this IS `systemctl <action> <name>`.
    const { next } = interpreter.run(`systemctl ${action} ${name}`, vm);
    set((s) => {
      const nowResolved =
        winCondition && !s.resolved && winCondition(next) ? true : s.resolved;
      const lines: TerminalLine[] = [
        {
          id: s.lineSeq,
          kind: "system",
          text: `[GUI · Services] ${action} ${name} → ${next.services[name]?.status ?? "?"}`,
        },
      ];
      if (nowResolved && !s.resolved) {
        lines.push({
          id: s.lineSeq + 1,
          kind: "system",
          text: "✔ Incident resolved — service health restored. (+XP pending scoring)",
        });
      }
      return {
        vm: next,
        history: [...s.history, ...lines],
        lineSeq: s.lineSeq + lines.length,
        resolved: nowResolved,
      };
    });
  },

  setInterfaceUp: (name, up) => {
    const { vm } = get();
    const next = structuredClone(vm);
    const iface = next.network.interfaces.find((i) => i.name === name);
    if (!iface) return;
    iface.up = up;
    set((s) => ({
      vm: next,
      history: [
        ...s.history,
        {
          id: s.lineSeq,
          kind: "system",
          text: `[GUI · Network] ${name} administratively ${up ? "UP" : "DOWN"}`,
        },
      ],
      lineSeq: s.lineSeq + 1,
    }));
  },

  unlockUser: (username) => {
    const { vm } = get();
    const next = structuredClone(vm);
    const u = next.users.find((x) => x.username === username);
    if (!u) return;
    u.locked = false;
    u.failedLogins = 0;
    set((s) => ({
      vm: next,
      history: [
        ...s.history,
        {
          id: s.lineSeq,
          kind: "system",
          text: `[GUI · Active Directory] Unlocked account '${username}' (failed logins reset)`,
        },
      ],
      lineSeq: s.lineSeq + 1,
    }));
  },

  loadVM: (vm, win) =>
    set({
      vm,
      history: [],
      commandLog: [],
      lineSeq: 0,
      winCondition: win ?? null,
      resolved: false,
    }),

  reset: () =>
    set({
      vm: createSeedVM(),
      interpreter: buildInterpreter(),
      history: [],
      commandLog: [],
      lineSeq: 0,
      winCondition: seed502Win,
      resolved: false,
    }),

  pushSystem: (text) =>
    set((s) => ({
      history: [...s.history, { id: s.lineSeq, kind: "system", text }],
      lineSeq: s.lineSeq + 1,
    })),

  clearScreen: () => set({ history: [] }),
}));

/** Compress $HOME to ~ for the prompt, like a real shell. */
function shortCwd(vm: VMState): string {
  if (vm.cwd === vm.env.HOME) return "~";
  if (vm.cwd.startsWith(vm.env.HOME + "/")) return "~" + vm.cwd.slice(vm.env.HOME.length);
  return vm.cwd;
}

export { shortCwd };
