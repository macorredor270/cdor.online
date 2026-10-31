<script lang="ts">
  import { toasts } from "#lib/client/toast.svelte.js";

  /**
   * Región de avisos. Se monta una sola vez por layout.
   *
   * `role` se decide por aviso: `alert` para errores (interrumpe al lector de
   * pantalla) y `status` para el resto (espera a que termine de leer). Una
   * región `alert` global anunciaría hasta los éxitos triviales.
   */
</script>

<div class="viewport" aria-live="polite" aria-relevant="additions">
  {#each toasts.items as toast (toast.id)}
    <div
      class="toast {toast.kind}"
      role={toast.kind === "error" ? "alert" : "status"}
      onmouseenter={() => toasts.pause()}
      onmouseleave={() => toasts.resume()}
      onfocusin={() => toasts.pause()}
      onfocusout={() => toasts.resume()}
    >
      <span class="dot" aria-hidden="true"></span>
      <p>{toast.message}</p>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onclick={() => toasts.dismiss(toast.id)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  {/each}
</div>

<style>
  .viewport {
    position: fixed;
    z-index: 60;
    right: var(--space-4);
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    display: grid;
    width: min(24rem, calc(100vw - var(--space-8)));
    gap: var(--space-2);
    justify-items: stretch;
    pointer-events: none;
  }

  .toast {
    display: grid;
    align-items: center;
    gap: var(--space-3);
    grid-template-columns: auto minmax(0, 1fr) auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    box-shadow: var(--shadow);
    padding: var(--space-3) var(--space-4);
    pointer-events: auto;
    animation: toast-in var(--motion-base) var(--easing);
  }

  /* Punto de color: el tipo nunca se comunica solo por color, el texto del
     aviso lo explica. Sirve de refuerzo, no de único indicador. */
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .success .dot {
    background: var(--success);
  }

  .error .dot {
    background: var(--danger);
  }

  .warning .dot {
    background: var(--mac-violet-300);
  }

  .info .dot {
    background: var(--accent);
  }

  .toast p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    overflow-wrap: anywhere;
  }

  .toast button {
    display: grid;
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .toast button:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 620px) {
    .viewport {
      right: var(--space-2);
      left: var(--space-2);
      width: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
