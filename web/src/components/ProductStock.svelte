<script lang="ts">
  import { onMount } from 'svelte';
  import type { Product } from '../lib/types';
  import { euros } from '../lib/format';
  import { onMember } from '../lib/member';
  import StockStepper from './StockStepper.svelte';

  /** Members-only block of a product page: the stock (and, for wines, where it is and what it cost). Visitors get nothing. */
  let { id, name }: { id: number; name: string } = $props();
  let product = $state<Product | null>(null);

  onMount(() =>
    onMember(async () => {
      const res = await fetch(`/api/products/${id}`);
      if (res.ok) product = await res.json();
    }),
  );
</script>

{#if product && product.quantity !== undefined}
  <div class="stock">
    <div>
      <strong>En stock</strong>
      <span class:out={product.quantity === 0}>{product.quantity === 0 ? 'Plus en stock' : `${product.quantity} à la maison`}</span>
    </div>
    <StockStepper {id} {name} bind:quantity={product.quantity} />
  </div>
  {#if product.location || product.purchase_price_cents}
    <p class="private">
      {#if product.location}Emplacement : <strong>{product.location}</strong>{/if}
      {#if product.location && product.purchase_price_cents}·{/if}
      {#if product.purchase_price_cents}Acheté {euros(product.purchase_price_cents)}{/if}
    </p>
  {/if}
{/if}

<style>
  .stock {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px 12px 18px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .stock div {
    display: flex;
    flex-direction: column;
  }
  .stock span {
    color: var(--good);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .stock span.out {
    color: var(--muted);
  }
  .private {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
