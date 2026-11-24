<script lang="ts">
  import { onMount } from 'svelte';
  import type { Product, ProductList, RecipeList } from '../lib/types';
  import { iconBadge } from '../lib/icons';
  import { productHref, productSubtitle } from '../lib/products';
  import RecipeCard from './RecipeCard.svelte';
  import { isMember, onMember } from '../lib/member';

  let { initial, tags, initialTags = [] }: { initial: RecipeList; tags: { tag: string; count: number }[]; initialTags?: string[] } =
    $props();

  let list = $state(initial);
  let query = $state('');
  // Several tags can be combined: a recipe must carry all of them.
  let selectedTags = $state<string[]>(initialTags);
  let loading = $state(false);
  let member = $state(false);
  // Keyboard selection from the search field: ↑/↓ to move, Entrée to open.
  let activeIndex = $state(-1);
  let relatedProducts = $state<Product[]>([]);
  let requestId = 0;

  async function load(append = false) {
    const id = ++requestId;
    loading = true;
    const params = new URLSearchParams({ limit: '24', offset: append ? String(list.items.length) : '0' });
    if (query.trim()) params.set('q', query.trim());
    if (selectedTags.length) params.set('tag', selectedTags.join(','));
    const q = query.trim();
    // Products and wines matching the search (sections closed to the visitor are left out by the API).
    const related = !append && q.length >= 2 ? fetch(`/api/products?limit=4&q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
    const res = await fetch(`/api/recipes?${params}`);
    const data: RecipeList = await res.json();
    const products = (await related) as ProductList | null;
    if (id !== requestId) return;
    if (!append) relatedProducts = products?.items ?? [];
    list = append ? { ...data, items: [...list.items, ...data.items] } : data;
    loading = false;

    const url = new URL(location.href);
    query.trim() ? url.searchParams.set('q', query.trim()) : url.searchParams.delete('q');
    selectedTags.length ? url.searchParams.set('tag', selectedTags.join(',')) : url.searchParams.delete('tag');
    history.replaceState(null, '', url);
  }

  function toggleTag(t: string | null) {
    selectedTags = t === null ? [] : selectedTags.includes(t) ? selectedTags.filter((x) => x !== t) : [...selectedTags, t];
    load();
  }

  // Fade the edges of the chip row while there is more to scroll that way.
  function scrollFade(node: HTMLElement) {
    const update = () => {
      node.classList.toggle('more-start', node.scrollLeft > 4);
      node.classList.toggle('more-end', node.scrollLeft + node.clientWidth < node.scrollWidth - 4);
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return { destroy: () => (node.removeEventListener('scroll', update), observer.disconnect()) };
  }

  onMount(() => {
    const input = document.getElementById('site-search') as HTMLInputElement | null;
    let timer: ReturnType<typeof setTimeout>;
    member = isMember();
    onMember(() => (member = true));
    const onInput = () => {
      clearTimeout(timer);
      activeIndex = -1;
      timer = setTimeout(() => {
        query = input!.value;
        load();
      }, 180);
    };
    // ↑/↓ go through the recipe cards, then the related products.
    const onKey = (e: KeyboardEvent) => {
      const count = list.items.length + relatedProducts.length;
      if (!count) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = e.key === 'ArrowDown' ? (activeIndex + 1) % count : (activeIndex - 1 + count) % count;
        document.querySelectorAll('.grid .wrap, .related a')[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'Enter') {
        const i = Math.max(activeIndex, 0);
        const recipe = list.items[i];
        const product = relatedProducts[i - list.items.length];
        if (recipe) location.href = `/recettes/${recipe.slug}`;
        else if (product) location.href = productHref(product);
      }
    };
    input?.addEventListener('input', onInput);
    input?.addEventListener('keydown', onKey);
    query = input?.value ?? '';
    return () => {
      input?.removeEventListener('input', onInput);
      input?.removeEventListener('keydown', onKey);
    };
  });
</script>

{#if tags.length}
  <div class="chip-row" role="toolbar" aria-label="Filtrer par tag (plusieurs possibles)" use:scrollFade>
    <button class="chip" aria-pressed={selectedTags.length === 0} onclick={() => toggleTag(null)}>Toutes</button>
    {#each tags as t (t.tag)}
      <button class="chip" aria-pressed={selectedTags.includes(t.tag)} onclick={() => toggleTag(t.tag)}>
        #{t.tag}<span class="count">{t.count}</span>
      </button>
    {/each}
  </div>
{/if}

<div class="grid" class:loading aria-busy={loading}>
  {#each list.items as recipe, i (recipe.id)}
    <RecipeCard {recipe} eager={i < 4} editable={member} active={i === activeIndex} />
  {:else}
    <p class="empty">{query || selectedTags.length ? 'Aucune recette ne correspond.' : 'Aucune recette publiée pour le moment.'}</p>
  {/each}
</div>

{#if relatedProducts.length}
  <section class="related">
    <h2>Produits liés</h2>
    <div class="related-list">
      {#each relatedProducts as p, j (p.id)}
        <a href={productHref(p)} class:active={list.items.length + j === activeIndex}>
          {#if p.cover}<img src={p.cover.sm} alt="" loading="lazy" decoding="async" />{:else}<span class="ph">{@html iconBadge(p.category?.icon ?? (p.kind === 'wine' ? 'wine' : 'package'), 26)}</span>{/if}
          <span class="text"><strong>{p.name}</strong>{#if productSubtitle(p)}<small>{productSubtitle(p)}</small>{/if}</span>
        </a>
      {/each}
    </div>
  </section>
{/if}

{#if list.items.length < list.total}
  <div class="more">
    <button onclick={() => load(true)} disabled={loading}>Voir plus de recettes</button>
  </div>
{/if}

<style>
  .chip-row {
    margin-bottom: 20px;
    --fade-start: 0px;
    --fade-end: 0px;
    mask-image: linear-gradient(to right, transparent, #000 var(--fade-start), #000 calc(100% - var(--fade-end)), transparent);
  }
  .chip-row:global(.more-start) {
    --fade-start: 28px;
  }
  .chip-row:global(.more-end) {
    --fade-end: 40px;
  }
  .chip-row .chip {
    box-shadow: none;
  }
  /* How many recipes carry the tag; follows the chip's text colour. */
  .chip .count {
    margin-left: 2px;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.65;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
    transition: opacity 0.15s;
  }
  .grid.loading {
    opacity: 0.6;
  }
  .empty {
    grid-column: 1 / -1;
    color: var(--muted);
    text-align: center;
    padding: 48px 0;
  }
  .related {
    margin-top: 32px;
  }
  .related h2 {
    margin: 0 0 12px;
    font-size: 1.3rem;
  }
  .related-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 8px 16px;
  }
  .related a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--surface);
    text-decoration: none;
  }
  .related a.active {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .related img,
  .related .ph {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--surface-2);
  }
  .related .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .related small {
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    display: flex;
    justify-content: center;
    margin-top: 28px;
  }
  .more button {
    padding: 10px 20px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-weight: 600;
    cursor: pointer;
  }
</style>
