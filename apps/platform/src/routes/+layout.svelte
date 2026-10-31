<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { onNavigate } from "$app/navigation";
  import { followSystemTheme } from "#lib/client/theme.js";
  import ToastViewport from "#lib/components/ToastViewport.svelte";

  let { children } = $props();

  // The theme itself is applied before first paint by the inline script in
  // app.html; here we only keep following the OS while "system" is chosen.
  onMount(() => followSystemTheme());

  // Cross-fade between pages where the browser supports view transitions.
  // Same-page navigations (query changes) keep their own state untouched.
  onNavigate((navigation) => {
    if (
      !document.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      navigation.from?.url.pathname === navigation.to?.url.pathname
    ) {
      return;
    }
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<!-- Los iconos se declaran una sola vez en app.html; duplicarlos aquí ya
     provocó que el favicon apuntara a un archivo inexistente. -->

<ToastViewport />

{@render children()}
