<script lang="ts">
  import type { Conversation } from "@cdor/contracts";
  import type { ConversationGroup } from "#lib/client/conversation-groups.js";
  import Icon from "#lib/components/Icon.svelte";
  import Skeleton from "#lib/components/Skeleton.svelte";

  let {
    groups,
    activeId,
    loadedOnce,
    loading,
    hasMore,
    query,
    loadError,
    onloadmore,
    onrename,
    ondelete
  }: {
    groups: ConversationGroup[];
    activeId: string | null;
    loadedOnce: boolean;
    loading: boolean;
    hasMore: boolean;
    query: string;
    loadError: string;
    onloadmore: () => void;
    onrename: (conversation: Conversation, title: string) => Promise<boolean>;
    ondelete: (conversation: Conversation) => void;
  } = $props();

  /** Conversación en edición de título, y su borrador. */
  let renamingId = $state<string | null>(null);
  let draft = $state("");
  let saving = $state(false);

  const isEmpty = $derived(groups.every((group) => group.items.length === 0));

  function startRename(conversation: Conversation) {
    renamingId = conversation.id;
    draft = conversation.title;
  }

  function cancelRename() {
    renamingId = null;
    draft = "";
  }

  async function commitRename(conversation: Conversation) {
    if (saving || renamingId !== conversation.id) return;
    const title = draft.trim();
    if (!title || title === conversation.title) {
      cancelRename();
      return;
    }
    saving = true;
    const ok = await onrename(conversation, title);
    saving = false;
    if (ok) cancelRename();
  }

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<nav class="history" aria-label="Conversaciones">
  {#if !loadedOnce}
    <p class="sr-only" role="status">Cargando historial</p>
    <div class="skeleton">
      <Skeleton lines={6} height="2.25rem" gap="var(--space-1)" />
    </div>
  {:else if isEmpty}
    <p class="empty-hint">
      {query ? "Ninguna conversación coincide." : "Tus conversaciones aparecerán aquí."}
    </p>
  {/if}

  {#each groups as group (group.id)}
    <section class="group" aria-label={group.label}>
      <h2 class="group-label">{group.label}</h2>
      <ul>
        {#each group.items as conversation (conversation.id)}
          <li class="row" class:active={conversation.id === activeId}>
            {#if renamingId === conversation.id}
              <input
                class="rename"
                value={draft}
                maxlength="255"
                aria-label="Nuevo título"
                disabled={saving}
                use:focusOnMount
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
                aria-current={conversation.id === activeId ? "page" : undefined}
                title={conversation.title}
              >
                {conversation.title}
              </a>
              <div class="row-actions">
                <button
                  type="button"
                  aria-label={`Renombrar ${conversation.title}`}
                  onclick={() => startRename(conversation)}
                >
                  <Icon name="pencil" size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar ${conversation.title}`}
                  onclick={() => ondelete(conversation)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if hasMore && !query}
    <button type="button" class="load-more" onclick={onloadmore} disabled={loading}>
      {loading ? "Cargando…" : "Mostrar anteriores"}
    </button>
  {/if}
  {#if loadError}<p class="error" role="status">{loadError}</p>{/if}
</nav>

<style>
  .history {
    min-height: 0;
    overflow-y: auto;
    /* Reserva el canal de la barra de scroll para que el contenido no salte
       al aparecer, y difumina el borde inferior bajo el perfil. */
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    margin-right: calc(-1 * var(--space-2));
    padding-right: var(--space-1);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 1.5rem), transparent);
  }

  .skeleton {
    padding: var(--space-2) 0;
  }

  .group + .group {
    margin-top: var(--space-3);
  }

  .group-label {
    margin: var(--space-2) var(--space-3) var(--space-1);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  ul {
    display: grid;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .empty-hint {
    margin: var(--space-4) var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
  }

  /* El enlace ocupa todo el ancho; las acciones flotan encima a la derecha
     con un fundido del mismo color de la fila, así el título no pierde sitio
     cuando están ocultas. */
  .row {
    --row-bg: transparent;
    position: relative;
    border-radius: var(--radius-sm);
    background: var(--row-bg);
    transition: background var(--motion-fast) var(--easing);
  }

  .row:hover,
  .row:focus-within {
    --row-bg: var(--surface-2);
  }

  .row.active {
    --row-bg: var(--surface-3);
  }

  .row a {
    display: block;
    overflow: hidden;
    padding: 0.5rem var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.35;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row:hover a,
  .row.active a {
    color: var(--text);
  }

  .row.active a {
    font-weight: 550;
  }

  .row-actions {
    position: absolute;
    top: 50%;
    right: 0.2rem;
    display: flex;
    gap: 1px;
    padding-left: 1.75rem;
    background: linear-gradient(to right, transparent, var(--row-bg) 1.5rem);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-50%);
    transition: opacity var(--motion-fast) var(--easing);
  }

  .row:hover .row-actions,
  .row:focus-within .row-actions {
    opacity: 1;
    pointer-events: auto;
  }

  .row-actions button {
    display: grid;
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .row-actions button:hover,
  .row-actions button:focus-visible {
    background: var(--surface-3);
    color: var(--text);
  }

  /* En pantallas táctiles no hay hover: las acciones de la fila activa se
     muestran siempre y con un objetivo mayor. */
  @media (hover: none) {
    .row.active .row-actions {
      opacity: 1;
      pointer-events: auto;
    }

    .row-actions button {
      width: 2.25rem;
      height: 2.25rem;
    }
  }

  .rename {
    width: 100%;
    min-height: 2.25rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--surface);
    padding: 0 var(--space-3);
    color: var(--text);
    font-size: var(--text-sm);
  }

  .load-more {
    width: 100%;
    margin-top: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .load-more:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--text);
  }

  .error {
    margin: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
  }
</style>
