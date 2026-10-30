<script lang="ts">
  import { ulid } from "ulid";
  import type { Device } from "@cdor/contracts";
  import { apiRequest } from "#lib/client/api.js";
  import { toasts } from "#lib/client/toast.svelte.js";
  import ConfirmDialog from "#lib/components/ConfirmDialog.svelte";
  import Skeleton from "#lib/components/Skeleton.svelte";
  import UserAvatar from "#lib/components/UserAvatar.svelte";

  let { data } = $props();
  /** `null` mientras la lista viaja; el vacío real es un array vacío. */
  let devices = $state<Device[] | null>(null);
  let devicesFailed = $state(false);
  let error = $state("");
  let linking = $state(false);

  $effect(() => {
    const request = data.devices;
    devices = null;
    devicesFailed = false;
    request
      .then((result) => {
        // Descartamos una respuesta que llegue después de otra navegación en
        // vez de pisar la lista buena con la vieja.
        if (data.devices === request) devices = result;
      })
      .catch(() => {
        if (data.devices === request) devicesFailed = true;
      });
  });

  async function linkBrowser() {
    linking = true;
    error = "";
    try {
      const device = await apiRequest<Device>(
        fetch,
        "/api/v1/auth/devices",
        {
          method: "POST",
          body: JSON.stringify({
            id: ulid(),
            name: `${navigator.platform || "Navegador"} web`,
            platform: "web",
            appVersion: "1.0"
          })
        }
      );
      devices = [device, ...(devices ?? []).filter((item) => item.id !== device.id)];
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : "No se pudo vincular el navegador.";
    } finally {
      linking = false;
    }
  }

  // Dispositivo pendiente de revocar; abre el diálogo al asignarse.
  let revoking = $state<Device | null>(null);

  async function confirmRevoke() {
    const device = revoking;
    if (!device) return;
    error = "";
    try {
      await apiRequest(fetch, `/api/v1/auth/devices/${device.id}`, {
        method: "DELETE"
      });
      devices = (devices ?? []).filter((item) => item.id !== device.id);
      toasts.success(`${device.name} ya no tiene acceso.`);
    } catch (cause) {
      toasts.error(
        cause instanceof Error ? cause.message : "No se pudo revocar el dispositivo."
      );
    } finally {
      revoking = null;
    }
  }

  // El borrado exige escribir el correo y la contraseña: la sesión activa por
  // sí sola no puede destruir la cuenta.
  let confirmEmail = $state("");
  let confirmPassword = $state("");
  let deleting = $state(false);
  let deleteError = $state("");
  let deleteReady = $derived(
    confirmEmail.trim().toLowerCase() === data.user.email.toLowerCase() &&
      confirmPassword.length > 0
  );

  async function deleteAccount(event: SubmitEvent) {
    event.preventDefault();
    if (!deleteReady || deleting) return;
    deleting = true;
    deleteError = "";
    try {
      await apiRequest(fetch, "/api/v1/account/delete", {
        method: "POST",
        body: JSON.stringify({ password: confirmPassword })
      });
      window.location.href = "/";
    } catch (cause) {
      deleting = false;
      confirmPassword = "";
      deleteError =
        cause instanceof Error
          ? cause.message
          : "No se pudo eliminar la cuenta.";
    }
  }
</script>

<svelte:head><title>Cuenta — MAC</title></svelte:head>

<div class="page">
  <header>
    <p>Identidad y sesiones</p>
    <h1>Cuenta</h1>
  </header>

  <section class="identity panel">
    <UserAvatar name={data.user.name} image={data.user.image} size="account" />
    <div>
      <h2>{data.user.name}</h2>
      <p class="muted">{data.user.email}</p>
    </div>
    <span>Correo verificado</span>
  </section>

  <section class="devices">
    <div class="section-head">
      <div>
        <h2>Dispositivos vinculados</h2>
        <p class="muted">Revocar un dispositivo elimina todas sus sesiones.</p>
      </div>
      <button
        class="button secondary"
        type="button"
        onclick={linkBrowser}
        disabled={linking || devices === null}
      >
        {linking ? "Vinculando…" : "Vincular este navegador"}
      </button>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="device-list" aria-busy={devices === null}>
      {#if devicesFailed}
        <p class="panel empty error" role="alert">
          No se pudo cargar la lista de dispositivos. Recarga la página para
          reintentar.
        </p>
      {:else if devices === null}
        {#each Array.from({ length: 2 }), index (index)}
          <article class="panel loading">
            <Skeleton height="2.5rem" width="2.5rem" radius="0.8rem" />
            <div>
              <Skeleton height="0.9rem" width="10rem" />
              <Skeleton height="0.75rem" width="14rem" />
            </div>
          </article>
        {/each}
      {:else if devices.length === 0}
        <p class="panel empty muted">No hay dispositivos vinculados todavía.</p>
      {/if}
      {#each devices ?? [] as device (device.id)}
        <article class="panel">
          <div class="device-icon" aria-hidden="true">
            {device.platform === "android" ? "A" : device.platform === "ios" ? "i" : "W"}
          </div>
          <div>
            <strong>{device.name}</strong>
            <small>
              {device.platform} · visto {new Date(device.lastSeenAt).toLocaleDateString("es")}
            </small>
          </div>
        <button class="button danger" type="button" onclick={() => (revoking = device)}>
            Revocar
          </button>
        </article>
      {/each}
    </div>
  </section>

  <section class="danger-zone">
    <h2>Eliminar la cuenta</h2>
    <p class="muted">
      Se eliminan de forma permanente tu cuenta, sesiones, dispositivos,
      conversaciones, mensajes, memorias y preferencias. La acción no se puede
      deshacer y no existe copia de recuperación.
    </p>
    <form class="panel" onsubmit={deleteAccount}>
      <label for="confirm-email">
        Escribe <strong>{data.user.email}</strong> para confirmar
      </label>
      <input
        id="confirm-email"
        type="email"
        autocomplete="off"
        bind:value={confirmEmail}
        disabled={deleting}
      />

      <label for="confirm-password">Tu contraseña</label>
      <input
        id="confirm-password"
        type="password"
        autocomplete="current-password"
        bind:value={confirmPassword}
        disabled={deleting}
      />

      {#if deleteError}<p class="error" role="alert">{deleteError}</p>{/if}

      <button
        class="button danger"
        type="submit"
        disabled={!deleteReady || deleting}
      >
        {deleting ? "Eliminando…" : "Eliminar mi cuenta definitivamente"}
      </button>
    </form>
  </section>
</div>

<ConfirmDialog
  open={revoking !== null}
  destructive
  title="Revocar acceso del dispositivo"
  description={revoking
    ? `${revoking.name} perderá la sesión y tendrá que iniciar sesión de nuevo. El contenido de tu cuenta no se elimina.`
    : ""}
  confirmLabel="Revocar acceso"
  onconfirm={confirmRevoke}
  oncancel={() => (revoking = null)}
/>

<style>
  .page {
    width: min(850px, calc(100% - 2rem));
    margin: 0 auto;
    padding: clamp(2rem, 6vw, 5rem) 0;
  }

  header p {
    margin: 0;
    color: var(--accent-strong);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.3rem 0 2rem;
    font-size: var(--text-display);
    letter-spacing: -0.045em;
  }

  .identity {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    padding: 1.3rem;
  }

  .identity h2,
  .identity p {
    margin: 0;
  }

  .identity > span {
    border: 1px solid color-mix(in srgb, var(--success) 40%, var(--border));
    border-radius: 999px;
    padding: 0.35rem 0.65rem;
    color: var(--success);
    font-size: var(--text-xs);
  }

  .device-icon {
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 850;
  }

  .devices {
    margin-top: 2.4rem;
  }

  .section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-head h2,
  .section-head p {
    margin: 0;
  }

  .device-list {
    display: grid;
    gap: 0.7rem;
    margin-top: 1rem;
  }

  article {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.9rem;
    padding: 1rem;
  }

  .device-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.8rem;
  }

  article strong,
  article small {
    display: block;
  }

  article small {
    color: var(--text-muted);
  }

  article .button {
    min-height: 2.2rem;
    font-size: var(--text-sm);
  }

  .empty {
    padding: 1rem;
  }

  .loading {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .loading > div {
    display: grid;
    gap: var(--space-2);
  }

  .danger-zone {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border);
  }

  .danger-zone h2 {
    margin: 0;
    color: var(--danger);
  }

  .danger-zone > p {
    margin: 0.35rem 0 1rem;
  }

  .danger-zone form {
    display: grid;
    gap: 0.4rem;
    padding: 1.2rem;
  }

  .danger-zone label {
    font-size: var(--text-sm);
  }

  .danger-zone input {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
    background: transparent;
    color: var(--text);
    font: inherit;
  }

  .danger-zone .button {
    margin-top: 0.7rem;
    justify-self: start;
  }

  @media (max-width: 620px) {
    .identity {
      grid-template-columns: auto 1fr;
    }

    .identity > span {
      grid-column: 1 / -1;
      width: fit-content;
    }

    .section-head {
      align-items: flex-start;
      flex-direction: column;
    }

    article {
      grid-template-columns: auto minmax(0, 1fr);
    }

    article .button {
      grid-column: 1 / -1;
    }
  }
</style>
