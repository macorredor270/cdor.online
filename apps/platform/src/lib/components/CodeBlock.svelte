<script lang="ts">
  import { highlight, resolveLanguage, type HighlightLine } from "#lib/client/highlight.js";
  import { toasts } from "#lib/client/toast.svelte.js";

  let { language = "", value }: { language?: string; value: string } = $props();

  let lines = $state<HighlightLine[] | null>(null);
  let copied = $state(false);

  const resolved = $derived(resolveLanguage(language));
  /** Etiqueta visible: lo que escribió el modelo, o "texto" si no puso nada. */
  const label = $derived(language.trim().split(/\s+/)[0] || "texto");

  $effect(() => {
    // Solo se pide resaltado cuando el bloque ya está completo y el lenguaje
    // es conocido. Durante el streaming el bloque llega troceado y volver a
    // tokenizar en cada delta degradaría la escritura en vivo.
    const code = value;
    if (!resolved) {
      lines = null;
      return;
    }
    let cancelled = false;
    void highlight(code, language).then((result) => {
      if (!cancelled) lines = result;
    });
    return () => {
      cancelled = true;
    };
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      toasts.success("Código copiado.");
      setTimeout(() => (copied = false), 2000);
    } catch {
      toasts.error("El navegador no permitió copiar al portapapeles.");
    }
  }
</script>

<figure class="code">
  <figcaption>
    <span class="lang">{label}</span>
    <button type="button" onclick={copy} aria-label="Copiar bloque de código">
      {copied ? "Copiado" : "Copiar"}
    </button>
  </figcaption>

  <pre><code
      >{#if lines}{#each lines as line, index (index)}<span class="line"
            >{#each line as token, position (position)}<span
                class="token"
                style:--hl-dark={token.dark.color}
                style:--hl-light={token.light.color}
                style:font-style={(token.dark.fontStyle ?? 0) & 1 ? "italic" : null}
                style:font-weight={(token.dark.fontStyle ?? 0) & 2 ? "bold" : null}
                >{token.content}</span
              >{/each}</span
          >{/each}{:else}{value}{/if}</code
    ></pre>
</figure>

<style>
  .code {
    margin: var(--space-4) 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
  }

  figcaption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    border-bottom: 1px solid var(--border);
    padding: var(--space-2) var(--space-3);
  }

  .lang {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  figcaption button {
    /* Objetivo táctil cómodo sin engordar la cabecera. */
    min-height: 2rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 0 var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
    transition:
      color var(--motion-fast) var(--easing),
      border-color var(--motion-fast) var(--easing);
  }

  figcaption button:hover,
  figcaption button:focus-visible {
    border-color: var(--border-strong);
    color: var(--text);
  }

  pre {
    overflow-x: auto;
    margin: 0;
    padding: var(--space-4);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    /* Sin ajuste de línea: el código se lee con scroll horizontal, no partido. */
    white-space: pre;
  }

  .line {
    display: block;
    min-height: 1lh;
  }

  .token {
    color: var(--hl-dark, inherit);
  }

  :global(:root[data-theme="light"]) .token {
    color: var(--hl-light, inherit);
  }
</style>
