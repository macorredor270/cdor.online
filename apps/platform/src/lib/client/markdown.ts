export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; value: string }
  | { type: "emphasis"; value: string }
  | { type: "link"; value: string; href: string };

export type MarkdownBlock =
  | { type: "paragraph"; content: InlineToken[] }
  | { type: "heading"; level: 1 | 2 | 3; content: InlineToken[] }
  | { type: "list"; ordered: boolean; items: InlineToken[][] }
  | { type: "code"; language: string; value: string }
  | { type: "quote"; content: InlineToken[] }
  | { type: "rule" }
  | {
      type: "table";
      align: TableAlign[];
      header: InlineToken[][];
      rows: InlineToken[][][];
    };

export type TableAlign = "left" | "center" | "right" | null;

/** Límites defensivos: el modelo no puede forzar tablas descomunales. */
const MAX_TABLE_COLUMNS = 12;
const MAX_TABLE_ROWS = 200;

const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$|^\s*\|\s*:?-+:?\s*\|\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  // Una barra escapada (\|) es contenido de la celda, no un separador.
  return row
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll("\\|", "|"))
    .slice(0, MAX_TABLE_COLUMNS);
}

function isTableStart(lines: string[], index: number): boolean {
  const line = lines[index];
  const next = lines[index + 1];
  return (
    line !== undefined &&
    next !== undefined &&
    line.includes("|") &&
    TABLE_SEPARATOR.test(next)
  );
}

function parseAlign(cell: string): TableAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

const INLINE_PATTERN =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^) \n]+\))/g;

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseInline(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;
  for (const match of source.matchAll(INLINE_PATTERN)) {
    const index = match.index;
    if (index > cursor) {
      tokens.push({ type: "text", value: source.slice(cursor, index) });
    }
    const value = match[0];
    if (value.startsWith("`")) {
      tokens.push({ type: "code", value: value.slice(1, -1) });
    } else if (value.startsWith("**")) {
      tokens.push({ type: "strong", value: value.slice(2, -2) });
    } else if (value.startsWith("*")) {
      tokens.push({ type: "emphasis", value: value.slice(1, -1) });
    } else {
      const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
      const href = parts ? safeHref(parts[2]) : null;
      if (parts && href) {
        tokens.push({ type: "link", value: parts[1], href });
      } else {
        tokens.push({ type: "text", value });
      }
    }
    cursor = index + value.length;
  }
  if (cursor < source.length) {
    tokens.push({ type: "text", value: source.slice(cursor) });
  }
  return tokens;
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim().slice(0, 32);
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", language, value: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        content: parseInline(heading[2])
      });
      index += 1;
      continue;
    }
    if (isTableStart(lines, index)) {
      const header = splitRow(line);
      const align = splitRow(lines[index + 1])
        .map(parseAlign)
        .concat(Array(header.length).fill(null))
        .slice(0, header.length);
      const rows: InlineToken[][][] = [];
      index += 2;
      while (
        index < lines.length &&
        lines[index].includes("|") &&
        lines[index].trim() &&
        rows.length < MAX_TABLE_ROWS
      ) {
        const cells = splitRow(lines[index]);
        rows.push(
          header.map((_, column) => parseInline(cells[column] ?? ""))
        );
        index += 1;
      }
      blocks.push({
        type: "table",
        align,
        header: header.map((cell) => parseInline(cell)),
        rows
      });
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", content: parseInline(quote.join("\n")) });
      continue;
    }
    const list = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (list) {
      const ordered = /\d+\./.test(list[2]);
      const items: InlineToken[][] = [];
      while (index < lines.length) {
        const item = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(lines[index]);
        if (!item || /\d+\./.test(item[2]) !== ordered) {
          break;
        }
        items.push(parseInline(item[3]));
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s|^```|^>|^(\s*)([-*]|\d+\.)\s+/.test(lines[index]) &&
      !RULE.test(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({
      type: "paragraph",
      content: parseInline(paragraph.join("\n"))
    });
  }
  return blocks;
}
