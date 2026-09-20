<script lang="ts">
  import { tick } from "svelte";
  import type { ChatMessage, Conversation } from "@cdor/contracts";

  let {
    conversations,
    activeConversation,
    messages,
    streamText,
    streaming,
    generationId,
    online,
    onNew,
    onSelect,
    onSend,
    onRetry,
    onCancel
  }: {
    conversations: Conversation[];
    activeConversation: Conversation | null;
    messages: ChatMessage[];
    streamText: string;
    streaming: boolean;
    generationId: string | null;
    online: boolean;
    onNew: () => void | Promise<void>;
    onSelect: (id: string) => void | Promise<void>;
    onSend: (content: string, webSearch?: boolean) => void | Promise<void>;
    onRetry: (sourceMessageId: string, webSearch?: boolean) => void | Promise<void>;
    onCancel: () => void | Promise<void>;
  } = $props();

  // Solo la última respuesta completada se puede regenerar, y solo con red.
  const lastAssistantId = $derived(
    messages.reduce<string | null>(
      (found, message) =>
        message.role === "assistant" && message.status === "completed"
          ? message.id
          : found,
      null
    )
  );

  let drawer = $state(false);
  let prompt = $state("");
  let webSearch = $state(true);
  let searchWarning = $state(false);
  let scroller: HTMLDivElement;

  async function send() {
    const content = prompt.trim();
    if (!content || streaming) return;
    prompt = "";
    await onSend(content, webSearch);
    await tick();
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
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

  async function choose(id: string) {
    drawer = false;
    await onSelect(id);
  }
</script>

<section class="chat-view">
  <header>
    <button class="icon" type="button" aria-label="Abrir historial" onclick={() => (drawer = true)}>
      ☰
    </button>
    <div>
      <small>{online ? "Sincronizado" : "Sin conexión"}</small>
      <h1>{activeConversation?.title ?? "MAC"}</h1>
    </div>
    <button class="icon new" type="button" aria-label="Nueva conversación" onclick={onNew}>
      ＋
    </button>
  </header>

  {#if drawer}
    <button class="scrim" type="button" aria-label="Cerrar historial" onclick={() => (drawer = false)}></button>
    <aside>
      <div class="drawer-head">
        <strong>Conversaciones</strong>
        <button type="button" aria-label="Cerrar" onclick={() => (drawer = false)}>×</button>
      </div>
      <button class="new-chat" type="button" onclick={async () => { drawer = false; await onNew(); }}>
        ＋ Nueva conversación
      </button>
      <div class="conversation-list">
        {#if conversations.length === 0}
          <p>No hay conversaciones en la caché.</p>
        {/if}
        {#each conversations as conversation (conversation.id)}
          <button
            class:active={conversation.id === activeConversation?.id}
            type="button"
            onclick={() => choose(conversation.id)}
          >
            <span>{conversation.title}</span>
            <small>{conversation.syncVersion === "0" ? "Pendiente" : "Guardada"}</small>
          </button>
        {/each}
      </div>
    </aside>
  {/if}

  <div class="messages" bind:this={scroller} role="log" aria-label="Mensajes">
    <div class="message-column">
      {#if !activeConversation}
        <div class="empty">
          <img class="mark" src="/mac-logo-256.png" alt="" width="44" height="44" />
          <h2>Tu espacio está listo</h2>
          <p>Abre una conversación de la caché o empieza una nueva.</p>
          <button type="button" onclick={onNew}>Nueva conversación</button>
        </div>
      {:else if messages.length === 0 && !streaming}
        <div class="empty">
          <img class="mark" src="/mac-logo-256.png" alt="" width="44" height="44" />
          <h2>¿En qué quieres pensar?</h2>
          <p>Los mensajes se guardan primero en este dispositivo.</p>
        </div>
      {/if}

      {#each messages as message (message.id)}
        <article class:user={message.role === "user"}>
          <div>
            <strong>{message.role === "user" ? "Tú" : "MAC"}</strong>
            {#if message.status === "pending"}<small>En cola</small>{/if}
          </div>
          <p>{message.content}</p>
          {#if message.id === lastAssistantId && !streaming && online}
            <button
              class="retry"
              type="button"
              onclick={() => onRetry(message.id, webSearch)}
            >
              Regenerar
            </button>
          {/if}
        </article>
      {/each}

      {#if streaming}
        <article class="stream" aria-live="polite">
          <div><strong>MAC</strong><small>{streamText ? "Respondiendo" : "Pensando"}</small></div>
          {#if streamText}
            <p>{streamText}</p>
          {:else}
            <div class="dots" aria-label="Generando"><i></i><i></i><i></i></div>
          {/if}
        </article>
      {/if}
    </div>
  </div>

  <div class="composer-area">
    {#if searchWarning && !webSearch}
      <div class="search-warning" role="alert">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 2.6 18 17H2L10 2.6Z" />
          <path d="M10 7v4.7M10 14.4v.1" />
        </svg>
        <span>
          <strong>Búsqueda web desactivada.</strong>
          MAC puede responder con conocimiento desactualizado desde diciembre de 2023.
        </span>
        <button type="button" onclick={reactivateWebSearch}>Reactivar</button>
      </div>
    {/if}
    <div class="composer">
      <label class="sr-only" for="mobile-prompt">Mensaje</label>
      <textarea
        id="mobile-prompt"
        rows="1"
        maxlength="32000"
        placeholder={online ? "Escribe un mensaje…" : "Se enviará cuando vuelva la conexión"}
        bind:value={prompt}
        onkeydown={keydown}
        disabled={!activeConversation || streaming}
      ></textarea>
      <button
        class:active={webSearch}
        class="search-toggle"
        type="button"
        aria-pressed={webSearch}
        aria-label={webSearch ? "Desactivar búsqueda web" : "Activar búsqueda web"}
        disabled={!online || streaming || !activeConversation}
        onclick={toggleWebSearch}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="9" cy="9" r="6" />
          <path d="M3 9h12M9 3c1.8 1.7 2.8 3.7 2.8 6S10.8 13.3 9 15M9 3C7.2 4.7 6.2 6.7 6.2 9S7.2 13.3 9 15M13.3 13.3 17 17" />
        </svg>
        <span>Web</span>
      </button>
      {#if streaming}
        <button class="send stop" type="button" onclick={onCancel} disabled={!generationId}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" />
          </svg>
          <span class="sr-only">Detener</span>
        </button>
      {:else}
        <button class="send" type="button" onclick={send} disabled={!activeConversation || !prompt.trim()}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 13V3.5M8 3.5 4 7.5M8 3.5l4 4" />
          </svg>
          <span class="sr-only">Enviar</span>
        </button>
      {/if}
    </div>
  </div>
</section>

<style>
  .chat-view {
    display: grid;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  header {
    display: grid;
    min-height: calc(3.75rem + env(safe-area-inset-top));
    grid-template-columns: 2.7rem minmax(0, 1fr) 2.7rem;
    align-items: end;
    gap: 0.55rem;
    border-bottom: 1px solid var(--border);
    padding:
      calc(0.45rem + env(safe-area-inset-top))
      0.7rem
      0.55rem;
    background: var(--surface);
  }

  header div {
    min-width: 0;
    text-align: center;
  }

  header h1,
  header small {
    display: block;
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header h1 {
    font-size: 0.95rem;
  }

  header small {
    color: var(--muted);
    font-size: 0.62rem;
  }

  .icon {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border: 0;
    border-radius: 0.75rem;
    background: var(--surface-2);
    color: var(--text);
  }

  .new {
    color: var(--accent-light);
    font-size: 1.3rem;
  }

  .messages {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .message-column {
    display: grid;
    gap: 1.15rem;
    padding: 1.3rem 0.85rem 1rem;
  }

  article {
    content-visibility: auto;
    contain-intrinsic-size: auto 110px;
  }

  article > div {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.32rem;
    font-size: 0.72rem;
  }

  article small {
    color: var(--muted);
  }

  article p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .retry {
    margin-top: 0.5rem;
    /* Objetivo táctil cómodo sin romper el ritmo de la lista. */
    min-height: 2.1rem;
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.78rem;
  }

  article.user {
    width: fit-content;
    max-width: 88%;
    justify-self: end;
    border: 1px solid var(--border);
    border-radius: 1rem 1rem 0.25rem 1rem;
    background: var(--surface-2);
    padding: 0.75rem 0.85rem;
  }

  .empty {
    display: grid;
    min-height: 54dvh;
    place-content: center;
    justify-items: center;
    text-align: center;
  }

  .empty .mark {
    width: 2.75rem;
    height: 2.75rem;
    object-fit: contain;
  }

  .empty h2 {
    margin: 0.6rem 0 0.25rem;
  }

  .empty p {
    max-width: 19rem;
    margin: 0;
    color: var(--muted);
  }

  .empty button {
    margin-top: 1rem;
    border: 0;
    border-radius: 0.8rem;
    background: var(--accent-button);
    padding: 0.7rem 0.9rem;
    color: white;
    font-weight: 750;
  }

  .dots {
    display: flex;
    gap: 0.3rem;
    padding: 0.4rem 0;
  }

  .dots i {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 50%;
    background: var(--muted);
    animation: pulse 800ms ease-in-out infinite alternate;
  }

  .dots i:nth-child(2) { animation-delay: 120ms; }
  .dots i:nth-child(3) { animation-delay: 240ms; }

  @keyframes pulse {
    to { opacity: 0.25; transform: translateY(-2px); }
  }

  .composer-area {
    display: grid;
    gap: 0.45rem;
    padding: 0.45rem 0.7rem 0.65rem;
    background: linear-gradient(transparent, var(--bg) 28%);
  }

  .search-warning {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--warning) 48%, var(--border));
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--warning) 10%, var(--surface));
    padding: 0.6rem 0.7rem;
    color: var(--muted);
    font-size: 0.72rem;
    line-height: 1.35;
  }

  .search-warning > svg {
    width: 1rem;
    height: 1rem;
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
    padding: 0.3rem;
    color: var(--accent-light);
    font: inherit;
    font-weight: 800;
  }

  .composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 0.45rem;
    border: 1px solid var(--border-strong);
    border-radius: 1rem;
    background: var(--surface);
    padding: 0.5rem;
  }

  textarea {
    max-height: 8rem;
    resize: none;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 0.55rem;
    color: var(--text);
  }

  .send {
    display: grid;
    width: 2.55rem;
    height: 2.55rem;
    place-items: center;
    border: 0;
    border-radius: 0.78rem;
    background: var(--accent-button);
    color: white;
    font-weight: 900;
  }

  .send svg {
    width: 1rem;
    height: 1rem;
  }

  .send:not(.stop) svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .search-toggle {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid var(--border);
    border-radius: 0.78rem;
    background: transparent;
    padding: 0 0.7rem;
    color: var(--muted);
    font: inherit;
    font-size: 0.78rem;
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

  .search-toggle.active {
    border-color: var(--accent-light);
    background: color-mix(in srgb, var(--accent-light) 16%, transparent);
    color: var(--accent-light);
  }

  .stop {
    background: var(--danger);
    font-size: 0.72rem;
  }

  .send:disabled {
    opacity: 0.4;
  }

  .scrim {
    position: fixed;
    z-index: 30;
    inset: 0;
    border: 0;
    background: rgb(0 0 0 / 58%);
  }

  aside {
    position: fixed;
    z-index: 31;
    inset: 0 auto 0 0;
    width: min(86vw, 21rem);
    border-right: 1px solid var(--border);
    background: var(--surface);
    padding:
      calc(1rem + env(safe-area-inset-top))
      0.8rem
      calc(1rem + env(safe-area-inset-bottom));
    box-shadow: 16px 0 50px rgb(0 0 0 / 35%);
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem;
  }

  .drawer-head button {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 1.5rem;
  }

  .new-chat {
    width: 100%;
    min-height: 2.8rem;
    margin: 0.7rem 0;
    border: 1px solid var(--border-strong);
    border-radius: 0.8rem;
    background: var(--surface-2);
    color: var(--text);
    font-weight: 750;
  }

  .conversation-list {
    display: grid;
    gap: 0.2rem;
    max-height: calc(100dvh - 9rem);
    overflow-y: auto;
  }

  .conversation-list > button {
    display: grid;
    gap: 0.12rem;
    border: 0;
    border-radius: 0.7rem;
    background: transparent;
    padding: 0.7rem;
    color: var(--text);
    text-align: left;
  }

  .conversation-list > button.active {
    background: var(--accent-soft);
  }

  .conversation-list span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-list small,
  .conversation-list p {
    color: var(--muted);
  }
</style>
