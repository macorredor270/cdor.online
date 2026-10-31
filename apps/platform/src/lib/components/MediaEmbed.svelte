<script lang="ts">
  import type { MediaKind } from "@cdor/markdown";
  import Icon from "./Icon.svelte";

  /**
   * Reproductor de audio, vídeo o imagen enlazado por el modelo.
   *
   * Un recurso externo no se carga solo: pedirlo revela la IP del usuario a
   * ese servidor, y una respuesta manipulada por inyección de prompt podría
   * esconder datos de la conversación en la URL. Se muestra de dónde viene y
   * se carga al pulsar. Los recursos del propio dominio cargan directamente.
   *
   * Todo son elementos en línea (`span`, `button`, `audio`, `video`, `img`)
   * para que el componente sea válido también dentro de un párrafo.
   */
  let { kind, src, title = "" }: { kind: MediaKind; src: string; title?: string } =
    $props();

  const LABELS: Record<MediaKind, { noun: string; action: string }> = {
    audio: { noun: "audio", action: "Reproducir audio" },
    video: { noun: "vídeo", action: "Reproducir vídeo" },
    image: { noun: "imagen", action: "Mostrar imagen" }
  };

  const url = $derived(new URL(src));
  const fileName = $derived(
    decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? url.hostname)
  );
  const label = $derived(title && title !== src ? title : fileName);
  const trusted = $derived(
    typeof location !== "undefined" && url.origin === location.origin
  );
  // Un http:// en una página https:// lo bloquea el navegador (contenido mixto).
  const embeddable = $derived(url.protocol === "https:" || trusted);

  let requested = $state(false);
  let failed = $state(false);
  const loaded = $derived((trusted || requested) && embeddable && !failed);
</script>

<span class="media" data-kind={kind}>
  {#if loaded}
    {#if kind === "audio"}
      <span class="player audio-player">
        <span class="caption"><Icon name="audio" size={16} />{label}</span>
        <audio controls preload="metadata" {src} onerror={() => (failed = true)}>
          <a href={src} target="_blank" rel="noopener noreferrer">{label}</a>
        </audio>
      </span>
    {:else if kind === "video"}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        class="player"
        controls
        playsinline
        preload="metadata"
        {src}
        title={label}
        onerror={() => (failed = true)}
      ></video>
    {:else}
      <a class="image-link" href={src} target="_blank" rel="noopener noreferrer">
        <img
          {src}
          alt={title || fileName}
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          onerror={() => (failed = true)}
        />
      </a>
    {/if}
  {:else}
    <span class="card">
      <span class="kind-icon"><Icon name={kind} size={20} /></span>
      <span class="meta">
        <strong title={label}>{label}</strong>
        <small>
          {#if failed}
            No se pudo cargar este {LABELS[kind].noun}.
          {:else if !embeddable}
            Enlace sin cifrar: ábrelo en una pestaña nueva.
          {:else}
            {LABELS[kind].noun[0].toUpperCase() + LABELS[kind].noun.slice(1)} de {url.hostname}
          {/if}
        </small>
      </span>
      <span class="actions">
        {#if embeddable && !failed}
          <button type="button" class="load" onclick={() => (requested = true)}>
            <Icon name="play" size={14} />
            {LABELS[kind].action}
          </button>
        {/if}
        <a
          class="open"
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir ${label} en una pestaña nueva`}
        >
          <Icon name="external" size={16} />
        </a>
      </span>
    </span>
  {/if}
</span>

<style>
  .media {
    display: block;
    max-width: 100%;
    margin: var(--space-3) 0;
  }

  .card {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    padding: var(--space-3);
  }

  .kind-icon {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent-strong);
  }

  .meta {
    display: grid;
    min-width: 0;
    flex: 1 1 10rem;
    gap: 0.1rem;
  }

  .meta strong {
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta small {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .load {
    display: inline-flex;
    min-height: 2.25rem;
    align-items: center;
    gap: var(--space-2);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    padding: 0 var(--space-3);
    color: var(--text);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--motion-fast) var(--easing);
  }

  .load:hover {
    background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  }

  .open {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    place-items: center;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }

  .open:hover,
  .open:focus-visible {
    background: var(--surface-3);
    color: var(--text);
  }

  .player {
    display: block;
    width: 100%;
    animation: mac-fade var(--motion-base) var(--easing);
  }

  video.player {
    max-height: 28rem;
    border-radius: var(--radius-control);
    background: #000;
  }

  .audio-player {
    display: grid;
    gap: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    padding: var(--space-3);
  }

  .caption {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: var(--space-2);
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  audio {
    width: 100%;
  }

  .image-link {
    display: inline-block;
    max-width: 100%;
  }

  img {
    display: block;
    max-width: 100%;
    max-height: 32rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    animation: mac-fade var(--motion-base) var(--easing);
  }
</style>
