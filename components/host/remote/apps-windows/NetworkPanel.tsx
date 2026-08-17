"use client";

/**
 * Network Connections (ncpa.cpl equivalent)
 * =========================================
 * Adapters on one node, and the IPv4 properties dialog behind each.
 *
 * Every control writes straight to the infra store, so a ticket that breaks
 * DNS on a machine is fixed by fixing DNS on that machine — there is no second
 * copy of the truth for a win-condition to disagree with.
 *
 * ── DHCP vs STATIC IS A MODE, NOT A GUESS ───────────────────────────────────
 *
 * Windows decides which radio is selected from whether the adapter is
 * configured statically, and this needs a stored intent because the two are
 * INDISTINGUISBABLE from the resulting address alone: a machine on DHCP that
 * received 10.0.0.5 and a machine statically set to 10.0.0.5 look identical.
 * The mode lives in local component state seeded from the node, so switching
 * to Static and back does not silently rewrite the address the operator was
 * about to read.
 *
 * ── AN EMPTY FIELD IS NOT A ZERO ────────────────────────────────────────────
 *
 * Clearing the gateway box and saving writes an EMPTY gateway, which is a
 * legitimate (and broken) configuration a ticket may want. It does not write
 * "0.0.0.0" and it does not silently keep the old value — a settings dialog
 * that quietly ignores a cleared field is one an operator cannot trust.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { IconX } from "@/components/ui/icons";

type Mode = "dhcp" | "static";

export default function NetworkPanel({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]);
  const setUp = useInfraStore((s) => s.setNodeInterfaceUp);
  const [editing, setEditing] = useState<string | null>(null);

  const ifaces = node?.network?.interfaces ?? [];
  const gateway = useMemo(
    () => node?.network?.routes?.find((r) => r.destination === "default")?.gateway ?? "",
    [node],
  );

  if (!node) return <div className="p-4 text-[12px] text-gray-500">Node not found.</div>;

  return (
    <div className="flex h-full flex-col bg-panel text-[12px] text-gray-200">
      <div className="shrink-0 border-b border-edge bg-panelalt px-3 py-2">
        <div className="text-[12px] font-semibold text-gray-100">Network Connections</div>
        <div className="text-[10px] text-gray-500">
          {node.hostname} · {ifaces.length} adapter{ifaces.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto term-scroll p-3">
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
          {ifaces.map((nic) => {
            /*
             * Three states, not two. "Disabled" is the adapter being switched
             * off; "Network cable unplugged" is it being on with no link. A UI
             * that collapses them into "not working" hides the difference
             * between a fix that is one click away and one that is in the
             * comms room.
             */
            const status = !nic.up
              ? { label: "Disabled", ink: "text-gray-500", dot: "bg-gray-600" }
              : nic.ipv4
                ? { label: "Connected", ink: "text-accent-strong", dot: "bg-accent" }
                : { label: "No network access", ink: "text-warn-strong", dot: "bg-warn" };

            return (
              <div key={nic.name} className="rounded-md border border-edge bg-panelalt p-3">
                <div className="flex items-start gap-2">
                  <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-gray-100">{nic.name}</div>
                    <div className={`text-[10.5px] ${status.ink}`}>{status.label}</div>
                    <div className="mt-1 font-mono text-[10px] text-gray-500">
                      {nic.up ? nic.ipv4 || "no address" : "—"}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setUp(nodeId, nic.name, !nic.up)}
                    className="rounded border border-edge px-2 py-1 text-[10.5px] text-gray-200 transition hover:bg-panel"
                  >
                    {nic.up ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => setEditing(nic.name)}
                    disabled={!nic.up}
                    className="rounded border border-edge px-2 py-1 text-[10.5px] text-gray-200 transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40"
                    title={nic.up ? undefined : "Enable the adapter before changing its properties"}
                  >
                    Properties
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <Ipv4Dialog
          nodeId={nodeId}
          iface={editing}
          currentIp={ifaces.find((i) => i.name === editing)?.ipv4 ?? ""}
          currentMask={ifaces.find((i) => i.name === editing)?.netmask ?? "255.255.255.0"}
          currentGateway={gateway}
          currentDns={node.network?.dnsServers ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Ipv4Dialog({
  nodeId,
  iface,
  currentIp,
  currentMask,
  currentGateway,
  currentDns,
  onClose,
}: {
  nodeId: string;
  iface: string;
  currentIp: string;
  currentMask: string;
  currentGateway: string;
  currentDns: string[];
  onClose: () => void;
}) {
  const setIpv4 = useInfraStore((s) => s.setNodeIpv4);
  const setDns = useInfraStore((s) => s.setNodeDns);

  const [mode, setMode] = useState<Mode>(currentIp ? "static" : "dhcp");
  const [dnsMode, setDnsMode] = useState<Mode>(currentDns.length ? "static" : "dhcp");
  const [ip, setIp] = useState(currentIp);
  const [mask, setMask] = useState(currentMask);
  const [gw, setGw] = useState(currentGateway);
  const [dns1, setDns1] = useState(currentDns[0] ?? "");
  const [dns2, setDns2] = useState(currentDns[1] ?? "");

  function save() {
    if (mode === "static") setIpv4(nodeId, iface, ip.trim());
    if (dnsMode === "static") {
      // Filter empties so a blank alternate does not become a resolver the
      // machine tries and fails on.
      setDns(nodeId, [dns1.trim(), dns2.trim()].filter(Boolean));
    } else {
      setDns(nodeId, []);
    }
    onClose();
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-sunken/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Internet Protocol Version 4 properties for ${iface}`}
        className="ctx-in w-full max-w-[24rem] overflow-hidden rounded-md border border-edge bg-panel shadow-panel"
      >
        <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-gray-100">
            Internet Protocol Version 4 (TCP/IPv4)
          </span>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-500/15 hover:text-gray-100">
            <IconX size={11} />
          </button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto term-scroll p-3">
          <Radio
            name="ipmode"
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { value: "dhcp", label: "Obtain an IP address automatically" },
              { value: "static", label: "Use the following IP address:" },
            ]}
          />
          <div className="mt-1.5 space-y-1.5 pl-5">
            <Field label="IP address" value={ip} onChange={setIp} disabled={mode !== "static"} />
            <Field label="Subnet mask" value={mask} onChange={setMask} disabled={mode !== "static"} />
            <Field label="Default gateway" value={gw} onChange={setGw} disabled={mode !== "static"} />
          </div>

          <div className="mt-3 border-t border-edge pt-3">
            <Radio
              name="dnsmode"
              value={dnsMode}
              onChange={(v) => setDnsMode(v as Mode)}
              options={[
                { value: "dhcp", label: "Obtain DNS server address automatically" },
                { value: "static", label: "Use the following DNS server addresses:" },
              ]}
            />
            <div className="mt-1.5 space-y-1.5 pl-5">
              <Field label="Preferred DNS" value={dns1} onChange={setDns1} disabled={dnsMode !== "static"} />
              <Field label="Alternate DNS" value={dns2} onChange={setDns2} disabled={dnsMode !== "static"} />
            </div>
          </div>
        </div>

        <div className="form-footer">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={save} className="btn-primary btn-sm">OK</button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-[6.5rem] shrink-0 text-[10.5px] text-gray-400">{label}:</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        className="min-w-0 flex-1 rounded border border-edge bg-surface-2 px-2 py-1 font-mono text-[11px] text-gray-100 outline-none transition focus:border-brand-text disabled:opacity-40"
      />
    </label>
  );
}

function Radio({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="accent-info"
          />
          <span className="text-[11px] text-gray-200">{o.label}</span>
        </label>
      ))}
    </div>
  );
}
