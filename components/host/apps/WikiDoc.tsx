"use client";

/**
 * WikiDoc — the documentation renderer.
 * =====================================
 * A small, dependency-free Markdown subset, styled to the TriageOS surface
 * rather than to a generic prose theme. Supported:
 *
 *   # ## ###        headings
 *   - / * bullet    unordered list
 *   1.              ordered list
 *   > quote         callout
 *   ```lang         fenced code block
 *   | a | b |       table (a --- row marks the header)
 *   ---             horizontal rule
 *   **bold** `code` inline
 *
 * Written as a single pass over lines so articles stay plain strings in
 * lib/wiki/articles.ts and can interpolate live world state.
 */

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "hr" };

/** `**bold**`, `*italic*` and `` `code` `` runs. Bold is matched first. */
function inline(text: string, key: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g).map((chunk, i) => {
    const k = `${key}-${i}`;
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return (
        <strong key={k} className="font-semibold text-gray-100">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2) {
      return (
        <em key={k} className="italic text-gray-200">
          {chunk.slice(1, -1)}
        </em>
      );
    }
    if (chunk.startsWith("`") && chunk.endsWith("`") && chunk.length > 2) {
      return (
        <code
          key={k}
          className="rounded border border-edge bg-black/40 px-1 py-px font-mono text-[11px] text-info"
        >
          {chunk.slice(1, -1)}
        </code>
      );
    }
    return <span key={k}>{chunk}</span>;
  });
}

const cells = (row: string) =>
  row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function parse(md: string): Block[] {
  const lines = md.replace(/\t/g, "  ").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      i++;
      continue;
    }

    // Fenced code — consumed verbatim, no inline parsing inside.
    if (t.startsWith("```")) {
      const lang = t.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i]), i++;
      i++; // closing fence
      blocks.push({ kind: "code", lang, lines: body });
      continue;
    }

    if (/^-{3,}$/.test(t)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(t);
    if (heading) {
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    // Table: a header row followed by a |---| separator.
    if (t.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const head = cells(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i].trim()));
        i++;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    if (t.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }

    // Paragraph: soft-wrap consecutive plain lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|[-*]\s|\d+\.\s|>|```|\||-{3,}$)/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }

  return blocks;
}

const H_CLASS: Record<number, string> = {
  1: "mt-1 text-lg font-bold text-gray-50",
  2: "mt-5 border-b border-edge pb-1.5 text-[15px] font-semibold text-gray-100",
  3: "mt-4 text-[13px] font-semibold text-gray-200",
  4: "mt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500",
};

export default function WikiDoc({ markdown }: { markdown: string }) {
  const blocks = parse(markdown);

  return (
    <div className="text-[12.5px] leading-relaxed text-gray-300">
      {blocks.map((b, i) => {
        const k = `b-${i}`;
        switch (b.kind) {
          case "h":
            return (
              <div key={k} className={H_CLASS[b.level] ?? H_CLASS[3]}>
                {b.text}
              </div>
            );

          case "p":
            return (
              <p key={k} className="my-2.5">
                {inline(b.text, k)}
              </p>
            );

          case "ul":
            return (
              <ul key={k} className="my-2.5 space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-info/70" />
                    <span>{inline(it, `${k}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={k} className="my-2.5 space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-info/15 text-[9px] font-bold text-info">
                      {j + 1}
                    </span>
                    <span>{inline(it, `${k}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            );

          case "quote":
            return (
              <div
                key={k}
                className="my-3 rounded-r-md border-l-2 border-info/60 bg-info/[0.06] py-2 pl-3 pr-3 text-[12px] text-gray-300"
              >
                {b.lines.map((l, j) => (
                  <p key={j} className={j ? "mt-1.5" : ""}>
                    {inline(l, `${k}-${j}`)}
                  </p>
                ))}
              </div>
            );

          case "code":
            return (
              <div key={k} className="my-3 overflow-hidden rounded-lg border border-edge bg-black/45">
                {b.lang && (
                  <div className="border-b border-edge/70 px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-gray-600">
                    {b.lang}
                  </div>
                )}
                <pre className="term-scroll overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                  {b.lines.join("\n")}
                </pre>
              </div>
            );

          case "table":
            return (
              <div key={k} className="term-scroll my-3 overflow-x-auto rounded-lg border border-edge">
                <table className="w-full border-collapse text-left text-[11.5px]">
                  <thead>
                    <tr className="bg-panelalt">
                      {b.head.map((h, j) => (
                        <th
                          key={j}
                          className="whitespace-nowrap border-b border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-edge/40 last:border-0 hover:bg-white/[0.02]">
                        {r.map((c, m) => (
                          <td key={m} className="px-3 py-1.5 align-top text-gray-300">
                            {inline(c, `${k}-${j}-${m}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "hr":
            return <div key={k} className="my-4 h-px bg-edge" />;
        }
      })}
    </div>
  );
}
