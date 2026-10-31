/**
 * Markdown de las respuestas del modelo, compartido por la web y el móvil.
 *
 * El resultado es un árbol de datos tipado que cada aplicación pinta con sus
 * propios componentes. Nunca se produce HTML: el texto que parezca HTML se
 * conserva como texto, y los enlaces e imágenes solo aceptan http(s).
 *
 * El parser es tolerante por diseño: durante el streaming el texto llega
 * cortado a mitad de una tabla, un bloque de código o un enlace, y debe
 * renderizarse de forma razonable en cada fragmento. Todas las búsquedas de
 * cierre están acotadas para que una respuesta hostil no pueda disparar un
 * coste cuadrático en el navegador.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineToken[] }
  | { type: "emphasis"; children: InlineToken[] }
  | { type: "strike"; children: InlineToken[] }
  | { type: "link"; href: string; children: InlineToken[] }
  | { type: "image"; src: string; alt: string };

export type TableAlign = "left" | "center" | "right" | null;

export type MediaKind = "audio" | "video" | "image";

export type ListItem = {
  /** `null` si no es una tarea; `true`/`false` para `[x]`/`[ ]`. */
  checked: boolean | null;
  content: InlineToken[];
  /** Contenido anidado: sublistas, código, citas o párrafos adicionales. */
  blocks: MarkdownBlock[];
};

export type MarkdownBlock =
  | { type: "paragraph"; content: InlineToken[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: InlineToken[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "code"; language: string; value: string }
  | { type: "quote"; blocks: MarkdownBlock[] }
  | { type: "rule" }
  | {
      type: "table";
      align: TableAlign[];
      header: InlineToken[][];
      rows: InlineToken[][][];
    }
  | { type: "media"; kind: MediaKind; src: string; title: string };

/** Límites defensivos frente a respuestas desmesuradas u hostiles. */
const MAX_DEPTH = 6;
const MAX_TABLE_COLUMNS = 12;
const MAX_TABLE_ROWS = 200;
const SEARCH_WINDOW = 2000;

const MEDIA_EXTENSIONS: Record<string, MediaKind> = {
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  oga: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  opus: "audio",
  mp4: "video",
  m4v: "video",
  webm: "video",
  ogv: "video",
  mov: "video",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  svg: "image"
};

/** Devuelve la URL normalizada si es http(s); cualquier otro esquema, `null`. */
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Tipo de medio según la extensión de la ruta, o `null` si no es un medio. */
export function mediaKind(href: string): MediaKind | null {
  try {
    const extension = new URL(href).pathname
      .split(".")
      .pop()
      ?.toLowerCase();
    return extension ? (MEDIA_EXTENSIONS[extension] ?? null) : null;
  } catch {
    return null;
  }
}

/** Texto plano de una lista de tokens (títulos, textos alternativos). */
export function inlineToText(tokens: readonly InlineToken[]): string {
  return tokens
    .map((token) => {
      if (token.type === "text" || token.type === "code") return token.value;
      if (token.type === "image") return token.alt;
      return inlineToText(token.children);
    })
    .join("");
}

// ---------------------------------------------------------------- inline

const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const BARE_URL = /^https?:\/\/[^\s<>"'`]+/;
const AUTOLINK = /^<(https?:\/\/[^\s<>]+)>/;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/** Recorta la puntuación final que casi nunca forma parte de la URL. */
function trimUrl(raw: string): string {
  let url = raw.replace(/[.,;:!?*_~]+$/, "");
  // Un paréntesis de cierre sin abrir es del texto: "(ver https://x.com)".
  while (
    url.endsWith(")") &&
    (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)
  ) {
    url = url.slice(0, -1).replace(/[.,;:!?*_~]+$/, "");
  }
  return url;
}

type LinkParts = { label: string; target: string; end: number };

/**
 * Lee `[etiqueta](destino "título")` desde `start` (el corchete). Admite
 * corchetes y paréntesis equilibrados dentro, y escapes.
 */
function readLink(source: string, start: number): LinkParts | null {
  const limit = Math.min(source.length, start + SEARCH_WINDOW);
  let depth = 0;
  let index = start;
  for (; index < limit; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) break;
    } else if (char === "\n" && source[index + 1] === "\n") {
      return null;
    }
  }
  if (depth !== 0 || source[index + 1] !== "(") return null;
  const labelEnd = index;
  let parens = 0;
  for (index += 1; index < limit; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
    } else if (char === "(") {
      parens += 1;
    } else if (char === ")") {
      parens -= 1;
      if (parens === 0) break;
    } else if (char === "\n") {
      return null;
    }
  }
  if (parens !== 0) return null;
  const inside = source.slice(labelEnd + 2, index).trim();
  // El título opcional entre comillas no se usa: solo se descarta.
  const target = inside.replace(/\s+("[^"]*"|'[^']*')$/, "").replace(/^<|>$/g, "");
  return { label: source.slice(start + 1, labelEnd), target, end: index + 1 };
}

/** Cierre de un delimitador de énfasis, o -1. */
function findClose(source: string, from: number, delimiter: string): number {
  const char = delimiter[0];
  const limit = Math.min(source.length, from + SEARCH_WINDOW);
  let position = source.indexOf(delimiter, from);
  while (position !== -1 && position < limit) {
    let run = 0;
    while (source[position + run] === char) run += 1;
    const closes =
      run === delimiter.length &&
      position > from &&
      !isSpace(source[position - 1]) &&
      // `_` dentro de una palabra (snake_case) no cierra.
      (char !== "_" || !isWordChar(source[position + run]));
    if (closes) return position;
    position = source.indexOf(delimiter, position + run);
  }
  return -1;
}

export function parseInline(source: string, depth = 0): InlineToken[] {
  if (depth >= MAX_DEPTH) return source ? [{ type: "text", value: source }] : [];

  const tokens: InlineToken[] = [];
  let text = "";
  const flush = () => {
    if (text) {
      tokens.push({ type: "text", value: text });
      text = "";
    }
  };
  const push = (token: InlineToken) => {
    flush();
    tokens.push(token);
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const rest = source.slice(index, index + SEARCH_WINDOW);

    if (char === "\\" && ESCAPABLE.test(source[index + 1] ?? "")) {
      text += source[index + 1];
      index += 2;
      continue;
    }

    if (char === "`") {
      let run = 1;
      while (source[index + run] === "`") run += 1;
      const fence = "`".repeat(run);
      const end = source.indexOf(fence, index + run);
      if (end !== -1 && end - index < SEARCH_WINDOW) {
        let value = source.slice(index + run, end);
        if (value.length > 2 && value.startsWith(" ") && value.endsWith(" ")) {
          value = value.slice(1, -1);
        }
        push({ type: "code", value });
        index = end + run;
      } else {
        text += fence;
        index += run;
      }
      continue;
    }

    if (char === "!" && source[index + 1] === "[") {
      const link = readLink(source, index + 1);
      const src = link ? safeUrl(link.target) : null;
      if (link && src) {
        push({ type: "image", src, alt: link.label });
        index = link.end;
        continue;
      }
    }

    if (char === "[") {
      const link = readLink(source, index);
      if (link) {
        const href = safeUrl(link.target);
        if (href) {
          push({
            type: "link",
            href,
            children: parseInline(link.label, depth + 1)
          });
        } else {
          // Esquema no permitido (javascript:, data:…): se muestra tal cual,
          // como texto, para que se vea qué intentaba enlazar.
          text += source.slice(index, link.end);
        }
        index = link.end;
        continue;
      }
    }

    if (char === "<") {
      const auto = AUTOLINK.exec(rest);
      const href = auto ? safeUrl(auto[1]) : null;
      if (auto && href) {
        push({ type: "link", href, children: [{ type: "text", value: auto[1] }] });
        index += auto[0].length;
        continue;
      }
    }

    if ((char === "h" || char === "H") && !isWordChar(source[index - 1])) {
      const bare = BARE_URL.exec(rest);
      if (bare) {
        const url = trimUrl(bare[0]);
        const href = safeUrl(url);
        if (href) {
          push({ type: "link", href, children: [{ type: "text", value: url }] });
          index += url.length;
          continue;
        }
      }
    }

    if (char === "*" || char === "_" || char === "~") {
      let run = 1;
      while (source[index + run] === char) run += 1;
      const size = char === "~" ? (run >= 2 ? 2 : 0) : Math.min(run, 3);
      const opens =
        size > 0 &&
        !isSpace(source[index + run]) &&
        (char !== "_" || !isWordChar(source[index - 1]));
      if (opens) {
        const delimiter = char.repeat(size);
        const close = findClose(source, index + size, delimiter);
        if (close !== -1) {
          const children = parseInline(source.slice(index + size, close), depth + 1);
          if (char === "~") {
            push({ type: "strike", children });
          } else if (size === 1) {
            push({ type: "emphasis", children });
          } else if (size === 2) {
            push({ type: "strong", children });
          } else {
            push({ type: "strong", children: [{ type: "emphasis", children }] });
          }
          index = close + size;
          continue;
        }
      }
      text += char.repeat(run);
      index += run;
      continue;
    }

    text += char;
    index += 1;
  }
  flush();
  return tokens;
}

// ---------------------------------------------------------------- blocks

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const SETEXT_H1 = /^ {0,3}=+\s*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
/** Líneas de rayas tipográficas («——», «———»): el modelo las usa como separador. */
const DASH_RULE = /^\s*[—–]{2,}\s*$/;
const QUOTE = /^ {0,3}> ?/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const TABLE_SEPARATOR =
  /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$|^\s*\|\s*:?-+:?\s*\|\s*$/;

function indentOf(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === " ") width += 1;
    else if (char === "\t") width += 4 - (width % 4);
    else break;
  }
  return width;
}

/** Quita hasta `count` columnas de sangría. */
function dedent(line: string, count: number): string {
  let removed = 0;
  let index = 0;
  while (index < line.length && removed < count) {
    if (line[index] === " ") removed += 1;
    else if (line[index] === "\t") removed += 4 - (removed % 4);
    else break;
    index += 1;
  }
  return line.slice(index);
}

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

function isTableStart(lines: readonly string[], index: number): boolean {
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

function isRule(line: string): boolean {
  return RULE.test(line) || DASH_RULE.test(line);
}

/** ¿Empieza aquí un bloque que interrumpe un párrafo? */
function startsBlock(lines: readonly string[], index: number): boolean {
  const line = lines[index];
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    isRule(line) ||
    LIST_ITEM.test(line) ||
    isTableStart(lines, index)
  );
}

function listType(marker: string): string {
  return /\d/.test(marker) ? `ol${marker.at(-1)}` : marker;
}

/** Un párrafo formado solo por un enlace o imagen a un medio pasa a reproductor. */
function asMedia(content: InlineToken[]): MarkdownBlock | null {
  const meaningful = content.filter(
    (token) => !(token.type === "text" && !token.value.trim())
  );
  if (meaningful.length !== 1) return null;
  const [token] = meaningful;
  if (token.type === "image") {
    const kind = mediaKind(token.src) ?? "image";
    return { type: "media", kind, src: token.src, title: token.alt };
  }
  if (token.type === "link") {
    const kind = mediaKind(token.href);
    if (!kind) return null;
    return { type: "media", kind, src: token.href, title: inlineToText(token.children) };
  }
  return null;
}

function parseBlocks(lines: readonly string[], depth: number): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) {
      const marker = fence[2];
      const indent = fence[1].length;
      const code: string[] = [];
      index += 1;
      while (index < lines.length) {
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[index]);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) {
          index += 1;
          break;
        }
        code.push(dedent(lines[index], indent));
        index += 1;
      }
      blocks.push({
        type: "code",
        language: fence[3].trim().slice(0, 32),
        value: code.join("\n")
      });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        content: parseInline(heading[2])
      });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitRow(line);
      const align = splitRow(lines[index + 1])
        .map(parseAlign)
        .concat(Array<TableAlign>(header.length).fill(null))
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
        rows.push(header.map((_, column) => parseInline(cells[column] ?? "")));
        index += 1;
      }
      // Las filas que exceden el límite se descartan en lugar de reaparecer
      // como párrafos sueltos.
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
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

    // Antes que las listas: «- - -» y «* * *» son separadores, no viñetas.
    if (isRule(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        inner.push(lines[index].replace(QUOTE, ""));
        index += 1;
      }
      blocks.push({
        type: "quote",
        blocks:
          depth < MAX_DEPTH
            ? parseBlocks(inner, depth + 1)
            : [{ type: "paragraph", content: [{ type: "text", value: inner.join("\n") }] }]
      });
      continue;
    }

    const first = LIST_ITEM.exec(line);
    if (first) {
      const baseIndent = indentOf(first[1]);
      const type = listType(first[2]);
      const ordered = type.startsWith("ol");
      const items: ListItem[] = [];

      while (index < lines.length) {
        if (!lines[index].trim()) {
          // Una línea en blanco entre viñetas del mismo tipo no corta la lista.
          let next = index + 1;
          while (next < lines.length && !lines[next].trim()) next += 1;
          const following = LIST_ITEM.exec(lines[next] ?? "");
          if (
            following &&
            indentOf(following[1]) === baseIndent &&
            listType(following[2]) === type
          ) {
            index = next;
            continue;
          }
          break;
        }

        const item = LIST_ITEM.exec(lines[index]);
        if (!item || indentOf(item[1]) !== baseIndent || listType(item[2]) !== type) {
          break;
        }

        const contentIndent = Math.min(
          baseIndent + item[2].length + item[3].length,
          baseIndent + item[2].length + 4
        );
        let firstLine = item[4];
        let checked: boolean | null = null;
        const task = TASK.exec(firstLine);
        if (task) {
          checked = task[1] !== " ";
          firstLine = task[2];
        }
        const body: string[] = [];
        let sawBlank = false;
        index += 1;

        while (index < lines.length) {
          const current = lines[index];
          if (!current.trim()) {
            let next = index + 1;
            while (next < lines.length && !lines[next].trim()) next += 1;
            if (next < lines.length && indentOf(lines[next]) > baseIndent) {
              body.push("");
              sawBlank = true;
              index += 1;
              continue;
            }
            break;
          }
          const indent = indentOf(current);
          const dedented = dedent(current, Math.min(indent, contentIndent));
          // El renglón siguiente con sangría continúa el texto del elemento,
          // salvo que abra un bloque propio (sublista, código, cita…).
          if (
            indent > baseIndent &&
            body.length === 0 &&
            !sawBlank &&
            !startsBlock([dedented], 0)
          ) {
            firstLine += `\n${dedented.trim()}`;
            index += 1;
            continue;
          }
          if (indent > baseIndent) {
            body.push(dedented);
            index += 1;
            continue;
          }
          // Continuación perezosa: texto sin sangría que sigue al primer renglón.
          if (body.length === 0 && !sawBlank && !startsBlock(lines, index)) {
            firstLine += `\n${current.trim()}`;
            index += 1;
            continue;
          }
          break;
        }

        items.push({
          checked,
          content: parseInline(firstLine),
          blocks: depth < MAX_DEPTH ? parseBlocks(body, depth + 1) : []
        });
      }

      blocks.push({
        type: "list",
        ordered,
        start: ordered ? Number.parseInt(first[2], 10) : 1,
        items
      });
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    let setext = false;
    while (index < lines.length && lines[index].trim()) {
      if (SETEXT_H1.test(lines[index])) {
        setext = true;
        index += 1;
        break;
      }
      if (startsBlock(lines, index)) break;
      paragraph.push(lines[index].trim());
      index += 1;
    }
    const content = parseInline(paragraph.join("\n"));
    if (setext) {
      blocks.push({ type: "heading", level: 1, content });
    } else {
      blocks.push(asMedia(content) ?? { type: "paragraph", content });
    }
  }

  return blocks;
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  return parseBlocks(source.replaceAll("\r\n", "\n").split("\n"), 0);
}
