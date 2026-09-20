<script lang="ts">
  import type { Memory } from "@cdor/contracts";
  import { apiRequest } from "$lib/client/api";
  import { toasts } from "$lib/client/toast.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";

  let { data } = $props();
  /** `null` mientras la lista viaja; el vacío real es un array vacío. */
  let memories = $state<Memory[] | null>(null);
  let listFailed = $state(false);
  let content = $state("");
  let category = $state("general");
  let importance = $state(3);
  let pending = $state(false);
  let error = $state("");

  $effect(() => {
    const request = data.list;
    memories = null;
    listFailed = false;
    request
      .then((result) => {
        // Si ya se navegó a otra carga, su resultado manda: descartamos el
        // que llega tarde en vez de pisar la lista buena.
        if (data.list === request) memories = result.items;
      })
      .catch(() => {
        if (data.list === request) listFailed = true;
      });
  });

  async function createMemory(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    error = "";
    try {
      const memory = await apiRequest<Memory>(fetch, "/api/v1/memories", {
        method: "POST",
        body: JSON.stringify({
          content,
          category,
          importance,
          enabled: true
        })
      });
      memories = [memory, ...(memories ?? [])];
      content = "";
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : "No se pudo crear la memoria.";
    } finally {
      pending = false;
    }
  }

  async function toggle(memory: Memory) {
    error = "";
    try {
      const updated = await apiRequest<Memory>(
        fetch,
        `/api/v1/memories/${memory.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            enabled: !memory.enabled,
            baseVersion: memory.syncVersion
          })
        }
      );
      memories = (memories ?? []).map((item) =>
        item.id === updated.id ? updated : item
      );
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : "No se pudo actualizar la memoria.";
    }
  }

  // Memoria pendiente de borrar; abre el diálogo al asignarse.
  let removing = $state<Memory | null>(null);

  async function confirmRemove() {
    const memory = removing;
    if (!memory) return;
    error = "";
    try {
      await apiRequest(
        fetch,
        `/api/v1/memories/${memory.id}?baseVersion=${memory.syncVersion}`,
        { method: "DELETE" }
      );
      memories = (memories ?? []).filter((item) => item.id !== memory.id);
      toasts.success("Memoria eliminada.");
    } catch (cause) {
      toasts.error(
        cause instanceof Error ? cause.message : "No se pudo eliminar la memoria."
      );
    } finally {
      removing = null;
    }
  }
</script>

<svelte:head><title>Memorias — MAC</title></svelte:head>

<div class="page">
  <header>
    <p class="eyebrow">Contexto bajo tu control</p>
    <h1>Memorias</h1>
    <p class="muted">
      MAC solo incluye en el contexto las memorias activas. Puedes desactivar o
      eliminar cualquiera en todo momento.
    </p>
  </header>

  <form class="panel create" onsubmit={createMemory}>
    <div class="field wide">
      <label for="memory">Nueva memoria</label>
      <textarea
        id="memory"
        rows="3"
        maxlength="8192"
        placeholder="Ejemplo: Prefiero respuestas breves y en español."
        bind:value={content}
        required
      ></textarea>
    </div>
    <div class="field">
      <label for="category">Categoría</label>
      <input
        id="category"
        maxlength="64"
        pattern="[a-z0-9][a-z0-9_-]*"
        bind:value={category}
        required
      />
    </div>
    <div class="field">
      <label for="importance">Importancia</label>
      <select id="importance" bind:value={importance}>
        <option value={1}>1 — Baja</option>
        <option value={2}>2</option>
        <option value={3}>3 — Media</option>
        <option value={4}>4</option>
        <option value={5}>5 — Alta</option>
      </select>
    </div>
    <button class="button" type="submit" disabled={pending || !content.trim()}>
      {pending ? "Guardando…" : "Guardar memoria"}
    </button>
  </form>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <section class="memory-list" aria-label="Memorias guardadas" aria-busy={memories === null}>
    {#if listFailed}
      <p class="empty panel error" role="alert">
        No se pudieron cargar tus memorias. Recarga la página para reintentar.
      </p>
    {:else if memories === null}
      {#each Array.from({ length: 3 }), index (index)}
        <article class="panel loading">
          <Skeleton height="0.75rem" width="8rem" />
          <Skeleton lines={2} />
          <Skeleton height="0.75rem" width="11rem" />
        </article>
      {/each}
    {:else if memories.length === 0}
      <div class="empty panel">
        <h2>Aún no hay memorias</h2>
        <p class="muted">Añade solo aquello que quieras reutilizar en futuras conversaciones.</p>
      </div>
    {/if}
    {#each memories ?? [] as memory (memory.id)}
      <article class:disabled={!memory.enabled} class="panel">
        <div class="memory-head">
          <span>{memory.category}</span>
          <span>Importancia {memory.importance}/5</span>
        </div>
        <p>{memory.content}</p>
        <footer>
          <time datetime={memory.updatedAt}>
            Actualizada {new Date(memory.updatedAt).toLocaleDateString("es")}
          </time>
          <div>
            <button class="button secondary" type="button" onclick={() => toggle(memory)}>
              {memory.enabled ? "Desactivar" : "Activar"}
            </button>
            <button class="button danger" type="button" onclick={() => (removing = memory)}>
              Eliminar
            </button>
          </div>
        </footer>
      </article>
    {/each}
  </section>
</div>

<ConfirmDialog
  open={removing !== null}
  destructive
  title="Eliminar esta memoria"
  description="MAC dejará de usarla como contexto y el borrado se sincronizará con tus dispositivos."
  confirmLabel="Eliminar memoria"
  onconfirm={confirmRemove}
  oncancel={() => (removing = null)}
/>

<style>
  .page {
    width: min(960px, calc(100% - 2rem));
    margin: 0 auto;
    padding: clamp(2rem, 6vw, 5rem) 0;
  }

  header {
    max-width: 650px;
    margin-bottom: 2rem;
  }

  .eyebrow {
    margin: 0;
    color: var(--accent-strong);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.35rem 0;
    font-size: var(--text-display);
    letter-spacing: -0.045em;
  }

  header p:last-child {
    margin: 0;
  }

  .create {
    display: grid;
    /* La última columna se ajusta al botón: fijada en 10rem partía
       "Guardar memoria" en dos líneas. */
    grid-template-columns: minmax(0, 1fr) 12rem auto;
    gap: 1rem;
    padding: 1.2rem;
  }

  .create .wide {
    grid-column: 1 / -1;
  }

  .create .button {
    align-self: end;
  }

  .memory-list {
    display: grid;
    gap: 1rem;
    margin-top: 2rem;
  }

  article,
  .empty {
    padding: 1.2rem;
  }

  article.disabled {
    opacity: 0.62;
  }

  .loading {
    display: grid;
    gap: var(--space-3);
    padding: 1.1rem;
  }

  .memory-head {
    display: flex;
    justify-content: space-between;
    color: var(--accent-strong);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  article > p {
    margin: 0.8rem 0 1.2rem;
    white-space: pre-wrap;
  }

  article footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  article footer time {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  article footer div {
    display: flex;
    gap: 0.5rem;
  }

  article footer .button {
    min-height: 2.2rem;
    padding: 0.4rem 0.7rem;
    font-size: var(--text-sm);
  }

  @media (max-width: 720px) {
    .create {
      grid-template-columns: 1fr;
    }

    .create .wide {
      grid-column: auto;
    }

    article footer {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
