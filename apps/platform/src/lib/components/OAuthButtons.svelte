<script lang="ts">
  let {
    providers,
    callbackURL = "/chat"
  }: {
    providers: Readonly<{ github: boolean; google: boolean }>;
    callbackURL?: string;
  } = $props();

  let pending = $state<"github" | "google" | null>(null);
  let error = $state("");

  async function signIn(provider: "github" | "google") {
    if (pending) return;
    pending = provider;
    error = "";
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, callbackURL, disableRedirect: true })
      });
      const body = await response.json().catch(() => null) as {
        url?: unknown;
        message?: unknown;
      } | null;
      if (!response.ok || typeof body?.url !== "string") {
        error = typeof body?.message === "string"
          ? body.message
          : `No se pudo continuar con ${provider === "github" ? "GitHub" : "Google"}.`;
        return;
      }
      location.assign(body.url);
    } catch {
      error = "No se pudo conectar con el proveedor de acceso.";
    } finally {
      pending = null;
    }
  }
</script>

{#if providers.github || providers.google}
<div class="oauth" aria-label="Otros métodos de acceso">
    <div class="buttons">
      {#if providers.github}
      <button class="provider-button" type="button" disabled={pending !== null} onclick={() => signIn("github")}>
        <svg class="provider-icon github-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.28-1.29-5.28-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a10.94 10.94 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
        </svg>
        <span>{pending === "github" ? "Conectando con GitHub…" : "Continuar con GitHub"}</span>
      </button>
      {/if}
      {#if providers.google}
      <button class="provider-button" type="button" disabled={pending !== null} onclick={() => signIn("google")}>
        <svg class="provider-icon" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.702-1.567 2.684-3.874 2.684-6.615Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.259c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z" />
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
        </svg>
        <span>{pending === "google" ? "Conectando con Google…" : "Continuar con Google"}</span>
      </button>
      {/if}
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>
{/if}

<style>
  .oauth {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .buttons {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .provider-button {
    display: inline-flex;
    min-height: 3rem;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--surface-2) 88%, white 2%);
    padding: 0.65rem 1rem;
    color: var(--text);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 650;
    cursor: pointer;
    transition:
      border-color var(--motion-fast) var(--easing),
      background var(--motion-fast) var(--easing),
      transform var(--motion-fast) var(--easing);
  }

  .provider-button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
    transform: translateY(-1px);
  }

  .provider-button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: 2px;
  }

  .provider-button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .provider-icon {
    width: 1.2rem;
    height: 1.2rem;
    flex: 0 0 auto;
  }

  .github-icon {
    color: var(--text);
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: var(--text-sm);
  }

</style>
