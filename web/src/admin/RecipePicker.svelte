<script lang="ts">
  import { onMount } from 'svelte';
  import type { RecipeCard, RecipeList } from '../lib/types';
  import { iconBadge } from '../lib/icons';
  import { api } from './client.svelte';

  let { exclude = [], onpick, onclose }: { exclude?: number[]; onpick: (r: RecipeCard) => void; onclose?: () => void } = $props();

  let input: HTMLInputElement;
  let query = $state('');
  let results = $state<RecipeCard[]>([]);
  let active = $state(0);
  let timer: ReturnType<typeof setTimeout>;
  const id = `recipe-picker-${Math.random().toString(36).slice(2, 8)}`;

  async function load() {
    const params = new URLSearchParams({ drafts: 'true', limit: '8' });
    if (query.trim()) params.set('q', query.trim());
    const { items } = await api.get<RecipeList>(`/recipes?${params}`);
    results = items.filter((r) => !exclude.includes(r.id));
    active = 0;
  }

  function search() {
    clearTimeout(timer);
    timer = setTimeout(load, 180);
  }

  // ↑/↓ move through the suggestions, Enter picks one, Escape closes the picker.
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose?.();
    } else if (!results.length) {
      return;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onpick(results[active]);
    }
  }

  onMount(() => {
    input.focus();
    load();
  });
</script>

<div class="picker">
  <input
    bind:this={input}
    type="search"
    placeholder="Chercher une recette…"
    bind:value={query}
    oninput={search}
    {onkeydown}
    onblur={() => setTimeout(() => onclose?.(), 150)}
    role="combobox"
    aria-expanded={results.length > 0}
    aria-controls={id}
    aria-activedescendant={results.length ? `${id}-${active}` : undefined}
  />
  {#if results.length}
    <ul id={id} role="listbox">
      {#each results as r, i (r.id)}
        <li id="{id}-{i}" role="option" aria-selected={i === active}>
          <button type="button" tabindex="-1" class:active={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => onpick(r)} onmouseenter={() => (active = i)}>
            {#if r.cover}<img src={r.cover.sm} alt="" loading="lazy" />{:else}<span class="ph">{@html iconBadge(r.category?.icon ?? 'cooking-pot', 28)}</span>{/if}
            <span>{r.title}{#if !r.published}<small> · brouillon</small>{/if}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if query.trim()}
    <p class="muted none">Aucune recette.</p>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }
  input {
    width: 100%;
  }
  ul,
  .none {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: var(--shadow);
  }
  .none {
    padding: 10px;
    font-size: 0.85rem;
  }
  li button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  li button.active {
    background: var(--surface-2);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  img,
  .ph {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 30px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--surface-2);
  }
  small {
    color: var(--muted);
  }
</style>
