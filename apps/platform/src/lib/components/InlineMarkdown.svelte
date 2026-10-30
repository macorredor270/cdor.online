<script lang="ts">
  import type { InlineToken } from "#lib/client/markdown.js";

  let { tokens }: { tokens: InlineToken[] } = $props();
</script>

{#each tokens as token}
  {#if token.type === "text"}
    {token.value}
  {:else if token.type === "code"}
    <code>{token.value}</code>
  {:else if token.type === "strong"}
    <strong>{token.value}</strong>
  {:else if token.type === "emphasis"}
    <em>{token.value}</em>
  {:else}
    <a href={token.href} target="_blank" rel="noopener noreferrer">
      {token.value}
    </a>
  {/if}
{/each}
