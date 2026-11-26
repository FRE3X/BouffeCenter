<script lang="ts">
  import { onMount } from 'svelte';
  import { icon } from '../lib/icons';

  let { tags = $bindable([]), kind }: { tags: string[]; kind: 'place' | 'recipe' | 'product' | 'wine' } = $props();
  let draft = $state('');
  let suggestions = $state<string[]>([]);
  const listId = `tags-${Math.random().toString(36).slice(2)}`;

  onMount(async () => {
    const res = await fetch(`/api/tags?kind=${kind}`);
    suggestions = ((await res.json()) as { tag: string }[]).map((t) => t.tag);
  });

  function add() {
    const value = draft.trim().replace(/^#/, '').toLowerCase();
    if (value && !tags.includes(value)) tags = [...tags, value];
    draft = '';
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      tags = tags.slice(0, -1);
    }
  }
</script>

<div class="tags-input">
  {#each tags as tag (tag)}
    <span class="tag">#{tag}<button type="button" aria-label={`Retirer le tag ${tag}`} onclick={() => (tags = tags.filter((t) => t !== tag))}>{@html icon('x', 14, 2.5)}</button></span>
  {/each}
  <input
    list={listId}
    bind:value={draft}
    {onkeydown}
    onblur={add}
    aria-label="Ajouter un tag"
    enterkeyhint="done"
    autocapitalize="none"
    placeholder={tags.length ? 'Autre tag…' : 'végé, rapide… (virgule ou Entrée)'}
  />
  <datalist id={listId}>
    {#each suggestions.filter((s) => !tags.includes(s)) as s}<option value={s}></option>{/each}
  </datalist>
</div>

<style>
  .tags-input {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
  }
  .tags-input:focus-within {
    border-color: var(--accent);
  }
  .tags-input input {
    flex: 1;
    min-width: 140px;
    border: 0 !important;
    padding: 4px !important;
    box-shadow: none !important;
    background: transparent !important;
  }
  .tag button {
    position: relative;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin: 0 -4px 0 2px;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
    padding: 0;
    color: inherit;
  }
  .tag button:hover {
    background: color-mix(in srgb, var(--ink) 10%, transparent);
  }
  /* 44px touch target around the small ✕. */
  .tag button::after {
    content: '';
    position: absolute;
    inset: -11px;
  }
  .tags-input input::placeholder {
    color: var(--muted);
    opacity: 1;
  }
</style>
