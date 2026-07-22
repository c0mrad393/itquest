"use client";

/**
 * Control Panel → Services (GUI)
 * ------------------------------
 * Reads services from the shared VMState and drives Start/Stop/Restart through
 * useVMStore.controlService — the SAME interpreter path the terminal uses.
 * Fixing the 502 here resolves the identical ticket you'd resolve in the CLI.
 */

import { useVMStore } from "@/lib/vm/store";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-accent/20 text-accent",
  failed: "bg-danger/20 text-danger",
  inactive: "bg-gray-700/40 text-gray-400",
  activating: "bg-warn/20 text-warn",
};

export default function ServicesApp() {
  const services = useVMStore((s) => Object.values(s.vm.services));
  const control = useVMStore((s) => s.controlService);

  return (
    <div className="p-3 text-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
            <th className="px-2 py-1 font-semibold">Service</th>
            <th className="px-2 py-1 font-semibold">Status</th>
            <th className="px-2 py-1 font-semibold">PID</th>
            <th className="px-2 py-1 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {services.map((svc) => (
            <tr key={svc.name} className="border-t border-edge/60">
              <td className="px-2 py-2">
                <div className="text-gray-200">{svc.name}</div>
                <div className="text-[10px] text-gray-500">
                  {svc.enabled ? "startup: auto" : "startup: manual"}
                </div>
              </td>
              <td className="px-2 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    STATUS_STYLES[svc.status] ?? STATUS_STYLES.inactive
                  }`}
                >
                  {svc.status}
                </span>
              </td>
              <td className="px-2 py-2 text-xs text-gray-400">{svc.pid ?? "—"}</td>
              <td className="px-2 py-2">
                <div className="flex justify-end gap-1">
                  <ActionBtn
                    disabled={svc.status === "active"}
                    onClick={() => control(svc.name, "start")}
                    tone="accent"
                  >
                    Start
                  </ActionBtn>
                  <ActionBtn
                    disabled={svc.status !== "active"}
                    onClick={() => control(svc.name, "stop")}
                    tone="danger"
                  >
                    Stop
                  </ActionBtn>
                  <ActionBtn onClick={() => control(svc.name, "restart")} tone="neutral">
                    Restart
                  </ActionBtn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 px-2 text-[10px] leading-relaxed text-gray-600">
        Actions here route through the same command engine as the CLI
        (<code className="text-info">systemctl</code>). Resolving an incident in this
        panel is identical to resolving it in the terminal.
      </p>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "accent" | "danger" | "neutral";
}) {
  const tones = {
    accent: "border-accent/40 text-accent hover:bg-accent/15",
    danger: "border-danger/40 text-danger hover:bg-danger/15",
    neutral: "border-edge text-gray-300 hover:bg-edge",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-30 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
