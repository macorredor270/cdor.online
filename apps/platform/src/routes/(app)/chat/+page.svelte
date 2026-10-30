<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import type { Conversation } from "@cdor/contracts";
  import { apiRequest } from "#lib/client/api.js";
  import { toasts } from "#lib/client/toast.svelte.js";
  import Composer from "#lib/components/Composer.svelte";
  import Logo from "#lib/components/Logo.svelte";

  let { data } = $props();
  let prompt = $state("");
  let creating = $state(false);
  // Initial value only: the user toggles it afterwards.
  let webSearch = $state(untrack(() => Boolean(data.webSearchEnabled)));

  /**
   * La pantalla vacía ya no es un catálogo de sugerencias: es el compositor.
   *
   * Antes había seis tarjetas de categoría que solo servían para dejar una
   * frase escrita en el compositor de la conversación siguiente. Escribir
   * directamente hace lo mismo con un paso menos, y una rejilla simétrica de
   * seis tarjetas idénticas era el patrón más reconocible de la interfaz.
   */
  async function send() {
    const text = prompt.trim();
    if (!text || creating) return;
    creating = true;
    try {
      const conversation = await apiRequest<Conversation>(
        fetch,
        "/api/v1/conversations",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Nueva conversación",
            modelMode: "balanced"
          })
        }
      );
      // El texto viaja en la URL y la conversación lo envía al abrirse, para
      // que pulsar Enter aquí y pulsarlo dentro hagan exactamente lo mismo.
      const search = `&search=${webSearch ? "1" : "0"}`;
      await goto(`/chat/${conversation.id}?send=${encodeURIComponent(text)}${search}`);
    } catch {
      toasts.error("No se pudo crear la conversación.");
      creating = false;
    }
  }
</script>

<svelte:head><title>Chat — MAC</title></svelte:head>

<section class="empty">
  <div class="middle">
    <div class="head">
      <Logo size="auth" alt="" />
      <h1>¿En qué estás trabajando?</h1>
    </div>

    <Composer
      bind:value={prompt}
      busy={creating}
      webSearchEnabled={data.webSearchEnabled}
      bind:webSearch
      autofocus
      placeholder="Mensaje a MAC"
      onsend={send}
    />

    <p class="note">
      MAC solo usa las <a href="/memories">memorias</a> que mantengas activas.
    </p>
  </div>
</section>

<style>
  .empty {
    display: grid;
    height: 100dvh;
    place-items: center;
    padding: var(--space-6);
  }

  .middle {
    display: grid;
    width: min(var(--width-chat), 100%);
    gap: var(--space-6);
    animation: mac-rise var(--motion-slow) var(--easing-out);
  }

  .head {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: 620;
    letter-spacing: -0.02em;
  }

  .note {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }

  .note a {
    color: var(--text-muted);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .note a:hover {
    color: var(--text);
  }

  @media (max-width: 760px) {
    .empty {
      height: calc(100dvh - var(--topbar-height));
    }
  }
</style>
