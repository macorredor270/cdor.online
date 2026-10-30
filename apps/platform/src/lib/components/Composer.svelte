<script lang="ts">
  /**
   * Compositor único.
   *
   * La pantalla vacía y la conversación abierta usan el mismo, así que
   * escribir el primer mensaje y escribir el décimo se sienten igual. Antes la
   * pantalla vacía no tenía compositor: obligaba a elegir una tarjeta o pulsar
   * "Empezar en blanco" para llegar a un cuadro de texto.
   *
   * MAC publica un solo modo (`balanced`) y no acepta ficheros. La búsqueda
   * web sí es un control real: activa una herramienta sobre el mismo modelo
   * que responde cuando la búsqueda está apagada.
   */
  let {
    value = $bindable(""),
    placeholder = "Mensaje a MAC",
    busy = false,
    canStop = false,
    webSearchEnabled = false,
    webSearch = $bindable(true),
    autofocus = false,
    onsend,
    onstop
  }: {
    value?: string;
    placeholder?: string;
    busy?: boolean;
    /** El botón de detener solo sirve si hay una generación identificada. */
    canStop?: boolean;
    webSearchEnabled?: boolean;
    webSearch?: boolean;
    autofocus?: boolean;
    onsend: () => void;
    onstop?: () => void;
  } = $props();

  let field = $state<HTMLTextAreaElement | null>(null);
  let searchWarning = $state(false);

  // La caja crece con el texto hasta un tope y luego hace scroll: un textarea
  // de alto fijo esconde lo que se acaba de escribir.
  function grow() {
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 54), 240)}px`;
  }

  $effect(() => {
    void value;
    grow();
  });

  $effect(() => {
    if (autofocus) field?.focus();
  });

  function keydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!busy && value.trim()) onsend();
    }
  }

  function toggleWebSearch() {
    webSearch = !webSearch;
    searchWarning = !webSearch;
  }

  function reactivateWebSearch() {
    webSearch = true;
    searchWarning = false;
  }
</script>

<div class="composer" class:busy>
  <label class="sr-only" for="composer-field">Mensaje</label>
  <textarea
    id="composer-field"
    bind:this={field}
    bind:value
    rows="1"
    maxlength="32000"
    {placeholder}
    disabled={busy}
    onkeydown={keydown}
    oninput={grow}
  ></textarea>

  <div class="tools">
    <div class="tool-group">
      {#if webSearchEnabled}
        <button
          class="search-toggle"
          class:active={webSearch}
          type="button"
          aria-pressed={webSearch}
          aria-label={webSearch ? "Desactivar búsqueda web" : "Activar búsqueda web"}
          disabled={busy}
          onclick={toggleWebSearch}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="9" cy="9" r="6" />
            <path d="M3 9h12M9 3c1.8 1.7 2.8 3.7 2.8 6S10.8 13.3 9 15M9 3C7.2 4.7 6.2 6.7 6.2 9S7.2 13.3 9 15M13.3 13.3 17 17" />
          </svg>
          Buscar en web
        </button>
      {/if}
      <span class="hint">Enter envía · Mayús + Enter salta de línea</span>
    </div>
    {#if busy}
      <button
        class="action stop"
        type="button"
        aria-label="Detener la respuesta"
        disabled={!canStop}
        onclick={() => onstop?.()}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" />
        </svg>
      </button>
    {:else}
      <button
        class="action send"
        type="button"
        aria-label="Enviar el mensaje"
        disabled={!value.trim()}
        onclick={onsend}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            d="M8 13V3.5M8 3.5L4 7.5M8 3.5l4 4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    {/if}
  </div>

  {#if webSearchEnabled && searchWarning && !webSearch}
    <div class="search-warning" role="alert">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2.6 18 17H2L10 2.6Z" />
        <path d="M10 7v4.7M10 14.4v.1" />
      </svg>
      <span>
        <strong>Búsqueda web desactivada.</strong>
        MAC puede responder con conocimiento desactualizado desde diciembre de 2023.
      </span>
      <button type="button" disabled={busy} onclick={reactivateWebSearch}>Reactivar</button>
    </div>
  {/if}
</div>

<style>
  .composer {
    display: grid;
    width: 100%;
    gap: var(--space-2);
    border: 1px solid var(--border);
    border-radius: 1.5rem;
    background: var(--surface-2);
    padding: var(--space-4);
    transition:
      border-color var(--motion-fast) var(--easing),
      box-shadow var(--motion-fast) var(--easing);
  }

  /* El foco vive en la caja, no en el textarea: dentro, un anillo alrededor de
     un campo sin borde propio parecía un segundo control. */
  .composer:focus-within {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent);
  }

  textarea {
    /* Tres líneas de alto en reposo: la caja se lee como un sitio donde
       escribir algo, no como un campo de una línea. */
    min-height: 3.4rem;
    max-height: 15rem;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 0;
    color: var(--text);
    font: inherit;
    line-height: var(--leading-normal);
    resize: none;
  }

  textarea::placeholder {
    color: var(--text-muted);
  }

  .tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .hint {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .tool-group {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: var(--space-3);
  }

  .search-toggle {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: transparent;
    padding: 0.35rem 0.85rem;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-xs);
    cursor: pointer;
    transition:
      border-color var(--motion-fast) var(--easing),
      background var(--motion-fast) var(--easing),
      color var(--motion-fast) var(--easing);
  }

  .search-toggle:hover,
  .search-toggle:focus-visible {
    border-color: var(--border-strong);
    color: var(--text);
  }

  .search-toggle:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .search-toggle.active {
    border-color: var(--accent-light);
    background: color-mix(in srgb, var(--accent-light) 16%, transparent);
    color: var(--accent-light);
  }

  .search-toggle svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .search-warning {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--warning) 9%, transparent);
    padding: 0.65rem 0.75rem;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .search-warning > svg {
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: var(--warning);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .search-warning strong {
    color: var(--text);
  }

  .search-warning button {
    border: 0;
    background: transparent;
    padding: 0.35rem;
    color: var(--accent-strong);
    font: inherit;
    font-weight: 750;
    cursor: pointer;
  }

  /* Misma forma, tamaño y gradiente que el botón de envío de apps/mobile. */
  .action {
    display: grid;
    width: 2.55rem;
    height: 2.55rem;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--accent-button);
    color: var(--on-accent);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--easing),
      opacity var(--motion-fast) var(--easing);
  }

  .action:disabled {
    background: var(--surface-3);
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .stop {
    background: var(--danger);
    color: var(--on-accent);
  }

  @media (max-width: 560px) {
    /* Sin sitio para la pista y el botón en la misma línea, manda el botón. */
    .hint {
      display: none;
    }

    .tools {
      justify-content: flex-end;
    }

    .search-warning {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .search-warning button {
      grid-column: 2;
      justify-self: start;
      padding-left: 0;
    }
  }
</style>
