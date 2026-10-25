<script lang="ts">
  import { onMount } from 'svelte';
  import type { User } from '../lib/types';
  import { date } from '../lib/format';
  import { api, notify } from './client.svelte';

  type ApiKey = {
    id: number;
    user_id: number;
    owner: string;
    name: string;
    prefix: string;
    expires_at: number | null;
    last_used_at: number | null;
    created_at: number;
    expired: boolean;
  };

  let { user }: { user: User } = $props();

  const VALIDITY = [
    { value: '7', label: '7 jours' },
    { value: '30', label: '30 jours' },
    { value: '90', label: '90 jours' },
    { value: '365', label: '1 an' },
    { value: 'never', label: 'Sans expiration' },
    { value: 'custom', label: "Jusqu'à une date…" },
  ];

  let keys = $state<ApiKey[]>([]);
  let all = $state(false);
  let name = $state('');
  let validity = $state('90');
  let until = $state('');
  let created = $state('');
  let saving = $state(false);

  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const minDate = day(1);
  const maxDate = day(3650);

  const load = async () => (keys = await api.get<ApiKey[]>(`/api-keys${all ? '?all=true' : ''}`));
  onMount(load);

  /** Days of validity for the chosen option; null = never expires. */
  function expiresInDays(): number | null {
    if (validity === 'never') return null;
    if (validity !== 'custom') return Number(validity);
    // Whole days only, so the key expires on the chosen day at the latest.
    return Math.max(1, Math.floor((new Date(`${until}T23:59:59`).getTime() - Date.now()) / 86400000));
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    try {
      created = (await api.post<ApiKey & { token: string }>('/api-keys', { name, expires_in_days: expiresInDays() })).token;
      name = '';
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      saving = false;
    }
  }

  async function revoke(key: ApiKey) {
    if (!confirm(`Révoquer la clé « ${key.name} » ? Les applications qui l'utilisent n'auront plus accès.`)) return;
    try {
      await api.del(`/api-keys/${key.id}`);
      notify('Clé révoquée');
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(created);
    notify('Clé copiée');
  }
</script>

<section class="card keys">
  <h2>Clés API</h2>
  <p class="muted hint">
    Elles donnent accès à l'API REST du site (<code>/api</code>) depuis un script, une application ou un outil externe, avec les mêmes droits que
    ton compte. Envoie la clé dans l'en-tête <code>Authorization: Bearer &lt;clé&gt;</code>.
  </p>

  <form class="row" onsubmit={create}>
    <label class="field"><span>Nom</span><input bind:value={name} placeholder="ex. Script de sauvegarde" maxlength="60" required /></label>
    <label class="field">
      <span>Validité</span>
      <select bind:value={validity}>
        {#each VALIDITY as v}<option value={v.value}>{v.label}</option>{/each}
      </select>
    </label>
    {#if validity === 'custom'}
      <label class="field"><span>Valable jusqu'au</span><input type="date" bind:value={until} min={minDate} max={maxDate} required /></label>
    {/if}
    <button class="btn primary" disabled={saving}>Créer la clé</button>
  </form>
  {#if validity === 'never'}
    <p class="muted hint">Une clé sans expiration reste valable jusqu'à ce que tu la révoques.</p>
  {/if}

  {#if created}
    <div class="created">
      <p><strong>Copie cette clé maintenant :</strong> elle ne sera plus jamais affichée.</p>
      <div class="copy">
        <input readonly value={created} onfocus={(e) => e.currentTarget.select()} />
        <button type="button" class="btn" onclick={copy}>Copier</button>
        <button type="button" class="btn" onclick={() => (created = '')}>J'ai copié</button>
      </div>
    </div>
  {/if}

  {#if user.role === 'admin'}
    <label class="switch all"><input type="checkbox" bind:checked={all} onchange={load} /> Clés de tous les membres</label>
  {/if}

  <div class="list">
    {#each keys as key (key.id)}
      <div class="list-item">
        <span class="grow">
          <strong>{key.name}</strong>
          <small>
            <code>{key.prefix}…</code>
            {#if all} · {key.owner}{/if}
            · créée le {date(key.created_at)}
            · {key.last_used_at ? `utilisée le ${date(key.last_used_at)}` : 'jamais utilisée'}
          </small>
        </span>
        {#if key.expired}
          <span class="badge">Expirée</span>
        {:else}
          <span class="badge live">{key.expires_at ? `Jusqu'au ${date(key.expires_at)}` : 'Sans expiration'}</span>
        {/if}
        <button class="btn small danger" onclick={() => revoke(key)}>Révoquer</button>
      </div>
    {:else}
      <p class="muted">Aucune clé.</p>
    {/each}
  </div>
</section>

<style>
  .keys {
    margin-top: 16px;
  }
  h2 {
    margin: 0 0 4px;
  }
  .hint {
    margin: 0 0 12px;
    font-size: 0.88rem;
  }
  form {
    align-items: flex-end;
  }
  form .btn {
    margin-bottom: 14px;
  }
  .created {
    margin: 4px 0 14px;
    padding: 12px;
    border-radius: 10px;
    background: var(--surface-2);
    border-left: 3px solid var(--accent);
  }
  .created p {
    margin: 0 0 8px;
  }
  .copy {
    display: flex;
    gap: 8px;
  }
  .copy input {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, monospace;
  }
  .all {
    margin: 4px 0 10px;
  }
  code {
    font-size: 0.85em;
  }
</style>
