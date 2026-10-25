<script lang="ts">
  import { onMount } from 'svelte';
  import type { Category } from '../lib/types';
  import { CATEGORY_COLORS } from '../lib/icons';
  import { api, notify } from './client.svelte';
  import ColorPicker from './ColorPicker.svelte';
  import IconPicker from './IconPicker.svelte';

  type Row = Category & { places: number; recipes: number };
  let rows = $state<Row[]>([]);
  const blank = () => ({ name: '', icon: 'utensils' as string | null, color: CATEGORY_COLORS[0] });
  let draft = $state(blank());

  const load = async () => (rows = await api.get<Row[]>('/categories'));
  onMount(load);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    try {
      await api.post('/categories', { ...draft, sort: rows.length + 1 });
      draft = blank();
      await load();
      notify('Catégorie ajoutée');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function update(row: Row) {
    try {
      await api.patch(`/categories/${row.id}`, { name: row.name, icon: row.icon, color: row.color, sort: row.sort, published: row.published });
      notify('Catégorie mise à jour');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function remove(row: Row) {
    if (!confirm(`Supprimer « ${row.name} » ? Les adresses et recettes associées n'auront plus de catégorie.`)) return;
    await api.del(`/categories/${row.id}`);
    await load();
  }
</script>

<h1>Catégories</h1>
<p class="muted">Partagées entre les adresses et les recettes. Les catégories publiées apparaissent dans la barre d'icônes à droite de la carte.</p>

<div class="cats">
  {#each rows as row (row.id)}
    <div class="card cat" class:unpublished={!row.published}>
      <div class="top">
        <IconPicker bind:value={row.icon} onchange={() => update(row)} />
        <input class="name" bind:value={row.name} onchange={() => update(row)} aria-label="Nom de la catégorie" />
        <small class="muted">{row.places} adr. · {row.recipes} rec.</small>
        <label class="switch"><input type="checkbox" bind:checked={row.published} onchange={() => update(row)} /> Publiée</label>
        <button class="btn small danger" onclick={() => remove(row)}>Supprimer</button>
      </div>
      <ColorPicker bind:value={row.color} onchange={() => update(row)} />
    </div>
  {/each}

  <form class="card cat add" onsubmit={create}>
    <div class="top">
      <IconPicker bind:value={draft.icon} />
      <input class="name" bind:value={draft.name} placeholder="Nouvelle catégorie" required aria-label="Nom de la catégorie" />
      <button class="btn primary">Ajouter</button>
    </div>
    <ColorPicker bind:value={draft.color} />
  </form>
</div>

<style>
  .cats {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cat {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .name {
    flex: 1 1 220px;
    font-size: 1.05rem;
    font-weight: 600;
  }
  .add {
    border-style: dashed;
  }
  .unpublished {
    opacity: 0.6;
  }
  .unpublished:hover,
  .unpublished:focus-within {
    opacity: 1;
  }
</style>
