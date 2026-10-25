<script lang="ts">
  import { icon } from '../lib/icons';
  import { changeStock } from '../lib/products';

  /** − [n] + for members: optimistic, rapid clicks are merged into one request (see changeStock). */
  let {
    id,
    name,
    quantity = $bindable(0),
    size = 'md',
  }: { id: number; name: string; quantity?: number; size?: 'sm' | 'md' } = $props();

  function step(delta: number, e: Event) {
    // The stepper sits inside clickable cards: never open the product.
    e.preventDefault();
    e.stopPropagation();
    if (quantity + delta < 0) return;
    quantity += delta;
    changeStock(
      id,
      delta,
      (q) => (quantity = q),
      (unsaved) => (quantity = Math.max(0, quantity - unsaved)),
    );
  }
</script>

<div class="stepper {size}" class:empty={quantity === 0} role="group" aria-label={`Stock de ${name}`}>
  <button type="button" onclick={(e) => step(-1, e)} disabled={quantity === 0} aria-label={`Retirer un ${name}`}>
    {@html icon('minus', size === 'sm' ? 14 : 16, 2.5)}
  </button>
  <output aria-live="polite">{quantity}</output>
  <button type="button" onclick={(e) => step(1, e)} aria-label={`Ajouter un ${name}`}>{@html icon('plus', size === 'sm' ? 14 : 16, 2.5)}</button>
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    flex: none;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: 0 1px 2px rgb(31 27 22 / 0.06);
  }
  button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  button:disabled {
    color: var(--line);
    cursor: default;
  }
  output {
    min-width: 2ch;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .empty output {
    color: var(--muted);
  }
  .sm button {
    width: 30px;
    height: 30px;
  }
  .sm output {
    font-size: 0.9rem;
  }
</style>
