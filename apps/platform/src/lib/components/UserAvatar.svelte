<script lang="ts">
  type Size = "sidebar" | "account";

  let {
    name,
    image = null,
    size = "sidebar"
  }: {
    name: string;
    image?: string | null;
    size?: Size;
  } = $props();

  let failedImage = $state<string | null>(null);
  let showImage = $derived(Boolean(image) && failedImage !== image);
  let initial = $derived(name.trim().slice(0, 1).toUpperCase() || "M");
</script>

<span class="user-avatar {size}">
  {#if showImage && image}
    <img
      src={image}
      alt={`Avatar de ${name}`}
      referrerpolicy="no-referrer"
      onerror={() => (failedImage = image)}
    />
  {:else}
    <span aria-hidden="true">{initial}</span>
  {/if}
</span>

<style>
  .user-avatar {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 800;
  }

  .sidebar {
    width: 1.9rem;
    height: 1.9rem;
    font-size: var(--text-sm);
  }

  .account {
    width: 3.3rem;
    height: 3.3rem;
    font-size: var(--text-lg);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
