/**
 * TriageOS — Command implementations (Linux flavor)
 * -------------------------------------------------
 * The initial command set covering Helpdesk → Sysadmin → NetOps troubleshooting.
 * Every mutating command clones VMState with structuredClone and returns `next`.
 *
 * Realism note: outputs are modeled on real GNU/systemd/iproute2 formatting so
 * muscle memory transfers. They are simulations, not shell passthrough.
 */

import type { CommandContext, CommandSpec } from "./interpreter";
import {
  canRead,
  formatMode,
  getNode,
  listDir,
  nodeAt,
  resolvePath,
} from "./fs";
import type { CommandResult, VMState } from "./types";

const ok = (output: string): { result: CommandResult } => ({
  result: { output, exitCode: 0, mutated: false },
});
const err = (output: string, code = 1): { result: CommandResult } => ({
  result: { output, exitCode: code, mutated: false },
});

function currentGroups(vm: VMState): string[] {
  return vm.users.find((u) => u.username === vm.currentUser)?.groups ?? [];
}

// ── Filesystem & shell basics ─────────────────────────────────────────────────

const pwd: CommandSpec = {
  name: "pwd",
  summary: "print working directory",
  usage: "pwd",
  handler: ({ vm }) => ok(vm.cwd),
};

const whoami: CommandSpec = {
  name: "whoami",
  summary: "print current user",
  usage: "whoami",
  handler: ({ vm }) => ok(vm.currentUser),
};

const hostname: CommandSpec = {
  name: "hostname",
  summary: "show system hostname",
  usage: "hostname",
  handler: ({ vm }) => ok(vm.hostname),
};

const unameCmd: CommandSpec = {
  name: "uname",
  summary: "print system information",
  usage: "uname [-a]",
  handler: ({ vm, flags }) => {
    if (flags.a)
      return ok(
        `Linux ${vm.hostname} ${vm.kernel} #1 SMP x86_64 GNU/Linux`,
      );
    return ok("Linux");
  },
};

const id: CommandSpec = {
  name: "id",
  summary: "print user identity",
  usage: "id",
  handler: ({ vm }) => {
    const u = vm.users.find((x) => x.username === vm.currentUser);
    if (!u) return err("id: current user not found");
    const groups = u.groups.map((g, i) => `${1000 + i}(${g})`).join(",");
    return ok(`uid=${u.uid}(${u.username}) gid=${u.uid}(${u.groups[0]}) groups=${groups}`);
  },
};

const echo: CommandSpec = {
  name: "echo",
  summary: "display a line of text",
  usage: "echo [text...]",
  handler: ({ args }) => ok(args.join(" ")),
};

const cd: CommandSpec = {
  name: "cd",
  summary: "change directory",
  usage: "cd [dir]",
  handler: ({ vm, args }) => {
    const target = args[0] ?? vm.env.HOME;
    const abs = resolvePath(target, vm.cwd);
    const node = getNode(vm.filesystem, abs);
    if (!node) return err(`cd: ${target}: No such file or directory`);
    if (node.type !== "dir") return err(`cd: ${target}: Not a directory`);
    const next = structuredClone(vm);
    next.cwd = abs === "" ? "/" : abs;
    next.env.PWD = next.cwd;
    return { result: { output: "", exitCode: 0, mutated: true }, next };
  },
};

const ls: CommandSpec = {
  name: "ls",
  summary: "list directory contents",
  usage: "ls [-la] [path]",
  handler: ({ vm, args, flags }) => {
    const path = args[0] ?? ".";
    const node = nodeAt(vm, path);
    if (!node) return err(`ls: cannot access '${path}': No such file or directory`, 2);
    const all = !!flags.a;
    const long = !!flags.l;

    if (node.type !== "dir") {
      // Listing a single file.
      return ok(long ? longLine(node, path.split("/").pop() ?? path) : path);
    }
    const names = listDir(node, all);
    if (!long) return ok(names.join("  "));
    const lines = names.map((n) => longLine(node.children![n], n));
    return ok([`total ${names.length}`, ...lines].join("\n"));
  },
};

function longLine(node: ReturnType<typeof getNode> & object, name: string): string {
  const size = node.content ? node.content.length : 4096;
  const date = new Date(node.mtime).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatMode(node)} 1 ${node.owner} ${node.group} ${String(size).padStart(6)} ${date} ${name}`;
}

const cat: CommandSpec = {
  name: "cat",
  summary: "concatenate and print files",
  usage: "cat <file>",
  handler: ({ vm, args }) => {
    if (args.length === 0) return err("cat: missing file operand");
    const out: string[] = [];
    for (const p of args) {
      const node = nodeAt(vm, p);
      if (!node) return err(`cat: ${p}: No such file or directory`);
      if (node.type === "dir") return err(`cat: ${p}: Is a directory`);
      if (node.binary) return err(`cat: ${p}: cannot display binary file`);
      if (!canRead(node, vm.currentUser, currentGroups(vm)))
        return err(`cat: ${p}: Permission denied`);
      out.push(node.content ?? "");
    }
    return ok(out.join(""));
  },
};

const grep: CommandSpec = {
  name: "grep",
  summary: "search text for a pattern",
  usage: "grep [-i] [-n] <pattern> [file]",
  handler: ({ vm, args, flags, stdin }) => {
    const pattern = args[0];
    if (!pattern) return err("usage: grep [-i] [-n] pattern [file]", 2);
    let text = stdin;
    if (args[1]) {
      const node = nodeAt(vm, args[1]);
      if (!node) return err(`grep: ${args[1]}: No such file or directory`, 2);
      if (node.type === "dir") return err(`grep: ${args[1]}: Is a directory`, 2);
      text = node.content ?? "";
    }
    const re = new RegExp(pattern, flags.i ? "i" : "");
    const matches: string[] = [];
    text.split("\n").forEach((ln, i) => {
      if (re.test(ln)) matches.push(flags.n ? `${i + 1}:${ln}` : ln);
    });
    if (matches.length === 0) return { result: { output: "", exitCode: 1, mutated: false } };
    return ok(matches.join("\n"));
  },
};

const tail: CommandSpec = {
  name: "tail",
  summary: "output the last part of files",
  usage: "tail [-n N] <file>",
  handler: ({ vm, args, flags, stdin }) => {
    const n = typeof flags.n === "string" ? parseInt(flags.n, 10) : 10;
    let text = stdin;
    const fileArg = args[0];
    if (fileArg) {
      // Support log-store paths (dynamic) as well as fs files.
      const abs = resolvePath(fileArg, vm.cwd);
      if (vm.logs[abs]) {
        text = vm.logs[abs].map((e) => e.line).join("\n");
      } else {
        const node = nodeAt(vm, fileArg);
        if (!node) return err(`tail: cannot open '${fileArg}': No such file or directory`);
        text = node.content ?? "";
      }
    }
    const lines = text.split("\n");
    return ok(lines.slice(Math.max(0, lines.length - n)).join("\n"));
  },
};

const head: CommandSpec = {
  name: "head",
  summary: "output the first part of files",
  usage: "head [-n N] <file>",
  handler: ({ vm, args, flags, stdin }) => {
    const n = typeof flags.n === "string" ? parseInt(flags.n, 10) : 10;
    let text = stdin;
    if (args[0]) {
      const node = nodeAt(vm, args[0]);
      if (!node) return err(`head: cannot open '${args[0]}': No such file or directory`);
      text = node.content ?? "";
    }
    return ok(text.split("\n").slice(0, n).join("\n"));
  },
};

// ── Services (systemctl) ──────────────────────────────────────────────────────

const systemctl: CommandSpec = {
  name: "systemctl",
  summary: "control the systemd system and service manager",
  usage: "systemctl <status|start|stop|restart|list-units> [service]",
  handler: ({ vm, args }) => {
    const sub = args[0];
    const svcName = args[1]?.replace(/\.service$/, "");

    if (sub === "list-units" || (!sub && !svcName)) {
      const rows = Object.values(vm.services).map(
        (s) =>
          `${s.name}.service`.padEnd(22) +
          `loaded ${s.status === "active" ? "active   running" : s.status === "failed" ? "failed   failed " : "inactive dead   "}`,
      );
      return ok(["UNIT".padEnd(22) + "LOAD   ACTIVE   SUB", ...rows].join("\n"));
    }

    if (!svcName) return err("systemctl: service name required", 2);
    const svc = vm.services[svcName];
    if (!svc) return err(`Unit ${svcName}.service could not be found.`, 4);

    if (sub === "status") {
      const dot = svc.status === "active" ? "●" : svc.status === "failed" ? "×" : "○";
      const activeLine =
        svc.status === "active"
          ? `active (running)`
          : svc.status === "failed"
            ? `failed (Result: exit-code)`
            : `inactive (dead)`;
      return {
        result: {
          output: [
            `${dot} ${svc.name}.service - ${svc.name}`,
            `     Loaded: loaded (${svc.configPath ?? "/lib/systemd/system/" + svc.name + ".service"}; ${svc.enabled ? "enabled" : "disabled"})`,
            `     Active: ${activeLine}` + (svc.pid ? `` : ``),
            svc.pid ? `   Main PID: ${svc.pid} (${svc.name})` : `   Main PID: (none)`,
            svc.ports?.length ? `      Ports: ${svc.ports.join(", ")}` : ``,
            ``,
            svc.lastMessage ? `${vm.hostname} ${svc.name}[${svc.pid ?? 0}]: ${svc.lastMessage}` : ``,
          ]
            .filter(Boolean)
            .join("\n"),
          // Non-active status returns exit 3 like real systemctl.
          exitCode: svc.status === "active" ? 0 : 3,
          mutated: false,
        },
      };
    }

    if (sub === "start" || sub === "restart" || sub === "stop") {
      const next = structuredClone(vm);
      const target = next.services[svcName];
      if (sub === "stop") {
        target.status = "inactive";
        target.pid = null;
        target.lastMessage = `Stopped ${target.name}.`;
      } else {
        // start / restart
        target.status = "active";
        target.pid = next.nextPid++;
        target.lastMessage = `Started ${target.name}.`;
        // Bring a matching process into the table for realism.
        next.processes.push({
          pid: target.pid,
          ppid: 1,
          user: "root",
          command: `${target.name}: master process`,
          cpu: 0.1,
          mem: 0.4,
          state: "S",
        });
      }
      return {
        result: {
          output: "", // real systemctl is silent on success
          exitCode: 0,
          mutated: true,
          event: { type: `service:${sub}`, payload: { service: svcName } },
        },
        next,
      };
    }

    if (sub === "enable" || sub === "disable") {
      const next = structuredClone(vm);
      next.services[svcName].enabled = sub === "enable";
      return {
        result: {
          output: `${sub === "enable" ? "Created" : "Removed"} symlink for ${svcName}.service.`,
          exitCode: 0,
          mutated: true,
        },
        next,
      };
    }

    return err(`Unknown operation '${sub}'.`, 2);
  },
};

const ps: CommandSpec = {
  name: "ps",
  summary: "report process status",
  usage: "ps aux",
  handler: ({ vm }) => {
    const header = "USER       PID %CPU %MEM  STAT COMMAND";
    const rows = vm.processes.map(
      (p) =>
        `${p.user.padEnd(9)} ${String(p.pid).padStart(5)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)}  ${p.state.padEnd(4)} ${p.command}`,
    );
    return ok([header, ...rows].join("\n"));
  },
};

const ss: CommandSpec = {
  name: "ss",
  summary: "socket statistics (listening ports)",
  usage: "ss -tlnp",
  handler: ({ vm }) => {
    const header = "State      Local Address:Port    Process";
    const rows = Object.values(vm.services)
      .filter((s) => s.status === "active" && s.ports?.length)
      .flatMap((s) =>
        s.ports!.map(
          (port) =>
            `LISTEN     0.0.0.0:${port}`.padEnd(30) + `users:(("${s.name}",pid=${s.pid},fd=6))`,
        ),
      );
    return ok([header, ...rows].join("\n"));
  },
};

// ── Networking ────────────────────────────────────────────────────────────────

const ifconfigCmd: CommandSpec = {
  name: "ifconfig",
  summary: "configure / show network interfaces",
  usage: "ifconfig [iface] [up|down]",
  handler: ({ vm, args }) => {
    // Mutating form: `ifconfig eth0 up` / `ifconfig eth0 down`.
    if (args[1] === "up" || args[1] === "down") {
      const target = vm.network.interfaces.find((i) => i.name === args[0]);
      if (!target)
        return err(`${args[0]}: error fetching interface information: Device not found`);
      const next = structuredClone(vm);
      next.network.interfaces.find((i) => i.name === args[0])!.up = args[1] === "up";
      return {
        result: {
          output: "",
          exitCode: 0,
          mutated: true,
          event: { type: "iface:toggle", payload: { name: args[0], up: args[1] === "up" } },
        },
        next,
      };
    }

    const ifaces = args[0]
      ? vm.network.interfaces.filter((i) => i.name === args[0])
      : vm.network.interfaces;
    if (args[0] && ifaces.length === 0) return err(`${args[0]}: error fetching interface information: Device not found`);
    const blocks = ifaces.map((i) => {
      const flags = i.up ? "UP,BROADCAST,RUNNING,MULTICAST" : "BROADCAST,MULTICAST";
      return [
        `${i.name}: flags=<${flags}>  mtu 1500`,
        i.ipv4 ? `        inet ${i.ipv4}  netmask ${i.netmask}` : `        (no ipv4 assigned)`,
        `        ether ${i.mac}  txqueuelen 1000  (Ethernet)`,
        i.up ? `        status: active` : `        status: inactive (admin down)`,
      ].join("\n");
    });
    return ok(blocks.join("\n\n"));
  },
};

const ping: CommandSpec = {
  name: "ping",
  summary: "send ICMP echo requests",
  usage: "ping [-c N] <host>",
  handler: ({ vm, args, flags }) => {
    const host = args[0];
    if (!host) return err("ping: usage error: Destination address required", 2);
    const count = typeof flags.c === "string" ? parseInt(flags.c, 10) : 4;

    // Resolve host → ip via hosts table, then dns-known reachable set.
    const ip = vm.network.hostsTable[host] ?? host;
    const eth = vm.network.interfaces.find((i) => i.name !== "lo");
    const linkUp = ip.startsWith("127.") || (eth?.up && eth.carrier);

    if (!linkUp) {
      return err(`connect: Network is unreachable`, 2);
    }

    const target = ip.startsWith("127.")
      ? { latencyMs: 0.03 }
      : vm.network.reachableHosts[ip];

    if (!target) {
      const lines = [`PING ${host} (${ip}) 56(84) bytes of data.`];
      for (let i = 0; i < count; i++) lines.push(`Request timeout for icmp_seq ${i}`);
      lines.push(``, `--- ${host} ping statistics ---`, `${count} packets transmitted, 0 received, 100% packet loss`);
      return err(lines.join("\n"), 1);
    }

    const lines = [`PING ${host} (${ip}) 56(84) bytes of data.`];
    for (let i = 0; i < count; i++) {
      const jitter = (target.latencyMs + Math.random() * 0.3).toFixed(3);
      lines.push(`64 bytes from ${ip}: icmp_seq=${i + 1} ttl=64 time=${jitter} ms`);
    }
    lines.push(
      ``,
      `--- ${host} ping statistics ---`,
      `${count} packets transmitted, ${count} received, 0% packet loss`,
    );
    return ok(lines.join("\n"));
  },
};

const nslookup: CommandSpec = {
  name: "nslookup",
  summary: "query DNS records",
  usage: "nslookup <host>",
  handler: ({ vm, args }) => {
    const host = args[0];
    if (!host) return err("nslookup: missing host operand", 1);
    const server = vm.network.dnsServers[0] ?? "127.0.0.53";
    const ip = vm.network.hostsTable[host];
    if (!ip) {
      return err(
        [`Server:\t\t${server}`, `Address:\t${server}#53`, ``, `** server can't find ${host}: NXDOMAIN`].join("\n"),
        1,
      );
    }
    return ok(
      [`Server:\t\t${server}`, `Address:\t${server}#53`, ``, `Name:\t${host}`, `Address: ${ip}`].join("\n"),
    );
  },
};

const curl: CommandSpec = {
  name: "curl",
  summary: "transfer data from a URL",
  usage: "curl [-I] <url>",
  handler: ({ vm, args, flags }) => {
    const raw = args[0];
    if (!raw) return err("curl: try 'curl --help' for more information", 2);
    const url = raw.replace(/^https?:\/\//, "");
    const [hostPart, ...pathParts] = url.split("/");
    const [host, portStr] = hostPart.split(":");
    const path = "/" + pathParts.join("/");
    const port = portStr ? parseInt(portStr, 10) : 80;

    const ip = vm.network.hostsTable[host] ?? host;
    const isLocal = ip.startsWith("127.") || host === "localhost";

    // Local request hits nginx on :80, which proxies to the app upstream.
    if (isLocal && (port === 80 || !portStr)) {
      const nginx = vm.services.nginx;
      if (nginx?.status !== "active") {
        return err(`curl: (7) Failed to connect to ${host} port ${port}: Connection refused`, 7);
      }
      const app = vm.services.app;
      if (app?.status !== "active") {
        // Reproduce the 502 the ticket is about.
        const body = `<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>`;
        if (flags.I)
          return ok(`HTTP/1.1 502 Bad Gateway\r\nServer: nginx\r\nContent-Type: text/html\r\nConnection: keep-alive\r\n`);
        return ok(body);
      }
      if (flags.I)
        return ok(`HTTP/1.1 200 OK\r\nServer: nginx\r\nContent-Type: application/json\r\n`);
      return ok(`{"status":"ok","service":"app","path":"${path}"}`);
    }

    // Remote host reachability.
    const target = vm.network.reachableHosts[ip];
    if (!target || !target.open.includes(port)) {
      return err(`curl: (7) Failed to connect to ${host} port ${port}: Connection refused`, 7);
    }
    return ok(`<html><body>Response from ${host}:${port}${path}</body></html>`);
  },
};

// ── Meta ──────────────────────────────────────────────────────────────────────

const clearCmd: CommandSpec = {
  name: "clear",
  summary: "clear the terminal screen",
  usage: "clear",
  // Special marker consumed by the Terminal component.
  handler: () => ({ result: { output: "\x1b[2J\x1b[H", exitCode: 0, mutated: false } }),
};

/** Built with a closure so `help` can enumerate the registry it belongs to. */
export function makeHelp(list: () => CommandSpec[]): CommandSpec {
  return {
    name: "help",
    summary: "list available commands",
    usage: "help [command]",
    handler: ({ args }: CommandContext) => {
      if (args[0]) {
        const spec = list().find((c) => c.name === args[0]);
        if (!spec) return err(`help: no help topic for '${args[0]}'`);
        return ok(`${spec.name} — ${spec.summary}\n  usage: ${spec.usage}`);
      }
      const rows = list().map((c) => `  ${c.name.padEnd(12)} ${c.summary}`);
      return ok(["Available commands:", ...rows].join("\n"));
    },
  };
}

export const baseCommands: CommandSpec[] = [
  pwd,
  whoami,
  hostname,
  unameCmd,
  id,
  echo,
  cd,
  ls,
  cat,
  grep,
  tail,
  head,
  systemctl,
  ps,
  ss,
  ifconfigCmd,
  ping,
  nslookup,
  curl,
  clearCmd,
];
