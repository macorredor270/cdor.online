<script lang="ts">
  import { page } from "$app/state";
  import { goto, invalidateAll } from "$app/navigation";
  import type { Conversation, ConversationListData } from "@cdor/contracts";
  import { apiRequest } from "$lib/client/api";
  import {
    filterConversations,
    groupConversations
  } from "$lib/client/conversation-groups";
  import { toasts } from "$lib/client/toast.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import Logo from "$lib/components/Logo.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import UserAvatar from "$lib/components/UserAvatar.svelte";

  let { data, children } = $props();
  let conversations = $state<Conversation[]>([]);
  let nextCursor = $state<string | null>(null);
  let hasMore = $state(false);
  let loading = $state(false);
  let loadedOnce = $state(false);
  let creating = $state(false);
  let sidebarOpen = $state(false);
  /**
   * Barra plegada en escritorio.
   *
   * Se recuerda entre navegaciones: quien la pliega quiere trabajar con el
   * chat a pantalla completa, no volver a plegarla en cada página. En móvil
   * no aplica; allí la barra ya se abre y cierra con la hamburguesa.
   */
  let collapsed = $state(false);

  $effect(() => {
    collapsed = localStorage.getItem("mac.sidebar") === "collapsed";
  });

  function toggleCollapsed() {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    collapsed = !collapsed;
    localStorage.setItem("mac.sidebar", collapsed ? "collapsed" : "open");
  }
  let loadError = $state("");

  let temporaryConversationIds = $state<Set<string>>(new Set());

  $effect(() => {
    try {
      const stored = JSON.parse(
        sessionStorage.getItem("mac.temporary-conversations") ?? "[]"
      );
      if (Array.isArray(stored)) {
        temporaryConversationIds = new Set(
          stored.filter((id): id is string => typeof id === "string")
        );
      }
    } catch {
      temporaryConversationIds = new Set();
    }
  });

  function rememberTemporaryConversation(id: string) {
    temporaryConversationIds = new Set([...temporaryConversationIds, id]);
    sessionStorage.setItem(
      "mac.temporary-conversations",
      JSON.stringify([...temporaryConversationIds])
    );
  }

  let query = $state("");
  /** El buscador aparece al pedirlo: ocupa sitio fijo sin usarse casi nunca. */
  let searching = $state(false);
  let accountOpen = $state(false);
  /** Conversación en edición de título, y su borrador. */
  let renamingId = $state<string | null>(null);
  let draft = $state("");
  let savingRename = $state(false);
  let deleting = $state<Conversation | null>(null);

  const visible = $derived(
    filterConversations(
      conversations.filter((item) => !temporaryConversationIds.has(item.id)),
      query
    )
  );
  const groups = $derived(groupConversations(visible));

  async function loadConversations(reset = false) {
    if (loading) return;
    loading = true;
    loadError = "";
    try {
      const cursor = reset ? null : nextCursor;
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=30` : "?limit=30";
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

  async function createConversation() {
    if (creating) return;
    creating = true;
    try {
      const conversation = await apiRequest<Conversation>(
        fetch,
        "/api/v1/conversations",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Nueva conversación",
            modelMode: "balanced"
          })
        }
      );
      conversations = [conversation, ...conversations];
      sidebarOpen = false;
      await goto(`/chat/${conversation.id}`);
    } catch {
      toasts.error("No se pudo crear la conversación.");
    } finally {
      creating = false;
    }
  }

  async function createTemporaryConversation() {
    if (creating) return;
    creating = true;
    try {
      const conversation = await apiRequest<Conversation>(
        fetch,
        "/api/v1/conversations",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Chat temporal",
            modelMode: "balanced"
          })
        }
      );
      rememberTemporaryConversation(conversation.id);
      sidebarOpen = false;
      await goto(`/chat/${conversation.id}?temporary=1`);
    } catch {
      toasts.error("No se pudo abrir el chat temporal.");
    } finally {
      creating = false;
    }
  }

  function startRename(conversation: Conversation) {
    renamingId = conversation.id;
    draft = conversation.title;
  }

  function cancelRename() {
    renamingId = null;
    draft = "";
  }

  async function commitRename(conversation: Conversation) {
    const title = draft.trim();
    if (savingRename) return;
    if (!title || title === conversation.title) {
      cancelRename();
      return;
    }

    // Actualización optimista: la lista responde al instante y se revierte
    // entera si el servidor rechaza por conflicto de versión.
    const previous = conversations;
    conversations = conversations.map((item) =>
      item.id === conversation.id ? { ...item, title } : item
    );
    savingRename = true;
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
      cancelRename();
    } catch (cause) {
      conversations = previous;
      toasts.error(
        cause instanceof Error ? cause.message : "No se pudo renombrar."
      );
    } finally {
      savingRename = false;
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
      if (page.url.pathname === `/chat/${conversation.id}`) {
        await goto("/chat");
      }
    } catch (cause) {
      conversations = previous;
      toasts.error(
        cause instanceof Error ? cause.message : "No se pudo eliminar."
      );
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
    await invalidateAll();
    location.assign("/");
  }

  $effect(() => {
    void loadConversations(true);
  });
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="app-shell" class:collapsed>
  <!-- Barra plegada: la marca, el botón de volver a mostrarla y el de abrir
       una conversación. Nada más; lo demás está a un clic de distancia. -->
  <div class="rail" hidden={!collapsed}>
    <a class="rail-brand" href="/chat" aria-label="MAC, inicio">
      <Logo size="sidebar" alt="" />
    </a>
    <button class="icon" type="button" aria-label="Mostrar el menú" onclick={toggleCollapsed}>
      <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
        <rect x="2.5" y="3.5" width="15" height="13" rx="2.5"
              fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M8 3.5v13" stroke="currentColor" stroke-width="1.6" />
      </svg>
    </button>
    <button
      class="icon"
      type="button"
      aria-label="Nueva conversación"
      onclick={createConversation}
      disabled={creating}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
    <a class="icon rail-docs" href="/docs" aria-label="Docs">
      <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
        <path d="M4 3.5h7.5A2.5 2.5 0 0 1 14 6v10.5H6.5A2.5 2.5 0 0 1 4 14z"
              fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M6.5 13.5H14M7 7h4M7 10h4" fill="none" stroke="currentColor"
              stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </a>
  </div>

  <button
    class="mobile-menu"
    class:open={sidebarOpen}
    type="button"
    aria-label={sidebarOpen ? "Cerrar navegación" : "Abrir navegación"}
    aria-expanded={sidebarOpen}
    onclick={() => (sidebarOpen = !sidebarOpen)}
  >
    {#if sidebarOpen}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    {/if}
  </button>

  {#if sidebarOpen}
    <button
      class="scrim"
      type="button"
      aria-label="Cerrar navegación"
      onclick={() => (sidebarOpen = false)}
    ></button>
  {/if}

  <aside class:open={sidebarOpen} aria-label="Navegación principal">
    <div class="side-head">
      <a class="brand" href="/chat" onclick={() => (sidebarOpen = false)}>
        <Logo size="sidebar" alt="" />
        MAC
      </a>
      <div class="head-actions">
        <button
          class="icon"
          type="button"
          aria-label="Buscar conversaciones"
          aria-expanded={searching}
          onclick={() => {
            searching = !searching;
            if (!searching) query = "";
          }}
        >
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M13.2 13.2L17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="icon collapse"
          type="button"
          aria-label="Ocultar el menú"
          onclick={toggleCollapsed}
        >
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <rect x="2.5" y="3.5" width="15" height="13" rx="2.5"
                  fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M8 3.5v13" stroke="currentColor" stroke-width="1.6" />
          </svg>
        </button>
      </div>
    </div>

    <div class="side-actions">
      <button class="new-chat" type="button" onclick={createConversation} disabled={creating}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        {creating ? "Creando…" : "Nueva conversación"}
      </button>

      <button
        class="temporary-chat"
        type="button"
        onclick={createTemporaryConversation}
        disabled={creating}
      >
        <span aria-hidden="true">◌</span>
        <span>
          Chat temporal
          <small>Se borra al salir</small>
        </span>
      </button>

      <a class="docs-link" href="/docs" onclick={() => (sidebarOpen = false)}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M4 3.5h7.5A2.5 2.5 0 0 1 14 6v10.5H6.5A2.5 2.5 0 0 1 4 14z"
                fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M6.5 13.5H14M7 7h4M7 10h4" fill="none" stroke="currentColor"
                stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <span>
          Docs
          <small>Guías y referencia</small>
        </span>
      </a>

      {#if searching}
        <div class="search">
          <label class="sr-only" for="sidebar-search">Buscar conversaciones</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="sidebar-search"
            type="search"
            placeholder="Buscar"
            autocomplete="off"
            autofocus
            bind:value={query}
            onkeydown={(event) => {
              if (event.key === "Escape") {
                query = "";
                searching = false;
              }
            }}
          />
        </div>
      {/if}
    </div>

    <nav class="history" aria-label="Conversaciones">
      {#if !loadedOnce}
        <p class="sr-only" role="status">Cargando historial</p>
        <div class="history-skeleton">
          <Skeleton lines={5} height="2.4rem" gap="var(--space-1)" />
        </div>
      {:else if visible.length === 0}
        <p class="empty-hint">
          {query ? "Ninguna conversación coincide." : "Todavía no hay conversaciones."}
        </p>
      {/if}

      {#each groups as group (group.id)}
        <p class="group-label">{group.label}</p>
        {#each group.items as conversation (conversation.id)}
          <div class="row" class:active={page.url.pathname === `/chat/${conversation.id}`}>
            {#if renamingId === conversation.id}
              <input
                class="rename"
                value={draft}
                maxlength="255"
                aria-label="Nuevo título"
                disabled={savingRename}
                oninput={(event) => (draft = event.currentTarget.value)}
                onkeydown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitRename(conversation);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
                onblur={() => commitRename(conversation)}
              />
            {:else}
              <a
                href={`/chat/${conversation.id}`}
                onclick={() => (sidebarOpen = false)}
              >
                <span>{conversation.title}</span>
              </a>
              <div class="row-actions">
                <button
                  type="button"
                  aria-label={`Renombrar ${conversation.title}`}
                  onclick={() => startRename(conversation)}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                    <path
                      d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar ${conversation.title}`}
                  onclick={() => (deleting = conversation)}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                    <path
                      d="M3 4.5h10M6.5 4V2.5h3V4M5 4.5l.5 8h5l.5-8"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>
            {/if}
          </div>
        {/each}
      {/each}

      {#if hasMore && !query}
        <button type="button" class="load-more" onclick={() => loadConversations()}>
          {loading ? "Cargando…" : "Mostrar anteriores"}
        </button>
      {/if}
      {#if loadError}<p class="error" role="status">{loadError}</p>{/if}
    </nav>

    <!-- Memorias, Uso, Ajustes y Cuenta vivían como una cuarta lista siempre
         visible. Son destinos de visita ocasional: pesaban lo mismo que el
         historial, que es a lo que se vuelve todo el rato. -->
    <div class="account" class:open={accountOpen}>
      {#if accountOpen}
        <nav class="account-menu" aria-label="Cuenta y configuración">
          <a href="/memories" onclick={() => (accountOpen = false)}>Memorias</a>
          <a href="/usage" onclick={() => (accountOpen = false)}>Uso</a>
          <a href="/settings" onclick={() => (accountOpen = false)}>Ajustes</a>
          <a href="/account" onclick={() => (accountOpen = false)}>Cuenta</a>
          <button type="button" onclick={signOut}>Cerrar sesión</button>
        </nav>
      {/if}

      <button
        class="profile"
        type="button"
        aria-expanded={accountOpen}
        onclick={() => (accountOpen = !accountOpen)}
      >
        <UserAvatar name={data.user.name} image={data.user.image} size="sidebar" />
        <span class="who">{data.user.name}</span>
        <span class="dots" aria-hidden="true">···</span>
      </button>
    </div>
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
    min-height: 100vh;
  }

  /* La barra no lleva filo ni tarjetas: se separa del lienzo por el tono, no
     por una línea. Todo lo que no sea el historial pesa menos que él. */
  aside {
    position: fixed;
    z-index: 20;
    inset: 0 auto 0 0;
    display: grid;
    width: 16.5rem;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: var(--space-3);
    background: var(--surface);
    padding: var(--space-3);
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

  .side-actions {
    display: grid;
    gap: var(--space-2);
  }

  /* Barra plegada. Ocupa una columna estrecha en vez de desaparecer del todo:
     así el botón para recuperarla está donde estaba la barra, no flotando
     sobre el contenido. */
  .rail {
    position: fixed;
    z-index: 20;
    inset: 0 auto 0 0;
    display: grid;
    width: 3.75rem;
    align-content: start;
    justify-items: center;
    gap: var(--space-2);
    background: var(--surface);
    padding: var(--space-3) 0;
  }

  .rail[hidden] {
    display: none;
  }

  .rail-brand {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    margin-bottom: var(--space-1);
  }

  .collapsed aside {
    display: none;
  }

  .collapsed .app-content {
    margin-left: 3.75rem;
  }

  .brand {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.55rem;
    padding-left: var(--space-2);
    color: var(--text);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-decoration: none;
  }

  .icon {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: none;
  }

  .icon:hover,
  .icon:focus-visible {
    background: var(--surface-2);
    color: var(--text);
  }

  .new-chat {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    padding: 0 var(--space-4);
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--motion-fast) var(--easing);
  }

  .new-chat:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .temporary-chat {
    display: flex;
    min-height: 2.5rem;
    align-items: center;
    gap: 0.55rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: transparent;
    padding: 0 var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }

  .temporary-chat:hover:not(:disabled),
  .temporary-chat:focus-visible {
    border-color: var(--border-strong);
    background: var(--surface-2);
    color: var(--text);
  }

  .temporary-chat > span:first-child {
    color: var(--accent-strong);
    font-size: var(--text-lg);
  }

  .temporary-chat small {
    display: block;
    margin-top: 0.05rem;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .docs-link {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.65rem;
    border-radius: var(--radius-control);
    padding: 0 var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-decoration: none;
  }

  .docs-link:hover,
  .docs-link:focus-visible {
    background: var(--surface-2);
    color: var(--text);
  }

  .docs-link svg {
    flex: 0 0 auto;
    color: var(--accent-strong);
  }

  .docs-link small {
    display: block;
    margin-top: 0.05rem;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
  }

  /* 44px de alto en los controles del menú lateral: es la superficie que se
     usa con el pulgar y estaba entre 36 y 40px. El texto no cambia. */
  .search input {
    width: 100%;
    min-height: 2.75rem;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    padding: 0 var(--space-4);
    color: var(--text);
    font-size: var(--text-sm);
  }

  .search input:focus-visible {
    border-color: var(--accent);
  }


  .history {
    min-height: 0;
    overflow-y: auto;
  }

  .history-skeleton {
    padding: var(--space-2) 0;
  }

  .group-label {
    margin: var(--space-3) var(--space-2) var(--space-1);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 650;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .empty-hint {
    margin: var(--space-3) var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* Fila de conversación: el enlace ocupa el ancho y las acciones aparecen
     encima sin alterar el layout, para que el hover no dé saltos. */
  .row {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--radius-control);
  }

  .row:hover,
  .row.active,
  .row:focus-within {
    background: var(--surface-2);
  }

  /* Una línea por conversación: el título es lo único que distingue una de
     otra. La fecha estaba repetida bajo cada fila y ya la da el grupo. */
  .row a {
    display: block;
    min-width: 0;
    flex: 1;
    padding: 0.55rem var(--space-3);
    color: var(--text-muted);
    text-decoration: none;
  }

  .row:hover a,
  .row.active a {
    color: var(--text);
  }

  .row span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
  }

  .row-actions {
    display: flex;
    gap: 0.1rem;
    padding-right: var(--space-1);
    opacity: 0;
    transition: opacity var(--motion-fast) var(--easing);
  }

  .row:hover .row-actions,
  .row:focus-within .row-actions {
    opacity: 1;
  }

  .row-actions button {
    display: grid;
    /* 28px es el mínimo cómodo aquí; en móvil se agranda más abajo. */
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .row-actions button:hover,
  .row-actions button:focus-visible {
    background: var(--surface-3);
    color: var(--text);
  }

  .rename {
    width: 100%;
    min-height: 2.25rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius-control);
    background: var(--surface);
    padding: 0 var(--space-2);
    color: var(--text);
    font-size: var(--text-sm);
  }

  .load-more {
    width: 100%;
    border: 0;
    background: transparent;
    padding: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .account {
    position: relative;
  }

  .account-menu {
    position: absolute;
    z-index: 1;
    right: 0;
    bottom: calc(100% + var(--space-2));
    left: 0;
    display: grid;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-2);
    padding: var(--space-1);
    box-shadow: var(--shadow);
  }

  .account-menu a,
  .account-menu button {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
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
  }

  .account-menu a:hover,
  .account-menu a:focus-visible,
  .account-menu button:hover,
  .account-menu button:focus-visible {
    background: var(--surface-3);
    color: var(--text);
  }

  .profile {
    display: grid;
    width: 100%;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.6rem;
    grid-template-columns: auto minmax(0, 1fr) auto;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    padding: 0 var(--space-3) 0 var(--space-1);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .profile:hover,
  .account.open .profile {
    background: var(--surface-2);
  }

  .who {
    overflow: hidden;
    font-size: var(--text-sm);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dots {
    color: var(--text-muted);
    cursor: pointer;
  }

  .app-content {
    min-height: 100vh;
    margin-left: 18rem;
  }

  .mobile-menu,
  .scrim {
    display: none;
  }

  @media (max-width: 760px) {
    aside {
      width: min(19rem, calc(100vw - 3rem));
      transform: translateX(-100%);
      transition: transform 180ms ease;
    }

    aside.open {
      transform: translateX(0);
    }

    .app-content {
      margin-left: 0;
      padding-top: 3.7rem;
    }

    .collapsed .app-content {
      margin-left: 0;
    }

    .collapsed .rail {
      display: none;
    }

    .collapse {
      display: none;
    }

    .mobile-menu {
      position: fixed;
      z-index: 25;
      top: 0.7rem;
      left: 0.7rem;
      display: grid;
      width: 2.75rem;
      height: 2.75rem;
      place-items: center;
      border: 1px solid var(--border);
      border-radius: 0.7rem;
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      transition:
        left var(--motion-fast) var(--easing),
        border-color var(--motion-fast) var(--easing),
        background var(--motion-fast) var(--easing);
    }

    .mobile-menu.open {
      left: calc(min(19rem, calc(100vw - 3rem)) - 3.45rem);
      border-color: transparent;
      background: var(--surface-2);
    }

    .mobile-menu svg {
      width: 1.35rem;
      height: 1.35rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
    }

    .side-head {
      padding-right: 3rem;
    }

    .scrim {
      position: fixed;
      z-index: 18;
      inset: 0;
      display: block;
      border: 0;
      background: rgb(0 0 0 / 55%);
    }
  }
</style>
