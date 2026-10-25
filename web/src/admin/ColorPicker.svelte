<script lang="ts">
  import { CATEGORY_COLORS } from '../lib/icons';

  let { value = $bindable(CATEGORY_COLORS[0]), onchange }: { value: string; onchange?: (value: string) => void } = $props();
</script>

<div class="swatches" role="radiogroup" aria-label="Couleur">
  {#each CATEGORY_COLORS as color (color)}
    <button
      type="button"
      role="radio"
      aria-checked={value.toLowerCase() === color.toLowerCase()}
      aria-label={color}
      style:background={color}
      onclick={() => ((value = color), onchange?.(color))}
    ></button>
  {/each}
</div>

<style>
  .swatches {
    display: grid;
    grid-template-columns: repeat(12, 22px);
    gap: 6px;
  }
  button {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
  }
  button[aria-checked='true'] {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }
  @media (max-width: 520px) {
    .swatches {
      grid-template-columns: repeat(6, 26px);
    }
    button {
      width: 26px;
      height: 26px;
    }
  }
</style>
