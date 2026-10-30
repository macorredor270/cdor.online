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
  let webSearch = $state(Boolean(data.webSearchEnabled));

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

  async function scrollToBottom() {
    await tick();
    messageList?.scrollTo({
      top: messageList.scrollHeight,
      behavior: "smooth"
    });
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
    await scrollToBottom();

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
    await scrollToBottom();
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

  <div class="messages" bind:this={messageList} role="log" aria-label="Mensajes">
    <div class="message-column">
      {#if hasOlder}
        <button class="older" type="button" onclick={loadOlder} disabled={loadingOlder}>
          {loadingOlder ? "Cargando…" : "Cargar mensajes anteriores"}
        </button>
      {/if}

      {#if messages.length === 0 && !busy}
        <div class="conversation-empty">
          <span aria-hidden="true">✦</span>
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
                {copiedId === message.id ? "Copiado" : "Copiar"}
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
    height: 100vh;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  header {
    display: flex;
    min-height: 3.4rem;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem clamp(1rem, 4vw, 2.4rem);
  }

  .title-wrap {
    min-width: 0;
  }

  .temporary-badge {
    display: block;
    margin-bottom: 0.15rem;
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
    padding: 0 0.85rem;
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

  header h1 {
    overflow: hidden;
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header h1 {
    max-width: min(65vw, 700px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-base);
  }


  .messages {
    overflow-y: auto;
    overscroll-behavior: contain;
    scroll-behavior: smooth;
  }

  .message-column {
    display: grid;
    width: min(800px, calc(100% - 2rem));
    margin: 0 auto;
    gap: 1.5rem;
    padding: 2.5rem 0 2rem;
  }

  article {
    content-visibility: auto;
    contain-intrinsic-size: auto 140px;
  }

  /* El turno del usuario lleva el púrpura sólido; la respuesta de MAC se queda
     sobre el fondo de la página para no penalizar la legibilidad de textos
     largos ni de los bloques de código. */
  article.user {
    width: fit-content;
    max-width: min(85%, 680px);
    justify-self: end;
    border: 0;
    border-radius: 1.25rem;
    background: var(--surface-2);
    padding: 0.75rem 1.1rem;
    color: var(--text);
  }

  article.user .message-meta {
    color: var(--text-muted);
  }

  .message-meta {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.45rem;
    font-size: var(--text-sm);
  }

  .message-meta time,
  .thinking {
    color: var(--text-muted);
  }

  /* Sobre el púrpura sólido el gris de apoyo no contrasta lo suficiente. */
  article.user .message-meta time {
    color: var(--text-muted);
  }

  .user-content {
    margin: 0;
    white-space: pre-wrap;
  }

  .older {
    justify-self: center;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .message-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.55rem;
  }

  .message-action {
    /* 2.25rem de alto mantiene el objetivo táctil cómodo en móvil. */
    min-height: 2.25rem;
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
    transition:
      color var(--motion-fast) var(--easing),
      border-color var(--motion-fast) var(--easing),
      background var(--motion-fast) var(--easing);
  }

  .message-action:hover,
  .message-action:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: var(--accent-soft);
    color: var(--accent-strong);
  }

  .conversation-empty {
    display: grid;
    min-height: 50vh;
    place-content: center;
    justify-items: center;
    text-align: center;
  }

  .conversation-empty > span {
    color: var(--accent-strong);
    font-size: var(--text-2xl);
  }

  .conversation-empty h2 {
    margin: 0.7rem 0 0.25rem;
  }

  .conversation-empty p {
    margin: 0;
    color: var(--text-muted);
  }

  .dots {
    display: flex;
    gap: 0.3rem;
    padding: 0.4rem 0;
  }

  .dots i {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--text-muted);
    animation: pulse 1s ease-in-out infinite alternate;
  }

  .dots i:nth-child(2) {
    animation-delay: 150ms;
  }

  .dots i:nth-child(3) {
    animation-delay: 300ms;
  }

  @keyframes pulse {
    to {
      opacity: 0.25;
      transform: translateY(-2px);
    }
  }

  .composer-wrap {
    width: min(46rem, 100%);
    margin: 0 auto;
    padding: 0 var(--space-4) var(--space-4);
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
      height: calc(100vh - 3.7rem);
    }

    header {
      min-height: 3.7rem;
    }


    .message-column {
      width: min(100% - 1.2rem, 800px);
      padding-top: 1.5rem;
    }

    article.user {
      max-width: 92%;
    }
  }
</style>
