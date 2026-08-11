// Pure parsers over the Durabo discovery repo's markdown. Text in, objects
// out — the file reads live in io.ts so Jort's pushes show up without a sync.

export interface RosterRow {
  num: number;
  name: string;
  slug: string;
  department: string;
  status: string; // first word of the status cell: scheduled | excluded | ...
  statusNote: string; // the parenthetical, if any
  date?: string; // ISO "2026-08-12"
  time?: string; // "09:45"
  interviewer?: string; // from a "— Jort" / "— Sarvesh" annotation in the date cell
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", mrt: "03", apr: "04", may: "05", mei: "05",
  jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", okt: "10", nov: "11", dec: "12",
};

export function parseRoster(md: string): RosterRow[] {
  const rows: RosterRow[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*(\d+)\s*\|(.+)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    // # | Name | Department | Status | Interview date | Email | Employee file
    if (cells.length < 6) continue;
    const [name, department, statusCell, dateCell, , fileCell] = cells;
    const slugMatch = fileCell.match(/employees\/([a-z0-9-]+)\//);
    if (!slugMatch) continue;
    const statusWord = statusCell.match(/^[a-z-]+/i)?.[0] ?? statusCell;
    const statusNote = statusCell.match(/\((.*)\)\s*$/)?.[1] ?? "";
    const d = dateCell.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4}),?\s*(\d{1,2}:\d{2})/);
    const month = d ? MONTHS[d[2].toLowerCase()] : undefined;
    const interviewer = dateCell.match(/—\s*(Jort|Sarvesh)/)?.[1];
    rows.push({
      num: Number(m[1]),
      name,
      slug: slugMatch[1],
      department,
      status: statusWord.toLowerCase(),
      statusNote,
      date: d && month ? `${d[3]}-${month}-${d[1].padStart(2, "0")}` : undefined,
      time: d ? d[4].padStart(5, "0") : undefined,
      interviewer,
    });
  }
  return rows;
}

export interface CardStep {
  num: number;
  title: string;
  minutes: number;
  /** e.g. "NOOIT overslaan" / "sla over als je krap zit" / "" */
  flag: string;
  /** Planned cumulative minute at which this step should be DONE. */
  endsBy: number;
  html: string;
}

export function parseFieldCard(md: string): CardStep[] {
  const steps: CardStep[] = [];
  const parts = md.split(/^## /m).slice(1);
  let clock = 0;
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const heading = part.slice(0, nl).trim();
    const h = heading.match(/^(\d+)\s*·\s*(.+?)\s*\((\d+)\s*min[^)]*\)\s*(?:—\s*(.+))?$/);
    if (!h) continue; // preamble sections like "Voor je begint"
    const minutes = Number(h[3]);
    clock += minutes;
    steps.push({
      num: Number(h[1]),
      title: h[2],
      minutes,
      flag: h[4]?.trim() ?? "",
      endsBy: clock,
      html: mdToHtml(part.slice(nl + 1).replace(/\n---\s*$/, "").trim()),
    });
  }
  return steps;
}

export interface EmployeeDoc {
  meta: Record<string, string>;
  html: string;
}

/** Frontmatter → meta; MAP-DATA block and HTML comments stripped; rest rendered. */
export function parseEmployeeDoc(md: string): EmployeeDoc {
  const meta: Record<string, string> = {};
  let body = md;
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    body = md.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const kv = line.match(/^([^:]+):\s*(.*)$/);
      if (kv) meta[kv[1].trim()] = kv[2].trim();
    }
  }
  body = body
    .replace(/<!-- MAP-DATA:START -->[\s\S]*?<!-- MAP-DATA:END -->/, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return { meta, html: mdToHtml(body.trim()) };
}

// ---------- tiny markdown renderer ----------
// Headings, bold, italic, code, links-as-text, lists, blockquotes, hr,
// paragraphs. Content is our own repo's, but escape anyway — a transcript
// quote can contain anything.
// ponytail: no tables/nesting beyond one blockquote level; add if a card ever needs it.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export function mdToHtml(md: string): string {
  const out: string[] = [];
  const lines = md.split("\n");
  let i = 0;
  const isItem = (l: string) => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const n = h[1].length + 2; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (line.startsWith(">")) {
      const block: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) block.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${mdToHtml(block.join("\n"))}</blockquote>`);
      continue;
    }
    if (isItem(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && isItem(lines[i]))
        items.push(`<li>${inline(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>`);
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isItem(lines[i]) && !/^(#|>|---)/.test(lines[i]))
      para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}
