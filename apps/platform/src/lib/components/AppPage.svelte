<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Contenedor común de las páginas secundarias de la aplicación.
   *
   * Memorias, Uso, Ajustes y Cuenta tenían cada una su ancho (760, 850 y
   * 960 px) y su propia cabecera, así que el título saltaba de sitio al
   * cambiar de página. Aquí comparten eje, ritmo y jerarquía.
   */
  let {
    eyebrow,
    title,
    description,
    actions,
    children
  }: {
    eyebrow?: string;
    title: string;
    description?: Snippet;
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="app-page">
  <header>
    <div class="heading">
      {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
      <h1 class="page-title">{title}</h1>
      {#if description}<div class="description">{@render description()}</div>{/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </header>

  {@render children()}
</div>

<style>
  .app-page {
    width: min(var(--width-page), calc(100% - 2 * var(--gutter)));
    margin: 0 auto;
    padding: clamp(var(--space-8), 6vw, 4.5rem) 0 var(--space-12);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-8);
  }

  .heading {
    min-width: 0;
    max-width: 42rem;
  }

  header :global(.page-title) {
    margin-bottom: var(--space-3);
  }

  .description {
    color: var(--text-muted);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
  }

  .description :global(p) {
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
