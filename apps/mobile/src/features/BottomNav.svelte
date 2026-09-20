<script lang="ts">
  import type { MobileView } from "../state/mobile.svelte";

  let {
    view,
    onChange
  }: {
    view: MobileView;
    onChange: (view: MobileView) => void;
  } = $props();
</script>

<nav aria-label="Navegación principal">
  <button class:active={view === "chat"} type="button" onclick={() => onChange("chat")}>
    <span aria-hidden="true">◇</span>
    Chat
  </button>
  <button
    class:active={view === "memories"}
    type="button"
    onclick={() => onChange("memories")}
  >
    <span aria-hidden="true">✦</span>
    Memorias
  </button>
  <button
    class:active={view === "settings"}
    type="button"
    onclick={() => onChange("settings")}
  >
    <span aria-hidden="true">◌</span>
    Ajustes
  </button>
</nav>

<style>
  nav {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    padding: 0.45rem 0.65rem calc(0.4rem + env(safe-area-inset-bottom));
    backdrop-filter: blur(18px);
  }

  button {
    display: grid;
    min-height: 3.15rem;
    place-content: center;
    gap: 0.12rem;
    border: 0;
    border-radius: 0.75rem;
    background: transparent;
    color: var(--muted);
    font-size: 0.67rem;
    font-weight: 700;
  }

  button span {
    font-size: 1.05rem;
  }

  button.active {
    background: var(--accent-soft);
    color: var(--accent-light);
  }
</style>
