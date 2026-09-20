<script lang="ts">
  import { onMount } from "svelte";

  let theme = $state<"dark" | "light">("dark");
  let saved = $state(false);

  onMount(() => {
    theme =
      document.documentElement.dataset.theme === "light" ? "light" : "dark";
  });

  function save() {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cdor-theme", theme);
    saved = true;
    setTimeout(() => (saved = false), 1800);
  }
</script>

<svelte:head><title>Ajustes — MAC</title></svelte:head>

<div class="page">
  <header>
    <p>Apariencia del navegador</p>
    <h1>Ajustes</h1>
    <span class="muted">
      Estas opciones se guardan solo en este navegador. Las preferencias
      sincronizadas se incorporarán cuando tengan una ruta pública estable.
    </span>
  </header>

  <section class="panel">
    <div>
      <h2>Tema</h2>
      <p class="muted">Elige el contraste que te resulte más cómodo.</p>
    </div>
    <fieldset>
      <legend class="sr-only">Tema de la interfaz</legend>
      <label class:active={theme === "dark"}>
        <input type="radio" name="theme" value="dark" bind:group={theme} />
        <span aria-hidden="true">●</span>
        Oscuro
      </label>
      <label class:active={theme === "light"}>
        <input type="radio" name="theme" value="light" bind:group={theme} />
        <span aria-hidden="true">○</span>
        Claro
      </label>
    </fieldset>
    <button class="button" type="button" onclick={save}>Guardar en este navegador</button>
    {#if saved}<p class="success" role="status">Ajuste guardado.</p>{/if}
  </section>
</div>

<style>
  .page {
    width: min(760px, calc(100% - 2rem));
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
    margin: 0.3rem 0;
    font-size: var(--text-display);
    letter-spacing: -0.045em;
  }

  section {
    margin-top: 2rem;
    padding: 1.4rem;
  }

  section h2,
  section p {
    margin: 0;
  }

  fieldset {
    display: grid;
    margin: 1.5rem 0;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
    border: 0;
    padding: 0;
  }

  fieldset label {
    display: flex;
    min-height: 5rem;
    align-items: center;
    gap: 0.7rem;
    border: 1px solid var(--border);
    border-radius: 0.8rem;
    background: var(--surface-2);
    padding: 1rem;
    cursor: pointer;
  }

  fieldset label.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  fieldset input {
    position: absolute;
    opacity: 0;
  }
</style>
