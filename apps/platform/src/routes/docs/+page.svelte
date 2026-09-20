<script lang="ts">
  import PublicShell from "$lib/components/PublicShell.svelte";

  /**
   * Índice de la documentación.
   *
   * Los identificadores son también los anclajes que enlaza el pie del shell,
   * así que viven en un solo sitio: si cambia uno, cambia el enlace.
   *
   * No van numerados a propósito. Esto no es un procedimiento que se recorra
   * en orden, es material de consulta: quien llega buscando cómo revocar un
   * móvil no necesita saber que eso es "el paso 4".
   */
  const sections = [
    { id: "primeros-pasos", title: "Primeros pasos" },
    { id: "espacio-de-trabajo", title: "El espacio de trabajo" },
    { id: "sistema-de-memorias", title: "Memorias" },
    { id: "sincronizacion-multi-dispositivo", title: "Sincronización entre dispositivos" },
    { id: "atajos-de-teclado", title: "Atajos de teclado" },
    { id: "seguridad", title: "Seguridad y datos" }
  ];
</script>

<svelte:head>
  <title>Documentación — MAC</title>
  <meta
    name="description"
    content="Cómo usar MAC: crear la cuenta, organizar conversaciones, memorias, sincronizar el móvil con la web, atajos y qué se hace con tus datos."
  />
  <link rel="canonical" href="https://cdor.online/docs" />
</svelte:head>

<PublicShell variant="prose" title="Documentación">
  <header class="page-header">
    <p class="eyebrow">Documentación</p>
    <h1 class="page-title">Cómo funciona MAC</h1>
    <p class="lead">
      Lo que necesitas saber para usar la cuenta, el espacio de trabajo y la
      sincronización con el móvil. Si algo no está aquí,
      <a href="/contact">escríbenos</a>.
    </p>
  </header>

  <nav class="toc" aria-label="Índice de la documentación">
    <ul>
      {#each sections as section}
        <li><a href={`#${section.id}`}>{section.title}</a></li>
      {/each}
    </ul>
  </nav>

  <section id="primeros-pasos" class="block">
    <h2>Primeros pasos</h2>
    <p>
      Crea la cuenta en <a href="/register">registro</a> con tu correo y una
      contraseña. Te llega un enlace para confirmar que la dirección es tuya; sin
      confirmarla no se puede entrar. Si no aparece, revisa el spam o
      <a href="/verify-email">pide otro enlace</a>: caduca en una hora.
    </p>
    <p>
      Al entrar por primera vez llegas a un espacio vacío. La primera
      conversación la creas escribiendo.
    </p>
    <p class="callout">
      Cada inicio de sesión guarda la sesión en una cookie que el JavaScript de
      la página no puede leer. No hace falta que hagas nada, pero conviene
      saberlo: si compartes el equipo, cierra sesión al terminar.
    </p>
  </section>

  <section id="espacio-de-trabajo" class="block">
    <h2>El espacio de trabajo</h2>
    <p>
      Cada conversación es un hilo independiente con su propio contexto. Lo que
      digas en una no se filtra a las demás.
    </p>
    <dl>
      <div>
        <dt>Crear un hilo</dt>
        <dd>
          <strong>Nueva conversación</strong> en la barra lateral. El título se
          genera solo con el primer mensaje y puedes cambiarlo después.
        </dd>
      </div>
      <div>
        <dt>Respuestas en directo</dt>
        <dd>
          El texto va apareciendo mientras se genera. Puedes cortarlo en
          cualquier momento; lo escrito hasta ese punto se guarda.
        </dd>
      </div>
      <div>
        <dt>Código</dt>
        <dd>
          Los bloques de código salen con los colores del lenguaje y un botón
          para copiarlos enteros.
        </dd>
      </div>
    </dl>
  </section>

  <section id="sistema-de-memorias" class="block">
    <h2>Memorias</h2>
    <p>
      Una memoria es un dato que quieres que MAC recuerde entre conversaciones,
      para no repetirlo cada vez. No se guarda nada sin que tú lo pidas.
    </p>
    <dl>
      <div>
        <dt>Ver qué recuerda</dt>
        <dd>
          Todo lo guardado está en <a href="/memories">Memorias</a>, en texto
          plano y legible. No hay nada oculto detrás.
        </dd>
      </div>
      <div>
        <dt>Corregir</dt>
        <dd>Puedes editar cualquier memoria; el cambio se aplica al momento.</dd>
      </div>
      <div>
        <dt>Borrar</dt>
        <dd>
          Al eliminarla desaparece de la base de datos. No queda copia ni
          papelera.
        </dd>
      </div>
    </dl>
  </section>

  <section id="sincronizacion-multi-dispositivo" class="block">
    <h2>Sincronización entre dispositivos</h2>
    <p>
      La misma cuenta vale para el navegador y para la app. Las conversaciones
      son las mismas en los dos sitios; cada dispositivo se vincula por separado
      y se puede revocar por separado.
    </p>

    <div class="table-scroll">
      <table>
        <caption class="sr-only">
          Comportamiento de la sesión en cada plataforma
        </caption>
        <thead>
          <tr>
            <th scope="col">Dónde</th>
            <th scope="col">Cuándo sincroniza</th>
            <th scope="col">Cómo se retira el acceso</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Navegador</th>
            <td>Al momento</td>
            <td>Revocar desde Cuenta</td>
          </tr>
          <tr>
            <th scope="row">Android</th>
            <td>Al recuperar conexión</td>
            <td>Revocar desde Cuenta, sin tocar el móvil</td>
          </tr>
          <tr>
            <th scope="row">iOS</th>
            <td>Al recuperar conexión</td>
            <td>Revocar desde Cuenta, sin tocar el móvil</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="callout warning">
      Si pierdes un móvil, entra en <a href="/account">Cuenta</a> y pulsa
      <strong>Revocar</strong> en ese dispositivo. Sus sesiones caen de
      inmediato, aunque el aparato ya no esté en tu poder. Tus conversaciones no
      se borran.
    </p>

    <p>
      La app de Android se descarga desde <a href="/install">Instalar</a>.
    </p>
  </section>

  <section id="atajos-de-teclado" class="block">
    <h2>Atajos de teclado</h2>
    <table class="shortcuts">
      <caption class="sr-only">Atajos disponibles</caption>
      <tbody>
        <tr>
          <th scope="row"><kbd>Enter</kbd></th>
          <td>Enviar el mensaje</td>
        </tr>
        <tr>
          <th scope="row"><kbd>Shift</kbd> + <kbd>Enter</kbd></th>
          <td>Salto de línea sin enviar</td>
        </tr>
        <tr>
          <th scope="row"><kbd>Enter</kbd></th>
          <td>Guardar el título al renombrar una conversación</td>
        </tr>
        <tr>
          <th scope="row"><kbd>Esc</kbd></th>
          <td>Cancelar el renombrado o cerrar un diálogo</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section id="seguridad" class="block">
    <h2>Seguridad y datos</h2>
    <dl>
      <div>
        <dt>En tránsito</dt>
        <dd>
          Todo el tráfico va por HTTPS. El navegador se niega a cargar el sitio
          sin cifrar aunque escribas la dirección a mano.
        </dd>
      </div>
      <div>
        <dt>Credenciales</dt>
        <dd>
          Las claves del servidor y de la base de datos viven solo en el
          servidor. Nunca llegan al navegador ni a la app.
        </dd>
      </div>
      <div>
        <dt>Tus datos</dt>
        <dd>
          Puedes borrar la cuenta entera desde <a href="/account">Cuenta</a>: se
          van conversaciones, mensajes, memorias, dispositivos y preferencias, sin
          copia de recuperación. El detalle está en la
          <a href="/privacy">política de privacidad</a>.
        </dd>
      </div>
    </dl>
  </section>

  <p class="closing">
    ¿Falta algo o algo no encaja con lo que ves?
    <a href="/contact">Cuéntanoslo</a>.
  </p>
</PublicShell>

<style>
  .lead {
    max-width: 60ch;
    margin: 0;
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .lead a,
  .block a,
  .closing a {
    color: var(--accent-strong);
  }

  .toc {
    margin: var(--space-8) 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: var(--space-4) 0;
  }

  /* Columnas CSS, no grid: el grid coloca por filas y la lista se leería
     1-2 / 3-4 / 5-6 en horizontal, cuando el ojo baja por la columna. */
  .toc ul {
    columns: 2;
    column-gap: var(--space-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* 44px de zona pulsable: el enlace medía 17px de alto y era el objetivo más
     pequeño de la página. El texto no cambia de tamaño. */
  .toc a {
    display: flex;
    min-height: 44px;
    align-items: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    text-decoration: none;
  }

  .toc a:hover {
    color: var(--text);
    text-decoration: underline;
  }

  .block {
    margin-top: var(--space-12);
    /* El ancla queda debajo del borde superior si el navegador salta justo al
       título; este margen se lo devuelve. */
    scroll-margin-top: var(--space-6);
  }

  .block h2 {
    margin: 0 0 var(--space-4);
    font-size: var(--text-xl);
    font-weight: 620;
    letter-spacing: -0.02em;
  }

  .block p {
    max-width: 68ch;
    margin: 0 0 var(--space-4);
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .block dl {
    display: grid;
    gap: var(--space-4);
    margin: 0;
  }

  .block dt {
    color: var(--text);
    font-weight: 650;
  }

  .block dd {
    max-width: 68ch;
    margin: var(--space-1) 0 0;
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  /* Aviso: se distingue por el filo lateral, no solo por el color, para que
     siga leyéndose como aviso sin distinguir tonos. */
  .callout {
    border-left: 3px solid var(--info);
    padding-left: var(--space-4);
  }

  .callout.warning {
    border-left-color: var(--warning);
  }

  .table-scroll {
    overflow-x: auto;
    margin-bottom: var(--space-4);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  th,
  td {
    border-bottom: 1px solid var(--border);
    padding: var(--space-3) var(--space-4) var(--space-3) 0;
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    vertical-align: top;
  }

  thead th {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    white-space: nowrap;
  }

  tbody th {
    color: var(--text);
    font-weight: 650;
    white-space: nowrap;
  }

  tbody td {
    color: var(--text-muted);
  }

  .shortcuts tbody th {
    width: 1%;
    padding-right: var(--space-6);
  }

  kbd {
    display: inline-block;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    padding: 0.15rem 0.45rem;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .closing {
    margin: var(--space-12) 0 0;
    border-top: 1px solid var(--border);
    padding-top: var(--space-6);
    color: var(--text-muted);
  }
</style>
