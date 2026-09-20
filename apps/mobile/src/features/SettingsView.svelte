<script lang="ts">
  import type { SyncStatus } from "../bridge";

  let {
    online,
    syncing,
    status,
    syncStatus,
    theme,
    onSync,
    onTheme,
    onLogout
  }: {
    online: boolean;
    syncing: boolean;
    status: string;
    syncStatus: SyncStatus | null;
    theme: "system" | "light" | "dark";
    onSync: () => void | Promise<void>;
    onTheme: (theme: "system" | "light" | "dark") => void;
    onLogout: () => void | Promise<void>;
  } = $props();
</script>

<section class="view">
  <header>
    <p>Dispositivo</p>
    <h1>Ajustes</h1>
  </header>
  <div class="content">
    <section>
      <h2>Sincronización</h2>
      <div class="row">
        <div>
          <strong>{online ? "Con conexión" : "Sin conexión"}</strong>
          <small>{status}</small>
        </div>
        <i class:online></i>
      </div>
      <dl>
        <div><dt>Pendientes</dt><dd>{syncStatus?.pending ?? "—"}</dd></div>
        <div><dt>Con error</dt><dd>{syncStatus?.failed ?? "—"}</dd></div>
        <div><dt>Cursor</dt><dd>{syncStatus?.cursor ?? "—"}</dd></div>
      </dl>
      <button class="primary" type="button" disabled={syncing || !online} onclick={onSync}>
        {syncing ? "Sincronizando…" : "Sincronizar ahora"}
      </button>
    </section>

    <section>
      <h2>Apariencia</h2>
      <div class="theme" role="group" aria-label="Tema">
        {#each ["system", "light", "dark"] as option}
          <button
            class:active={theme === option}
            type="button"
            onclick={() => onTheme(option as "system" | "light" | "dark")}
          >
            {option === "system" ? "Sistema" : option === "light" ? "Claro" : "Oscuro"}
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h2>Privacidad</h2>
      <p>La sesión permanece en Keystore o Keychain. El WebView no puede leer el token ni ejecutar SQL.</p>
    </section>

    <button class="logout" type="button" onclick={onLogout}>Cerrar sesión</button>
  </div>
</section>

<style>
  .view { min-height: 0; overflow-y: auto; padding-bottom: 1rem; }
  header { min-height: calc(4.8rem + env(safe-area-inset-top)); padding: calc(.8rem + env(safe-area-inset-top)) 1rem .8rem; border-bottom: 1px solid var(--border); background: var(--surface); }
  header p, header h1 { margin: 0; }
  header p { color: var(--muted); font-size: .67rem; }
  header h1 { font-size: 1.35rem; letter-spacing: -.03em; }
  .content { display: grid; gap: .8rem; padding: 1rem; }
  .content > section { border: 1px solid var(--border); border-radius: 1rem; background: var(--surface); padding: 1rem; }
  h2 { margin: 0 0 .8rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  .row { display: flex; align-items: center; justify-content: space-between; }
  .row div { display: grid; gap: .18rem; }
  .row small { color: var(--muted); }
  .row > i { width: .7rem; height: .7rem; border-radius: 50%; background: var(--danger); box-shadow: 0 0 0 .3rem color-mix(in srgb, var(--danger) 13%, transparent); }
  .row > i.online { background: var(--success); box-shadow: 0 0 0 .3rem color-mix(in srgb, var(--success) 13%, transparent); }
  dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; margin: 1rem 0; }
  dl div { display: grid; gap: .2rem; border-radius: .7rem; background: var(--surface-2); padding: .65rem; }
  dt { color: var(--muted); font-size: .62rem; }
  dd { margin: 0; font-weight: 800; overflow: hidden; text-overflow: ellipsis; }
  .primary, .logout { width: 100%; min-height: 2.75rem; border: 0; border-radius: .75rem; font-weight: 800; }
  .primary { background: var(--accent-button); color: white; }
  .primary:disabled { opacity: .45; }
  .theme { display: grid; grid-template-columns: repeat(3, 1fr); gap: .35rem; }
  .theme button { min-height: 2.45rem; border: 1px solid var(--border); border-radius: .65rem; background: var(--surface-2); color: var(--muted); }
  .theme button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-light); }
  section p { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.55; }
  .logout { margin-top: .35rem; background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
</style>
