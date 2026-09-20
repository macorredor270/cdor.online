<script lang="ts">
  /**
   * Diálogo de confirmación accesible sobre `<dialog>` nativo.
   *
   * Sustituye a `confirm()`, que salía sin estilo, no era tematizable y en
   * móvil aparecía como alerta del sistema justo en las acciones delicadas.
   *
   * `showModal()` aporta gratis el focus trap, el bloqueo del fondo y el
   * cierre con Escape; solo hay que devolver el foco al abridor y evitar el
   * doble envío.
   */
  type Props = {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    /**
     * Si se indica, hay que escribir este texto exacto para habilitar la
     * acción. Para lo irreversible de verdad.
     */
    confirmPhrase?: string;
    onconfirm: () => void | Promise<void>;
    oncancel?: () => void;
  };

  let {
    open = $bindable(),
    title,
    description,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    destructive = false,
    confirmPhrase,
    onconfirm,
    oncancel
  }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  let typed = $state("");
  let pending = $state(false);
  /** Elemento que tenía el foco al abrir, para devolvérselo al cerrar. */
  let opener: HTMLElement | null = null;

  const ready = $derived(
    confirmPhrase === undefined || typed.trim() === confirmPhrase
  );

  $effect(() => {
    const element = dialog;
    if (!element) return;
    if (open && !element.open) {
      opener = document.activeElement as HTMLElement | null;
      typed = "";
      pending = false;
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  });

  function dismiss() {
    if (pending) return;
    open = false;
    oncancel?.();
    opener?.focus();
  }

  async function accept() {
    // Sin esta guarda, una doble pulsación lanza dos peticiones destructivas.
    if (pending || !ready) return;
    pending = true;
    try {
      await onconfirm();
      open = false;
      opener?.focus();
    } finally {
      pending = false;
    }
  }
</script>

<dialog
  bind:this={dialog}
  class:destructive
  aria-labelledby="confirm-title"
  aria-describedby="confirm-description"
  onclose={() => {
    // Cubre el Escape del navegador, que cierra sin pasar por dismiss().
    if (open) {
      open = false;
      oncancel?.();
      opener?.focus();
    }
  }}
  oncancel={(event) => {
    if (pending) event.preventDefault();
  }}
>
  <h2 id="confirm-title">{title}</h2>
  <p id="confirm-description">{description}</p>

  {#if confirmPhrase}
    <div class="field">
      <label for="confirm-phrase">
        Escribe <strong>{confirmPhrase}</strong> para continuar
      </label>
      <input
        id="confirm-phrase"
        type="text"
        autocomplete="off"
        bind:value={typed}
        disabled={pending}
      />
    </div>
  {/if}

  <div class="actions">
    <button
      class="button secondary"
      type="button"
      onclick={dismiss}
      disabled={pending}
    >
      {cancelLabel}
    </button>
    <button
      class="button"
      class:danger={destructive}
      type="button"
      onclick={accept}
      disabled={!ready || pending}
      data-loading={pending}
    >
      {pending ? "Procesando…" : confirmLabel}
    </button>
  </div>
</dialog>

<style>
  dialog {
    width: min(28rem, calc(100vw - var(--space-8)));
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface);
    box-shadow: var(--shadow);
    padding: var(--space-6);
    color: var(--text);
  }

  dialog::backdrop {
    background: rgb(4 0 12 / 62%);
  }

  /* El borde superior refuerza el peligro sin depender solo del color del
     botón: hay grosor y posición, no únicamente tono. */
  dialog.destructive {
    border-top: 3px solid var(--danger);
  }

  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-lg);
    line-height: var(--leading-snug);
  }

  p {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .field {
    margin-top: var(--space-4);
  }

  .field label {
    font-size: var(--text-sm);
    font-weight: 450;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-6);
  }

  @media (max-width: 480px) {
    .actions {
      flex-direction: column-reverse;
    }

    .actions :global(.button) {
      width: 100%;
    }
  }
</style>
