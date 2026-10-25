<script lang="ts">
  import { tick } from 'svelte';
  import type { Ingredient } from '../lib/types';

  let { items = $bindable([]) }: { items: Ingredient[] } = $props();
  let list: HTMLUListElement;

  async function add(after = items.length - 1) {
    items = [...items.slice(0, after + 1), { qty: '', name: '' }, ...items.slice(after + 1)];
    await tick();
    list.querySelectorAll<HTMLInputElement>('input.qty')[after + 1]?.focus();
  }

  function move(i: number, delta: number) {
    const next = [...items];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item);
    items = next;
  }

  /** Pasting several lines ("200 g farine") creates one ingredient per line. */
  function onpaste(e: ClipboardEvent, i: number) {
    const text = e.clipboardData?.getData('text') ?? '';
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const parsed = lines.map((line) => {
      const m = line.match(/^([\d.,/½¼¾]+\s*(?:g|kg|ml|cl|l|c\.? ?à ?[sc]\.?|cs|cc|pincée|tasses?|sachets?|gousses?|tranches?)?\b)\s*(?:de |d')?(.*)$/i);
      return m ? { qty: m[1].trim(), name: m[2].trim() } : { qty: '', name: line };
    });
    const empty = !items[i].qty && !items[i].name;
    items = [...items.slice(0, empty ? i : i + 1), ...parsed, ...items.slice(i + 1)];
  }
</script>

<ul bind:this={list}>
  {#each items as item, i (i)}
    <li>
      <input class="qty" placeholder="200 g" bind:value={item.qty} />
      <input
        placeholder="farine"
        bind:value={item.name}
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), add(i))}
        onpaste={(e) => onpaste(e, i)}
      />
      <button type="button" class="btn small" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Monter">↑</button>
      <button type="button" class="btn small" disabled={i === items.length - 1} onclick={() => move(i, 1)} aria-label="Descendre">↓</button>
      <button type="button" class="btn small danger" onclick={() => (items = items.filter((_, j) => j !== i))} aria-label="Retirer">✕</button>
    </li>
  {/each}
</ul>
<button type="button" class="btn small" onclick={() => add()}>+ Ingrédient</button>
<p class="muted hint">Astuce : colle une liste entière, une ligne par ingrédient.</p>

<style>
  ul {
    list-style: none;
    padding: 0;
    margin: 0 0 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  li input {
    padding: 7px 10px !important;
  }
  .qty {
    width: 90px !important;
    flex: none;
  }
  li .btn {
    padding: 4px 8px;
    flex: none;
  }
  .hint {
    font-size: 0.8rem;
    margin: 8px 0 0;
  }
</style>
