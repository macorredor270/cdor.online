<script lang="ts">
  import CodeBlock from "./CodeBlock.svelte";
  import { parseMarkdown } from "$lib/client/markdown";
  import InlineMarkdown from "./InlineMarkdown.svelte";

  let { source }: { source: string } = $props();
  let blocks = $derived(parseMarkdown(source));
</script>

<div class="markdown">
  {#each blocks as block}
    {#if block.type === "paragraph"}
      <p><InlineMarkdown tokens={block.content} /></p>
    {:else if block.type === "heading"}
      {#if block.level === 1}
        <h2><InlineMarkdown tokens={block.content} /></h2>
      {:else if block.level === 2}
        <h3><InlineMarkdown tokens={block.content} /></h3>
      {:else}
        <h4><InlineMarkdown tokens={block.content} /></h4>
      {/if}
    {:else if block.type === "code"}
      <CodeBlock language={block.language} value={block.value} />
    {:else if block.type === "quote"}
      <blockquote><InlineMarkdown tokens={block.content} /></blockquote>
    {:else if block.ordered}
      <ol>
        {#each block.items as item}<li><InlineMarkdown tokens={item} /></li>{/each}
      </ol>
    {:else}
      <ul>
        {#each block.items as item}<li><InlineMarkdown tokens={item} /></li>{/each}
      </ul>
    {/if}
  {/each}
</div>

<style>
  .markdown :global(p),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4),
  .markdown :global(ol),
  .markdown :global(ul),
  .markdown :global(blockquote) {
    margin: 0 0 0.8rem;
  }

  .markdown :global(p:last-child),
  .markdown :global(ol:last-child),
  .markdown :global(ul:last-child),
  .markdown :global(blockquote:last-child) {
    margin-bottom: 0;
  }

  .markdown :global(p) {
    white-space: pre-wrap;
  }

  .markdown :global(a) {
    color: var(--accent-strong);
  }

  .markdown :global(code) {
    font-family: var(--font-mono);
  }

  .markdown :global(p code) {
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: var(--surface-2);
    padding: 0.08rem 0.3rem;
  }




  blockquote {
    border-left: 3px solid var(--accent);
    padding-left: 0.85rem;
    color: var(--text-muted);
  }
</style>
