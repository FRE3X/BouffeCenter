<script lang="ts">
  import type { User } from '../lib/types';
  import { api } from './client.svelte';

  let { onlogin }: { onlogin: (user: User) => void } = $props();
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const { user } = await api.post<{ user: User }>('/auth/login', { email, password });
      onlogin(user);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<form class="card auth" onsubmit={submit}>
  <h1>Espace membres</h1>
  <p class="muted">Connecte-toi pour publier des adresses, des avis et des recettes.</p>
  <label class="field"><span>Email</span><input type="email" bind:value={email} autocomplete="email" required /></label>
  <label class="field">
    <span>Mot de passe</span><input type="password" bind:value={password} autocomplete="current-password" required />
  </label>
  {#if error}<p class="error-text">{error}</p>{/if}
  <button class="btn primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
  <p class="muted small">L'accès se fait sur invitation uniquement.</p>
</form>

<style>
  .auth {
    max-width: 400px;
    margin: 40px auto;
    padding: 28px;
  }
  .auth h1 {
    margin-bottom: 6px;
  }
  .auth button {
    width: 100%;
    padding: 12px;
  }
  .small {
    font-size: 0.85rem;
    text-align: center;
  }
</style>
