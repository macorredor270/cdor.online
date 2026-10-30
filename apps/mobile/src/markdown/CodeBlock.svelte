<script lang="ts">
  /**
   * Bloque de código del móvil. Sin resaltado de sintaxis: Shiki pesaría más
   * que el presupuesto de JavaScript inicial de la app (< 250 KiB).
   */
  let { language = "", value }: { language?: string; value: string } = $props();
  let copied = $state(false);
  const label = $derived(language.trim().split(/\s+/)[0] || "texto");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      copied = false;
    }
  }
</script>

<div class="code">
  <span class="head">
    <span class="lang">{label}</span>
    <button type="button" onclick={copy} aria-label="Copiar bloque de código">
      {copied ? "Copiado" : "Copiar"}
    </button>
  </span>
  <pre><code>{value}</code></pre>
</div>

<style>
  .code {
    display: block;
    margin: 0.75rem 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  }

  .lang {
    color: var(--muted);
    font-family: ui-monospace, monospace;
    font-size: var(--text-xs);
    text-transform: uppercase;
  }

  button {
    min-height: 2.25rem;
    border: 0;
    background: transparent;
    padding: 0 0.5rem;
    color: var(--muted);
    font: inherit;
    font-size: var(--text-sm);
  }

  pre {
    overflow-x: auto;
    margin: 0;
    padding: 0.75rem;
  }

  code {
    font-family: ui-monospace, "SFMono-Regular", monospace;
    font-size: var(--text-sm);
    white-space: pre;
  }
</style>
