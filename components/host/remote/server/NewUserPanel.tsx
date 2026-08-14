"use client";

/**
 * Modal shell for the new-account form (v0.9.1)
 * =============================================
 * Separate from NewUserForm so the form itself stays presentation-agnostic:
 * the same fields can later open in a side panel, in a ticket's inline
 * workspace, or in a wizard step without the modal coming along with them.
 *
 * The shell owns exactly three things a modal must get right and a form should
 * not have to know about: it dims what is behind it, it closes on Escape and
 * on backdrop click, and it constrains its own height so a long form scrolls
 * INSIDE the dialog rather than pushing its footer off-screen — which is how
 * "the Save button disappeared" bugs happen.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useEffect } from "react";
import NewUserForm from "./NewUserForm";
import { EDS_SHORT } from "@/lib/core";
import { IconUsers, IconX } from "@/components/ui/icons";

export default function NewUserPanel({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-sunken/70 p-4">
      {/* Backdrop click closes. The dialog stops propagation so a click inside
          it — including a drag that ends outside — never dismisses the form. */}
      <div className="absolute inset-0" onClick={onDone} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`New ${EDS_SHORT} account`}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full w-[30rem] flex-col overflow-hidden rounded-lg border border-edge bg-surface shadow-panel"
      >
        <div className="card-header shrink-0">
          <IconUsers size={13} className="text-brand-text" />
          <h2 className="text-[12px] font-semibold text-gray-100">New account</h2>
          <button
            onClick={onDone}
            aria-label="Close"
            className="ml-auto text-gray-500 transition hover:text-gray-200"
          >
            <IconX size={12} />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <NewUserForm onDone={onDone} />
        </div>
      </div>
    </div>
  );
}
