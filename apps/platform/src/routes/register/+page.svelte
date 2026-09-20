<script lang="ts">
  import AuthCard from "$lib/components/AuthCard.svelte";
  import OAuthButtons from "$lib/components/OAuthButtons.svelte";
  import PublicShell from "$lib/components/PublicShell.svelte";

  let { data } = $props();
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let reveal = $state(false);
  let pending = $state(false);
  let error = $state("");
  let created = $state(false);

  function errorCode(body: unknown): string {
    if (!body || typeof body !== "object") return "";
    const value = body as { code?: unknown; error?: { code?: unknown } };
    return typeof value.code === "string"
      ? value.code
      : typeof value.error?.code === "string"
        ? value.error.code
        : "";
  }

  const RULES = [
    { label: "8 caracteres como mínimo", test: (v: string) => v.length >= 8 },
    { label: "Una letra minúscula", test: (v: string) => /[a-z]/.test(v) },
    { label: "Una letra mayúscula", test: (v: string) => /[A-Z]/.test(v) },
    { label: "Un número", test: (v: string) => /\d/.test(v) },
    { label: "Un carácter especial", test: (v: string) => /[^A-Za-z0-9]/.test(v) }
  ];

  let checks = $derived(RULES.map((rule) => rule.test(password)));
  let score = $derived(checks.filter(Boolean).length);
  let passwordIsStrong = $derived(score === RULES.length);
  let passwordsMatch = $derived(
    confirmPassword.length > 0 && password === confirmPassword
  );

  async function register(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    error = "";
    created = false;

    if (!passwordIsStrong) {
      error = "La contraseña debe cumplir todos los requisitos de seguridad.";
      pending = false;
      return;
    }

    if (!passwordsMatch) {
      error = "Las contraseñas no coinciden.";
      pending = false;
      return;
    }

    try {
      const response = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: "/chat"
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = errorCode(body).toUpperCase();
        error =
          code.includes("SIGN_UP") || code.includes("SIGNUP")
            ? "El registro está cerrado en este entorno."
            : code.includes("ORIGIN") || code.includes("CSRF")
              ? "Este dominio no está autorizado. Abre cdor.online sin www o prueba a recargar la página."
            : "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.";
        return;
      }

      created = true;
    } catch {
      error = "No se pudo conectar con MAC.";
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head>
  <title>Crear una cuenta — MAC</title>
  <meta
    name="description"
    content="Crea una cuenta de MAC y continúa tus conversaciones sin perder el hilo."
  />
</svelte:head>

<PublicShell variant="center" title="Crear una cuenta">
  <AuthCard
    title="Crea tu cuenta"
    description={created
      ? undefined
      : "Usa un correo al que tengas acceso. Tendrás que verificarlo antes de entrar."}
  >
    {#if created}
      <!-- El alta responde igual exista o no el correo, para no revelar qué
           direcciones están registradas. Por eso el mensaje no puede prometer
           un envío: si la cuenta ya existía no sale ningún correo, y quien
           esperaba el enlace se quedaba mirando la bandeja. -->
      <div class="sent" role="status">
        <strong>Revisa tu correo.</strong>
        <p>
          Si esa dirección no tenía cuenta, te hemos enviado un enlace para
          activarla. Comprueba también la carpeta de spam.
        </p>
        <p class="sent-alt">
          ¿Ya tenías cuenta con ese correo? No se envía un enlace nuevo: entra
          desde <a href="/">el acceso</a>,
          <a href="/verify-email">reenvía la verificación</a> o
          <a href="/forgot-password">recupera la contraseña</a>.
        </p>
      </div>
    {:else}
      <form onsubmit={register}>
        <div class="field">
          <label for="name">Nombre</label>
          <input id="name" name="name" autocomplete="name" bind:value={name} required />
        </div>

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
            type={reveal ? "text" : "password"}
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            bind:value={password}
            aria-describedby="password-help"
            required
          />
          <div id="password-help" class="password-help">
            <div
              class="meter"
              role="img"
              aria-label={`Contraseña: ${score} de ${RULES.length} requisitos cumplidos`}
            >
              {#each checks as isValid}
                <span class:is-valid={isValid}></span>
              {/each}
            </div>
            <ul class="rules">
              {#each RULES as rule, index}
                <li class:is-valid={checks[index]}>
                  <!-- El estado no se cifra solo en el color: el símbolo cambia
                       de guion a marca de verificación. -->
                  <span class="mark" aria-hidden="true">{checks[index] ? "✓" : "–"}</span>
                  {rule.label}
                </li>
              {/each}
            </ul>
          </div>
        </div>

        <div class="field">
          <label for="confirm-password">Repite la contraseña</label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type={reveal ? "text" : "password"}
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            bind:value={confirmPassword}
            aria-describedby="password-match"
            required
          />
          {#if confirmPassword}
            <p id="password-match" class="match" class:is-valid={passwordsMatch}>
              {passwordsMatch
                ? "Las contraseñas coinciden."
                : "Las contraseñas no coinciden."}
            </p>
          {/if}
        </div>

        <!-- Escribir dos veces una contraseña larga a ciegas es la causa
             habitual de que este formulario falle. -->
        <label class="reveal">
          <input type="checkbox" bind:checked={reveal} />
          Mostrar las contraseñas
        </label>

        {#if error}<p class="error" role="alert">{error}</p>{/if}

        <!-- Las condiciones se aceptan al pulsar, así que se leen antes de
             pulsar y no en un enlace del pie de la página. -->
        <p class="legal">
          Al crear la cuenta aceptas los
          <a href="/terms">términos de uso</a> y la
          <a href="/privacy">política de privacidad</a>.
        </p>

        <button class="button" type="submit" disabled={pending} data-loading={pending}>
          {pending ? "Creando…" : "Crear cuenta"}
        </button>
      </form>

      <OAuthButtons providers={data.socialProviders} />
    {/if}

    {#snippet footer()}
      <a href="/">Ya tengo cuenta</a>
      <a href="/forgot-password">Recuperar contraseña</a>
    {/snippet}
  </AuthCard>
</PublicShell>

<style>
  form {
    display: grid;
    gap: var(--space-4);
  }

  .password-help {
    display: grid;
    gap: var(--space-3);
    /* Pegado al input, el medidor se leía como un subrayado roto del campo. */
    margin-top: var(--space-2);
  }

  .meter {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.25rem;
  }

  .meter span {
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--border);
    transition: background var(--motion-fast) var(--easing);
  }

  .meter span.is-valid {
    background: var(--accent);
  }

  .rules {
    display: grid;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    list-style: none;
  }

  .rules li.is-valid {
    color: var(--success);
  }

  .mark {
    display: inline-block;
    width: 1rem;
  }

  .match {
    margin: 0;
    color: var(--danger);
    font-size: var(--text-sm);
  }

  .match.is-valid {
    color: var(--success);
  }

  .reveal {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .reveal input {
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent);
  }

  .error {
    margin: 0;
    font-size: var(--text-sm);
  }

  .legal {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .legal a {
    color: var(--accent-strong);
  }

  .sent {
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .sent strong {
    color: var(--text);
  }

  .sent p {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
  }

  .sent-alt {
    margin-top: var(--space-4);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }

  .sent a {
    color: var(--accent-strong);
  }
</style>
