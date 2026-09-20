<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import Logo from "./Logo.svelte";

  /**
   * Shell único de la superficie pública.
   *
   * Antes había cuatro: `.landing-shell`, `.register-shell`, `.auth-page` y un
   * `main` pelado en las páginas legales, con cuatro anchos distintos, tres
   * estrategias de alto y tres tratamientos del logo. Esa fragmentación era la
   * causa de que la web no se pareciera a sí misma.
   *
   * Variantes:
   * - `split`   dos columnas (portada)
   * - `center`  tarjeta centrada (acceso, registro, recuperación)
   * - `prose`   documento legal ancho de lectura
   */
  type Variant = "split" | "center" | "prose" | "wide";

  let {
    variant = "center",
    title,
    children,
    aside
  }: {
    variant?: Variant;
    /** Nombre accesible del contenido principal. */
    title?: string;
    children: Snippet;
    /** Columna secundaria; solo se usa en la variante `split`. */
    aside?: Snippet;
  } = $props();

  const LINKS = [
    { href: "/docs", label: "Documentación" },
    { href: "/install", label: "Instalar" },
    { href: "/privacy", label: "Privacidad" },
    { href: "/terms", label: "Términos" },
    { href: "/contact", label: "Contacto" }
  ];

  const FOOTER_GROUPS = [
    {
      title: "Producto",
      links: [
        { href: "/chat", label: "Espacio de trabajo" },
        { href: "/docs", label: "Documentación" },
        { href: "/register", label: "Crear cuenta" },
        { href: "/install", label: "Instalar la app" }
      ]
    },
    {
      title: "Guías y recursos",
      links: [
        { href: "/docs#primeros-pasos", label: "Cómo empezar" },
        { href: "/docs#sistema-de-memorias", label: "Sistema de memorias" },
        { href: "/docs#sincronizacion-multi-dispositivo", label: "App móvil y sincronización" },
        { href: "/docs#atajos-de-teclado", label: "Atajos de teclado" }
      ]
    },
    {
      title: "Legal y soporte",
      links: [
        { href: "/privacy", label: "Privacidad" },
        { href: "/terms", label: "Términos" },
        { href: "/contact", label: "Contacto" }
      ]
    }
  ] as const;

  /**
   * Ruta actual dentro de la navegación pública.
   *
   * No basta con `aria-current`: la señal tiene que verse. Se marca con color,
   * peso y un filo inferior a la vez, para no depender solo del púrpura.
   */
  let current = $derived(page.url.pathname);
  let menuOpen = $state(false);

  function closeMenu() {
    menuOpen = false;
  }

  function handleWindowClick(event: MouseEvent) {
    if (!menuOpen) return;
    const target = event.target;
    if (target instanceof Element && !target.closest(".shell-header")) closeMenu();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") closeMenu();
  }

  function handleWindowResize() {
    if (window.innerWidth > 720) closeMenu();
  }
</script>

<svelte:window
  onclick={handleWindowClick}
  onkeydown={handleWindowKeydown}
  onresize={handleWindowResize}
/>

<div class="shell" class:landing-shell={variant === "split"}>
  <header class="shell-header">
    <a class="brand" href="/" aria-label="MAC, inicio">
      <Logo size="navbar" alt="" />
      <span>MAC</span>
    </a>
    <button
      class="nav-toggle"
      type="button"
      aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
      aria-expanded={menuOpen}
      aria-controls="public-navigation"
      onclick={(event) => {
        event.stopPropagation();
        menuOpen = !menuOpen;
      }}
    >
      {#if menuOpen}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      {/if}
    </button>
    <nav id="public-navigation" class:open={menuOpen} aria-label="Enlaces principales">
      <div class="nav-heading" aria-hidden="true">
        <span>Navegación</span>
        <small>Explora MAC</small>
      </div>
      {#each LINKS as link (link.href)}
        <a
          href={link.href}
          class:current={current === link.href}
          aria-current={current === link.href ? "page" : undefined}
          onclick={closeMenu}
        >
          <span>{link.label}</span>
          <svg class="nav-link-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </a>
      {/each}
    </nav>
  </header>

  <main class="shell-main {variant}" aria-label={title}>
    {#if variant === "split" && aside}
      <div class="split-primary">{@render children()}</div>
      <div class="split-secondary">{@render aside()}</div>
    {:else}
      {@render children()}
    {/if}
  </main>

  <footer class="shell-footer">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="brand" href="/" aria-label="MAC, inicio">
          <Logo size="navbar" alt="" />
          <span>MAC</span>
        </a>
        <p class="tagline">
          Tu espacio personal de conversaciones, ideas y contexto sincronizado.
        </p>
      </div>

      {#each FOOTER_GROUPS as group (group.title)}
        <div class="footer-col">
          <span class="col-title">{group.title}</span>
          {#each group.links as link (link.href)}
            <a href={link.href}>{link.label}</a>
          {/each}
        </div>
      {/each}
    </div>

    <div class="footer-mobile" role="navigation" aria-label="Enlaces del pie de página">
      {#each FOOTER_GROUPS as group (group.title)}
        <details>
          <summary>
            <span>{group.title}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m8 10 4 4 4-4" />
            </svg>
          </summary>
          <div class="mobile-links">
            {#each group.links as link (link.href)}
              <a href={link.href}>{link.label}</a>
            {/each}
          </div>
        </details>
      {/each}
    </div>

    <div class="footer-bottom">
      <span>© 2026 MAC. Conversaciones bajo tu control.</span>
      <span class="footer-domain">cdor.online</span>
    </div>
  </footer>
</div>

<style>
  .shell {
    /* Alto de la cabecera. Vive en una variable porque el alto mínimo del
       contenido depende de él y las dos medidas tienen que moverse juntas. */
    --header-height: 5.25rem;

    display: grid;
    /* La columna implícita de un grid es `auto`, que se dimensiona al
       max-content del hijo más ancho: la nav con enlaces sin partir inflaba el
       contenedor por encima del viewport y cortaba el texto en móvil.
       minmax(0, 1fr) le impide crecer más que el espacio disponible. */
    grid-template-columns: minmax(0, 1fr);
    background: var(--bg);
    color: var(--text);
  }

  .shell-header,
  .shell-main,
  .shell-footer {
    width: min(var(--width-wide), calc(100% - var(--space-8)));
    margin: 0 auto;
  }

  .shell-header {
    display: flex;
    min-height: var(--header-height);
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: inline-flex;
    flex: 0 0 auto;
    min-height: 44px;
    align-items: center;
    gap: var(--space-2);
    color: var(--text);
    font-size: var(--text-base);
    font-weight: 650;
    letter-spacing: 0.04em;
    text-decoration: none;
  }

  nav {
    display: flex;
    /* Sin min-width: 0 un hijo flex nunca baja de su contenido, y su
       overflow-x: auto no llega a activarse: es la cabecera la que se estira
       y arrastra 100 px de desbordamiento en móvil. */
    min-width: 0;
    gap: var(--space-6);
    overflow-x: auto;
    scrollbar-width: none;
  }

  nav::-webkit-scrollbar {
    display: none;
  }

  nav a {
    white-space: nowrap;
  }

  /* 44px de alto de zona pulsable. El texto sigue midiendo lo mismo: lo que
     crece es el área, que en móvil se tocaba con el dedo sobre 21px. */
  nav a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-decoration: none;
    transition: color var(--motion-fast) var(--easing);
  }

  nav a:hover {
    color: var(--text);
  }

  nav a.current {
    box-shadow: inset 0 -2px 0 var(--accent);
    color: var(--text);
    font-weight: 600;
  }

  .nav-toggle {
    display: none;
  }

  .nav-heading,
  .nav-link-icon {
    display: none;
  }

  /* El contenido ocupa por sí solo la primera pantalla, así que el pie
     empieza justo por debajo del pliegue y hay que desplazar para verlo.
     Antes el `1fr` estiraba esta fila hasta cuadrar los 100dvh entre los
     tres bloques, y el pie entraba entero en la primera vista. */
  .shell-main {
    min-height: calc(100dvh - var(--header-height));
    padding: var(--space-12) 0;
  }

  /* Las dos columnas arrancan en la misma línea. Centradas verticalmente, la
     tarjeta empezaba antes que la etiqueta y el titular, y el ojo buscaba una
     relación entre ambas que no existía. Y sin `align-content: start` la fila
     se estiraba a la altura de la pantalla, dejando una franja muerta antes
     del pie que parecía relleno. */
  .split {
    display: grid;
    /* La portada debe crecer con el hero y la tarjeta. La altura mínima del
       shell completo estaba reservando otra pantalla entera antes del pie,
       aunque el contenido real solo ocupase unos cientos de píxeles. */
    min-height: 0;
    align-content: start;
    align-items: start;
    gap: clamp(var(--space-8), 5vw, var(--space-12));
    grid-template-columns: minmax(0, 1fr) minmax(390px, 440px);
    padding: clamp(var(--space-6), 4vw, var(--space-8)) 0;
  }

  .split-primary,
  .split-secondary {
    min-width: 0;
    align-self: start;
  }

  .split-primary {
    align-self: stretch;
  }

  .split-secondary {
    width: 100%;
    justify-self: stretch;
  }

  .split-secondary :global(.auth-card) {
    width: 100%;
  }

  .center {
    display: grid;
    justify-items: center;
    align-content: center;
  }

  .prose {
    width: min(var(--width-prose), calc(100% - var(--space-8)));
  }

  .wide {
    width: min(var(--width-wide), calc(100% - var(--space-8)));
  }

  .shell-footer {
    border-top: 1px solid var(--border);
    padding: 2.2rem 1.5rem 1.2rem;
    margin-top: 3rem;
  }

  .landing-shell .shell-footer {
    margin-top: 0;
  }

  .footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: var(--space-6);
    margin-bottom: 1.5rem;
  }

  .footer-brand {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .tagline {
    max-width: 300px;
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .footer-col {
    display: flex;
    flex-direction: column;
  }

  .footer-mobile {
    display: none;
  }

  .col-title {
    color: var(--text);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.1rem;
  }

  /* El alto lo da la zona pulsable, no un `gap`: así el espacio entre enlaces
     forma parte del objetivo en vez de ser un pasillo muerto entre dos. */
  .footer-col a {
    display: flex;
    min-height: 44px;
    align-items: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-decoration: none;
    transition: color var(--motion-fast) var(--easing);
  }

  .footer-col a:hover {
    color: var(--text);
  }

  /* El margen inferior iguala al superior: antes la última línea parecía
     recortada por el borde de la ventana. */
  .footer-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
    padding-bottom: var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  @media (max-width: 860px) {
    .shell-header,
    .shell-main,
    .shell-footer,
    .prose,
    .wide {
      width: min(620px, calc(100% - var(--space-4)));
    }

    .split {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-8);
      align-items: stretch;
    }

    .split-secondary {
      width: 100%;
      justify-self: stretch;
    }

    .split-primary {
      width: 100%;
      align-self: start;
    }

    /* En móvil la cabecera es más baja; el alto mínimo del contenido la
       sigue para que el pie caiga igual justo bajo el pliegue. */
    .shell {
      --header-height: 4.5rem;
    }

    .shell-main {
      padding: var(--space-8) 0;
    }

    .footer-grid {
      grid-template-columns: 1fr 1fr;
      gap: var(--space-6);
    }

    .footer-brand {
      grid-column: 1 / -1;
    }

    .footer-bottom {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }
  }

  @media (max-width: 720px) {
    .shell-header {
      position: relative;
      z-index: 20;
    }

    .nav-toggle {
      display: inline-grid;
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
      place-items: center;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-2);
      color: var(--text);
      cursor: pointer;
      transition:
        border-color var(--motion-fast) var(--easing),
        background var(--motion-fast) var(--easing),
        transform var(--motion-fast) var(--easing);
    }

    .nav-toggle:hover {
      border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
      background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
    }

    .nav-toggle:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }

    .nav-toggle:active {
      transform: scale(0.96);
    }

    .nav-toggle svg {
      width: 1.35rem;
      height: 1.35rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }

    nav {
      position: absolute;
      z-index: 2;
      top: calc(100% + var(--space-2));
      right: 0;
      left: auto;
      display: flex;
      width: min(20rem, 100%);
      flex-direction: column;
      gap: 0;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      background: color-mix(in srgb, var(--surface) 94%, var(--bg));
      padding: var(--space-2);
      box-shadow: 0 1.25rem 3rem rgb(0 0 0 / 48%);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-0.5rem) scale(0.98);
      transform-origin: top right;
      visibility: hidden;
      transition:
        opacity var(--motion-fast) var(--easing),
        transform var(--motion-fast) var(--easing),
        visibility 0s linear var(--motion-fast);
    }

    nav.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
      visibility: visible;
      transition-delay: 0s;
    }

    .nav-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      border-bottom: 1px solid var(--border);
      padding: var(--space-2) var(--space-3) var(--space-3);
      color: var(--text);
      font-size: var(--text-sm);
      font-weight: 700;
    }

    .nav-heading small {
      color: var(--text-muted);
      font-size: var(--text-xs);
      font-weight: 500;
    }

    nav a {
      width: 100%;
      justify-content: space-between;
      gap: var(--space-3);
      padding: 0 var(--space-3);
      border-radius: var(--radius-sm);
      font-size: var(--text-base);
    }

    nav a:hover,
    nav a.current {
      background: color-mix(in srgb, var(--accent) 9%, transparent);
    }

    nav a.current {
      box-shadow: inset 3px 0 0 var(--accent);
      color: var(--accent-strong);
    }

    .nav-link-icon {
      display: block;
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 0.65;
    }

    .shell-footer {
      padding: var(--space-6) var(--space-2) var(--space-3);
    }

    .footer-grid {
      display: block;
      margin-bottom: var(--space-4);
    }

    .footer-grid .footer-col {
      display: none;
    }

    .footer-brand {
      gap: var(--space-1);
    }

    .tagline {
      max-width: 32ch;
    }

    .footer-mobile {
      display: grid;
      border-top: 1px solid var(--border);
    }

    .footer-mobile details {
      border-bottom: 1px solid var(--border);
    }

    .footer-mobile summary {
      display: flex;
      min-height: 3.25rem;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      color: var(--text);
      font-size: var(--text-xs);
      font-weight: 700;
      letter-spacing: 0.08em;
      list-style: none;
      text-transform: uppercase;
      cursor: pointer;
    }

    .footer-mobile summary::-webkit-details-marker {
      display: none;
    }

    .footer-mobile summary svg {
      width: 1.2rem;
      height: 1.2rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform var(--motion-fast) var(--easing);
    }

    .footer-mobile details[open] summary svg {
      transform: rotate(180deg);
    }

    .mobile-links {
      display: grid;
      padding-bottom: var(--space-3);
    }

    .mobile-links a {
      display: flex;
      min-height: 44px;
      align-items: center;
      color: var(--text-muted);
      font-size: var(--text-sm);
      text-decoration: none;
    }

    .mobile-links a:hover {
      color: var(--text);
    }

    .footer-bottom {
      padding: var(--space-4) 0 0;
      font-size: var(--text-xs);
      line-height: var(--leading-normal);
    }

    .footer-domain {
      display: none;
    }

    .shell-header {
      min-height: 4rem;
    }
  }
</style>
