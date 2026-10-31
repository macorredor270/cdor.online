import { describe, expect, it } from "vitest";
import {
  inlineToText,
  mediaKind,
  parseInline,
  parseMarkdown,
  type MarkdownBlock
} from "../src/index";

const text = (value: string) => ({ type: "text", value }) as const;

function only<T extends MarkdownBlock["type"]>(
  blocks: MarkdownBlock[],
  type: T
): Extract<MarkdownBlock, { type: T }> {
  expect(blocks).toHaveLength(1);
  expect(blocks[0].type).toBe(type);
  return blocks[0] as Extract<MarkdownBlock, { type: T }>;
}

describe("seguridad", () => {
  it("no acepta enlaces ejecutables ni produce HTML", () => {
    const blocks = parseMarkdown(
      "# Título\n\n**seguro** [web](https://cdor.online) " +
        "[ataque](javascript:alert(1)) <script>alert(1)</script>"
    );
    expect(blocks).toHaveLength(2);
    const json = JSON.stringify(blocks);
    expect(json).toContain("https://cdor.online/");
    expect(json).not.toContain('"href":"javascript:');
    expect(json).toContain("<script>alert(1)</script>");
  });

  it("descarta imágenes y autoenlaces con esquemas no permitidos", () => {
    const json = JSON.stringify(
      parseMarkdown("![x](data:image/png;base64,AAAA) <javascript:alert(1)>")
    );
    expect(json).not.toContain('"src":"data:');
    expect(json).not.toContain('"href":"javascript:');
  });

  it("no se degrada con delimitadores sin cerrar", () => {
    const hostile = "*".repeat(20_000) + "_".repeat(20_000) + "[".repeat(5_000);
    const started = performance.now();
    parseMarkdown(hostile);
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it("limita la profundidad de anidamiento", () => {
    const deep = ">".repeat(50) + " hola";
    expect(() => parseMarkdown(deep)).not.toThrow();
    expect(JSON.stringify(parseMarkdown(deep))).toContain("hola");
  });
});

describe("en línea", () => {
  it("código, énfasis, negrita y tachado como datos", () => {
    expect(parseInline("usa `code`, *énfasis*, **fuerza** y ~~antes~~")).toEqual([
      text("usa "),
      { type: "code", value: "code" },
      text(", "),
      { type: "emphasis", children: [text("énfasis")] },
      text(", "),
      { type: "strong", children: [text("fuerza")] },
      text(" y "),
      { type: "strike", children: [text("antes")] }
    ]);
  });

  it("anida énfasis y enlaces", () => {
    expect(parseInline("**ver [docs](https://cdor.online/docs)**")).toEqual([
      {
        type: "strong",
        children: [
          text("ver "),
          {
            type: "link",
            href: "https://cdor.online/docs",
            children: [text("docs")]
          }
        ]
      }
    ]);
    expect(parseInline("***las dos***")).toEqual([
      { type: "strong", children: [{ type: "emphasis", children: [text("las dos")] }] }
    ]);
    expect(parseInline("__fuerte__ y _suave_")).toEqual([
      { type: "strong", children: [text("fuerte")] },
      text(" y "),
      { type: "emphasis", children: [text("suave")] }
    ]);
  });

  it("no confunde snake_case ni asteriscos sueltos con énfasis", () => {
    expect(parseInline("usa mi_variable_larga")).toEqual([text("usa mi_variable_larga")]);
    expect(parseInline("2 * 3 * 4")).toEqual([text("2 * 3 * 4")]);
  });

  it("convierte URLs sueltas y autoenlaces sin arrastrar la puntuación", () => {
    expect(parseInline("Mira https://cdor.online/docs.")).toEqual([
      text("Mira "),
      { type: "link", href: "https://cdor.online/docs", children: [text("https://cdor.online/docs")] },
      text(".")
    ]);
    expect(parseInline("(ver https://es.wikipedia.org/wiki/Foo_(bar))")).toEqual([
      text("(ver "),
      {
        type: "link",
        href: "https://es.wikipedia.org/wiki/Foo_(bar)",
        children: [text("https://es.wikipedia.org/wiki/Foo_(bar)")]
      },
      text(")")
    ]);
    expect(parseInline("<https://cdor.online>")).toEqual([
      { type: "link", href: "https://cdor.online/", children: [text("https://cdor.online")] }
    ]);
  });

  it("respeta escapes y código con varias comillas invertidas", () => {
    expect(parseInline("\\*no\\* es énfasis")).toEqual([text("*no* es énfasis")]);
    expect(parseInline("`` a `b` c ``")).toEqual([{ type: "code", value: "a `b` c" }]);
  });

  it("lee imágenes con título opcional", () => {
    expect(parseInline('![logo](https://cdor.online/logo.png "MAC")')).toEqual([
      { type: "image", src: "https://cdor.online/logo.png", alt: "logo" }
    ]);
  });
});

describe("bloques", () => {
  it("títulos de nivel 1 a 6 y subrayados", () => {
    const blocks = parseMarkdown("# a\n## b\n### c\n#### d\n##### e\n###### f ###\n\nTítulo\n===");
    expect(blocks.map((block) => (block.type === "heading" ? block.level : 0))).toEqual([
      1, 2, 3, 4, 5, 6, 1
    ]);
    expect(blocks[5]).toEqual({ type: "heading", level: 6, content: [text("f")] });
  });

  it("separadores con guiones, asteriscos, guiones bajos y rayas", () => {
    for (const rule of ["---", "***", "___", "- - -", "* * *", "——", "———", "–––"]) {
      expect(parseMarkdown(`uno\n\n${rule}\n\ndos`).map((block) => block.type)).toEqual([
        "paragraph",
        "rule",
        "paragraph"
      ]);
    }
  });

  it("bloques de código con ``` o ~~~, también sin cerrar durante el streaming", () => {
    const fenced = only(parseMarkdown("~~~python\nprint(1)\n~~~"), "code");
    expect(fenced).toEqual({ type: "code", language: "python", value: "print(1)" });
    const open = only(parseMarkdown("```ts\nconst a = 1;\nconst b"), "code");
    expect(open.value).toBe("const a = 1;\nconst b");
    const nested = only(parseMarkdown("````md\n```js\nx\n```\n````"), "code");
    expect(nested.value).toBe("```js\nx\n```");
  });

  it("listas anidadas, numeradas desde cualquier número y tareas", () => {
    const list = only(
      parseMarkdown(
        [
          "3. tercero",
          "   - sub a",
          "   - sub b",
          "     1. muy dentro",
          "4. cuarto",
          "   continúa en otra línea",
          "",
          "5. quinto tras línea en blanco"
        ].join("\n")
      ),
      "list"
    );
    expect(list.ordered).toBe(true);
    expect(list.start).toBe(3);
    expect(list.items).toHaveLength(3);
    const sub = list.items[0].blocks[0];
    expect(sub.type).toBe("list");
    if (sub.type !== "list") throw new Error();
    expect(sub.items.map((item) => inlineToText(item.content))).toEqual(["sub a", "sub b"]);
    expect(sub.items[1].blocks[0].type).toBe("list");
    expect(list.items[1].content).toEqual([text("cuarto\ncontinúa en otra línea")]);

    const tasks = only(parseMarkdown("- [x] hecho\n- [ ] pendiente\n- normal"), "list");
    expect(tasks.items.map((item) => item.checked)).toEqual([true, false, null]);
    expect(tasks.items[0].content).toEqual([text("hecho")]);
  });

  it("un cambio de viñeta empieza otra lista y el código cabe dentro de un elemento", () => {
    expect(parseMarkdown("- a\n* b").map((block) => block.type)).toEqual(["list", "list"]);
    const list = only(parseMarkdown("- paso\n\n  ```sh\n  pnpm i\n  ```"), "list");
    expect(list.items[0].blocks).toEqual([{ type: "code", language: "sh", value: "pnpm i" }]);
  });

  it("citas con Markdown dentro y anidadas", () => {
    const quote = only(parseMarkdown("> **Nota**\n> - uno\n> - dos\n>> dentro"), "quote");
    expect(quote.blocks.map((block) => block.type)).toEqual(["paragraph", "list", "quote"]);
  });

  it("tablas GFM con alineación, barras escapadas y límites", () => {
    const blocks = parseMarkdown(
      [
        "Antes de la tabla",
        "| Variable | Antes | Ahora |",
        "| :--- | :---: | ---: |",
        "| `ORIGIN` | Ejecución | **Build** |",
        "| a \\| b | [x](javascript:alert(1)) |",
        "",
        "Después"
      ].join("\n")
    );
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "table", "paragraph"]);
    const table = blocks[1];
    if (table.type !== "table") throw new Error();
    expect(table.align).toEqual(["left", "center", "right"]);
    expect(table.rows[0][0]).toEqual([{ type: "code", value: "ORIGIN" }]);
    expect(table.rows[0][2]).toEqual([{ type: "strong", children: [text("Build")] }]);
    expect(table.rows[1][0]).toEqual([text("a | b")]);
    expect(table.rows[1][2]).toEqual([]);
    expect(JSON.stringify(table)).not.toContain('"href":"javascript:');

    const header = `| ${Array.from({ length: 20 }, (_, i) => `c${i}`).join(" | ")} |`;
    const separator = `| ${Array.from({ length: 20 }, () => "---").join(" | ")} |`;
    const rows = Array.from({ length: 250 }, () => "| x | y |");
    const big = only(parseMarkdown([header, separator, ...rows].join("\n")), "table");
    expect(big.header).toHaveLength(12);
    expect(big.rows).toHaveLength(200);
  });
});

describe("medios", () => {
  it("detecta el tipo por extensión", () => {
    expect(mediaKind("https://x.com/a/cancion.MP3?v=1")).toBe("audio");
    expect(mediaKind("https://x.com/clip.webm")).toBe("video");
    expect(mediaKind("https://x.com/foto.jpeg")).toBe("image");
    expect(mediaKind("https://x.com/pagina")).toBeNull();
  });

  it("un enlace o URL a un medio, solo en su párrafo, se vuelve reproductor", () => {
    expect(parseMarkdown("https://cdn.example.com/podcast.mp3")).toEqual([
      {
        type: "media",
        kind: "audio",
        src: "https://cdn.example.com/podcast.mp3",
        title: "https://cdn.example.com/podcast.mp3"
      }
    ]);
    expect(parseMarkdown("[Demo en vídeo](https://cdn.example.com/demo.mp4)")).toEqual([
      { type: "media", kind: "video", src: "https://cdn.example.com/demo.mp4", title: "Demo en vídeo" }
    ]);
    expect(parseMarkdown("![Diagrama](https://cdn.example.com/d.png)")).toEqual([
      { type: "media", kind: "image", src: "https://cdn.example.com/d.png", title: "Diagrama" }
    ]);
  });

  it("un enlace a un medio dentro de una frase sigue siendo un enlace", () => {
    const paragraph = only(
      parseMarkdown("Escucha [esto](https://cdn.example.com/a.mp3) cuando puedas"),
      "paragraph"
    );
    expect(paragraph.content.some((token) => token.type === "link")).toBe(true);
  });
});
