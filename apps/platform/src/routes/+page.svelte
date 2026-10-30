<script lang="ts">
  import AuthCard from "#lib/components/AuthCard.svelte";
  import OAuthButtons from "#lib/components/OAuthButtons.svelte";
  import PublicShell from "#lib/components/PublicShell.svelte";

  let { data } = $props();
  let email = $state("");
  let password = $state("");
  let pending = $state(false);
  let error = $state("");
  let unverified = $state(false);

  function errorCode(body: unknown): string {
    if (!body || typeof body !== "object") return "";
    const value = body as { code?: unknown; error?: { code?: unknown } };
    return typeof value.code === "string"
      ? value.code
      : typeof value.error?.code === "string"
        ? value.error.code
        : "";
  }

  async function signIn(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    error = "";
    unverified = false;
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe: true })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = errorCode(body).toUpperCase();
        unverified =
          response.status === 403 &&
          code.includes("VERIF");
        error = unverified
          ? "Tu correo aún no está verificado. Reenvía el enlace de activación."
          : code.includes("ORIGIN") || code.includes("CSRF")
            ? "Este dominio no está autorizado para iniciar sesión. Abre cdor.online sin www o prueba a recargar la página."
          : response.status === 401 || response.status === 403
            ? "El correo o la contraseña no son correctos."
            : "No se pudo iniciar sesión. Inténtalo de nuevo.";
        return;
      }
      location.assign("/chat");
    } catch {
      error = "No se pudo conectar con MAC.";
    } finally {
      pending = false;
    }
  }
</script>

<!-- La descripción dice qué hace el producto, no cómo de bueno es. La anterior
     encadenaba «avanzado, rápido y personalizado» sin nombrar una sola cosa
     que se pueda hacer aquí. -->
<svelte:head>
  <title>MAC — Conversaciones que siguen donde las dejaste</title>
  <meta
    name="description"
    content="Chat con memoria y sincronización: las mismas conversaciones en el navegador y en el móvil, con el contexto que tú decides guardar."
  />
  <meta property="og:title" content="MAC — Conversaciones que siguen donde las dejaste" />
  <meta
    property="og:description"
    content="Chat con memoria y sincronización: las mismas conversaciones en el navegador y en el móvil, con el contexto que tú decides guardar."
  />
  <meta property="og:url" content="https://cdor.online/" />
  <meta name="twitter:title" content="MAC — Conversaciones que siguen donde las dejaste" />
  <meta
    name="twitter:description"
    content="Chat con memoria y sincronización: las mismas conversaciones en el navegador y en el móvil."
  />
  <link rel="canonical" href="https://cdor.online/" />
</svelte:head>

<PublicShell variant="split">
  <section class="hero" aria-labelledby="product-title">
    <p class="eyebrow">Retoma tu trabajo</p>
    <h1 id="product-title">Vuelve al punto exacto donde lo dejaste.</h1>
    <p class="lead">
      Tus conversaciones y memorias, sincronizadas para continuar donde las
      dejaste.
    </p>

    <div class="continuity" aria-label="Continuidad entre navegador y aplicación móvil">
      <div class="continuity-heading">
        <span>Tu contexto, listo donde estés</span>
      </div>

      <div class="continuity-flow">
        <div class="device">
          <span class="device-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="13" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </span>
          <span>
            <strong>Navegador</strong>
            <small>Empieza aquí</small>
          </span>
        </div>

        <div class="sync-path" aria-hidden="true">
          <span></span>
          <svg viewBox="0 0 20 20">
            <path d="m7 4 6 6-6 6" />
          </svg>
        </div>

        <div class="device">
          <span class="device-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="7" y="2" width="10" height="20" rx="2.5" />
              <path d="M10 5h4M11 19h2" />
            </svg>
          </span>
          <span>
            <strong>App móvil</strong>
            <small>Continúa allí</small>
          </span>
        </div>
      </div>

      <div class="capabilities" aria-label="Funciones disponibles">
        <span>Memoria configurable</span>
        <span>Chat temporal</span>
        <span>Búsqueda web integrada</span>
      </div>
    </div>
  </section>

  {#snippet aside()}
    <AuthCard
      fluid
      headingLevel={2}
      title="Inicia sesión"
      description={data.signUpEnabled
        ? "Entra con tu correo y sigue donde lo dejaste."
        : "Acceso por invitación: el alta pública está cerrada."}
    >
      <form onsubmit={signIn}>
        <div class="field">
          <label for="email">Correo electrónico</label>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            bind:value={email}
            required
          />
        </div>
        <div class="field">
          <label for="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            minlength="8"
            maxlength="128"
            bind:value={password}
            required
          />
        </div>
        {#if error}
          <p class="error" role="alert">{error}</p>
          {#if unverified}
            <p class="unverified-help">
              <a href="/verify-email">Reenviar el correo de verificación</a>
            </p>
          {/if}
        {/if}
        <button class="button" type="submit" disabled={pending} data-loading={pending}>
          {pending ? "Comprobando…" : "Entrar"}
        </button>
      </form>

      <OAuthButtons providers={data.socialProviders} />

      {#snippet footer()}
        {#if data.signUpEnabled}
          <a href="/register">Crear una cuenta</a>
        {/if}
        <a href="/forgot-password">Recuperar contraseña</a>
      {/snippet}
    </AuthCard>
  {/snippet}
</PublicShell>

<style>
  .hero {
    display: flex;
    height: 100%;
    flex-direction: column;
    width: 100%;
    gap: var(--space-3);
  }

  .eyebrow {
    color: var(--accent-strong);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0;
  }

  h1 {
    max-width: 19ch;
    font-size: clamp(2.25rem, 4vw, 2.75rem);
    letter-spacing: -0.04em;
    line-height: 1.08;
    margin: 0;
    text-wrap: balance;
  }

  .lead {
    color: var(--text-muted);
    font-size: var(--text-base);
    line-height: 1.6;
    margin: 0;
    max-width: 44ch;
  }

  .continuity {
    display: grid;
    flex: 1;
    align-content: center;
    margin-top: clamp(var(--space-12), 10vh, 5rem);
    border-top: 1px solid var(--border);
    padding: var(--space-6) 0;
  }

  .continuity-heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .continuity-flow {
    display: grid;
    align-items: center;
    gap: var(--space-4);
    grid-template-columns: auto minmax(4rem, 1fr) auto;
    margin-top: var(--space-6);
  }

  .device {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: var(--space-3);
  }

  .device-icon {
    display: grid;
    width: 3rem;
    height: 3rem;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    color: var(--accent-strong);
  }

  .device-icon svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .device strong,
  .device small {
    display: block;
    white-space: nowrap;
  }

  .device strong {
    font-size: var(--text-base);
    font-weight: 650;
  }

  .device small {
    margin-top: 0.1rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .sync-path {
    display: flex;
    min-width: 0;
    align-items: center;
    color: var(--accent-strong);
  }

  .sync-path span {
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, var(--border), var(--accent), var(--border));
  }

  .sync-path svg {
    width: 1rem;
    height: 1rem;
    flex: 0 0 auto;
    margin-left: -0.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .capabilities {
    display: grid;
    gap: var(--space-2);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: var(--space-6);
  }

  .capabilities span {
    display: flex;
    min-height: 2.5rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 0.4rem 0.75rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }

  @media (max-width: 860px) {
    .hero {
      height: auto;
    }

    .continuity {
      display: block;
      flex: initial;
      margin-top: var(--space-6);
      padding: var(--space-6) 0 var(--space-2);
    }

    .capabilities {
      display: flex;
      flex-wrap: wrap;
      margin-top: var(--space-4);
    }

    .capabilities span {
      min-height: 2.25rem;
      font-size: var(--text-xs);
    }
  }

  @media (max-width: 460px) {
    .continuity-flow {
      gap: var(--space-2);
      grid-template-columns: auto minmax(2rem, 1fr) auto;
    }

    .device {
      gap: var(--space-2);
    }

    .device-icon {
      width: 2.25rem;
      height: 2.25rem;
    }

    .device small {
      display: none;
    }
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .unverified-help {
    margin: 0;
  }

  .unverified-help a {
    color: var(--accent-strong);
    font-size: var(--text-sm);
  }

  .error {
    color: var(--danger);
    font-size: var(--text-sm);
    margin: 0;
  }

</style>
