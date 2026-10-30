<script lang="ts">
  import PublicShell from "#lib/components/PublicShell.svelte";
  import { apiRequest } from "#lib/client/api.js";

  let name = $state("");
  let email = $state("");
  let subject = $state("");
  let message = $state("");

  let sending = $state(false);
  let success = $state(false);
  let error = $state("");

  async function submitContact(event: SubmitEvent) {
    event.preventDefault();
    if (sending) return;

    sending = true;
    error = "";
    success = false;

    try {
      await apiRequest(fetch, "/api/v1/contact", {
        method: "POST",
        body: JSON.stringify({ name, email, subject, message })
      });
      success = true;
      name = "";
      email = "";
      subject = "";
      message = "";
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "No se pudo enviar el mensaje. Revisa los datos e inténtalo de nuevo.";
    } finally {
      sending = false;
    }
  }
</script>

<svelte:head>
  <title>Contacto — MAC</title>
  <meta
    name="description"
    content="Escribe al equipo de MAC. Respondemos por correo a dudas de cuenta, fallos y privacidad."
  />
  <link rel="canonical" href="https://cdor.online/contact" />
</svelte:head>

<PublicShell variant="prose" title="Contacto">
  <!-- El título vive fuera de la tarjeta: dentro competía con las etiquetas del
       formulario y dejaba la tarjeta flotando sin anclaje en la página. -->
  <header class="page-header">
    <p class="eyebrow">Contacto</p>
    <h1 class="page-title">Escríbenos</h1>
    <p class="lead">
      Cuéntanos qué necesitas y te responderemos por correo. Lo lee una persona,
      no un sistema automático, así que puede tardar unos días. Si es un fallo,
      di qué hacías y en qué dispositivo: acorta el ida y vuelta.
    </p>
  </header>

  {#if success}
    <div class="sent panel" role="status">
      <h2>Mensaje enviado</h2>
      <p>
        Te responderemos a tu correo. Si no ves nada en unos días, revisa la
        carpeta de spam antes de volver a escribir.
      </p>
      <button class="button secondary" type="button" onclick={() => (success = false)}>
        Escribir otro mensaje
      </button>
    </div>
  {:else}
    <form class="panel" onsubmit={submitContact}>
      <div class="row">
        <div class="field">
          <label for="contact-name">Nombre</label>
          <input
            id="contact-name"
            type="text"
            autocomplete="name"
            bind:value={name}
            required
            disabled={sending}
          />
        </div>
        <div class="field">
          <label for="contact-email">Correo electrónico</label>
          <input
            id="contact-email"
            type="email"
            autocomplete="email"
            bind:value={email}
            required
            disabled={sending}
          />
          <p class="hint">Aquí es donde recibirás la respuesta.</p>
        </div>
      </div>

      <div class="field">
        <label for="contact-subject">Asunto</label>
        <input
          id="contact-subject"
          type="text"
          bind:value={subject}
          required
          disabled={sending}
        />
      </div>

      <div class="field">
        <label for="contact-message">Mensaje</label>
        <textarea
          id="contact-message"
          rows="6"
          bind:value={message}
          required
          disabled={sending}
        ></textarea>
      </div>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <button class="button" type="submit" disabled={sending} data-loading={sending}>
        {sending ? "Enviando…" : "Enviar mensaje"}
      </button>
    </form>
  {/if}

  <section class="alt">
    <h2>Otras vías</h2>
    <dl>
      <div>
        <dt>Privacidad y datos</dt>
        <dd>
          Las solicitudes de acceso o borrado están detalladas en la
          <a href="/privacy">política de privacidad</a>.
        </dd>
      </div>
      <div>
        <dt>Antes de escribir</dt>
        <dd>
          La <a href="/docs">documentación</a> cubre instalación, sincronización
          y memorias.
        </dd>
      </div>
    </dl>
  </section>
</PublicShell>

<style>
  .page-header {
    margin-bottom: var(--space-8);
  }

  .lead {
    max-width: 52ch;
    margin: 0;
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  form,
  .sent {
    display: grid;
    gap: var(--space-4);
    padding: clamp(var(--space-4), 4vw, var(--space-6));
  }

  .row {
    display: grid;
    /* Sin `start` las celdas se estiran a la misma altura y el campo sin nota
       de ayuda alarga su input para rellenar: dos cajas de alturas distintas
       en la misma fila. */
    align-items: start;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  .hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .field textarea {
    min-height: 9rem;
  }

  .error {
    margin: 0;
    font-size: var(--text-sm);
  }

  form .button,
  .sent .button {
    justify-self: start;
  }

  .sent h2 {
    margin: 0;
    color: var(--success);
    font-size: var(--text-lg);
  }

  .sent p {
    margin: 0;
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .alt {
    margin-top: var(--space-8);
    border-top: 1px solid var(--border);
    padding-top: var(--space-6);
  }

  .alt h2 {
    margin: 0 0 var(--space-4);
    font-size: var(--text-base);
    font-weight: 650;
  }

  .alt dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: var(--space-6);
    margin: 0;
  }

  .alt dt {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 650;
  }

  .alt dd {
    margin: var(--space-1) 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .alt a {
    color: var(--accent-strong);
  }

  @media (max-width: 580px) {
    .row {
      grid-template-columns: 1fr;
    }
  }
</style>
