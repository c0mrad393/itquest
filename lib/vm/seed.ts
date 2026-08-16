/**
 * ITQuest — Seed VM
 * ------------------
 * A deterministic starting VMState used for local dev and as the template for
 * the first authored scenario:
 *
 *   SCENARIO: "web-01: 502 Bad Gateway"
 *   Track: Sysadmin · Severity: High
 *   Fault: nginx is active but its upstream app service (gunicorn worker) has
 *          crashed (status: failed). `curl localhost` returns 502. The error
 *          log shows "connect() failed (111: Connection refused) ... upstream".
 *   Fix path (either workspace):
 *          `systemctl start app`  (CLI)  OR  Services panel → app → Start (GUI)
 *   Win condition: services.app.status === "active" && curl localhost → 200.
 */

import type { VMState, FsNode } from "./types";

const now = Date.now();

function dir(
  children: Record<string, FsNode>,
  owner = "root",
  mode = "rwxr-xr-x",
): FsNode {
  return { type: "dir", children, owner, group: owner, mode, mtime: now };
}

function file(
  content: string,
  owner = "root",
  mode = "rw-r--r--",
): FsNode {
  return { type: "file", content, owner, group: owner, mode, mtime: now };
}

const nginxConf = `user www-data;
worker_processes auto;

http {
    upstream app_backend {
        server 127.0.0.1:8000;   # gunicorn app worker
    }

    server {
        listen 80;
        server_name web-01.corp.internal;

        location / {
            proxy_pass http://app_backend;
            proxy_set_header Host $host;
            proxy_read_timeout 30s;
        }
    }
}
`;

export function createSeedVM(): VMState {
  const filesystem: FsNode = dir({
    etc: dir({
      nginx: dir({
        "nginx.conf": file(nginxConf),
        "sites-enabled": dir({}),
      }),
      hostname: file("web-01\n"),
      passwd: file(
        "root:x:0:0:root:/root:/bin/bash\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nokhare:x:1000:1000:Ops Engineer:/home/okhare:/bin/bash\n",
      ),
    }),
    var: dir({
      www: dir({ html: dir({ "index.html": file("<h1>web-01</h1>\n") }) }, "www-data"),
      log: dir({
        nginx: dir({
          "access.log": file(""),
          "error.log": file(""),
        }),
        "auth.log": file(""),
        "syslog": file(""),
      }),
    }),
    home: dir({
      okhare: dir(
        {
          ".bash_history": file("systemctl status nginx\ncurl localhost\n", "okhare", "rw-------"),
          "notes.txt": file("Deploy runbook: restart app worker if 502s appear.\n", "okhare"),
        },
        "okhare",
      ),
    }),
    root: dir({}, "root", "rwx------"),
    opt: dir({
      app: dir({
        "gunicorn.conf.py": file("bind = '127.0.0.1:8000'\nworkers = 3\n"),
      }),
    }),
  });

  return {
    vmId: "vm-web-01",
    hostname: "web-01",
    os: "linux",
    kernel: "5.15.0-91-generic",
    cwd: "/home/okhare",
    currentUser: "okhare",
    env: {
      HOME: "/home/okhare",
      USER: "okhare",
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      SHELL: "/bin/bash",
      PWD: "/home/okhare",
      LANG: "en_US.UTF-8",
    },
    filesystem,

    users: [
      { username: "root", uid: 0, groups: ["root"], home: "/root", shell: "/bin/bash", locked: false, failedLogins: 0, scope: "local" },
      { username: "www-data", uid: 33, groups: ["www-data"], home: "/var/www", shell: "/usr/sbin/nologin", locked: false, failedLogins: 0, scope: "local" },
      { username: "okhare", uid: 1000, groups: ["okhare", "sudo", "adm"], home: "/home/okhare", shell: "/bin/bash", locked: false, failedLogins: 0, scope: "local" },
      // Domain accounts (appear in the AD console). j.doe is locked out after
      // repeated failed logins — the classic Tier-1 "I can't sign in" ticket.
      { username: "j.doe", uid: 2001, groups: ["Domain Users", "Finance"], home: "/home/j.doe", shell: "/bin/bash", locked: true, failedLogins: 7, scope: "domain" },
      { username: "a.smith", uid: 2002, groups: ["Domain Users", "IT-Admins"], home: "/home/a.smith", shell: "/bin/bash", locked: false, failedLogins: 0, scope: "domain" },
    ],

    services: {
      nginx: {
        name: "nginx",
        status: "active",
        enabled: true,
        pid: 812,
        ports: [80],
        configPath: "/etc/nginx/nginx.conf",
        lastMessage: "Started A high performance web server and a reverse proxy server.",
      },
      // THE FAULT: upstream app worker has crashed.
      app: {
        name: "app",
        status: "failed",
        enabled: true,
        pid: null,
        ports: [8000],
        configPath: "/opt/app/gunicorn.conf.py",
        lastMessage:
          "gunicorn: worker failed to boot — MemoryError (OOM). Main process exited, code=exited, status=3/NOTIMPLEMENTED",
      },
      postgresql: {
        name: "postgresql",
        status: "active",
        enabled: true,
        pid: 640,
        ports: [5432],
        lastMessage: "database system is ready to accept connections",
      },
      ssh: { name: "ssh", status: "active", enabled: true, pid: 701, ports: [22] },
    },

    processes: [
      { pid: 1, ppid: 0, user: "root", command: "/sbin/init", cpu: 0.0, mem: 0.1, state: "S" },
      { pid: 640, ppid: 1, user: "postgres", command: "postgres -D /var/lib/postgresql/14/main", cpu: 0.3, mem: 2.1, state: "S" },
      { pid: 701, ppid: 1, user: "root", command: "sshd: /usr/sbin/sshd -D", cpu: 0.0, mem: 0.2, state: "S" },
      { pid: 812, ppid: 1, user: "root", command: "nginx: master process /usr/sbin/nginx", cpu: 0.1, mem: 0.4, state: "S" },
      { pid: 813, ppid: 812, user: "www-data", command: "nginx: worker process", cpu: 0.2, mem: 0.3, state: "S" },
    ],

    network: {
      interfaces: [
        { name: "lo", up: true, ipv4: "127.0.0.1", netmask: "255.0.0.0", mac: "00:00:00:00:00:00", carrier: true },
        { name: "eth0", up: true, ipv4: "10.20.4.11", netmask: "255.255.255.0", mac: "02:42:0a:14:04:0b", carrier: true },
      ],
      routes: [
        { destination: "default", gateway: "10.20.4.1", iface: "eth0", metric: 100 },
        { destination: "10.20.4.0/24", gateway: "0.0.0.0", iface: "eth0", metric: 0 },
      ],
      dnsServers: ["10.20.0.53", "1.1.1.1"],
      hostsTable: {
        localhost: "127.0.0.1",
        "web-01": "127.0.0.1",
        "web-01.corp.internal": "10.20.4.11",
      },
      firewall: [
        { id: "fw-1", chain: "INPUT", action: "ACCEPT", protocol: "tcp", port: 22, source: "any", enabled: true },
        { id: "fw-2", chain: "INPUT", action: "ACCEPT", protocol: "tcp", port: 80, source: "any", enabled: true },
      ],
      reachableHosts: {
        "10.20.4.1": { ip: "10.20.4.1", latencyMs: 0.4, open: [] },
        "1.1.1.1": { ip: "1.1.1.1", latencyMs: 12.3, open: [443] },
        "10.20.0.53": { ip: "10.20.0.53", latencyMs: 0.9, open: [53] },
      },
    },

    logs: {
      "/var/log/nginx/error.log": [
        { ts: now - 60000, severity: "error", line: `2026/07/22 09:14:02 [error] 813#813: *1 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.4.55, server: web-01.corp.internal, request: "GET / HTTP/1.1", upstream: "http://127.0.0.1:8000/", host: "web-01"` },
        { ts: now - 30000, severity: "error", line: `2026/07/22 09:14:32 [error] 813#813: *2 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.4.55, server: web-01.corp.internal, request: "GET /api/health HTTP/1.1", upstream: "http://127.0.0.1:8000/api/health", host: "web-01"` },
      ],
      "/var/log/nginx/access.log": [
        { ts: now - 60000, severity: "info", line: `10.20.4.55 - - [22/Jul/2026:09:14:02 +0000] "GET / HTTP/1.1" 502 552 "-" "Mozilla/5.0"` },
      ],
      "/var/log/auth.log": [
        { ts: now - 120000, severity: "info", line: `Jul 22 09:12:59 web-01 sshd[701]: Accepted publickey for okhare from 10.20.4.55 port 51122 ssh2` },
      ],
      "/var/log/syslog": [
        { ts: now - 45000, severity: "critical", line: `Jul 22 09:13:47 web-01 kernel: [4521.334] Out of memory: Killed process 998 (gunicorn) total-vm:1048576kB` },
      ],
    },

    nextPid: 2000,
  };
}
