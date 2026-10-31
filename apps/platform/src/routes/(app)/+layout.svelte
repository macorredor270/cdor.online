<script lang="ts">
  import { page } from "$app/state";
  import { afterNavigate, goto, refreshAll } from "$app/navigation";
  import type { Conversation, ConversationListData } from "@cdor/contracts";
  import { apiRequest } from "#lib/client/api.js";
  import {
    filterConversations,
    groupConversations
  } from "#lib/client/conversation-groups.js";
  import { toasts } from "#lib/client/toast.svelte.js";
  import AccountMenu from "#lib/components/app/AccountMenu.svelte";
  import ConversationList from "#lib/components/app/ConversationList.svelte";
  import ConfirmDialog from "#lib/components/ConfirmDialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Logo from "#lib/components/Logo.svelte";

  const SIDEBAR_KEY = "mac.sidebar";
  const TEMPORARY_KEY = "mac.temporary-conversations";

  let { data, children } = $props();

  let conversations = $state<Conversation[]>([]);
  let nextCursor = $state<string | null>(null);
  let hasMore = $state(false);
  let loading = $state(false);
  let loadedOnce = $state(false);
  let loadError = $state("");
  let creating = $state(false);
  let deleting = $state<Conversation | null>(null);

  /** Cajón abierto en móvil. */
  let drawerOpen = $state(false);
  /**
   * Barra plegada en escritorio.
   *
   * Se recuerda entre navegaciones: quien la pliega quiere trabajar con el
   * chat a pantalla completa, no volver a plegarla en cada página. En móvil
   * no aplica; allí la barra se abre y cierra como un cajón.
   */
  let collapsed = $state(false);
  /** El buscador aparece al pedirlo: ocupa sitio fijo sin usarse casi nunca. */
  let searching = $state(false);
  let query = $state("");

  let temporaryConversationIds = $state<Set<string>>(new Set());

  const activeId = $derived(page.params.conversationId ?? null);
  const visible = $derived(
    filterConversations(
      conversations.filter((item) => !temporaryConversationIds.has(item.id)),
      query
    )
  );
  const groups = $derived(groupConversations(visible));

  $effect(() => {
    try {
      collapsed = localStorage.getItem(SIDEBAR_KEY) === "collapsed";
      const stored = JSON.parse(sessionStorage.getItem(TEMPORARY_KEY) ?? "[]");
      if (Array.isArray(stored)) {
        temporaryConversationIds = new Set(
          stored.filter((id): id is string => typeof id === "string")
        );
      }
    } catch {
      temporaryConversationIds = new Set();
    }
  });

  $effect(() => {
    void loadConversations(true);
  });

  // El fondo no debe desplazarse por debajo del cajón abierto.
  $effect(() => {
    document.documentElement.classList.toggle("drawer-open", drawerOpen);
    return () => document.documentElement.classList.remove("drawer-open");
  });

  afterNavigate(() => {
    drawerOpen = false;
  });

  function toggleCollapsed() {
    collapsed = !collapsed;
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
    } catch {
      // Sin almacenamiento la preferencia dura lo que la página.
    }
  }

  function toggleSearch() {
    searching = !searching;
    if (!searching) query = "";
  }

  function rememberTemporaryConversation(id: string) {
    temporaryConversationIds = new Set([...temporaryConversationIds, id]);
    try {
      sessionStorage.setItem(
        TEMPORARY_KEY,
        JSON.stringify([...temporaryConversationIds])
      );
    } catch {
      // El chat temporal sigue funcionando aunque no se recuerde el marcador.
    }
  }

  async function loadConversations(reset = false) {
    if (loading) return;
    loading = true;
    loadError = "";
    try {
      const cursor = reset ? null : nextCursor;
      const suffix = cursor
        ? `?cursor=${encodeURIComponent(cursor)}&limit=30`
        : "?limit=30";
      const result = await apiRequest<ConversationListData>(
        fetch,
        `/api/v1/conversations${suffix}`
      );
      conversations = reset ? result.items : [...conversations, ...result.items];
      nextCursor = result.nextCursor;
      hasMore = result.hasMore;
    } catch {
      loadError = "No se pudo cargar el historial.";
    } finally {
      loading = false;
      loadedOnce = true;
    }
  }

  async function createConversation(temporary = false) {
    if (creating) return;
    creating = true;
    try {
      const conversation = await apiRequest<Conversation>(
        fetch,
        "/api/v1/conversations",
        {
          method: "POST",
          body: JSON.stringify({
            title: temporary ? "Chat temporal" : "Nueva conversación",
            modelMode: "balanced"
          })
        }
      );
      if (temporary) {
        rememberTemporaryConversation(conversation.id);
        await goto(`/chat/${conversation.id}?temporary=1`);
      } else {
        conversations = [conversation, ...conversations];
        await goto(`/chat/${conversation.id}`);
      }
    } catch {
      toasts.error(
        temporary
          ? "No se pudo abrir el chat temporal."
          : "No se pudo crear la conversación."
      );
    } finally {
      creating = false;
    }
  }

  async function renameConversation(
    conversation: Conversation,
    title: string
  ): Promise<boolean> {
    // Actualización optimista: la lista responde al instante y se revierte
    // entera si el servidor rechaza por conflicto de versión.
    const previous = conversations;
    conversations = conversations.map((item) =>
      item.id === conversation.id ? { ...item, title } : item
    );
    try {
      const updated = await apiRequest<Conversation>(
        fetch,
        `/api/v1/conversations/${conversation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title, baseVersion: conversation.syncVersion })
        }
      );
      conversations = conversations.map((item) =>
        item.id === updated.id ? updated : item
      );
      toasts.success("Conversación renombrada.");
      return true;
    } catch (cause) {
      conversations = previous;
      toasts.error(cause instanceof Error ? cause.message : "No se pudo renombrar.");
      return false;
    }
  }

  async function confirmDelete() {
    const conversation = deleting;
    if (!conversation) return;
    const previous = conversations;
    conversations = conversations.filter((item) => item.id !== conversation.id);
    try {
      await apiRequest(
        fetch,
        `/api/v1/conversations/${conversation.id}?baseVersion=${conversation.syncVersion}`,
        { method: "DELETE" }
      );
      toasts.success("Conversación eliminada.");
      // Si se borró la que estaba abierta, la URL apuntaría a algo inexistente.
      if (activeId === conversation.id) await goto("/chat");
    } catch (cause) {
      conversations = previous;
      toasts.error(cause instanceof Error ? cause.message : "No se pudo eliminar.");
    } finally {
      deleting = null;
    }
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    }).catch(() => null);
    await refreshAll();
    location.assign("/");
  }

  // `autofocus` no actúa sobre elementos insertados tras la carga: el
  // buscador aparece al pedirlo, así que se enfoca explícitamente.
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
  }

  function onWindowKey(event: KeyboardEvent) {
    if (event.key === "Escape" && drawerOpen) drawerOpen = false;
  }
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={onWindowKey} />

<div class="app-shell" class:collapsed>
  <!-- Barra superior en móvil: menú, marca y nueva conversación, siempre a
       mano. Sustituye a la hamburguesa flotante sobre el contenido. -->
  <header class="topbar">
    <button
      class="icon-button"
      type="button"
      aria-label="Abrir navegación"
      aria-expanded={drawerOpen}
      aria-controls="app-sidebar"
      onclick={() => (drawerOpen = true)}
    >
      <Icon name="menu" size={20} />
    </button>
    <a class="topbar-brand" href="/chat">
      <Logo size="sidebar" alt="" />
      MAC
    </a>
    <button
      class="icon-button"
      type="button"
      aria-label="Nueva conversación"
      disabled={creating}
      onclick={() => createConversation()}
    >
      <Icon name="plus" size={20} />
    </button>
  </header>

  <!-- Barra plegada en escritorio: la marca y los atajos esenciales. -->
  <nav class="rail" aria-label="Navegación compacta">
    <a class="rail-brand" href="/chat" aria-label="MAC, inicio">
      <Logo size="sidebar" alt="" />
    </a>
    <button class="icon-button" type="button" aria-label="Mostrar el menú" onclick={toggleCollapsed}>
      <Icon name="sidebar" />
    </button>
    <button
      class="icon-button"
      type="button"
      aria-label="Nueva conversación"
      disabled={creating}
      onclick={() => createConversation()}
    >
      <Icon name="plus" />
    </button>
    <a class="icon-button" href="/docs" aria-label="Docs">
      <Icon name="docs" />
    </a>
  </nav>

  {#if drawerOpen}
    <button
      class="scrim"
      type="button"
      tabindex="-1"
      aria-label="Cerrar navegación"
      onclick={() => (drawerOpen = false)}
    ></button>
  {/if}

  <aside id="app-sidebar" class="sidebar" class:open={drawerOpen} aria-label="Navegación principal">
    <div class="side-head">
      <a class="brand" href="/chat">
        <Logo size="sidebar" alt="" />
        MAC
      </a>
      <div class="head-actions">
        <button
          class="icon-button"
          type="button"
          aria-label="Buscar conversaciones"
          aria-pressed={searching}
          onclick={toggleSearch}
        >
          <Icon name="search" />
        </button>
        <button
          class="icon-button desktop-only"
          type="button"
          aria-label="Ocultar el menú"
          onclick={toggleCollapsed}
        >
          <Icon name="sidebar" />
        </button>
        <button
          class="icon-button mobile-only"
          type="button"
          aria-label="Cerrar navegación"
          onclick={() => (drawerOpen = false)}
        >
          <Icon name="close" />
        </button>
      </div>
    </div>

    <div class="side-actions">
      <button
        class="new-chat"
        type="button"
        onclick={() => createConversation()}
        disabled={creating}
      >
        <Icon name="plus" size={17} />
        {creating ? "Creando…" : "Nueva conversación"}
      </button>

      <div class="nav-list">
        <button
          class="nav-item"
          type="button"
          onclick={() => createConversation(true)}
          disabled={creating}
        >
          <Icon name="temporary" size={17} />
          <span>Chat temporal</span>
          <small>Se borra al salir</small>
        </button>
        <a class="nav-item" href="/docs">
          <Icon name="docs" size={17} />
          <span>Docs</span>
          <small>Guías</small>
        </a>
      </div>

      {#if searching}
        <div class="search">
          <Icon name="search" size={16} />
          <label class="sr-only" for="sidebar-search">Buscar conversaciones</label>
          <input
            id="sidebar-search"
            type="search"
            placeholder="Buscar conversaciones"
            autocomplete="off"
            use:focusOnMount
            bind:value={query}
            onkeydown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                toggleSearch();
              }
            }}
          />
        </div>
      {/if}
    </div>

    <ConversationList
      {groups}
      {activeId}
      {loadedOnce}
      {loading}
      {hasMore}
      {query}
      {loadError}
      onloadmore={() => loadConversations()}
      onrename={renameConversation}
      ondelete={(conversation) => (deleting = conversation)}
    />

    <AccountMenu user={data.user} onsignout={signOut} />
  </aside>

  <main class="app-content">
    {@render children()}
  </main>
</div>

<ConfirmDialog
  open={deleting !== null}
  destructive
  title="Eliminar la conversación"
  description={deleting
    ? `«${deleting.title}» y sus mensajes dejarán de estar disponibles. El borrado se sincroniza con tus dispositivos.`
    : ""}
  confirmLabel="Eliminar"
  onconfirm={confirmDelete}
  oncancel={() => (deleting = null)}
/>

<style>
  .app-shell {
    min-height: 100dvh;
  }

  /* La barra no lleva filo ni tarjetas: se separa del lienzo por el tono, no
     por una línea. Todo lo que no sea el historial pesa menos que él. */
  .sidebar {
    position: fixed;
    z-index: 20;
    inset: 0 auto 0 0;
    display: grid;
    width: var(--sidebar-width);
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: var(--space-4);
    background: var(--surface);
    padding: var(--space-3);
    view-transition-name: app-sidebar;
  }

  .side-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .head-actions {
    display: flex;
    align-items: center;
  }

  .brand,
  .topbar-brand {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.55rem;
    color: var(--text);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-decoration: none;
  }

  .brand {
    padding-left: var(--space-2);
  }

  .icon-button {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: none;
    transition:
      background var(--motion-fast) var(--easing),
      color var(--motion-fast) var(--easing);
  }

  .icon-button:hover:not(:disabled),
  .icon-button:focus-visible,
  .icon-button[aria-pressed="true"] {
    background: var(--surface-2);
    color: var(--text);
  }

  .icon-button:disabled {
    opacity: 0.5;
    cursor: progress;
  }

  .side-actions {
    display: grid;
    gap: var(--space-3);
  }

  .new-chat {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
    border-radius: var(--radius-control);
    background: var(--accent-soft);
    padding: 0 var(--space-4);
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--easing),
      border-color var(--motion-fast) var(--easing),
      transform var(--motion-fast) var(--easing);
  }

  .new-chat :global(.icon) {
    color: var(--accent-strong);
  }

  .new-chat:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  }

  .new-chat:active:not(:disabled) {
    transform: scale(0.99);
  }

  .new-chat:disabled {
    opacity: 0.7;
    cursor: progress;
  }

  /* Chat temporal y Docs comparten forma: dos destinos secundarios con el
     mismo peso, en vez de una tarjeta con borde y un enlace suelto. */
  .nav-list {
    display: grid;
    gap: 1px;
  }

  .nav-item {
    display: grid;
    min-height: 2.5rem;
    align-items: center;
    gap: var(--space-3);
    grid-template-columns: auto minmax(0, 1fr) auto;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 0 var(--space-3);
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--easing),
      color var(--motion-fast) var(--easing);
  }

  .nav-item:hover:not(:disabled),
  .nav-item:focus-visible {
    background: var(--surface-2);
    color: var(--text);
  }

  .nav-item :global(.icon) {
    color: var(--accent-strong);
  }

  .nav-item small {
    color: var(--text-muted);
    font-size: var(--text-xs);
    opacity: 0.8;
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    padding: 0 var(--space-3);
    color: var(--text-muted);
    animation: mac-rise var(--motion-fast) var(--easing-out);
  }

  .search:focus-within {
    border-color: var(--accent);
  }

  .search input {
    width: 100%;
    min-height: 2.5rem;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    font-size: var(--text-sm);
  }

  .rail {
    position: fixed;
    z-index: 20;
    inset: 0 auto 0 0;
    display: none;
    width: var(--sidebar-rail);
    align-content: start;
    justify-items: center;
    gap: var(--space-2);
    background: var(--surface);
    padding: var(--space-3) 0;
  }

  .rail-brand {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    margin-bottom: var(--space-1);
  }

  .collapsed .rail {
    display: grid;
  }

  .collapsed .sidebar {
    display: none;
  }

  .app-content {
    min-height: 100dvh;
    margin-left: var(--sidebar-width);
  }

  .collapsed .app-content {
    margin-left: var(--sidebar-rail);
  }

  .topbar,
  .scrim,
  .mobile-only {
    display: none;
  }

  @media (max-width: 760px) {
    .topbar {
      position: fixed;
      z-index: 15;
      inset: 0 0 auto;
      display: flex;
      height: var(--topbar-height);
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg) 88%, transparent);
      padding: 0 var(--space-2);
      backdrop-filter: blur(12px);
    }

    .topbar-brand {
      font-size: var(--text-sm);
    }

    .sidebar,
    .collapsed .sidebar {
      display: grid;
      width: min(19rem, calc(100vw - 3rem));
      box-shadow: var(--shadow);
      transform: translateX(-100%);
      /* Oculto para el teclado y los lectores mientras está cerrado; la
         visibilidad cambia al final del deslizamiento al cerrar. */
      transition:
        transform var(--motion-base) var(--easing),
        visibility 0s linear var(--motion-base);
      visibility: hidden;
      view-transition-name: none;
    }

    .sidebar.open {
      transform: none;
      transition: transform var(--motion-base) var(--easing-out);
      visibility: visible;
    }

    .collapsed .rail {
      display: none;
    }

    .app-content,
    .collapsed .app-content {
      margin-left: 0;
      padding-top: var(--topbar-height);
    }

    .desktop-only {
      display: none;
    }

    .mobile-only {
      display: grid;
    }

    .scrim {
      position: fixed;
      z-index: 18;
      inset: 0;
      display: block;
      border: 0;
      background: rgb(0 0 0 / 55%);
      animation: mac-fade var(--motion-base) var(--easing);
    }

    :global(html.drawer-open) {
      overflow: hidden;
    }
  }
</style>
