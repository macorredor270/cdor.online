<script lang="ts">
  import type { MarkdownBlock } from "@cdor/markdown";
  import CodeBlock from "./CodeBlock.svelte";
  import InlineMarkdown from "./InlineMarkdown.svelte";
  import MarkdownBlocks from "./MarkdownBlocks.svelte";
  import MediaEmbed from "./MediaEmbed.svelte";

  /** Pinta bloques ya parseados; se llama a sí mismo para citas y listas. */
  let { blocks }: { blocks: MarkdownBlock[] } = $props();
</script>

{#each blocks as block}
  {#if block.type === "paragraph"}
    <p><InlineMarkdown tokens={block.content} /></p>
  {:else if block.type === "heading"}
    <!-- El título de la página es el h1: los del modelo empiezan en h2. -->
    <svelte:element this={`h${Math.min(block.level + 1, 6)}`} class={`md-h${block.level}`}>
      <InlineMarkdown tokens={block.content} />
    </svelte:element>
  {:else if block.type === "code"}
    <CodeBlock language={block.language} value={block.value} />
  {:else if block.type === "quote"}
    <blockquote><MarkdownBlocks blocks={block.blocks} /></blockquote>
  {:else if block.type === "rule"}
    <hr />
  {:else if block.type === "media"}
    <MediaEmbed kind={block.kind} src={block.src} title={block.title} />
  {:else if block.type === "table"}
    <!-- La tabla se desplaza dentro de su marco: nunca ensancha la página.
         Es enfocable para poder desplazarla con el teclado (WCAG 2.1.1). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
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
  {:else}
    <svelte:element
      this={block.ordered ? "ol" : "ul"}
      start={block.ordered && block.start !== 1 ? block.start : undefined}
      class:tasks={block.items.some((item) => item.checked !== null)}
    >
      {#each block.items as item}
        <li class:task={item.checked !== null}>
          {#if item.checked !== null}
            <span class="checkbox" class:checked={item.checked} role="img"
              aria-label={item.checked ? "Hecho" : "Pendiente"}></span>
          {/if}
          <InlineMarkdown tokens={item.content} />
          {#if item.blocks.length}<MarkdownBlocks blocks={item.blocks} />{/if}
        </li>
      {/each}
    </svelte:element>
  {/if}
{/each}
