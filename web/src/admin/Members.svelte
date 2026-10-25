<script lang="ts">
  import { onMount } from 'svelte';
  import type { User } from '../lib/types';
  import { api, notify } from './client.svelte';

  type Member = User & { pending: number; places: number; recipes: number; reviews: number; created_at: number };
  let { user }: { user: User } = $props();
  let members = $state<Member[]>([]);
  let draft = $state({ email: '', pseudo: '', role: 'editor' as 'admin' | 'editor' });
  let inviteUrl = $state('');

  const load = async () => (members = await api.get<Member[]>('/users'));
  onMount(load);

  async function invite(e: SubmitEvent) {
    e.preventDefault();
    try {
      inviteUrl = (await api.post<{ invite_url: string }>('/users', draft)).invite_url;
      draft = { email: '', pseudo: '', role: 'editor' };
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function reinvite(m: Member) {
    inviteUrl = (await api.post<{ invite_url: string }>(`/users/${m.id}/invite`)).invite_url;
  }

  async function setRole(m: Member, role: string) {
    await api.patch(`/users/${m.id}`, { role });
    notify('Rôle mis à jour');
  }

  async function remove(m: Member) {
    if (!confirm(`Supprimer le compte de ${m.pseudo} ? Ses avis seront supprimés, ses adresses et recettes conservées.`)) return;
    await api.del(`/users/${m.id}`);
    await load();
  }

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    notify('Lien copié');
  }
</script>

<h1>Membres</h1>

<form class="card invite" onsubmit={invite}>
  <h2>Inviter quelqu'un</h2>
  <div class="row">
    <label class="field"><span>Email</span><input type="email" bind:value={draft.email} required /></label>
    <label class="field"><span>Pseudo</span><input bind:value={draft.pseudo} required minlength="2" /></label>
    <label class="field">
      <span>Rôle</span>
      <select bind:value={draft.role}><option value="editor">Membre</option><option value="admin">Admin</option></select>
    </label>
  </div>
  <button class="btn primary">Créer l'invitation</button>
  {#if inviteUrl}
    <div class="link">
      <p class="muted">Envoie ce lien (valable 7 jours) pour que la personne choisisse son mot de passe :</p>
      <div class="copy"><input readonly value={inviteUrl} onfocus={(e) => e.currentTarget.select()} /><button type="button" class="btn" onclick={copy}>Copier</button></div>
    </div>
  {/if}
</form>

<div class="list">
  {#each members as m (m.id)}
    <div class="list-item">
      <span class="thumb">{m.pseudo.slice(0, 1).toUpperCase()}</span>
      <span class="grow">
        <strong>{m.pseudo}</strong>
        <small>{m.email} · {m.places} adr. · {m.recipes} rec. · {m.reviews} avis</small>
      </span>
      {#if m.pending}<span class="badge">Invitation en attente</span>{/if}
      {#if m.id !== user.id}
        <select value={m.role} onchange={(e) => setRole(m, e.currentTarget.value)} style="width:auto">
          <option value="editor">Membre</option><option value="admin">Admin</option>
        </select>
        <button class="btn small" onclick={() => reinvite(m)}>{m.pending ? 'Nouveau lien' : 'Lien de réinit.'}</button>
        <button class="btn small danger" onclick={() => remove(m)}>✕</button>
      {:else}
        <span class="badge live">Toi</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .invite {
    margin-bottom: 24px;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 1.2rem;
  }
  .link {
    margin-top: 16px;
  }
  .copy {
    display: flex;
    gap: 8px;
  }
  .list-item {
    flex-wrap: wrap;
  }
</style>
