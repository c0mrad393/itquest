"use client";

/**
 * File Explorer (GUI)
 * -------------------
 * Browses the SAME filesystem tree the CLI's ls/cat/cd operate on. Read-only
 * for now (write ops arrive with the expanded command set). Click a folder to
 * descend, a file to preview its contents — great for hunting misplaced logs
 * or corrupted config files.
 */

import { useState } from "react";
import { useVMStore } from "@/lib/vm/store";
import { getNode, listDir, resolvePath } from "@/lib/vm/fs";

export default function FilesApp() {
  const root = useVMStore((s) => s.vm.filesystem);
  const [path, setPath] = useState("/etc");
  const [preview, setPreview] = useState<string | null>(null);

  const node = getNode(root, path);
  const entries = node?.type === "dir" ? listDir(node, true) : [];

  const crumbs = path.split("/").filter(Boolean);

  function openEntry(name: string) {
    const childPath = resolvePath(name, path);
    const child = getNode(root, childPath);
    if (!child) return;
    if (child.type === "dir") {
      setPath(childPath);
      setPreview(null);
    } else {
      setPreview(child.binary ? "(binary file)" : child.content ?? "");
    }
  }

  return (
    <div className="flex h-full flex-col text-sm">
      {/* Breadcrumb + up */}
      <div className="flex items-center gap-1 border-b border-edge px-3 py-2 text-xs text-gray-400">
        <button
          onClick={() => {
            setPath(resolvePath("..", path));
            setPreview(null);
          }}
          className="rounded border border-edge px-1.5 py-0.5 hover:bg-edge"
        >
          ↑ Up
        </button>
        <span className="ml-2 text-gray-500">/</span>
        {crumbs.map((c, i) => (
          <span key={i} className="text-gray-300">
            {c}
            <span className="text-gray-600">/</span>
          </span>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Listing */}
        <div className="w-1/2 overflow-y-auto term-scroll border-r border-edge px-2 py-2">
          {entries.length === 0 && <div className="px-2 text-xs text-gray-600">empty</div>}
          {entries.map((name) => {
            const child = getNode(root, resolvePath(name, path));
            const isDir = child?.type === "dir";
            return (
              <button
                key={name}
                onClick={() => openEntry(name)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-panelalt"
              >
                <span>{isDir ? "📁" : name.startsWith(".") ? "📄" : "📃"}</span>
                <span className={isDir ? "text-info" : "text-gray-300"}>{name}</span>
                <span className="ml-auto text-[10px] text-gray-600">{child?.mode}</span>
              </button>
            );
          })}
        </div>

        {/* Preview */}
        <div className="w-1/2 overflow-y-auto term-scroll px-3 py-2">
          {preview === null ? (
            <div className="text-xs text-gray-600">Select a file to preview its contents.</div>
          ) : (
            <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-gray-300">
              {preview}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
