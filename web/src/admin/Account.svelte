<script lang="ts">
  import type { User } from '../lib/types';
  import { api, notify } from './client.svelte';
  import ApiKeys from './ApiKeys.svelte';

  let { user = $bindable() }: { user: User } = $props();
  let pseudo = $state(user.pseudo);
  let current = $state('');
  let password = $state('');

  async function savePseudo(e: SubmitEvent) {
    e.preventDefault();
    try {
      user = (await api.patch<{ user: User }>('/auth/me', { pseudo })).user;
      notify('Pseudo mis à jour');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function savePassword(e: SubmitEvent) {
    e.preventDefault();
    try {
      await api.patch('/auth/me', { password, current_password: current });
      current = password = '';
      notify('Mot de passe modifié');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }
</script>

<h1>Mon compte</h1>
<div class="row">
  <form class="card" onsubmit={savePseudo}>
    <label class="field"><span>Pseudo (affiché sur tes avis et photos)</span><input bind:value={pseudo} minlength="2" required /></label>
    <p class="muted">Email : {user.email} · Rôle : {user.role === 'admin' ? 'Admin' : 'Membre'}</p>
    <button class="btn primary">Enregistrer</button>
  </form>
  <form class="card" onsubmit={savePassword}>
    <label class="field"><span>Mot de passe actuel</span><input type="password" bind:value={current} autocomplete="current-password" required /></label>
    <label class="field"><span>Nouveau mot de passe</span><input type="password" bind:value={password} minlength="8" autocomplete="new-password" required /></label>
    <button class="btn primary">Changer le mot de passe</button>
  </form>
</div>

<ApiKeys {user} />
