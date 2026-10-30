<script lang="ts">
  import { onMount } from "svelte";
  import {
    readThemePreference,
    saveThemePreference,
    type ThemePreference
  } from "#lib/client/theme.js";
  import AppPage from "#lib/components/AppPage.svelte";

  const OPTIONS: ReadonlyArray<{
    value: ThemePreference;
    label: string;
    hint: string;
  }> = [
    { value: "system", label: "Sistema", hint: "Sigue el tema del dispositivo" },
    { value: "dark", label: "Oscuro", hint: "El predeterminado de MAC" },
    { value: "light", label: "Claro", hint: "Más contraste con luz ambiente" }
  ];

  let theme = $state<ThemePreference>("dark");

  onMount(() => {
    theme = readThemePreference();
  });

  // El cambio se aplica al elegir: un botón de guardar para algo que se ve
  // al instante solo añadía un paso.
  function choose(value: ThemePreference) {
    theme = value;
    saveThemePreference(value);
  }
</script>

<svelte:head><title>Ajustes — MAC</title></svelte:head>

<AppPage eyebrow="Este navegador" title="Ajustes">
  {#snippet description()}
    <p>
      Estas opciones se guardan solo en este navegador. Tu cuenta, tus
      conversaciones y tus memorias se sincronizan aparte.
    </p>
  {/snippet}

  <section class="panel">
    <div class="section-head">
      <h2 id="theme-heading">Tema</h2>
      <p class="muted">Se aplica en cuanto lo eliges.</p>
    </div>
    <div class="options" role="radiogroup" aria-labelledby="theme-heading">
      {#each OPTIONS as option (option.value)}
        <label class="option" class:active={theme === option.value}>
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={theme === option.value}
            onchange={() => choose(option.value)}
          />
          <span class="swatch" data-swatch={option.value} aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
          <span class="text">
            <strong>{option.label}</strong>
            <small>{option.hint}</small>
          </span>
        </label>
      {/each}
    </div>
  </section>
</AppPage>

<style>
  section {
    padding: var(--space-6);
  }

  .section-head h2,
  .section-head p {
    margin: 0;
  }

  .section-head h2 {
    font-size: var(--text-lg);
  }

  .section-head p {
    margin-top: var(--space-1);
    font-size: var(--text-sm);
  }

  .options {
    display: grid;
    margin-top: var(--space-6);
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: var(--space-3);
  }

  .option {
    position: relative;
    display: grid;
    gap: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    padding: var(--space-3);
    cursor: pointer;
    transition:
      border-color var(--motion-fast) var(--easing),
      box-shadow var(--motion-fast) var(--easing),
      transform var(--motion-fast) var(--easing);
  }

  .option:hover {
    border-color: var(--border-strong);
  }

  .option.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .option:has(input:focus-visible) {
    outline: 3px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: 2px;
  }

  .option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  /* Miniatura del tema: fondo, superficie y acento con los tokens de marca. */
  .swatch {
    display: grid;
    height: 4.5rem;
    overflow: hidden;
    grid-template-columns: 1fr 2fr;
    grid-template-rows: 1fr 1fr;
    gap: 4px;
    border-radius: var(--radius-sm);
    padding: 6px;
  }

  .swatch i {
    border-radius: 4px;
  }

  .swatch i:first-child {
    grid-row: span 2;
  }

  .swatch[data-swatch="dark"] {
    background: #0d0518;
  }

  .swatch[data-swatch="dark"] i {
    background: #1d0f30;
  }

  .swatch[data-swatch="light"] {
    background: var(--mac-background);
  }

  .swatch[data-swatch="light"] i {
    background: #ebe6f2;
  }

  .swatch[data-swatch="system"] {
    background: linear-gradient(135deg, #0d0518 50%, var(--mac-background) 50%);
  }

  .swatch[data-swatch="system"] i {
    background: color-mix(in srgb, #1d0f30 50%, #ebe6f2);
  }

  .swatch i:last-child {
    background: var(--mac-gradient) !important;
  }

  .text {
    display: grid;
    gap: 0.1rem;
  }

  .text strong {
    font-size: var(--text-sm);
  }

  .text small {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
