<script lang="ts">
  import { tick } from 'svelte';
  import type { Ingredient } from '../lib/types';
  import { icon } from '../lib/icons';

  let { items = $bindable([]) }: { items: Ingredient[] } = $props();
  let list: HTMLUListElement;

  async function add(after = items.length - 1) {
    items = [...items.slice(0, after + 1), { qty: '', name: '' }, ...items.slice(after + 1)];
    await tick();
    list.querySelectorAll<HTMLInputElement>('input.qty')[after + 1]?.focus();
  }

  /** Runs a row action from its "⋯" menu, then closes the menu. */
  function act(e: Event, fn: () => void) {
    (e.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
    fn();
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


<!-- "⋯" menus close on a tap outside or on Escape. -->
<svelte:document
  onpointerdown={(e) => document.querySelectorAll<HTMLDetailsElement>('details.row-menu[open]').forEach((d) => !d.contains(e.target as Node) && (d.open = false))}
  onkeydown={(e) => e.key === 'Escape' && document.querySelectorAll<HTMLDetailsElement>('details.row-menu[open]').forEach((d) => (d.open = false))}
/>

<ul bind:this={list}>
  {#each items as item, i (i)}
    <li>
      <input class="qty" placeholder="200 g" bind:value={item.qty} aria-label={`Quantité, ingrédient ${i + 1}`} enterkeyhint="next" />
      <input
        class="name"
        placeholder="farine"
        bind:value={item.name}
        aria-label={`Ingrédient ${i + 1}`}
        enterkeyhint="next"
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), add(i))}
        onpaste={(e) => onpaste(e, i)}
      />
      <details class="row-menu">
        <summary aria-label={`Actions pour l'ingrédient ${i + 1}`}>{@html icon('more', 20)}</summary>
        <div class="menu">
          <button type="button" disabled={i === 0} onclick={(e) => act(e, () => move(i, -1))}>{@html icon('arrow-up', 16)} Monter</button>
          <button type="button" disabled={i === items.length - 1} onclick={(e) => act(e, () => move(i, 1))}>{@html icon('arrow-down', 16)} Descendre</button>
          <button type="button" class="danger" onclick={(e) => act(e, () => (items = items.filter((_, j) => j !== i)))}>{@html icon('trash', 16)} Retirer</button>
        </div>
      </details>
    </li>
  {/each}
</ul>
<button type="button" class="btn add" onclick={() => add()}>{@html icon('plus', 16)} Ingrédient</button>
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
  .name {
    flex: 1;
    min-width: 0;
  }
  .add {
    min-height: 44px;
  }
  .row-menu {
    position: relative;
    flex: none;
  }
  .row-menu summary {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    color: var(--muted);
    list-style: none;
    cursor: pointer;
  }
  .row-menu summary::-webkit-details-marker {
    display: none;
  }
  .row-menu[open] summary,
  .row-menu summary:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 170px;
    padding: 6px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .menu button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .menu .danger {
    color: var(--meh);
  }
  .hint {
    font-size: 0.8rem;
    margin: 8px 0 0;
  }
</style>
