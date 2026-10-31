<script lang="ts">
  import type { Snippet } from "svelte";
  import PublicShell from "./PublicShell.svelte";

  /**
   * Documento legal.
   *
   * El índice se saca de los `h2` del propio documento en vez de declararlo
   * aparte: así el texto legal se edita como texto y nunca puede quedar un
   * índice que prometa una sección que ya no existe. El precio es que solo
   * aparece con JavaScript, y por eso no se pinta el encabezado del índice
   * hasta que hay entradas: un rótulo «En esta página» sin nada debajo es
   * peor que no tener índice.
   */
  let {
    title,
    effectiveFrom,
    notice,
    children
  }: {
    title: string;
    /** Fecha de entrada en vigor, en texto ya formateado. */
    effectiveFrom: string;
    /** Aviso de estado del servicio; nunca se mezcla con la fecha legal. */
    notice?: string;
    children: Snippet;
  } = $props();

  type Entry = { id: string; label: string };

  let article = $state<HTMLElement | null>(null);
  let entries = $state<Entry[]>([]);
  let activeId = $state("");

  function slug(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  $effect(() => {
    const root = article;
    if (!root) return;

    const headings = [...root.querySelectorAll("h2")];
    entries = headings.map((heading) => {
      const id = heading.id || slug(heading.textContent ?? "");
      heading.id = id;
      heading.style.scrollMarginTop = "5rem";
      return { id, label: heading.textContent ?? "" };
    });

    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((record) => record.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) activeId = visible.target.id;
      },
      { rootMargin: "-10% 0px -70% 0px" }
    );
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  });
</script>

<PublicShell variant="wide" title={title}>
  <div class="legal-body" class:with-toc={entries.length > 0}>
    {#if entries.length > 0}
      <nav class="toc" aria-label="Índice del documento">
        <p class="toc-title">En esta página</p>
        <ol>
          {#each entries as entry (entry.id)}
            <li>
              <a
                href={`#${entry.id}`}
                class:current={activeId === entry.id}
                aria-current={activeId === entry.id ? "location" : undefined}
              >
                {entry.label}
              </a>
            </li>
          {/each}
        </ol>
      </nav>
    {/if}

    <article bind:this={article}>
      <p class="eyebrow">Vigentes desde el {effectiveFrom}</p>
      <h1 class="page-title">{title}</h1>
      {#if notice}
        <p class="notice">{notice}</p>
      {/if}
      {@render children()}
    </article>
  </div>
</PublicShell>

<style>
  .legal-body {
    display: grid;
    gap: var(--space-12);
  }

  /* Sin índice no se reserva su columna: dejarla vacía empujaba el documento
     a la derecha con 15rem de nada al lado. */
  /* 19rem, no 15: las etiquetas legales llevan número y varias palabras, y a
     15rem la mitad del índice se partía en dos y tres líneas. */
  .with-toc {
    grid-template-columns: 19rem minmax(0, 1fr);
  }

  .toc {
    position: sticky;
    top: var(--space-8);
    align-self: start;
    max-height: calc(100dvh - var(--space-12));
    overflow-y: auto;
    padding-right: 1rem;
  }

  .toc-title {
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .toc ol {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .toc a {
    display: flex;
    min-height: 44px;
    align-items: center;
    border-left: 2px solid var(--border);
    padding: 0.35rem var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    text-decoration: none;
    transition:
      color var(--motion-fast) var(--easing),
      border-left-color var(--motion-fast) var(--easing);
  }

  .toc a:hover {
    color: var(--text);
    border-left-color: color-mix(in srgb, var(--accent-strong) 50%, transparent);
  }

  /* El activo no se cifra solo en el filo púrpura: cambian a la vez el color
     del texto, el peso y la superficie. */
  .toc a.current {
    border-left-color: var(--accent-strong);
    background: var(--surface-2);
    color: var(--text);
    font-weight: 650;
  }

  article {
    max-width: 48rem;
  }

  .legal-body:not(.with-toc) article {
    margin-inline: auto;
  }

  .notice {
    margin: 0 0 var(--space-6);
    border-left: 3px solid var(--warning);
    padding-left: var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  article :global(.intro) {
    color: var(--text);
    font-size: var(--text-lg);
    line-height: 1.6;
    margin-bottom: 2.5rem;
  }

  article :global(h2) {
    margin: 2.8rem 0 0.8rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
    font-size: var(--text-xl);
    letter-spacing: -0.02em;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  article :global(p),
  article :global(ul) {
    color: var(--text-muted);
    line-height: 1.6;
    font-size: var(--text-base);
  }

  article :global(ul) {
    padding-left: 1.2rem;
    margin: 0.8rem 0 1.5rem;
  }

  article :global(li) {
    margin-bottom: 0.5rem;
  }

  article :global(li strong) {
    color: var(--text);
  }

  article :global(a) {
    color: var(--accent-strong);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  article :global(.note) {
    margin-top: 2.5rem;
    padding: 1.2rem 1.4rem;
    border-left: 3px solid var(--accent-strong);
    background: color-mix(in srgb, var(--bg) 95%, white 5%);
    border-radius: 0 0.6rem 0.6rem 0;
    font-size: var(--text-sm);
    color: var(--text);
    line-height: 1.5;
  }

  @media (max-width: 900px) {
    .with-toc {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-6);
    }

    .toc {
      position: static;
      max-height: none;
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: var(--space-4);
    }
  }
</style>
