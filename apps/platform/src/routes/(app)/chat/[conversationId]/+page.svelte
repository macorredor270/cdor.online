<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { ulid } from "ulid";
  import type {
    ChatMessage,
    ChatStreamEvent,
    Conversation,
    MessageListData
  } from "@cdor/contracts";
  import { apiRequest, readChatStream } from "#lib/client/api.js";
  import Composer from "#lib/components/Composer.svelte";
  import Markdown from "#lib/components/Markdown.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Logo from "#lib/components/Logo.svelte";

  let { data } = $props();
  let conversation = $state<Conversation>(
    untrack(() => data.conversation)
  );
  let messages = $state<ChatMessage[]>(
    untrack(() => data.messages.items.toReversed())
  );
  let olderCursor = $state<string | null>(
    untrack(() => data.messages.nextCursor)
  );
  let hasOlder = $state(untrack(() => data.messages.hasMore));
  let prompt = $state("");
  let temporary = $state(false);
  let temporaryCleanupStarted = false;
  // Initial value only: the user toggles it afterwards.
  let webSearch = $state(untrack(() => Boolean(data.webSearchEnabled)));

  /**
   * Arranque procedente de la pantalla vacía.
   *
   * `prompt` lo deja escrito para completarlo; `send` lo manda directamente,
   * que es lo que espera quien ya pulsó Enter allí. Se limpia la URL en
   * cuanto se consume: recargar no puede reenviar el mismo mensaje.
   */
  let seeded = $state(false);
  $effect(() => {
    if (untrack(() => seeded)) return;
    const url = page.url;
    temporary = url.searchParams.get("temporary") === "1";
    if (url.searchParams.has("search")) {
      webSearch = url.searchParams.get("search") === "1";
    }
    const draft = url.searchParams.get("prompt");
    const immediate = url.searchParams.get("send");
    if (!draft && !immediate) return;

    seeded = true;
    prompt = immediate ?? draft ?? "";
    void goto(url.pathname, { replace: true, reset: false });
    if (immediate) void send();
  });

  async function cleanupTemporary() {
    if (!temporary || temporaryCleanupStarted) return;
    temporaryCleanupStarted = true;
    try {
      await fetch(
        `/api/v1/conversations/${conversation.id}?baseVersion=${conversation.syncVersion}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true
        }
      );
    } finally {
      try {
        const key = "mac.temporary-conversations";
        const stored = JSON.parse(sessionStorage.getItem(key) ?? "[]");
        if (Array.isArray(stored)) {
          sessionStorage.setItem(
            key,
            JSON.stringify(stored.filter((id) => id !== conversation.id))
          );
        }
      } catch {
        // La limpieza del marcador local no debe interrumpir la navegación.
      }
    }
  }

  async function leaveTemporary() {
    await cleanupTemporary();
    await goto("/chat");
  }

  onDestroy(() => {
    if (temporary) void cleanupTemporary();
  });
  let busy = $state(false);
  let loadingOlder = $state(false);
  let streamingText = $state("");
  let generationId = $state<string | null>(null);
  let assistantId = $state<string | null>(null);
  let usage = $state<{ inputTokens: number; outputTokens: number } | null>(null);
  let chatError = $state("");
  let messageList: HTMLDivElement;
  let activeConversationId = $state(
    untrack(() => data.conversation.id)
  );
  // Solo la última respuesta completada ofrece regenerar: una respuesta
  // fallida o cancelada no tiene contenido que sustituir con sentido.
  let lastAssistantId = $derived(
    messages.findLast(
      (message) =>
        message.role === "assistant" && message.status === "completed"
    )?.id ?? null
  );

  $effect(() => {
    if (activeConversationId !== data.conversation.id) {
      activeConversationId = data.conversation.id;
      conversation = data.conversation;
      messages = data.messages.items.toReversed();
      olderCursor = data.messages.nextCursor;
      hasOlder = data.messages.hasMore;
      prompt = "";
      streamingText = "";
      generationId = null;
      assistantId = null;
      chatError = "";
    }
  });

  // Al abrir una conversación se empieza por el final, como en cualquier chat.
  $effect(() => {
    void activeConversationId;
    untrack(() => {
      void tick().then(() => {
        messageList?.scrollTo({ top: messageList.scrollHeight });
        atBottom = true;
      });
    });
  });

  // Confirmación efímera del copiado: sin toast ni dependencia nueva.
  let copiedId = $state<string | null>(null);

  async function copyMessage(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 2000);
    } catch {
      chatError = "El navegador no permitió copiar al portapapeles.";
    }
  }

  /**
   * Seguimiento del final de la conversación.
   *
   * Mientras el usuario está abajo, cada fragmento del streaming mantiene la
   * vista pegada al final. Si sube a releer algo, se le deja en paz y aparece
   * un botón para volver.
   */
  let atBottom = $state(true);

  function updateAtBottom() {
    if (!messageList) return;
    const distance =
      messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight;
    atBottom = distance < 120;
  }

  async function scrollToBottom(force = false) {
    if (!force && !atBottom) return;
    await tick();
    messageList?.scrollTo({
      top: messageList.scrollHeight,
      behavior: "smooth"
    });
    atBottom = true;
  }

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    loadingOlder = true;
    const previousHeight = messageList.scrollHeight;
    try {
      const page = await apiRequest<MessageListData>(
        fetch,
        `/api/v1/conversations/${conversation.id}/messages?before=${olderCursor}&limit=50`
      );
      messages = [...page.items.toReversed(), ...messages];
      olderCursor = page.nextCursor;
      hasOlder = page.hasMore;
      await tick();
      messageList.scrollTop = messageList.scrollHeight - previousHeight;
    } catch {
      chatError = "No se pudieron cargar los mensajes anteriores.";
    } finally {
      loadingOlder = false;
    }
  }

  function applyStreamEvent(event: ChatStreamEvent) {
    if (event.event === "start") {
      generationId = event.data.generationId;
      assistantId = event.data.assistantMessageId;
    } else if (event.event === "delta") {
      streamingText += event.data.text;
      void scrollToBottom();
    } else if (event.event === "usage") {
      usage = event.data;
    } else if (event.event === "done") {
      messages = [...messages, event.data.message];
      streamingText = "";
      assistantId = null;
      generationId = null;
      busy = false;
    } else {
      chatError = event.data.message;
      streamingText = "";
      assistantId = null;
      generationId = null;
      busy = false;
    }
  }

  async function maybeRename(firstMessage: string) {
    if (
      temporary ||
      conversation.title !== "Nueva conversación" ||
      messages.length > 1
    ) {
      return;
    }
    const title =
      [...firstMessage.trim()].slice(0, 64).join("") || "Nueva conversación";
    try {
      conversation = await apiRequest<Conversation>(
        fetch,
        `/api/v1/conversations/${conversation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title,
            baseVersion: conversation.syncVersion
          })
        }
      );
    } catch {
      // El mensaje es prioritario; un conflicto de título no interrumpe el chat.
    }
  }

  async function send() {
    const content = prompt.trim();
    if (!content || busy) return;
    prompt = "";
    busy = true;
    chatError = "";
    streamingText = "";
    usage = null;
    const now = new Date().toISOString();
    const messageId = ulid();
    const operationId = ulid();
    const optimistic: ChatMessage = {
      id: messageId,
      conversationId: conversation.id,
      userId: conversation.userId,
      clientOperationId: operationId,
      role: "user",
      content,
      status: "streaming",
      modelProvider: null,
      modelId: null,
      inputTokens: null,
      outputTokens: null,
      finishReason: null,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncVersion: "0"
    };
    messages = [...messages, optimistic];
    void maybeRename(content);
    await scrollToBottom(true);

    await runGeneration("/api/v1/chat/stream", {
      conversationId: conversation.id,
      message: {
        id: messageId,
        clientOperationId: operationId,
        content
      },
      modelMode: "balanced",
      webSearch
    });
  }

  async function runGeneration(path: string, body: unknown) {
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream"
        },
        body: JSON.stringify(body)
      });
      await readChatStream(response, applyStreamEvent);
      if (busy) {
        busy = false;
        chatError = "El stream terminó sin confirmar el mensaje.";
      }
    } catch (cause) {
      busy = false;
      streamingText = "";
      generationId = null;
      assistantId = null;
      chatError =
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la respuesta.";
    }
  }

  // Los mensajes son append-only: regenerar añade una respuesta nueva
  // anclada al mismo mensaje de usuario y conserva la anterior.
  async function regenerate(sourceMessageId: string) {
    if (busy) return;
    busy = true;
    chatError = "";
    streamingText = "";
    usage = null;
    await scrollToBottom(true);
    await runGeneration("/api/v1/chat/regenerate", {
      conversationId: conversation.id,
      sourceMessageId,
      clientOperationId: ulid(),
      modelMode: "balanced",
      webSearch
    });
  }

  async function cancel() {
    if (!generationId) return;
    try {
      await apiRequest(fetch, "/api/v1/chat/cancel", {
        method: "POST",
        body: JSON.stringify({ generationId })
      });
    } catch {
      chatError = "No se pudo solicitar la cancelación.";
    }
  }

  function composerKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }
</script>

<svelte:head>
  <title>{conversation.title} — MAC</title>
</svelte:head>

<section class="chat">
  <header>
    <div class="title-wrap">
      {#if temporary}<span class="temporary-badge">Temporal · se borra al salir</span>{/if}
      <h1>{conversation.title}</h1>
    </div>
    {#if temporary}
      <button class="temporary-exit" type="button" onclick={leaveTemporary}>
        Salir
      </button>
    {/if}
  </header>

  <div
    class="messages"
    bind:this={messageList}
    onscroll={updateAtBottom}
    role="log"
    aria-label="Mensajes"
  >
    <div class="message-column">
      {#if hasOlder}
        <button class="older" type="button" onclick={loadOlder} disabled={loadingOlder}>
          {loadingOlder ? "Cargando…" : "Cargar mensajes anteriores"}
        </button>
      {/if}

      {#if messages.length === 0 && !busy}
        <div class="conversation-empty">
          <Logo size="auth" alt="" />
          <h2>Empieza con una idea</h2>
          <p>Pregunta, redacta, analiza o continúa algo que ya tenías en mente.</p>
        </div>
      {/if}

      {#each messages as message (message.id)}
        <article class:user={message.role === "user"}>
          <div class="message-meta">
            {#if message.role === "assistant"}
              <Logo size="avatar" alt="" />
            {/if}
            <strong>{message.role === "user" ? "Tú" : "MAC"}</strong>
            <time datetime={message.createdAt}>
              {new Date(message.createdAt).toLocaleTimeString("es", {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </time>
          </div>
          {#if message.role === "assistant"}
            <Markdown source={message.content} />
            <div class="message-actions">
              <button
                class="message-action"
                type="button"
                onclick={() => copyMessage(message.id, message.content)}
              >
                {copiedId === message.id ? "Copiado ✓" : "Copiar"}
              </button>
              {#if message.id === lastAssistantId && !busy}
                <button
                  class="message-action"
                  type="button"
                  onclick={() => regenerate(message.id)}
                >
                  Regenerar
                </button>
              {/if}
            </div>
          {:else}
            <p class="user-content">{message.content}</p>
          {/if}
        </article>
      {/each}

      {#if busy}
        <article class="streaming" aria-live="polite">
          <div class="message-meta">
            <Logo size="avatar" alt="" />
            <strong>MAC</strong>
            <span class="thinking">{streamingText ? "Respondiendo" : "Pensando"}</span>
          </div>
          {#if streamingText}
            <Markdown source={streamingText} />
          {:else}
            <div class="dots" aria-label="Generando respuesta"><i></i><i></i><i></i></div>
          {/if}
        </article>
      {/if}
    </div>
  </div>

  <div class="composer-wrap">
    {#if !atBottom}
      <button
        class="to-bottom"
        type="button"
        aria-label="Ir al último mensaje"
        onclick={() => scrollToBottom(true)}
      >
        <Icon name="arrowDown" size={18} />
      </button>
    {/if}
    {#if chatError}<p class="error" role="alert">{chatError}</p>{/if}
    {#if usage}
      <p class="usage" aria-live="polite">
        {usage.inputTokens + usage.outputTokens} tokens en esta respuesta
      </p>
    {/if}
    <Composer
      bind:value={prompt}
      {busy}
      canStop={generationId !== null}
      webSearchEnabled={data.webSearchEnabled}
      bind:webSearch
      placeholder="Mensaje a MAC"
      onsend={send}
      onstop={cancel}
    />
  </div>
</section>

<style>
  .chat {
    display: grid;
    height: 100dvh;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  header {
    display: flex;
    min-height: 3.5rem;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--gutter);
  }

  .title-wrap {
    min-width: 0;
  }

  header h1 {
    overflow: hidden;
    margin: 0;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .temporary-badge {
    display: block;
    margin-bottom: 0.1rem;
    color: var(--accent-strong);
    font-size: var(--text-xs);
    font-weight: 650;
  }

  .temporary-exit {
    min-height: 2.25rem;
    margin-left: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: transparent;
    padding: 0 var(--space-4);
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .temporary-exit:hover,
  .temporary-exit:focus-visible {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }

  .messages {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* minmax(0, 1fr): sin él la pista crece hasta el ancho mínimo de un bloque
     de código o una tabla y la página se desborda en horizontal en móvil. */
  .message-column {
    display: grid;
    width: min(var(--width-chat), calc(100% - 2 * var(--gutter)));
    margin: 0 auto;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-6);
    padding: var(--space-6) 0 var(--space-8);
  }

  article {
    min-width: 0;
    content-visibility: auto;
    contain-intrinsic-size: auto 140px;
    animation: mac-rise var(--motion-base) var(--easing-out);
  }

  /* El turno del usuario se distingue por la superficie; la respuesta de MAC
     se queda sobre el fondo para no penalizar textos largos ni código. */
  article.user {
    width: fit-content;
    max-width: min(85%, 40rem);
    justify-self: end;
    border-radius: 1.25rem 1.25rem 0.375rem 1.25rem;
    background: var(--surface-2);
    padding: var(--space-3) var(--space-4);
  }

  .message-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
  }

  article.user .message-meta {
    margin-bottom: var(--space-1);
    font-size: var(--text-xs);
  }

  .message-meta time,
  .thinking {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .user-content {
    margin: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .older {
    justify-self: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: transparent;
    padding: var(--space-1) var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .older:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--text);
  }

  /* Acciones discretas: se ven sin pesar, y ganan presencia al pasar. */
  .message-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .message-action {
    min-height: 2rem;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    background: transparent;
    padding: 0 var(--space-3);
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 550;
    cursor: pointer;
    transition:
      color var(--motion-fast) var(--easing),
      border-color var(--motion-fast) var(--easing),
      background var(--motion-fast) var(--easing);
  }

  .message-action:hover,
  .message-action:focus-visible {
    border-color: var(--border);
    background: var(--surface-2);
    color: var(--text);
  }

  .conversation-empty {
    display: grid;
    min-height: 45vh;
    place-content: center;
    justify-items: center;
    gap: var(--space-2);
    text-align: center;
  }

  .conversation-empty h2 {
    margin: var(--space-3) 0 0;
    font-size: var(--text-xl);
    letter-spacing: -0.01em;
  }

  .conversation-empty p {
    max-width: 26rem;
    margin: 0;
    color: var(--text-muted);
  }

  .dots {
    display: flex;
    gap: 0.3rem;
    padding: var(--space-2) 0;
  }

  .dots i {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 0.9s ease-in-out infinite alternate;
  }

  .dots i:nth-child(2) {
    animation-delay: 150ms;
  }

  .dots i:nth-child(3) {
    animation-delay: 300ms;
  }

  @keyframes pulse {
    from {
      opacity: 0.9;
    }

    to {
      opacity: 0.2;
      transform: translateY(-2px);
    }
  }

  /* El compositor flota sobre un fundido del fondo: el texto que pasa por
     debajo se desvanece en lugar de cortarse en seco. */
  .composer-wrap {
    position: relative;
    width: min(var(--width-chat), calc(100% - 2 * var(--gutter)));
    margin: 0 auto;
    padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
  }

  .composer-wrap::before {
    position: absolute;
    right: 0;
    bottom: 100%;
    left: 0;
    height: var(--space-8);
    background: linear-gradient(to top, var(--bg), transparent);
    content: "";
    pointer-events: none;
  }

  .to-bottom {
    position: absolute;
    z-index: 1;
    bottom: calc(100% + var(--space-3));
    left: 50%;
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface-2);
    box-shadow: var(--shadow);
    color: var(--text);
    cursor: pointer;
    transform: translateX(-50%);
    animation: mac-rise var(--motion-fast) var(--easing-out);
  }

  .to-bottom:hover {
    background: var(--surface-3);
  }

  .usage,
  .composer-wrap > .error {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
  }

  .usage {
    color: var(--text-muted);
    text-align: center;
  }

  @media (max-width: 760px) {
    .chat {
      height: calc(100dvh - var(--topbar-height));
    }

    article.user {
      max-width: 92%;
    }
  }
</style>
