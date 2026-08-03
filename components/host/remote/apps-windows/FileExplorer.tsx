"use client";

/**
 * File Explorer — read-only browse of a node's filesystem tree.
 * Works for any node (Windows NTFS or Linux) via the shared fs helpers.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { getNode, listDir, resolvePath } from "@/lib/vm/fs";
import type { TargetNode } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";

export default function FileExplorer({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as TargetNode | undefined;
  const [path, setPath] = useState(node?.os === "windows" ? "/C:" : "/etc");
  const [preview, setPreview] = useState<string | null>(null);
  if (!node) return null;

  const root = node.filesystem;
  const current = getNode(root, path);
  const entries = current?.type === "dir" ? listDir(current, true) : [];
  const crumbs = path.split("/").filter(Boolean);

  function open(name: string) {
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
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <div className="flex items-center gap-1 border-b border-edge px-3 py-2 text-xs text-gray-400">
        <button
          onClick={() => {
            setPath(resolvePath("..", path));
            setPreview(null);
          }}
          className="rounded border border-edge px-1.5 py-0.5 hover:bg-panelalt"
        >
          ↑ Up
        </button>
        <span className="ml-2 font-mono text-gray-500">
          {crumbs.join(" \\ ") || "\\"}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-1/2 overflow-y-auto term-scroll border-r border-edge px-2 py-2">
          {entries.length === 0 && <div className="px-2 text-xs text-gray-600">empty</div>}
          {entries.map((name) => {
            const child = getNode(root, resolvePath(name, path));
            const isDir = child?.type === "dir";
            return (
              <button
                key={name}
                onClick={() => open(name)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-panelalt"
              >
                <AppIcon id={isDir ? "folder" : "file-text"} size={15} />
                <span className={isDir ? "text-info" : "text-gray-300"}>{name}</span>
              </button>
            );
          })}
        </div>
        <div className="w-1/2 overflow-y-auto term-scroll px-3 py-2">
          {preview === null ? (
            <div className="text-xs text-gray-600">Select a file to preview.</div>
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
