<script lang="ts">
  import { onMount } from 'svelte';

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
    <span class="tag">#{tag}<button type="button" aria-label={`Retirer ${tag}`} onclick={() => (tags = tags.filter((t) => t !== tag))}>×</button></span>
  {/each}
  <input list={listId} bind:value={draft} {onkeydown} onblur={add} placeholder={tags.length ? '' : 'végé, terrasse… (Entrée pour ajouter)'} />
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
    border: 0;
    background: none;
    cursor: pointer;
    padding: 0 0 0 4px;
    color: inherit;
  }
</style>
