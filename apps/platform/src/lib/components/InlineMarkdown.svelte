<script lang="ts">
  import type { InlineToken } from "@cdor/markdown";
  import InlineMarkdown from "./InlineMarkdown.svelte";
  import MediaEmbed from "./MediaEmbed.svelte";

  let { tokens }: { tokens: InlineToken[] } = $props();
</script>

{#each tokens as token}
  {#if token.type === "text"}
    {token.value}
  {:else if token.type === "code"}
    <code>{token.value}</code>
  {:else if token.type === "strong"}
    <strong><InlineMarkdown tokens={token.children} /></strong>
  {:else if token.type === "emphasis"}
    <em><InlineMarkdown tokens={token.children} /></em>
  {:else if token.type === "strike"}
    <del><InlineMarkdown tokens={token.children} /></del>
  {:else if token.type === "image"}
    <MediaEmbed kind="image" src={token.src} title={token.alt} />
  {:else}
    <a href={token.href} target="_blank" rel="noopener noreferrer">
      <InlineMarkdown tokens={token.children} />
    </a>
  {/if}
{/each}
