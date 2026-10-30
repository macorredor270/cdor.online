<script lang="ts">
  import AuthCard from "#lib/components/AuthCard.svelte";
  import PublicShell from "#lib/components/PublicShell.svelte";

  let email = $state("");
  let pending = $state(false);
  let sent = $state(false);
  let error = $state("");

  async function requestReset(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    error = "";
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          redirectTo: `${location.origin}/reset-password`
        })
      });
      if (!response.ok) {
        throw new Error();
      }
      sent = true;
    } catch {
      error = "No se pudo procesar la solicitud. Inténtalo de nuevo.";
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head>
  <title>Recuperar acceso — MAC</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PublicShell variant="center" title="Recuperar acceso">
  <AuthCard
    eyebrow="Recuperar acceso"
    title="Restablece tu contraseña"
    description={sent
      ? undefined
      : "Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva."}
  >
    {#if sent}
      <p class="sent" role="status">
        Si existe una cuenta con ese correo, recibirás un enlace en unos
        minutos. Revisa también la carpeta de spam.
      </p>
    {:else}
      <form onsubmit={requestReset}>
        <div class="field">
          <label for="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            autocomplete="email"
            bind:value={email}
            required
          />
        </div>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <button class="button" type="submit" disabled={pending} data-loading={pending}>
          {pending ? "Enviando…" : "Enviar enlace"}
        </button>
      </form>

      <!-- Explicado desde el lado de quien lee, no como requisito técnico: el
           mensaje es idéntico exista o no la cuenta, para no revelar cuáles
           están registradas. -->
      <p class="privacy">
        Verás este mismo mensaje tanto si el correo está registrado como si no.
      </p>
    {/if}

    {#snippet footer()}
      <a href="/">Volver a iniciar sesión</a>
      <a href="/register">Crear una cuenta</a>
    {/snippet}
  </AuthCard>
</PublicShell>

<style>
  form {
    display: grid;
    gap: var(--space-4);
  }

  .sent {
    margin: 0;
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .privacy {
    margin: var(--space-4) 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }
</style>
