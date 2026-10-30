<script lang="ts">
  import Skeleton from "#lib/components/Skeleton.svelte";

  let { data } = $props();

  const number = new Intl.NumberFormat("es-ES");

  function formatRange(start: string, end: string) {
    return `${new Date(start).toLocaleDateString("es")} – ${new Date(
      end
    ).toLocaleDateString("es")}`;
  }

  const CARDS = [
    { key: "totalTokens", label: "Tokens totales", note: "Entrada y salida" },
    { key: "generations", label: "Generaciones", note: "Respuestas completadas" },
    { key: "inputTokens", label: "Tokens de entrada", note: "Prompts y contexto" },
    { key: "outputTokens", label: "Tokens de salida", note: "Respuestas del modelo" }
  ] as const;
</script>

<svelte:head><title>Uso — MAC</title></svelte:head>

<div class="page">
  <header>
    <p class="eyebrow">Últimos 30 días</p>
    <h1 class="page-title">Uso</h1>
    {#await data.summary then summary}
      <span class="muted">{formatRange(summary.periodStart, summary.periodEnd)}</span>
    {/await}
  </header>

  {#await data.summary}
    <section class="metrics" aria-busy="true" aria-label="Cargando el resumen de uso">
      {#each CARDS as card (card.key)}
        <article class="panel">
          <span>{card.label}</span>
          <Skeleton height="1.75rem" width="7rem" />
          <small>{card.note}</small>
        </article>
      {/each}
    </section>
  {:then summary}
    <section class="metrics" aria-label="Resumen de uso">
      {#each CARDS as card, index (card.key)}
        <article class="panel" class:primary={index === 0}>
          <span>{card.label}</span>
          <strong>{number.format(summary[card.key])}</strong>
          <small>{card.note}</small>
        </article>
      {/each}
    </section>

    <section class="note panel">
      <div>
        <h2>Coste conocido</h2>
        <p class="muted">
          El proveedor actual no informa un coste facturable estable por evento.
          MAC mantiene el campo preparado sin estimar ni inventar importes.
        </p>
      </div>
      <strong>
        {summary.knownCostMicrousd === "0"
          ? "No disponible"
          : `${summary.knownCostMicrousd} µUSD`}
      </strong>
    </section>
  {:catch}
    <!-- Un fallo aquí no rompe la sesión: la cuenta sigue funcionando sin el
         resumen, así que se dice qué falta y cómo reintentar, sin volcar la
         página entera a la pantalla de error. -->
    <p class="failed panel" role="alert">
      No se pudo cargar el resumen de uso.
      <button class="button secondary" type="button" onclick={() => location.reload()}>
        Reintentar
      </button>
    </p>
  {/await}
</div>

<style>
  .page {
    width: min(960px, calc(100% - 2rem));
    margin: 0 auto;
    padding: clamp(2rem, 6vw, 5rem) 0;
  }

  .eyebrow {
    color: var(--accent-strong);
  }

  .page-title {
    margin: var(--space-2) 0;
  }

  .metrics {
    display: grid;
    margin-top: 2.2rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  article {
    display: grid;
    min-height: 11rem;
    align-content: space-between;
    padding: 1.3rem;
  }

  article.primary {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background:
      radial-gradient(circle at 90% 0, color-mix(in srgb, var(--accent) 20%, transparent), transparent 45%),
      var(--surface);
  }

  article span,
  article small {
    color: var(--text-muted);
  }

  /* La cifra destaca dentro de su tarjeta, pero no compite con el título de
     la página: el titular sigue siendo el elemento más grande. */
  article strong {
    font-size: var(--text-2xl);
    letter-spacing: -0.04em;
  }

  .note {
    display: flex;
    margin-top: 1rem;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding: 1.3rem;
  }

  .note h2,
  .note p {
    margin: 0;
  }

  .note p {
    max-width: 620px;
    margin-top: 0.35rem;
  }

  .failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-top: 2.2rem;
    padding: 1.3rem;
    color: var(--danger);
  }

  @media (max-width: 650px) {
    .metrics {
      grid-template-columns: 1fr;
    }

    .note {
      align-items: flex-start;
      flex-direction: column;
      gap: 1rem;
    }
  }
</style>
