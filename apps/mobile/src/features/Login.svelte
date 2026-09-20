<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { mobileBridge } from "../bridge";

  const OAUTH_STORAGE_KEY = "mac.mobile-oauth";
  const OAUTH_MAX_AGE_MS = 10 * 60 * 1_000;

  type OAuthProvider = "github" | "google";
  type PendingOAuth = Readonly<{
    provider: OAuthProvider;
    state: string;
    verifier: string;
    startedAt: number;
  }>;

  let {
    onAuthenticated
  }: { onAuthenticated: (userId: string) => void | Promise<void> } = $props();
  let email = $state("");
  let password = $state("");
  let pending = $state(false);
  let oauthPending = $state<"github" | "google" | null>(null);
  let oauthCompleting = $state(false);
  let error = $state("");

  function readPendingOAuth(): PendingOAuth | null {
    try {
      const value = JSON.parse(localStorage.getItem(OAUTH_STORAGE_KEY) ?? "null") as Partial<PendingOAuth> | null;
      if (
        !value ||
        (value.provider !== "github" && value.provider !== "google") ||
        typeof value.state !== "string" ||
        typeof value.verifier !== "string" ||
        typeof value.startedAt !== "number" ||
        Date.now() - value.startedAt > OAUTH_MAX_AGE_MS
      ) {
        localStorage.removeItem(OAUTH_STORAGE_KEY);
        return null;
      }
      return value as PendingOAuth;
    } catch {
      localStorage.removeItem(OAUTH_STORAGE_KEY);
      return null;
    }
  }

  function clearPendingOAuth() {
    localStorage.removeItem(OAUTH_STORAGE_KEY);
    oauthPending = null;
  }

  async function completeOAuth(urls: string[]) {
    if (oauthCompleting) return;
    const pendingOAuth = readPendingOAuth();
    if (!pendingOAuth) return;
    const callback = urls
      .map((value) => {
        try {
          return new URL(value);
        } catch {
          return null;
        }
      })
      .find((value) => value?.protocol === "mac:" && value.hostname === "oauth" && value.pathname === "/callback");
    if (!callback || callback.searchParams.get("state") !== pendingOAuth.state) return;

    oauthCompleting = true;
    oauthPending = pendingOAuth.provider;
    error = "";
    try {
      const oauthError = callback.searchParams.get("error");
      const code = callback.searchParams.get("code");
      if (oauthError || !code) throw new Error(oauthError ?? "missing_code");
      const session = await mobileBridge.authCompleteOAuth(code, pendingOAuth.verifier);
      if (!session.authenticated || !session.userId) throw new Error("session");
      clearPendingOAuth();
      await onAuthenticated(session.userId);
    } catch {
      clearPendingOAuth();
      error = `No se pudo continuar con ${pendingOAuth.provider === "github" ? "GitHub" : "Google"}. Inténtalo de nuevo.`;
    } finally {
      oauthCompleting = false;
    }
  }

  onMount(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const pendingOAuth = readPendingOAuth();
    oauthPending = pendingOAuth?.provider ?? null;
    void (async () => {
      unlisten = await onOpenUrl((urls) => void completeOAuth(urls));
      const current = await getCurrent();
      if (!disposed && current) await completeOAuth(current);
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  });

  async function login(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    error = "";
    try {
      const session = await mobileBridge.authSignIn(email, password);
      if (!session.authenticated || !session.userId) {
        throw new Error();
      }
      password = "";
      await onAuthenticated(session.userId);
    } catch {
      error = "El correo o la contraseña no son correctos.";
    } finally {
      pending = false;
    }
  }

  async function signInWithProvider(provider: OAuthProvider) {
    if (pending || oauthPending) return;
    oauthPending = provider;
    error = "";
    const state = globalThis.crypto.randomUUID();
    const verifierBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const verifier = btoa(String.fromCharCode(...verifierBytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    const challengeBytes = new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    );
    const challenge = btoa(String.fromCharCode(...challengeBytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    localStorage.setItem(
      OAUTH_STORAGE_KEY,
      JSON.stringify({ provider, state, verifier, startedAt: Date.now() } satisfies PendingOAuth)
    );
    const url = new URL("https://cdor.online/mobile-auth/start");
    url.searchParams.set("provider", provider);
    url.searchParams.set("state", state);
    url.searchParams.set("challenge", challenge);
    try {
      await openUrl(url.toString());
    } catch {
      clearPendingOAuth();
      error = `No se pudo continuar con ${provider === "github" ? "GitHub" : "Google"}. Inténtalo de nuevo.`;
    }
  }
</script>

<main class="login-screen">
  <div class="brand" aria-label="MAC">
    <!-- El isotipo va empaquetado, no traído de cdor.online: una app nativa que
         pide su propio logo por red no lo enseña sin cobertura, y en la
         pantalla de acceso eso ocurre justo cuando la conexión falla. -->
    <img src="/mac-logo-256.png" alt="" width="36" height="36" class="mac-logo" />
    MAC
  </div>
  <section>
    <p class="eyebrow">Acceso privado</p>
    <h1>Continúa donde lo dejaste.</h1>
    <p class="intro">
      Tus conversaciones se abrirán primero desde la caché segura del
      dispositivo.
    </p>
    <form onsubmit={login}>
      <label>
        <span>Correo</span>
        <input
          type="email"
          autocomplete="username"
          inputmode="email"
          bind:value={email}
          required
        />
      </label>
      <label>
        <span>Contraseña</span>
        <input
          type="password"
          autocomplete="current-password"
          minlength="8"
          maxlength="128"
          bind:value={password}
          required
        />
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar en MAC"}
      </button>
    </form>

    <div class="oauth" aria-label="Otros métodos de acceso">
      <div class="oauth-buttons">
        <button type="button" class="oauth-button" disabled={pending || oauthPending !== null} onclick={() => signInWithProvider("github")}>
          <svg class="provider-icon github-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.28-1.29-5.28-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a10.94 10.94 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
          </svg>
          <span>{oauthPending === "github" ? "Conectando con GitHub…" : "Continuar con GitHub"}</span>
        </button>
        <button type="button" class="oauth-button" disabled={pending || oauthPending !== null} onclick={() => signInWithProvider("google")}>
          <svg class="provider-icon" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.702-1.567 2.684-3.874 2.684-6.615Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.259c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
          </svg>
          <span>{oauthPending === "google" ? "Conectando con Google…" : "Continuar con Google"}</span>
        </button>
      </div>
    </div>

    <div class="register-line">
      <span>¿No tienes cuenta?</span>
      <a href="https://cdor.online/register" target="_blank" rel="noopener">Crear una cuenta</a>
    </div>
  </section>
</main>

<style>
  .login-screen {
    display: grid;
    min-height: 100dvh;
    align-content: space-between;
    padding:
      calc(1.4rem + env(safe-area-inset-top))
      1.2rem
      calc(1.4rem + env(safe-area-inset-bottom));
    background:
      radial-gradient(circle at 100% 0, rgb(132 113 255 / 18%), transparent 36%),
      var(--bg);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-weight: 850;
    letter-spacing: 0.12em;
  }

  .brand .mac-logo {
    width: 2.25rem;
    height: 2.25rem;
    object-fit: contain;
    border-radius: 0.5rem;
  }

  section {
    margin: auto 0;
    padding: 2rem 0;
  }

  .eyebrow {
    margin: 0;
    color: var(--accent-light);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 22rem;
    margin: 0.55rem 0 0.8rem;
    font-size: clamp(2.6rem, 12vw, 4rem);
    line-height: 0.98;
    letter-spacing: -0.055em;
  }

  .intro {
    max-width: 26rem;
    margin: 0;
    color: var(--muted);
  }

  form {
    display: grid;
    gap: 0.9rem;
    margin-top: 2rem;
  }

  label {
    display: grid;
    gap: 0.38rem;
    font-size: 0.8rem;
    font-weight: 750;
  }

  input {
    min-height: 3.15rem;
    border: 1px solid var(--border);
    border-radius: 0.85rem;
    background: var(--surface);
    padding: 0.75rem 0.85rem;
    color: var(--text);
  }

  button {
    min-height: 3.15rem;
    margin-top: 0.3rem;
    border: 0;
    border-radius: 0.85rem;
    background: var(--accent-button);
    color: white;
    font-weight: 800;
  }

  button:disabled {
    opacity: 0.55;
  }

  .oauth {
    display: grid;
    gap: 0.75rem;
    margin-top: 0.9rem;
  }

  .oauth-buttons {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.65rem;
  }

  .oauth-button {
    display: flex;
    min-height: 2.85rem;
    align-items: center;
    justify-content: flex-start;
    gap: 0.75rem;
    margin-top: 0;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    padding: 0.65rem 1rem;
    color: var(--text);
  }

  .oauth-button:active:not(:disabled) {
    border-color: var(--accent-light);
    background: color-mix(in srgb, var(--accent-light) 10%, var(--surface));
  }

  .provider-icon {
    width: 1.25rem;
    height: 1.25rem;
    flex: 0 0 auto;
  }

  .github-icon {
    color: var(--text);
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  .register-line {
    margin-top: 1.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .register-line a {
    color: var(--accent-light);
    font-weight: 700;
    text-decoration: none;
  }
</style>
