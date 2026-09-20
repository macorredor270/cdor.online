<script lang="ts">
  /**
   * Placeholder de carga. Sin dependencias.
   *
   * Es puramente visual: va `aria-hidden`, y el estado accesible lo anuncia
   * quien lo usa con su propia región `aria-live`. Así el lector de pantalla
   * oye «Cargando historial» una vez, no seis barras grises.
   */
  let {
    lines = 1,
    height = "1rem",
    width = "100%",
    radius = "var(--radius-sm)",
    gap = "var(--space-2)"
  }: {
    lines?: number;
    height?: string;
    width?: string;
    radius?: string;
    gap?: string;
  } = $props();
</script>

<div class="skeleton" style:gap aria-hidden="true">
  {#each Array.from({ length: lines }), index (index)}
    <span
      style:height
      style:border-radius={radius}
      style:width={index === lines - 1 && lines > 1 ? "70%" : width}
    ></span>
  {/each}
</div>

<style>
  .skeleton {
    display: grid;
  }

  span {
    display: block;
    background: linear-gradient(
      90deg,
      var(--surface-2) 0%,
      var(--surface-3) 50%,
      var(--surface-2) 100%
    );
    background-size: 200% 100%;
    animation: skeleton-sweep 1.4s ease-in-out infinite;
  }

  @keyframes skeleton-sweep {
    from {
      background-position: 200% 0;
    }

    to {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    span {
      background: var(--surface-2);
      animation: none;
    }
  }
</style>
