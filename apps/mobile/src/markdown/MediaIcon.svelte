<script lang="ts" module>
  // Mismas rutas que apps/platform/src/lib/components/Icon.svelte.
  const PATHS = {
    play: "M7 4.5v11l9-5.5z",
    audio: "M8 15.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM16 13.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 15.5V5l8-1.5v10",
    video: "M3.5 5.5h8a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 2 13V7a1.5 1.5 0 0 1 1.5-1.5ZM13 8.5l5-2.5v8l-5-2.5",
    image: "M4 3.5h12A1.5 1.5 0 0 1 17.5 5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V5A1.5 1.5 0 0 1 4 3.5ZM2.5 13l4-4 3 3 2.5-2.5 5.5 5.5M13 7.5h.01",
    external: "M11 3.5h5.5V9M16.5 3.5 9 11M14 11.5v4a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"
  } as const;
  export type MediaIconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18 }: { name: MediaIconName; size?: number } = $props();
</script>

<svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" focusable="false">
  <path d={PATHS[name]} />
</svg>

<style>
  svg {
    flex: 0 0 auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
