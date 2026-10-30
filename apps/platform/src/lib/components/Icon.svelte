<script lang="ts" module>
  /**
   * Iconos de trazo de la interfaz, en una sola rejilla de 20×20.
   *
   * Antes cada SVG vivía en línea donde se usaba, con grosores y rejillas
   * distintos (16, 20 y 24) y el mismo icono copiado en varios sitios.
   */
  const PATHS = {
    plus: "M10 4.5v11M4.5 10h11",
    search: "M9 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM13.2 13.2 17 17",
    sidebar: "M4.5 3.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM8 3.5v13",
    docs: "M5 3.5h7a2.5 2.5 0 0 1 2.5 2.5v10.5h-7A2.5 2.5 0 0 1 5 14ZM7.5 13.5H14.5M8 7h4M8 10h4",
    temporary: "M10 3a7 7 0 0 1 0 14M10 3a7 7 0 0 0-5.5 11.3M6.7 16.2A7 7 0 0 0 10 17M10 6.5V10l2.2 1.5",
    pencil: "M13.5 3.5l3 3-8.5 8.5-3.5.5.5-3.5z",
    trash: "M4 6h12M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6",
    menu: "M3.5 6h13M3.5 10h13M3.5 14h13",
    close: "m5 5 10 10M15 5 5 15",
    more: "M5 10h.01M10 10h.01M15 10h.01",
    memory: "M10 3.5c-3 0-5 2-5 4.5 0 1.8 1 3 2.3 3.8V14h5.4v-2.2C14 11 15 9.8 15 8c0-2.5-2-4.5-5-4.5ZM8 16.5h4",
    usage: "M4 16V10M8.5 16V5M13 16v-4M16.5 16H3.5",
    settings: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10 2.5v2M10 15.5v2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M2.5 10h2M15.5 10h2M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4",
    account: "M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 17c.8-3 3.4-4.5 6.5-4.5s5.7 1.5 6.5 4.5",
    logout: "M8 4H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16h3M12 6.5 15.5 10 12 13.5M15.5 10H8",
    arrowDown: "M10 4v12M5 11l5 5 5-5"
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg
  class="icon"
  viewBox="0 0 20 20"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
>
  <path d={PATHS[name]} />
</svg>

<style>
  .icon {
    flex: 0 0 auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
