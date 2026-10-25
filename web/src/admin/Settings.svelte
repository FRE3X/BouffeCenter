<script lang="ts">
  import { onMount } from 'svelte';
  import type { Settings } from '../lib/types';
  import { api, notify } from './client.svelte';
  import Backup from './Backup.svelte';

  let { settings = $bindable() }: { settings: Settings } = $props();

  const optional: { key: keyof Settings; label: string }[] = [
    { key: 'products_enabled', label: 'Section Produits' },
    { key: 'cellar_enabled', label: 'Section Cave' },
  ];
  const sections: { key: keyof Settings; label: string }[] = [
    { key: 'map_private', label: 'Carte privée' },
    { key: 'recipes_private', label: 'Recettes privées' },
    { key: 'planning_private', label: 'Planning privé' },
    { key: 'products_private', label: 'Produits privés' },
    { key: 'cellar_private', label: 'Cave privée' },
  ];

  async function update(patch: Partial<Settings>) {
    try {
      settings = await api.patch<Settings>('/settings', patch);
      notify('Paramètres enregistrés');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  type GrapeMinds = { configured: boolean; usage: { month: string; count: number; limit: number } };
  let gm = $state<GrapeMinds | null>(null);
  let key = $state('');
  let busy = $state(false);

  onMount(async () => {
    gm = await api.get<GrapeMinds>('/integrations/grapeminds').catch(() => null);
  });

  async function gmAction(fn: () => Promise<GrapeMinds>, message: string) {
    busy = true;
    try {
      gm = await fn();
      settings.grapeminds_enabled = gm.configured;
      key = '';
      notify(message);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

<h1>Paramètres</h1>

<div class="card">
  <h2>Sections</h2>
  {#each optional as s (s.key)}
    <label class="switch">
      <input type="checkbox" checked={settings[s.key]} onchange={(e) => update({ [s.key]: e.currentTarget.checked })} />
      {s.label}
    </label>
  {/each}
  <p class="muted hint">Une section désactivée disparaît du menu du site et de l'admin. Ses données sont conservées.</p>
</div>

<div class="card">
  <h2>Visibilité</h2>
  {#each sections as s (s.key)}
    <label class="switch">
      <input type="checkbox" checked={settings[s.key]} onchange={(e) => update({ [s.key]: e.currentTarget.checked })} />
      {s.label}
    </label>
  {/each}
  <p class="muted hint">
    Une section privée est réservée aux membres connectés : les visiteurs voient un écran « Section réservée aux membres » avec un
    bouton de connexion, et l'API leur répond 401. Par défaut, tout est public. Les membres gardent tout dans le back-office. Le stock
    des produits n'est jamais montré aux visiteurs.
  </p>
</div>

<div class="card">
  <h2>GrapeMinds (cave, facultatif)</h2>
  <p class="muted hint top">
    Avec une clé de l'API <a href="https://grapeminds.eu/fr/api-vin" target="_blank" rel="noopener">GrapeMinds</a>, les membres peuvent
    préremplir un vin (producteur, type, région, cépages, période de dégustation) en le cherchant par son nom. La clé reste sur le serveur :
    elle n'est jamais renvoyée ni incluse dans les sauvegardes.
  </p>
  {#if gm?.configured}
    <p class="status">
      <span class="badge live">Connecté</span>
      {gm.usage.count} / {gm.usage.limit} requêtes ce mois-ci
    </p>
    <div class="actions">
      <button class="btn small" disabled={busy} onclick={() => gmAction(() => api.post('/integrations/grapeminds/test'), 'La clé fonctionne')}>Tester</button>
      <button class="btn small danger" disabled={busy} onclick={() => confirm('Supprimer la clé GrapeMinds ?') && gmAction(() => api.del('/integrations/grapeminds'), 'Clé supprimée')}>
        Supprimer la clé
      </button>
    </div>
  {/if}
  <form
    class="key"
    onsubmit={(e) => {
      e.preventDefault();
      gmAction(() => api.put('/integrations/grapeminds', { api_key: key }), 'Clé GrapeMinds enregistrée');
    }}
  >
    <input type="password" bind:value={key} placeholder={gm?.configured ? 'Remplacer la clé…' : 'Clé API GrapeMinds'} autocomplete="off" minlength="8" required />
    <button class="btn primary" disabled={busy || key.trim().length < 8}>Enregistrer</button>
  </form>
  <p class="muted hint">La clé est vérifiée avant d'être enregistrée (une requête). Offre gratuite : 250 requêtes par mois.</p>
</div>

<Backup />

<style>
  h2 {
    margin: 0 0 10px;
    font-size: 1.2rem;
  }
  .card + .card {
    margin-top: 20px;
  }
  .switch {
    display: flex;
    width: fit-content;
  }
  .switch + .switch {
    margin-top: 8px;
  }
  .hint {
    margin: 8px 0 0;
    font-size: 0.88rem;
  }
  .hint.top {
    margin: 0 0 12px;
  }
  .hint a {
    color: var(--accent);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 10px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .key {
    display: flex;
    gap: 8px;
  }
</style>
