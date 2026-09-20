<script lang="ts">
  import PublicShell from "$lib/components/PublicShell.svelte";

  let { data } = $props();

  /** Pestaña activa. El navegador decide la inicial por su plataforma. */
  let platform = $state<"android" | "iphone">("android");

  $effect(() => {
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) platform = "iphone";
  });

  const updated = $derived(
    data.apk.available
      ? new Date(data.apk.updated).toLocaleDateString("es", {
          day: "numeric",
          month: "long",
          year: "numeric"
        })
      : ""
  );
</script>

<svelte:head>
  <title>Cómo instalar MAC — Android e iPhone</title>
  <meta
    name="description"
    content="Instala MAC en Android descargando el APK, o en iPhone añadiéndolo a la pantalla de inicio desde Safari."
  />
  <link rel="canonical" href="https://cdor.online/install" />
</svelte:head>

<PublicShell variant="prose" title="Cómo instalar MAC">
  <div class="install">
    <header class="intro">
      <p class="eyebrow">Instalación</p>
      <h1 class="page-title">Lleva MAC a tu teléfono</h1>
      <p class="lead">
        La misma cuenta, las mismas conversaciones y las mismas memorias en
        todos tus dispositivos. Elige tu sistema.
      </p>
    </header>

    <div class="tabs" role="tablist" aria-label="Sistema operativo">
      <button
        role="tab"
        id="tab-android"
        aria-selected={platform === "android"}
        aria-controls="panel-android"
        class:active={platform === "android"}
        onclick={() => (platform = "android")}
      >
        Android
      </button>
      <button
        role="tab"
        id="tab-iphone"
        aria-selected={platform === "iphone"}
        aria-controls="panel-iphone"
        class:active={platform === "iphone"}
        onclick={() => (platform = "iphone")}
      >
        iPhone y iPad
      </button>
    </div>

    {#if platform === "android"}
      <div
        id="panel-android"
        role="tabpanel"
        aria-labelledby="tab-android"
        tabindex="-1"
        class="panel-block"
      >
        {#if data.apk.available}
          <div class="download">
            <div>
              <h2>Aplicación para Android</h2>
              <p class="meta">
                Versión 0.1.0 · {data.apk.size} · actualizado el {updated}
              </p>
            </div>
            <a class="button" href={data.apk.href} download>
              Descargar APK
            </a>
          </div>

          <ol class="steps">
            <li>
              <h3>Descarga el archivo</h3>
              <p>
                Pulsa <strong>Descargar APK</strong> desde el propio teléfono. El
                archivo queda en tu carpeta de Descargas.
              </p>
            </li>
            <li>
              <h3>Abre el archivo</h3>
              <p>
                Android te pedirá permiso para instalar desde tu navegador. Acepta
                cuando lo ofrezca.
              </p>
            </li>
            <li>
              <h3>Entra con tu cuenta</h3>
              <p>
                Usa la misma cuenta que en la web. Tus conversaciones aparecerán
                sincronizadas.
              </p>
            </li>
          </ol>

          <p class="note">
            Requiere Android 7.0 o superior. Al no distribuirse por Google Play,
            vuelve a esta página para actualizar.
          </p>
        {:else}
          <!-- Sin paquete publicado no se describen pasos: enseñar cómo instalar
               algo que no se puede descargar es prometer una tarea imposible. -->
          <div class="primary-route">
            <h2>Usa MAC en el navegador</h2>
            <p>
              Funciona completo en Chrome desde <a href="/">cdor.online</a>, con
              tu cuenta y tus conversaciones sincronizadas. No hace falta
              instalar nada.
            </p>
            <a class="button" href="/">Abrir MAC</a>
          </div>

          <div class="soon">
            <h3>Aplicación para Android</h3>
            <p>
              Todavía no hay ninguna versión publicada. Cuando exista, la
              descarga aparecerá aquí con sus instrucciones.
            </p>
          </div>
        {/if}
      </div>
    {:else}
      <div
        id="panel-iphone"
        role="tabpanel"
        aria-labelledby="tab-iphone"
        tabindex="-1"
        class="panel-block"
      >
        <div class="recommended">
          <p class="tag">Recomendado</p>
          <h2>Añadir a la pantalla de inicio</h2>
          <p>
            MAC funciona en iPhone y iPad como aplicación instalada, con su
            icono, a pantalla completa y sin barra del navegador. No necesitas
            App Store, ni cuenta de desarrollador, ni pagar nada.
          </p>
          <ol class="steps">
            <li>
              <h3>Abre cdor.online en Safari</h3>
              <p>
                Tiene que ser Safari. Chrome y Firefox en iPhone no permiten
                instalar aplicaciones web.
              </p>
            </li>
            <li>
              <h3>Pulsa Compartir</h3>
              <p>
                El icono del cuadrado con la flecha hacia arriba, en la barra
                inferior.
              </p>
            </li>
            <li>
              <h3>Elige «Añadir a pantalla de inicio»</h3>
              <p>
                Desliza por la lista de opciones hasta encontrarla. Confirma con
                <strong>Añadir</strong>.
              </p>
            </li>
            <li>
              <h3>Ábrela desde el icono</h3>
              <p>
                MAC aparece junto al resto de tus aplicaciones. Se abre a
                pantalla completa y mantiene tu sesión iniciada.
              </p>
            </li>
          </ol>
        </div>

        <p class="soon-note">
          La aplicación para iPhone llegará a la App Store más adelante.
          Mientras tanto, la instalación desde Safari ofrece la misma
          experiencia.
        </p>
      </div>
    {/if}


  </div>
</PublicShell>

<style>
  /* El ancho lo pone la variante `prose` del shell, centrada como en la
     documentación y en contacto. Fijarlo aquí dejaba la columna pegada al
     borde izquierdo mientras la cabecera y el pie ocupaban todo el ancho. */
  .install {
    display: grid;
    gap: var(--space-8);
  }

  .intro {
    display: grid;
    gap: var(--space-2);
  }

  .lead {
    margin: 0;
    max-width: 40rem;
    color: var(--text-muted);
    font-size: var(--text-lg);
    line-height: var(--leading-normal);
  }

  .tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--border);
  }

  .tabs button {
    /* 44px de alto: objetivo táctil cómodo en móvil. */
    min-height: 2.75rem;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding: 0 var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: color var(--motion-fast) var(--easing);
  }

  .tabs button.active {
    border-bottom-color: var(--accent);
    color: var(--text);
  }

  .panel-block {
    display: grid;
    gap: var(--space-8);
  }

  .download {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface);
    padding: var(--space-6);
  }

  .download h2 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-xl);
  }

  .meta {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }


  .steps {
    display: grid;
    gap: var(--space-6);
    margin: 0;
    padding-left: var(--space-6);
  }

  .steps h3 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-base);
  }

  .steps p {
    margin: 0;
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .recommended {
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    border-radius: var(--radius-card);
    background: var(--surface);
    padding: var(--space-6);
  }

  .tag {
    display: inline-block;
    margin: 0 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    padding: 0.2rem var(--space-3);
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 650;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .recommended h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-xl);
  }

  .primary-route {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    border-radius: var(--radius-card);
    background: var(--surface);
    padding: var(--space-6);
  }

  .primary-route h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .primary-route p,
  .soon p,
  .soon-note {
    margin: 0;
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .soon {
    border-top: 1px solid var(--border);
    padding-top: var(--space-6);
  }

  .soon h3 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-base);
  }

  .soon-note {
    border-top: 1px solid var(--border);
    padding-top: var(--space-6);
    font-size: var(--text-sm);
  }

  .recommended > p {
    margin: 0 0 var(--space-6);
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }





  .note {
    border-left: 3px solid var(--accent);
    padding: var(--space-3) var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  @media (max-width: 620px) {
    .download {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
