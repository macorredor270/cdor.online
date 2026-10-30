<script lang="ts">
  import CodeBlock from "./CodeBlock.svelte";
  import { parseMarkdown } from "#lib/client/markdown.js";
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
    {:else if block.type === "rule"}
      <hr />
    {:else if block.type === "table"}
      <!-- La tabla se desplaza dentro de su marco: nunca ensancha la página. -->
      <div class="table-wrap" role="region" aria-label="Tabla" tabindex="0">
        <table>
          <thead>
            <tr>
              {#each block.header as cell, column}
                <th style:text-align={block.align[column]}><InlineMarkdown tokens={cell} /></th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each block.rows as row}
              <tr>
                {#each row as cell, column}
                  <td style:text-align={block.align[column]}><InlineMarkdown tokens={cell} /></td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
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

  .markdown {
    line-height: var(--leading-normal);
    overflow-wrap: anywhere;
  }

  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4) {
    margin-top: var(--space-6);
    line-height: var(--leading-snug);
  }

  .markdown :global(h2) {
    font-size: var(--text-xl);
  }

  .markdown :global(h3) {
    font-size: var(--text-lg);
  }

  .markdown :global(h4) {
    font-size: var(--text-base);
  }

  .markdown > :global(:first-child) {
    margin-top: 0;
  }

  .markdown :global(li + li) {
    margin-top: var(--space-1);
  }

  .markdown :global(li::marker) {
    color: var(--text-muted);
  }

  .markdown :global(p code),
  .markdown :global(li code),
  .markdown :global(td code),
  .markdown :global(blockquote code) {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
    padding: 0.06rem 0.32rem;
    font-size: 0.9em;
  }

  blockquote {
    border-left: 3px solid var(--accent);
    padding-left: var(--space-4);
    color: var(--text-muted);
    white-space: pre-wrap;
  }

  hr {
    height: 1px;
    margin: var(--space-6) 0;
    border: 0;
    background: var(--border);
  }

  .table-wrap {
    max-width: 100%;
    margin: 0 0 0.8rem;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }

  .table-wrap:last-child {
    margin-bottom: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    overflow-wrap: normal;
  }

  th,
  td {
    border-bottom: 1px solid var(--border);
    padding: var(--space-2) var(--space-3);
    text-align: left;
    vertical-align: top;
  }

  th {
    background: var(--surface-2);
    font-weight: 650;
    white-space: nowrap;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:nth-child(even) td {
    background: color-mix(in srgb, var(--surface-2) 45%, transparent);
  }
</style>
