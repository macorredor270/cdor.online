<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import UserAvatar from "#lib/components/UserAvatar.svelte";

  let {
    user,
    onsignout
  }: {
    user: { name: string; email: string; image: string | null };
    onsignout: () => void;
  } = $props();

  const LINKS: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
    { href: "/memories", label: "Memorias", icon: "memory" },
    { href: "/usage", label: "Uso", icon: "usage" },
    { href: "/settings", label: "Ajustes", icon: "settings" },
    { href: "/account", label: "Cuenta", icon: "account" }
  ];

  let open = $state(false);
  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;

  afterNavigate(() => {
    open = false;
  });

  function onWindowPointer(event: PointerEvent) {
    if (open && !root.contains(event.target as Node)) open = false;
  }

  function onWindowKey(event: KeyboardEvent) {
    if (open && event.key === "Escape") {
      open = false;
      trigger.focus();
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointer} onkeydown={onWindowKey} />

<div class="account" class:open bind:this={root}>
  {#if open}
    <div class="menu" role="menu" aria-label="Cuenta y configuración">
      <div class="identity">
        <strong>{user.name}</strong>
        <span>{user.email}</span>
      </div>
      {#each LINKS as link (link.href)}
        <a href={link.href} role="menuitem">
          <Icon name={link.icon} size={17} />
          {link.label}
        </a>
      {/each}
      <hr />
      <button type="button" role="menuitem" onclick={onsignout}>
        <Icon name="logout" size={17} />
        Cerrar sesión
      </button>
    </div>
  {/if}

  <button
    class="profile"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    bind:this={trigger}
    onclick={() => (open = !open)}
  >
    <UserAvatar name={user.name} image={user.image} size="sidebar" />
    <span class="who">{user.name}</span>
    <Icon name="more" size={18} />
  </button>
</div>

<style>
  .account {
    position: relative;
  }

  .menu {
    position: absolute;
    z-index: 2;
    right: 0;
    bottom: calc(100% + var(--space-2));
    left: 0;
    display: grid;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-2);
    padding: var(--space-1);
    box-shadow: var(--shadow);
    transform-origin: bottom center;
    animation: menu-in var(--motion-fast) var(--easing-out);
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
  }

  .identity {
    display: grid;
    gap: 0.1rem;
    padding: var(--space-2) var(--space-3) var(--space-3);
  }

  .identity strong,
  .identity span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity strong {
    font-size: var(--text-sm);
  }

  .identity span {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  hr {
    width: calc(100% - var(--space-4));
    height: 1px;
    margin: var(--space-1) auto;
    border: 0;
    background: var(--border);
  }

  .menu a,
  .menu button {
    display: flex;
    min-height: 2.5rem;
    align-items: center;
    gap: var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 0 var(--space-3);
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .menu a:hover,
  .menu a:focus-visible,
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--surface-3);
    color: var(--text);
  }

  .profile {
    display: grid;
    width: 100%;
    min-height: 2.75rem;
    align-items: center;
    gap: var(--space-3);
    grid-template-columns: auto minmax(0, 1fr) auto;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    padding: 0 var(--space-2) 0 var(--space-1);
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
    transition: background var(--motion-fast) var(--easing);
  }

  .profile:hover,
  .account.open .profile {
    background: var(--surface-2);
  }

  .who {
    overflow: hidden;
    color: var(--text);
    font-size: var(--text-sm);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
