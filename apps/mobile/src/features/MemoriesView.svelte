<script lang="ts">
  import type { Memory } from "@cdor/contracts";

  let {
    memories,
    syncing,
    onCreate,
    onToggle
  }: {
    memories: Memory[];
    syncing: boolean;
    onCreate: (content: string, category: string) => void | Promise<void>;
    onToggle: (memory: Memory) => void | Promise<void>;
  } = $props();

  let content = $state("");
  let category = $state("personal");
  let adding = $state(false);

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const clean = content.trim();
    if (!clean) return;
    await onCreate(clean, category);
    content = "";
    adding = false;
  }
</script>

<section class="view">
  <header>
    <div>
      <p>Contexto personal</p>
      <h1>Memorias</h1>
    </div>
    <button type="button" onclick={() => (adding = !adding)}>
      {adding ? "Cerrar" : "Añadir"}
    </button>
  </header>

  {#if adding}
    <form onsubmit={save}>
      <label>
        <span>Qué debería recordar MAC</span>
        <textarea bind:value={content} rows="3" maxlength="8000" required></textarea>
      </label>
      <label>
        <span>Categoría</span>
        <select bind:value={category}>
          <option value="personal">Personal</option>
          <option value="preferencia">Preferencia</option>
          <option value="trabajo">Trabajo</option>
          <option value="objetivo">Objetivo</option>
        </select>
      </label>
      <button class="primary" type="submit">Guardar en el dispositivo</button>
    </form>
  {/if}

  <div class="list" aria-busy={syncing}>
    {#if memories.length === 0}
      <div class="empty">
        <span aria-hidden="true">✦</span>
        <h2>Aún no hay memorias</h2>
        <p>Puedes añadirlas incluso sin conexión. Se sincronizarán después.</p>
      </div>
    {/if}
    {#each memories as memory (memory.id)}
      <article class:disabled={!memory.enabled}>
        <div class="meta">
          <span>{memory.category}</span>
          <span>{memory.syncVersion === "0" ? "Pendiente" : `Importancia ${memory.importance}`}</span>
        </div>
        <p>{memory.content}</p>
        <button
          type="button"
          role="switch"
          aria-checked={memory.enabled}
          onclick={() => onToggle(memory)}
        >
          <i></i>
          {memory.enabled ? "Activa" : "Pausada"}
        </button>
      </article>
    {/each}
  </div>
</section>

<style>
  .view { min-height: 0; overflow-y: auto; padding-bottom: 1rem; }
  header {
    display: flex; min-height: calc(4.8rem + env(safe-area-inset-top));
    align-items: end; justify-content: space-between;
    padding: calc(0.8rem + env(safe-area-inset-top)) 1rem 0.8rem;
    border-bottom: 1px solid var(--border); background: var(--surface);
  }
  header p, header h1 { margin: 0; }
  header p { color: var(--muted); font-size: .67rem; }
  header h1 { font-size: 1.35rem; letter-spacing: -.03em; }
  header button, .primary {
    min-height: 2.55rem; border: 0; border-radius: .75rem;
    padding: 0 .85rem; background: var(--accent-soft);
    color: var(--accent-light); font-weight: 800;
  }
  form { display: grid; gap: .8rem; margin: 1rem; padding: 1rem; border: 1px solid var(--border); border-radius: 1rem; background: var(--surface); }
  label { display: grid; gap: .35rem; font-size: .76rem; font-weight: 750; }
  textarea, select { border: 1px solid var(--border-strong); border-radius: .7rem; background: var(--surface-2); padding: .72rem; color: var(--text); }
  textarea { resize: vertical; }
  .primary { background: var(--accent-button); color: white; }
  .list { display: grid; gap: .7rem; padding: 1rem; }
  article { border: 1px solid var(--border); border-radius: 1rem; background: var(--surface); padding: .9rem; }
  article.disabled { opacity: .58; }
  .meta { display: flex; justify-content: space-between; color: var(--muted); font-size: .65rem; text-transform: capitalize; }
  article p { margin: .65rem 0 .8rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  article button { display: flex; align-items: center; gap: .45rem; border: 0; background: transparent; color: var(--muted); font-size: .7rem; }
  article button i { width: 1.8rem; height: 1rem; border-radius: 1rem; background: var(--border-strong); padding: .12rem; }
  article button i::after { display: block; width: .76rem; height: .76rem; border-radius: 50%; background: white; content: ""; transition: transform 150ms; }
  article button[aria-checked="true"] i { background: var(--accent); }
  article button[aria-checked="true"] i::after { transform: translateX(.8rem); }
  .empty { display: grid; min-height: 55dvh; place-content: center; justify-items: center; text-align: center; }
  .empty span { color: var(--accent-light); font-size: 1.8rem; }
  .empty h2 { margin: .65rem 0 .25rem; }
  .empty p { max-width: 19rem; margin: 0; color: var(--muted); }
</style>
