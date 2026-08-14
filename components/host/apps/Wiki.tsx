"use client";

/**
 * Company Wiki — the in-world documentation portal (Level-0 host app).
 * ====================================================================
 * A corporate intranet: category rail on the left, article list, reading pane.
 * Content comes from lib/wiki/articles.ts and is rendered as a function of the
 * live InfrastructureState, so the addressing plan and server inventory match
 * the operator's actual world.
 *
 * This is the support surface for Hard Mode. It documents standards and
 * procedures — never a specific ticket's answer. Per-ticket walkthroughs live
 * in the Tech Toolbox, which is QA-only.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import {
  WIKI_ARTICLES,
  WIKI_CATEGORIES,
  searchArticles,
  type WikiArticle,
  type WikiCategory,
} from "@/lib/wiki/articles";
import { AppIcon } from "@/components/ui/app-icons";
import type { HostAppIconId } from "@/lib/core";
import { AppHeader, SearchField } from "./AppChrome";
import WikiDoc from "./WikiDoc";

const CATEGORY_ICON: Record<WikiCategory, HostAppIconId> = {
  "Getting started": "book",
  Network: "globe",
  "Enterprise Directory Services": "users",
  "Servers & Services": "server",
  Procedures: "list",
  Reference: "search",
};

export default function Wiki() {
  const infra = useInfraStore((s) => s.infra);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WikiCategory | "all">("all");
  const [openId, setOpenId] = useState<string>(WIKI_ARTICLES[0].id);

  const matches = useMemo(
    () => searchArticles(WIKI_ARTICLES, infra, query),
    [infra, query],
  );

  // A search spans every category — narrowing by category as well would hide
  // the hit the operator is looking for.
  const listed = query.trim()
    ? matches
    : matches.filter((a) => category === "all" || a.category === category);

  const open: WikiArticle | undefined =
    listed.find((a) => a.id === openId) ?? listed[0] ?? WIKI_ARTICLES.find((a) => a.id === openId);

  const grouped = WIKI_CATEGORIES.map((c) => ({
    category: c,
    items: listed.filter((a) => a.category === c),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <AppHeader iconId="book" title="Company Wiki" subtitle={`${infra.org.name} · IT documentation`}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search documentation…"
          className="w-64"
        />
      </AppHeader>

      <div className="flex min-h-0 flex-1">
        {/* Category rail + article index */}
        <div className="flex w-60 shrink-0 flex-col border-r border-edge bg-panelalt">
          {!query.trim() && (
            <div className="scroll-thin flex shrink-0 items-center gap-1 overflow-x-auto border-b border-edge/70 px-2 py-1.5">
              <RailChip active={category === "all"} onClick={() => setCategory("all")}>
                All
              </RailChip>
              {WIKI_CATEGORIES.map((c) => (
                <RailChip key={c} active={category === c} onClick={() => setCategory(c)} title={c}>
                  <AppIcon id={CATEGORY_ICON[c]} size={12} />
                </RailChip>
              ))}
            </div>
          )}

          <div className="term-scroll min-h-0 flex-1 overflow-y-auto py-1">
            {query.trim() && (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-600">
                {listed.length} result{listed.length === 1 ? "" : "s"} for “{query.trim()}”
              </div>
            )}
            {grouped.length === 0 && (
              <div className="px-3 py-6 text-center text-[11px] text-gray-600">
                Nothing in the wiki matches that.
              </div>
            )}
            {grouped.map((g) => (
              <div key={g.category} className="mb-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                  <AppIcon id={CATEGORY_ICON[g.category]} size={11} />
                  {g.category}
                </div>
                {g.items.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setOpenId(a.id)}
                    className={`block w-full border-l-2 px-3 py-1.5 text-left transition ${
                      open?.id === a.id
                        ? "border-info bg-info/10"
                        : "border-transparent hover:bg-white/[0.03]"
                    }`}
                  >
                    <div
                      className={`truncate text-[12px] ${
                        open?.id === a.id ? "font-medium text-info" : "text-gray-300"
                      }`}
                    >
                      {a.title}
                    </div>
                    <div className="truncate text-[10px] text-gray-600">{a.summary}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Reading pane */}
        <div className="term-scroll min-w-0 flex-1 overflow-y-auto">
          {open ? (
            <article className="mx-auto max-w-3xl px-7 py-6">
              <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-600">
                <AppIcon id={CATEGORY_ICON[open.category]} size={11} />
                {open.category}
              </div>
              <WikiDoc markdown={open.body(infra).trim()} />
              <div className="mt-8 flex flex-wrap items-center gap-1.5 border-t border-edge pt-4">
                {open.tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setQuery(t)}
                    className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gray-500 transition hover:bg-white/10 hover:text-gray-300"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </article>
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-gray-600">
              Select an article.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RailChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-6 shrink-0 items-center justify-center gap-1 rounded px-2 text-[10px] font-medium transition ${
        active ? "bg-info/20 text-info" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}
