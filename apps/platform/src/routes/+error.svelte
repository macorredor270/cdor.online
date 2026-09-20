<script lang="ts">
  import { page } from "$app/state";
  import Logo from "$lib/components/Logo.svelte";

  /**
   * Página de error del producto.
   *
   * Sin ella, SvelteKit servía su pantalla por defecto: `<h1>404</h1>` sobre
   * fondo blanco, sin marca ni salida. Era la única pantalla sin diseñar y la
   * que más ve quien llega por un enlace roto.
   *
   * No se muestra `error.stack` ni ningún detalle interno: solo el código y un
   * mensaje redactado aquí.
   */
  const status = $derived(page.status);

  const copy = $derived.by(() => {
    if (status === 404) {
      return {
        title: "Esta página no existe",
        body: "El enlace es incorrecto o el contenido se movió. Comprueba la dirección o vuelve al inicio.",
        retry: false
      };
    }
    if (status === 403) {
      return {
        title: "No tienes acceso",
        body: "Tu cuenta no puede ver esta página. Si crees que es un error, inicia sesión de nuevo.",
        retry: false
      };
    }
    if (status >= 500) {
      return {
        title: "Algo falló por nuestra parte",
        body: "El servicio no pudo completar la petición. Suele ser temporal: vuelve a intentarlo en unos segundos.",
        retry: true
      };
    }
    return {
      title: "No se pudo mostrar la página",
      body: "La petición no se completó. Vuelve atrás o regresa al inicio.",
      retry: true
    };
  });

  function retry() {
    location.reload();
  }
</script>

<svelte:head>
  <title>{status} — MAC</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="error-page">
  <section class="error-card panel">
    <Logo size="auth" alt="" />
    <p class="eyebrow">Error {status}</p>
    <h1 class="page-title">{copy.title}</h1>
    <p class="body">{copy.body}</p>

    <div class="actions">
      <a class="button" href="/">Ir al inicio</a>
      {#if copy.retry}
        <button class="button secondary" type="button" onclick={retry}>
          Reintentar
        </button>
      {/if}
    </div>
  </section>
</main>

<style>
  .error-page {
    display: grid;
    width: min(var(--width-narrow), calc(100% - var(--space-4)));
    min-height: 100dvh;
    margin: 0 auto;
    align-content: center;
    padding: var(--space-8) 0;
  }

  .error-card {
    display: grid;
    justify-items: start;
    padding: clamp(var(--space-6), 5vw, var(--space-8));
  }

  .eyebrow {
    margin-top: var(--space-4);
  }

  .body {
    margin: 0;
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }
</style>
