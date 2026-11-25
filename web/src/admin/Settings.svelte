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

  type Ollama = { configured: boolean; url?: string; model?: string; has_token?: boolean };
  type OllamaModel = { name: string; size: number; parameters: string | null };
  let ollama = $state<Ollama | null>(null);
  let ol = $state({ url: '', model: '', token: '' });
  let models = $state<OllamaModel[]>([]);
  let olBusy = $state(false);

  onMount(async () => {
    [gm, ollama] = await Promise.all([
      api.get<GrapeMinds>('/integrations/grapeminds').catch(() => null),
      api.get<Ollama>('/integrations/ollama').catch(() => null),
    ]);
    if (ollama?.configured) ol = { url: ollama.url!, model: ollama.model!, token: '' };
  });

  const gb = (bytes: number) => (bytes ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} Go` : '');

  async function loadModels() {
    olBusy = true;
    try {
      models = (await api.post<{ models: OllamaModel[] }>('/integrations/ollama/models', { url: ol.url, token: ol.token || undefined })).models;
      if (!models.length) notify('Aucun modèle installé sur ce serveur (ollama pull …)', 'error');
      else if (!models.some((m) => m.name === ol.model)) ol.model = models[0].name;
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      olBusy = false;
    }
  }

  async function olAction(fn: () => Promise<Ollama>, message: string) {
    olBusy = true;
    try {
      ollama = await fn();
      settings.ollama_enabled = ollama.configured;
      ol.token = '';
      if (!ollama.configured) models = [];
      notify(message);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      olBusy = false;
    }
  }

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

<div class="card">
  <h2>Ollama (recettes, facultatif)</h2>
  <p class="muted hint top">
    Branchez un serveur <a href="https://ollama.com" target="_blank" rel="noopener">Ollama</a> pour que les membres puissent préremplir une
    recette à partir d'une simple demande (« un gratin dauphinois pour 6 »). Rien n'est publié sans relecture. Le serveur doit être joignable
    depuis Bouffe Center ; le jeton éventuel n'est jamais renvoyé ni sauvegardé.
  </p>
  {#if ollama?.configured}
    <p class="status">
      <span class="badge live">Connecté</span>
      <span class="muted">{ollama.model} · {ollama.url}</span>
    </p>
    <div class="actions">
      <button class="btn small" disabled={olBusy} onclick={() => olAction(() => api.post('/integrations/ollama/test'), 'Ollama répond, le modèle est disponible')}>Tester</button>
      <button class="btn small danger" disabled={olBusy} onclick={() => confirm('Déconnecter Ollama ?') && olAction(() => api.del('/integrations/ollama'), 'Ollama déconnecté')}>
        Déconnecter
      </button>
    </div>
  {/if}
  <form
    class="ollama"
    onsubmit={(e) => {
      e.preventDefault();
      olAction(() => api.put('/integrations/ollama', { url: ol.url, model: ol.model, token: ol.token || undefined }), 'Connexion Ollama enregistrée');
    }}
  >
    <div class="field">
      <label class="label" for="ollama-url">Adresse du serveur</label>
      <div class="inline">
        <input id="ollama-url" type="url" bind:value={ol.url} placeholder="http://192.168.1.10:11434" required />
        <button type="button" class="btn" disabled={olBusy || !ol.url} onclick={loadModels}>Charger les modèles</button>
      </div>
    </div>
    <label class="field">
      <span>Modèle</span>
      {#if models.length}
        <select bind:value={ol.model} required>
          {#each models as m (m.name)}<option value={m.name}>{m.name}{m.parameters ? ` · ${m.parameters}` : ''}{m.size ? ` · ${gb(m.size)}` : ''}</option>{/each}
        </select>
      {:else}
        <input bind:value={ol.model} placeholder="Chargez la liste, ou saisissez ex. mistral-small3.2" required />
      {/if}
    </label>
    <label class="field">
      <span>Jeton (facultatif, si Ollama est derrière une authentification)</span>
      <input type="password" bind:value={ol.token} autocomplete="off" placeholder={ollama?.has_token ? 'Jeton enregistré · laisser vide pour le garder' : 'Authorization: Bearer …'} />
    </label>
    <button class="btn primary" disabled={olBusy || !ol.url || !ol.model}>{olBusy ? 'Vérification…' : 'Enregistrer'}</button>
  </form>
  <p class="muted hint">
    L'adresse et le modèle sont vérifiés avant l'enregistrement. Un modèle d'au moins 7–8 milliards de paramètres donne de bien meilleures
    recettes en français ; sur un serveur sans carte graphique, comptez une à deux minutes par recette.
  </p>
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
  .ollama {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .ollama .field {
    width: 100%;
  }
  .inline {
    display: flex;
    gap: 8px;
  }
  .inline input {
    flex: 1;
    min-width: 0;
  }
</style>
