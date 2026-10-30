<script lang="ts">
  import AppPage from "#lib/components/AppPage.svelte";
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

  /** Proporción de salida sobre el total, para la barra de reparto. */
  function outputShare(input: number, output: number): number {
    const total = input + output;
    return total === 0 ? 0 : Math.round((output / total) * 100);
  }
</script>

<svelte:head><title>Uso — MAC</title></svelte:head>

<AppPage eyebrow="Últimos 30 días" title="Uso">
  {#snippet description()}
    {#await data.summary}
      <p>Calculando el periodo…</p>
    {:then summary}
      <p>{formatRange(summary.periodStart, summary.periodEnd)}</p>
    {:catch}
      <p>Periodo no disponible.</p>
    {/await}
  {/snippet}

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

    {@const share = outputShare(summary.inputTokens, summary.outputTokens)}
    <section class="split panel" aria-label="Reparto entre entrada y salida">
      <div class="split-head">
        <span>Entrada</span>
        <span>Salida</span>
      </div>
      <div
        class="bar"
        role="img"
        aria-label={`${100 - share}% de entrada y ${share}% de salida`}
      >
        <i style:width={`${100 - share}%`}></i>
      </div>
      <div class="split-head numbers">
        <span>{100 - share}%</span>
        <span>{share}%</span>
      </div>
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
</AppPage>

<style>
  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-3);
  }

  article {
    display: grid;
    min-height: 9.5rem;
    align-content: space-between;
    gap: var(--space-2);
    padding: var(--space-6);
    animation: mac-rise var(--motion-base) var(--easing-out) backwards;
  }

  article:nth-child(2) {
    animation-delay: 40ms;
  }

  article:nth-child(3) {
    animation-delay: 80ms;
  }

  article:nth-child(4) {
    animation-delay: 120ms;
  }

  article.primary {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background:
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--accent) 14%, transparent),
        transparent 60%
      ),
      var(--surface);
  }

  article span {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  article small {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  /* La cifra destaca dentro de su tarjeta, pero no compite con el título de
     la página: el titular sigue siendo el elemento más grande. */
  article strong {
    font-size: var(--text-2xl);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
  }

  .split {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding: var(--space-6);
  }

  .split-head {
    display: flex;
    justify-content: space-between;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .split-head.numbers {
    color: var(--text);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 0.5rem;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--accent) 22%, var(--surface-3));
  }

  .bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--mac-gradient);
    transition: width var(--motion-slow) var(--easing-out);
  }

  .note {
    display: flex;
    margin-top: var(--space-3);
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    padding: var(--space-6);
  }

  .note h2,
  .note p {
    margin: 0;
  }

  .note h2 {
    font-size: var(--text-lg);
  }

  .note p {
    max-width: 38rem;
    margin-top: var(--space-1);
    font-size: var(--text-sm);
  }

  .note strong {
    flex: 0 0 auto;
    font-size: var(--text-sm);
  }

  .failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-6);
    color: var(--danger);
  }

  @media (max-width: 650px) {
    .note {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-3);
    }
  }
</style>
