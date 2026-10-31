<script lang="ts">
  import { page } from "$app/state";
  import AuthCard from "#lib/components/AuthCard.svelte";
  import PublicShell from "#lib/components/PublicShell.svelte";

  let email = $state("");
  let pending = $state(false);
  let sent = $state(false);
  let error = $state("");

  let verified = $derived(
    page.url.searchParams.get("verified") === "true" ||
      page.url.searchParams.get("success") === "true" ||
      page.url.searchParams.get("status") === "success"
  );

  async function resend(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    error = "";
    try {
      const response = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          callbackURL: "/verify-email?verified=true"
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

  let eyebrow = $derived(
    verified ? "Cuenta activa" : sent ? "Enlace enviado" : "Verificar el correo"
  );
  let title = $derived(
    verified
      ? "Tu correo está verificado"
      : sent
        ? "Revisa tu bandeja de entrada"
        : "Reenviar el enlace de activación"
  );
  let description = $derived(
    verified
      ? "Ya puedes entrar y seguir tus conversaciones desde cualquier dispositivo."
      : sent
        ? "Si esa cuenta existe y todavía no está verificada, acabamos de enviar un enlace nuevo. Revisa también la carpeta de spam: caduca en una hora."
        : "¿Creaste la cuenta pero no te llegó el enlace? Escribe tu correo y te enviamos otro."
  );
</script>

<svelte:head>
  <title>{verified ? "Correo verificado" : "Reenviar verificación"} — MAC</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PublicShell variant="center" title="Verificación">
  <AuthCard {eyebrow} {title} {description}>
    {#if verified}
      <a class="button" href="/">Entrar a mi cuenta</a>
    {:else if sent}
      <a class="button secondary" href="/">Volver al acceso</a>
    {:else}
      <form onsubmit={resend}>
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
          {pending ? "Enviando…" : "Reenviar enlace"}
        </button>
      </form>
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

  .error {
    margin: 0;
    font-size: var(--text-sm);
  }

  /* El enlace de acción ocupa el ancho de la tarjeta igual que el botón del
     formulario, para que los tres estados de esta página se lean iguales. */
  a.button {
    width: 100%;
  }
</style>
