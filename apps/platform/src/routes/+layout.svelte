<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import ToastViewport from "$lib/components/ToastViewport.svelte";

  let { children } = $props();

  onMount(() => {
    const theme = localStorage.getItem("cdor-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
  });
</script>

<!-- Los iconos se declaran una sola vez en app.html; duplicarlos aquí ya
     provocó que el favicon apuntara a un archivo inexistente. -->

<ToastViewport />

{@render children()}
