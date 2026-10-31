/**
 * Resaltado de sintaxis diferido.
 *
 * Shiki no entra en el bundle inicial: se carga por importación dinámica la
 * primera vez que aparece un bloque de código, y el highlighter se cachea para
 * el resto de la sesión.
 *
 * Se usa `codeToTokens`, que devuelve tokens con color, y NO `codeToHtml`. Así
 * el resaltado se pinta con nodos `<span>` de Svelte y nunca hace falta
 * `{@html}` sobre contenido que viene del modelo.
 *
 * Motor: el de expresiones regulares de JavaScript, no Oniguruma, para no
 * arrastrar el WASM.
 *
 * Cada token trae los colores de los dos temas: el CSS elige según
 * `data-theme`, así que cambiar de tema no obliga a volver a tokenizar y el
 * resultado no depende de cuándo se aplicó el tema en la página.
 */

type TokenStyle = Readonly<{
  color?: string;
  /** Bitmask de Shiki: 1 itálica, 2 negrita, 4 subrayado. */
  fontStyle?: number;
}>;

export type HighlightToken = Readonly<{
  content: string;
  dark: TokenStyle;
  light: TokenStyle;
}>;

export type HighlightLine = readonly HighlightToken[];

/** Lenguajes soportados. Cada uno es un chunk aparte, cargado bajo demanda. */
const LANGUAGES = {
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  json: () => import("@shikijs/langs/json"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  bash: () => import("@shikijs/langs/bash"),
  markdown: () => import("@shikijs/langs/markdown"),
  yaml: () => import("@shikijs/langs/yaml")
} as const;

/** Alias frecuentes en las respuestas del modelo. */
const ALIASES: Record<string, keyof typeof LANGUAGES> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  py: "python",
  rs: "rust",
  md: "markdown",
  yml: "yaml",
  svelte: "html",
  postgres: "sql",
  mysql: "sql"
};

const THEMES = { dark: "github-dark-default", light: "github-light-default" };

export function resolveLanguage(raw: string): keyof typeof LANGUAGES | null {
  // El info-string puede traer más cosas ("ts title=x"): solo interesa la primera.
  const first = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!first) return null;
  if (first in LANGUAGES) return first as keyof typeof LANGUAGES;
  return ALIASES[first] ?? null;
}

type Highlighter = {
  codeToTokensWithThemes: (
    code: string,
    options: { lang: string; themes: Record<string, string> }
  ) => Array<
    Array<{ content: string; variants: Record<string, TokenStyle> }>
  >;
  getLoadedLanguages: () => string[];
  loadLanguage: (lang: unknown) => Promise<void>;
};

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript")
      ]);
    return (await createHighlighterCore({
      themes: [
        import("@shikijs/themes/github-dark-default"),
        import("@shikijs/themes/github-light-default")
      ],
      langs: [],
      engine: createJavaScriptRegexEngine()
    })) as unknown as Highlighter;
  })();
  return highlighterPromise;
}

/**
 * Tokeniza un bloque. Devuelve `null` si el lenguaje no está soportado o si
 * Shiki falla, y en ese caso el llamante deja el texto monoespaciado tal cual.
 */
export async function highlight(
  code: string,
  language: string
): Promise<HighlightLine[] | null> {
  const lang = resolveLanguage(language);
  if (!lang) return null;

  try {
    const highlighter = await getHighlighter();
    if (!highlighter.getLoadedLanguages().includes(lang)) {
      await highlighter.loadLanguage(await LANGUAGES[lang]());
    }
    const lines = highlighter.codeToTokensWithThemes(code, {
      lang,
      themes: THEMES
    });
    return lines.map((line) =>
      line.map((token) => ({
        content: token.content,
        dark: token.variants.dark ?? {},
        light: token.variants.light ?? {}
      }))
    );
  } catch {
    // Un fallo de resaltado nunca debe impedir leer el código.
    return null;
  }
}
