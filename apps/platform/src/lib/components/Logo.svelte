<script lang="ts">
  /**
   * Isotipo de MAC. Punto único de integración de la marca: cambiar aquí el
   * asset lo cambia en toda la interfaz.
   *
   * `branding/mac-logo.png` es el original sin tocar. Las variantes son
   * escalados proporcionales suyos y existen por peso: el máster pesa 1,5 MiB
   * y sería absurdo descargarlo para pintar 36 px. El navegador elige con
   * `srcset` según la ranura y la densidad de pantalla.
   */
  const MASTER = "/branding/mac-logo.png";
  const SRCSET = [
    "/branding/mac-logo-96.png 96w",
    "/branding/mac-logo-256.png 256w",
    "/branding/mac-512.png 512w"
  ].join(", ");

  type Size = "navbar" | "sidebar" | "auth" | "hero" | "avatar";

  /** Ancho de la ranura, para que el navegador no descargue de más. */
  const SIZES: Record<Size, string> = {
    navbar: "36px",
    sidebar: "40px",
    auth: "72px",
    avatar: "28px",
    hero: "clamp(96px, 12vw, 160px)"
  };

  let {
    size = "navbar",
    /**
     * Texto alternativo. Cadena vacía cuando el logo acompaña al nombre
     * escrito al lado y por tanto es decorativo.
     */
    alt = "MAC, asistente virtual de inteligencia artificial",
    class: className = ""
  }: {
    size?: Size;
    alt?: string;
    class?: string;
  } = $props();
</script>

<img
  src={MASTER}
  {alt}
  class="mac-logo {size} {className}"
  width="1024"
  height="1024"
  decoding="async"
  loading={size === "hero" || size === "auth" ? "eager" : "lazy"}
/>

<style>
  /* object-fit: contain en todas las variantes: el isotipo nunca se deforma
     ni se recorta, sea cual sea la caja que lo contiene. */
  .mac-logo {
    display: block;
    object-fit: contain;
  }

  .navbar {
    width: 36px;
    height: 36px;
  }

  .sidebar {
    width: 40px;
    height: 40px;
  }

  .auth {
    width: 72px;
    height: 72px;
  }

  .avatar {
    width: 28px;
    height: 28px;
  }

  .hero {
    width: clamp(96px, 12vw, 160px);
    height: auto;
  }

  @media (max-width: 620px) {
    .auth {
      width: 56px;
      height: 56px;
    }
  }
</style>
