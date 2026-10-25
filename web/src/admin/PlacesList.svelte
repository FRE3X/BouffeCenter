<script lang="ts">
  import { onMount } from 'svelte';
  import type { Place, User } from '../lib/types';
  import { rating, ratingColor } from '../lib/format';
  import { iconBadge, triedBadge } from '../lib/icons';
  import { api, navigate, notify } from './client.svelte';

  let { user }: { user: User } = $props();
  let places = $state<Place[] | null>(null);
  let q = $state('');
  let mine = $state(false);
  let creating = $state(false);

  const filtered = $derived.by(() => {
    const needle = q.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    return (places ?? []).filter(
      (p) =>
        (!mine || p.author_id === user.id) &&
        `${p.name} ${p.city}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(needle),
    );
  });

  onMount(async () => {
    places = await api.get<Place[]>('/places?drafts=true');
  });

  async function create() {
    creating = true;
    try {
      const place = await api.post<Place>('/places', { name: 'Nouvelle adresse' });
      navigate(`/adresses/${place.id}`);
    } catch (e) {
      notify((e as Error).message, 'error');
      creating = false;
    }
  }
</script>

<div class="toolbar">
  <h1 style="margin:0">Adresses</h1>
  <span class="spacer"></span>
  <button class="btn primary" onclick={create} disabled={creating}>+ Nouvelle adresse</button>
</div>
<div class="toolbar">
  <input type="search" placeholder="Filtrer…" bind:value={q} style="max-width:320px" />
  <label class="switch"><input type="checkbox" bind:checked={mine} /> Mes adresses</label>
</div>

{#if !places}
  <p class="muted">Chargement…</p>
{:else}
  <div class="list">
    {#each filtered as p (p.id)}
      <a class="list-item" href={`#/adresses/${p.id}`}>
        {#if p.cover}<img class="thumb" src={p.cover.sm} alt="" loading="lazy" />{:else}<span class="thumb">{@html iconBadge(p.marker_icon, 36)}</span>{/if}
        <span class="grow">
          <strong>{p.name}</strong>
          <small>{[p.category?.name, p.city, p.author && `par ${p.author}`].filter(Boolean).join(' · ')}</small>
        </span>
        {#if p.rating !== null}<span class="rating" style:background={ratingColor(p.rating)}>{rating(p.rating)}<small>/10</small></span>{/if}
        {@html triedBadge(p.tried, 28)}
        <span class="badge" class:live={p.published}>{p.published ? 'Publiée' : 'Brouillon'}</span>
      </a>
    {:else}
      <p class="muted">Aucune adresse.</p>
    {/each}
  </div>
{/if}
