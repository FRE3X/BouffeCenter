<script lang="ts">
  import { onMount } from 'svelte';
  import type { User } from '../lib/types';
  import { api } from './client.svelte';

  let { token, onlogin }: { token: string; onlogin: (user: User) => void } = $props();
  let invite = $state<{ email: string; pseudo: string } | null>(null);
  let password = $state('');
  let confirm = $state('');
  let error = $state('');
  let busy = $state(false);

  onMount(() => {
    api
      .get<{ email: string; pseudo: string }>(`/auth/invite/${token}`)
      .then((r) => (invite = r))
      .catch((e) => (error = e.message));
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (password !== confirm) return (error = 'Les mots de passe ne correspondent pas');
    busy = true;
    try {
      const { user } = await api.post<{ user: User }>(`/auth/invite/${token}`, { password });
      onlogin(user);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<form class="card auth" onsubmit={submit}>
  <h1>Bienvenue{invite ? `, ${invite.pseudo}` : ''}</h1>
  {#if invite}
    <p class="muted">Choisis un mot de passe pour activer ton compte <strong>{invite.email}</strong>.</p>
    <label class="field">
      <span>Mot de passe (8 caractères min.)</span>
      <input type="password" bind:value={password} minlength="8" autocomplete="new-password" required />
    </label>
    <label class="field">
      <span>Confirmation</span><input type="password" bind:value={confirm} autocomplete="new-password" required />
    </label>
    <button class="btn primary" disabled={busy}>Activer mon compte</button>
  {/if}
  {#if error}<p class="error-text">{error}</p>{/if}
</form>

<style>
  .auth {
    max-width: 420px;
    margin: 40px auto;
    padding: 28px;
  }
  .auth button {
    width: 100%;
    padding: 12px;
  }
</style>
