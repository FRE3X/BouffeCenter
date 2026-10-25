<script lang="ts">
  import type { RecipeCard } from '../lib/types';
  import { icon, iconBadge } from '../lib/icons';

  let {
    recipe,
    eager = false,
    editable = false,
    active = false,
  }: { recipe: RecipeCard; eager?: boolean; editable?: boolean; active?: boolean } = $props();
</script>

<article class="wrap">
<a class="card" class:active href={`/recettes/${recipe.slug}`}>
  <div class="cover">
    {#if recipe.cover}
      <img src={recipe.cover.sm} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />
    {:else}
      <span class="placeholder">{@html iconBadge(recipe.category?.icon ?? 'cooking-pot', 64)}</span>
    {/if}
    {#if recipe.category}<span class="category inline-icon">{@html iconBadge(recipe.category.icon, 20)}{recipe.category.name}</span>{/if}
  </div>
  <div class="content">
    <h2>{recipe.title}</h2>
    {#if recipe.description}<p>{recipe.description}</p>{/if}
    {#if recipe.tags.length}
      <div class="tags">
        {#each recipe.tags.slice(0, 4) as tag}<span class="tag">#{tag}</span>{/each}
      </div>
    {/if}
    {#if recipe.author}<small>par {recipe.author}</small>{/if}
  </div>
</a>
{#if editable}
  <a class="edit" href={`/admin#/recettes/${recipe.id}`} title="Modifier la recette" aria-label={`Modifier ${recipe.title}`} data-astro-prefetch="false">
    {@html icon('pencil', 15)}
  </a>
{/if}
</article>

<style>
  .wrap {
    position: relative;
    display: flex;
  }
  .wrap > .card {
    flex: 1;
  }
  .card.active {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .edit {
    position: absolute;
    top: 10px;
    right: 10px;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    box-shadow: var(--shadow);
  }
  .edit:hover {
    filter: brightness(1.1);
  }
  .card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--line);
    text-decoration: none;
    transition:
      transform 0.18s,
      box-shadow 0.18s;
  }
  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow);
  }
  .cover {
    position: relative;
    aspect-ratio: 4 / 3;
    background: var(--surface-2);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .placeholder {
    display: grid;
    place-items: center;
    height: 100%;
    font-size: 3rem;
  }
  .category {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 3px 10px 3px 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px 16px;
    flex: 1;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: 0.92rem;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  small {
    margin-top: auto;
    color: var(--muted);
  }
</style>
