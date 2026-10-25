<script lang="ts">
  import { onMount } from 'svelte';
  import type { RecipeCard, RecipeList, User } from '../lib/types';
  import { api, navigate, notify } from './client.svelte';
  import { iconBadge } from '../lib/icons';

  let { user }: { user: User } = $props();
  let recipes = $state<RecipeCard[] | null>(null);
  let q = $state('');
  let mine = $state(false);
  let creating = $state(false);

  async function load() {
    const params = new URLSearchParams({ drafts: 'true', limit: '100' });
    if (q.trim()) params.set('q', q.trim());
    if (mine) params.set('mine', 'true');
    recipes = (await api.get<RecipeList>(`/recipes?${params}`)).items;
  }

  onMount(load);

  let timer: ReturnType<typeof setTimeout>;
  function onFilter() {
    clearTimeout(timer);
    timer = setTimeout(load, 200);
  }

  async function create() {
    creating = true;
    try {
      const recipe = await api.post<RecipeCard>('/recipes', { title: 'Nouvelle recette' });
      navigate(`/recettes/${recipe.id}`);
    } catch (e) {
      notify((e as Error).message, 'error');
      creating = false;
    }
  }
</script>

<div class="toolbar">
  <h1 style="margin:0">Recettes</h1>
  <span class="spacer"></span>
  <button class="btn primary" onclick={create} disabled={creating}>+ Nouvelle recette</button>
</div>
<div class="toolbar">
  <input type="search" placeholder="Rechercher…" bind:value={q} oninput={onFilter} style="max-width:320px" />
  <label class="switch"><input type="checkbox" bind:checked={mine} onchange={load} /> Mes recettes</label>
</div>

{#if !recipes}
  <p class="muted">Chargement…</p>
{:else}
  <div class="list">
    {#each recipes as r (r.id)}
      <a class="list-item" href={`#/recettes/${r.id}`}>
        {#if r.cover}<img class="thumb" src={r.cover.sm} alt="" loading="lazy" />{:else}<span class="thumb">{@html iconBadge(r.category?.icon ?? 'cooking-pot', 36)}</span>{/if}
        <span class="grow">
          <strong>{r.title}</strong>
          <small>{[r.category?.name, r.tags.map((t) => `#${t}`).join(' '), r.author && `par ${r.author}`].filter(Boolean).join(' · ')}</small>
        </span>
        <span class="badge" class:live={r.published}>{r.published ? 'Publiée' : 'Brouillon'}</span>
      </a>
    {:else}
      <p class="muted">Aucune recette.</p>
    {/each}
  </div>
{/if}
