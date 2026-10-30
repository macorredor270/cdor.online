<script lang="ts">
  import { page } from "$app/state";
  import AuthCard from "#lib/components/AuthCard.svelte";
  import PublicShell from "#lib/components/PublicShell.svelte";

  let newPassword = $state("");
  let confirmPassword = $state("");
  let pending = $state(false);
  let done = $state(false);
  let error = $state("");
  let reveal = $state(false);

  async function resetPassword(event: SubmitEvent) {
    event.preventDefault();
    error = "";
    const token = page.url.searchParams.get("token");
    if (!token) {
      error = "El enlace no es válido o ha caducado.";
      return;
    }
    if (newPassword !== confirmPassword) {
      error = "Las contraseñas no coinciden.";
      return;
    }
    pending = true;
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword })
      });
      if (!response.ok) {
        throw new Error();
      }
      done = true;
    } catch {
      error = "El enlace no es válido o ha caducado.";
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head>
  <title>Nueva contraseña — MAC</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PublicShell variant="center" title="Nueva contraseña">
  <AuthCard
    eyebrow="Seguridad"
    title="Crea una nueva contraseña"
    description={done
      ? undefined
      : "Al guardarla se cerrarán las sesiones abiertas en otros dispositivos."}
  >
    {#if done}
      <p class="done" role="status">
        Tu contraseña se ha actualizado y las sesiones anteriores se han
        revocado.
      </p>
      <a class="button" href="/">Iniciar sesión</a>
    {:else}
      <form onsubmit={resetPassword}>
        <div class="field">
          <label for="password">Nueva contraseña</label>
          <input
            id="password"
            type={reveal ? "text" : "password"}
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            bind:value={newPassword}
            required
          />
        </div>
        <div class="field">
          <label for="confirm">Repite la contraseña</label>
          <input
            id="confirm"
            type={reveal ? "text" : "password"}
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            bind:value={confirmPassword}
            required
          />
        </div>

        <!-- Escribir dos veces una contraseña larga a ciegas es la causa
             habitual de que este formulario falle. -->
        <label class="reveal">
          <input type="checkbox" bind:checked={reveal} />
          Mostrar las contraseñas
        </label>

        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <button class="button" type="submit" disabled={pending} data-loading={pending}>
          {pending ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </form>
    {/if}

    {#snippet footer()}
      <a href="/">Volver a iniciar sesión</a>
    {/snippet}
  </AuthCard>
</PublicShell>

<style>
  form {
    display: grid;
    gap: var(--space-4);
  }

  .done {
    margin: 0 0 var(--space-4);
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .reveal {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .reveal input {
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent);
  }
</style>
