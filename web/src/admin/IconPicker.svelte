<script lang="ts">
  import { DEFAULT_ICON, FOOD_ICONS, iconBadge } from '../lib/icons';

  let {
    value = $bindable(null),
    inherited,
    onchange,
  }: {
    value: string | null;
    /** When set, the picker offers "inherit" (null) and shows this icon for it. */
    inherited?: string;
    onchange?: (value: string | null) => void;
  } = $props();

  let open = $state(false);
  let root: HTMLDivElement;
  const shown = $derived(value ?? inherited ?? DEFAULT_ICON);

  function pick(next: string | null) {
    value = next;
    open = false;
    onchange?.(next);
  }
</script>

<svelte:window onclick={(e) => open && !root.contains(e.target as Node) && (open = false)} />

<div class="picker" bind:this={root}>
  <button type="button" class="current" onclick={() => (open = !open)} aria-expanded={open} aria-label="Choisir une icône">
    {@html iconBadge(shown, 32)}
    <span>{value === null && inherited !== undefined ? 'Icône de la catégorie' : FOOD_ICONS[shown]?.label ?? 'Couverts'}</span>
  </button>
  {#if open}
    <div class="grid" role="listbox">
      {#if inherited !== undefined}
        <button type="button" class="option wide" class:selected={value === null} onclick={() => pick(null)}>
          {@html iconBadge(inherited, 30)}<small>Catégorie</small>
        </button>
      {/if}
      {#each Object.entries(FOOD_ICONS) as [key, { label }] (key)}
        <button type="button" class="option" class:selected={value === key} title={label} aria-label={label} onclick={() => pick(key)}>
          {@html iconBadge(key, 34)}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }
  .current {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 5px 14px 5px 5px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    cursor: pointer;
    font-weight: 600;
  }
  .current:hover,
  .current[aria-expanded='true'] {
    border-color: var(--accent);
  }
  .grid {
    position: absolute;
    z-index: 40;
    top: calc(100% + 6px);
    left: 0;
    width: min(340px, 86vw);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 4px;
    padding: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: var(--shadow);
  }
  .option {
    display: grid;
    place-items: center;
    height: 44px;
    border: 2px solid transparent;
    border-radius: 12px;
    background: none;
    cursor: pointer;
  }
  .option:hover {
    background: var(--surface-2);
  }
  .option.selected {
    border-color: var(--accent);
  }
  .option.wide {
    grid-column: span 2;
    display: flex;
    gap: 6px;
    justify-content: center;
  }
</style>
