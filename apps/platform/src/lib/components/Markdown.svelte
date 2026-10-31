<script lang="ts">
  import { parseMarkdown } from "@cdor/markdown";
  import MarkdownBlocks from "./MarkdownBlocks.svelte";

  let { source }: { source: string } = $props();
  // Se vuelve a parsear en cada fragmento del streaming: la respuesta se ve
  // ya formateada mientras se escribe.
  let blocks = $derived(parseMarkdown(source));
</script>

<div class="markdown">
  <MarkdownBlocks {blocks} />
</div>

<style>
  .markdown {
    line-height: var(--leading-normal);
    overflow-wrap: anywhere;
  }

  .markdown :global(:is(p, ul, ol, blockquote, .table-wrap, h2, h3, h4, h5, h6)) {
    margin: 0 0 0.8rem;
  }

  .markdown :global(:is(p, ul, ol, blockquote, .table-wrap):last-child) {
    margin-bottom: 0;
  }

  .markdown :global(p) {
    white-space: pre-wrap;
  }

  .markdown :global(:is(h2, h3, h4, h5, h6)) {
    margin-top: var(--space-6);
    line-height: var(--leading-snug);
    letter-spacing: -0.01em;
  }

  .markdown > :global(:first-child) {
    margin-top: 0;
  }

  .markdown :global(.md-h1) {
    font-size: var(--text-xl);
  }

  .markdown :global(.md-h2) {
    font-size: var(--text-lg);
  }

  .markdown :global(:is(.md-h3, .md-h4)) {
    font-size: var(--text-base);
  }

  .markdown :global(:is(.md-h5, .md-h6)) {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .markdown :global(a) {
    color: var(--accent-strong);
    text-underline-offset: 0.18em;
  }

  .markdown :global(del) {
    color: var(--text-muted);
  }

  .markdown :global(code) {
    font-family: var(--font-mono);
  }

  .markdown :global(:is(p, li, td, th, blockquote, h2, h3, h4, h5, h6) code) {
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    background: var(--surface-2);
    padding: 0.06rem 0.32rem;
    font-size: 0.9em;
  }

  .markdown :global(:is(ul, ol)) {
    padding-left: 1.5rem;
  }

  /* Las sublistas y bloques dentro de un elemento van más pegados. */
  .markdown :global(li > :is(ul, ol, p, blockquote, .table-wrap)) {
    margin: var(--space-1) 0 0;
  }

  .markdown :global(li + li) {
    margin-top: var(--space-1);
  }

  .markdown :global(li::marker) {
    color: var(--text-muted);
  }

  .markdown :global(ul.tasks) {
    padding-left: 0.25rem;
    list-style: none;
  }

  .markdown :global(li.task) {
    position: relative;
    padding-left: 1.75rem;
  }

  .markdown :global(.checkbox) {
    position: absolute;
    top: 0.3em;
    left: 0;
    width: 1.05em;
    height: 1.05em;
    border: 1.5px solid var(--border-strong);
    border-radius: 4px;
  }

  .markdown :global(.checkbox.checked) {
    border-color: transparent;
    background: var(--mac-gradient);
  }

  .markdown :global(.checkbox.checked)::after {
    position: absolute;
    top: 0.12em;
    left: 0.32em;
    width: 0.28em;
    height: 0.55em;
    border-right: 2px solid var(--on-accent);
    border-bottom: 2px solid var(--on-accent);
    content: "";
    transform: rotate(45deg);
  }

  .markdown :global(blockquote) {
    border-left: 3px solid var(--accent);
    padding-left: var(--space-4);
    color: var(--text-muted);
  }

  .markdown :global(hr) {
    height: 1px;
    margin: var(--space-6) 0;
    border: 0;
    background: var(--border);
  }

  .markdown :global(.table-wrap) {
    max-width: 100%;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }

  .markdown :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    overflow-wrap: normal;
  }

  .markdown :global(:is(th, td)) {
    border-bottom: 1px solid var(--border);
    padding: var(--space-2) var(--space-3);
    text-align: left;
    vertical-align: top;
  }

  .markdown :global(th) {
    background: var(--surface-2);
    font-weight: 650;
    white-space: nowrap;
  }

  .markdown :global(tbody tr:last-child td) {
    border-bottom: 0;
  }

  .markdown :global(tbody tr:nth-child(even) td) {
    background: color-mix(in srgb, var(--surface-2) 45%, transparent);
  }
</style>
