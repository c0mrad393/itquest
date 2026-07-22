/**
 * TriageOS — CLI Interpreter
 * --------------------------
 * A sandboxed command engine. It NEVER shells out. Each command is a pure-ish
 * function (VMState, argv) => { result, next } where `next` is the new VMState
 * (immutably produced) when the command mutated anything.
 *
 * The interpreter itself handles: tokenizing, flag parsing, command lookup,
 * and a small amount of shell grammar (pipes `|`, redirection is intentionally
 * limited for now). Real shell features are added deliberately, per scenario
 * need, to keep behavior realistic and predictable.
 */

import type { CommandResult, VMState } from "./types";

export interface CommandContext {
  vm: VMState;
  /** Parsed positional args (command name excluded). */
  args: string[];
  /** Flags map, e.g. { l: true, a: true } for `ls -la`; long flags too. */
  flags: Record<string, boolean | string>;
  /** Raw argv including the command name (some commands need it). */
  argv: string[];
  /** stdin piped from a previous command (empty string if none). */
  stdin: string;
}

/**
 * A command handler. Returns rendered output + exit code, and OPTIONALLY a
 * `next` VMState if it mutated. Handlers must treat `ctx.vm` as read-only and
 * build `next` via structuredClone when mutating.
 */
export type CommandHandler = (ctx: CommandContext) => {
  result: CommandResult;
  next?: VMState;
};

export interface CommandSpec {
  name: string;
  summary: string;
  usage: string;
  handler: CommandHandler;
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

/** Split a line honoring single/double quotes. Minimal but correct for our needs. */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " " || ch === "\t") {
      if (cur) tokens.push(cur), (cur = "");
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/** Separate flags (-l, --long, -la bundle) from positional args. */
export function parseFlags(tokens: string[]): {
  args: string[];
  flags: Record<string, boolean | string>;
} {
  const args: string[] = [];
  const flags: Record<string, boolean | string> = {};
  for (const t of tokens) {
    if (t.startsWith("--")) {
      const [k, v] = t.slice(2).split("=");
      flags[k] = v ?? true;
    } else if (t.startsWith("-") && t.length > 1 && !/^-\d/.test(t)) {
      for (const ch of t.slice(1)) flags[ch] = true;
    } else {
      args.push(t);
    }
  }
  return { args, flags };
}

// ── Registry & dispatch ───────────────────────────────────────────────────────

export class Interpreter {
  private registry = new Map<string, CommandSpec>();

  register(spec: CommandSpec): this {
    this.registry.set(spec.name, spec);
    return this;
  }

  registerAll(specs: CommandSpec[]): this {
    specs.forEach((s) => this.register(s));
    return this;
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  list(): CommandSpec[] {
    return [...this.registry.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): CommandSpec | undefined {
    return this.registry.get(name);
  }

  /**
   * Execute a full command line (supporting a single level of `|` piping).
   * Returns the final rendered result and the resulting VMState.
   */
  run(line: string, vm: VMState): { result: CommandResult; next: VMState } {
    const trimmed = line.trim();
    if (trimmed === "") {
      return { result: { output: "", exitCode: 0, mutated: false }, next: vm };
    }

    const stages = splitPipes(trimmed);
    let stdin = "";
    let state = vm;
    let mutated = false;
    let lastResult: CommandResult = { output: "", exitCode: 0, mutated: false };

    for (let i = 0; i < stages.length; i++) {
      const tokens = tokenize(stages[i]);
      const name = tokens[0];
      const spec = this.registry.get(name);

      if (!spec) {
        lastResult = {
          output: `${name}: command not found`,
          exitCode: 127,
          mutated: false,
        };
        // A failed stage short-circuits the pipeline (like set -o pipefail-ish).
        return { result: lastResult, next: state };
      }

      const { args, flags } = parseFlags(tokens.slice(1));
      const { result, next } = spec.handler({
        vm: state,
        args,
        flags,
        argv: tokens,
        stdin,
      });

      lastResult = result;
      if (next) {
        state = next;
        mutated = true;
      }
      stdin = result.output; // feed to next stage
    }

    return { result: { ...lastResult, mutated }, next: state };
  }
}

/** Split on top-level `|` (quotes respected). */
function splitPipes(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "|") {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
