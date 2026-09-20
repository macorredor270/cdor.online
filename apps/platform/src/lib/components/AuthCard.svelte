<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Tarjeta única de los flujos de autenticación.
   *
   * Acceso, registro y recuperación son tres momentos del mismo recorrido y
   * hasta ahora cada uno traía su propio ancho, su cabecera, su tamaño de
   * título y su botón. Compartían el color y nada más, así que cambiar de
   * pantalla parecía salir del producto.
   *
   * El isotipo no se repite aquí: ya está en la cabecera del shell, y
   * duplicarlo solo empuja el formulario hacia abajo.
   */
  let {
    eyebrow,
    title,
    description,
    headingLevel = 1,
    fluid = false,
    children,
    footer
  }: {
    /**
     * Contexto que el título no dice ya. Se omite cuando solo lo repetiría:
     * "CREAR CUENTA" sobre "Crea tu cuenta" es decoración, y la versalita
     * púrpura pierde valor si aparece en todas las tarjetas por costumbre.
     */
    eyebrow?: string;
    title: string;
    description?: string;
    /**
     * En la portada el titular de la página es la propuesta de producto, así
     * que la tarjeta baja a h2 y no deja dos h1 en el mismo documento.
     */
    headingLevel?: 1 | 2;
    /** Permite que la tarjeta llene una columna de composición. */
    fluid?: boolean;
    children: Snippet;
    /** Enlaces secundarios: crear cuenta, recuperar, volver. */
    footer?: Snippet;
  } = $props();
</script>

<section class="auth-card panel" class:fluid aria-labelledby="auth-title">
  {#if eyebrow}
    <p class="eyebrow">{eyebrow}</p>
  {/if}
  {#if headingLevel === 2}
    <h2 id="auth-title">{title}</h2>
  {:else}
    <h1 id="auth-title">{title}</h1>
  {/if}
  {#if description}
    <p class="description">{description}</p>
  {/if}

  <div class="body">{@render children()}</div>

  {#if footer}
    <div class="footer">{@render footer()}</div>
  {/if}
</section>

<style>
  .auth-card {
    width: min(26rem, 100%);
    padding: clamp(var(--space-6), 5vw, var(--space-8));
  }

  .auth-card.fluid {
    width: 100%;
    max-width: none;
    padding: clamp(var(--space-6), 3vw, var(--space-8));
  }

  /* Sin etiqueta encima, el título no necesita el margen que la separaba. */
  .auth-card > :is(h1, h2):first-child {
    margin-top: 0;
  }

  h1,
  h2 {
    /* Una tarea utilitaria no necesita un titular de portada: el tamaño
       anterior partía el título en dos líneas y empujaba el formulario. */
    margin: var(--space-2) 0 0;
    font-size: var(--text-xl);
    font-weight: 620;
    line-height: var(--leading-snug);
    letter-spacing: -0.02em;
  }

  .description {
    margin: var(--space-2) 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .body {
    margin-top: var(--space-6);
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: var(--space-6);
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
  }

  /* 44px de zona pulsable en las dos acciones secundarias de la tarjeta. */
  .footer :global(a) {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    color: var(--accent-strong);
    font-size: var(--text-sm);
    font-weight: 550;
    text-decoration: none;
  }

  .footer :global(a:hover) {
    text-decoration: underline;
  }
</style>
