<script lang="ts">
  import { onMount } from 'svelte';
  import type { Settings, User } from '../lib/types';
  import { api, navigate, toast } from './client.svelte';
  import Login from './Login.svelte';
  import Invite from './Invite.svelte';
  import PlacesList from './PlacesList.svelte';
  import RecipesList from './RecipesList.svelte';

  let user = $state<User | null>(null);
  let settings = $state<Settings>({
    map_private: false,
    recipes_private: false,
    planning_private: false,
    products_private: false,
    cellar_private: false,
    products_enabled: true,
    cellar_enabled: true,
    grapeminds_enabled: false,
  });
  let ready = $state(false);
  let route = $state(location.hash.slice(1) || '/');
  let toastVisible = $state(false);

  const parts = $derived(route.split('/').filter(Boolean));

  /** Back to the private page that sent the visitor here (same-origin paths only). */
  function returnToNext() {
    const next = new URLSearchParams(location.search).get('next');
    if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/admin')) return false;
    location.replace(next);
    return true;
  }

  onMount(() => {
    const onHash = () => (route = location.hash.slice(1) || '/');
    addEventListener('hashchange', onHash);
    api.get<Settings>('/settings').then((s) => (settings = s)).catch(() => {});
    api
      .get<{ user: User | null }>('/auth/me')
      .then((r) => {
        user = r.user;
        if (user && returnToNext()) return;
        // A member session exists: forget any earlier "not a member" check so public pages re-detect it.
        if (user) {
          try {
            sessionStorage.removeItem('bc_member_checked');
          } catch {}
        }
      })
      .finally(() => (ready = true));
    return () => removeEventListener('hashchange', onHash);
  });

  $effect(() => {
    if (!toast.at) return;
    toastVisible = true;
    const t = setTimeout(() => (toastVisible = false), 3000);
    return () => clearTimeout(t);
  });

  async function logout() {
    await api.post('/auth/logout');
    user = null;
    navigate('/');
  }

  const tabs = $derived([
    { path: '/adresses', label: 'Adresses' },
    { path: '/recettes', label: 'Recettes' },
    { path: '/planning', label: 'Planning' },
    ...(settings.products_enabled ? [{ path: '/produits', label: 'Produits' }] : []),
    ...(settings.cellar_enabled ? [{ path: '/cave', label: 'Cave' }] : []),
    ...(user?.role === 'admin'
      ? [
          { path: '/categories', label: 'Catégories' },
          { path: '/membres', label: 'Membres' },
          { path: '/parametres', label: 'Paramètres' },
        ]
      : []),
    { path: '/compte', label: 'Mon compte' },
  ]);
</script>

<div class="admin">
  {#if !ready}
    <p class="muted">Chargement…</p>
  {:else if parts[0] === 'invitation' && parts[1]}
    <Invite token={parts[1]} onlogin={(u) => ((user = u), navigate('/adresses'))} />
  {:else if !user}
    <Login onlogin={(u) => returnToNext() || (user = u)} />
  {:else}
    <nav class="tabs">
      {#each tabs as tab}
        <a href={`#${tab.path}`} class:active={route.startsWith(tab.path) || (route === '/' && tab.path === '/adresses')}>{tab.label}</a>
      {/each}
      <span class="spacer"></span>
      <span class="who">Connecté : <strong>{user.pseudo}</strong></span>
      <button class="btn small" onclick={logout}>Déconnexion</button>
    </nav>

    {#if parts[0] === 'adresses' && parts[1]}
      {#await import('./PlaceEdit.svelte') then { default: PlaceEdit }}
        {#key parts[1]}<PlaceEdit id={Number(parts[1])} {user} />{/key}
      {/await}
    {:else if parts[0] === 'recettes' && parts[1]}
      {#await import('./RecipeEdit.svelte') then { default: RecipeEdit }}
        {#key parts[1]}<RecipeEdit id={Number(parts[1])} {user} />{/key}
      {/await}
    {:else if parts[0] === 'recettes'}
      <RecipesList {user} />
    {:else if (parts[0] === 'produits' || parts[0] === 'cave') && parts[1]}
      {#await import('./ProductEdit.svelte') then { default: ProductEdit }}
        {#key route}<ProductEdit id={Number(parts[1])} {user} grapeminds={settings.grapeminds_enabled} />{/key}
      {/await}
    {:else if parts[0] === 'produits' || parts[0] === 'cave'}
      {#await import('./ProductsList.svelte') then { default: ProductsList }}
        {#key parts[0]}<ProductsList kind={parts[0] === 'cave' ? 'wine' : 'pantry'} />{/key}
      {/await}
    {:else if parts[0] === 'planning'}
      {#await import('./Planning.svelte') then { default: Planning }}<Planning week={parts[1]} isPrivate={settings.planning_private} isAdmin={user.role === 'admin'} />{/await}
    {:else if parts[0] === 'parametres' && user.role === 'admin'}
      {#await import('./Settings.svelte') then { default: SettingsView }}<SettingsView bind:settings />{/await}
    {:else if parts[0] === 'categories' && user.role === 'admin'}
      {#await import('./Categories.svelte') then { default: Categories }}<Categories />{/await}
    {:else if parts[0] === 'membres' && user.role === 'admin'}
      {#await import('./Members.svelte') then { default: Members }}<Members {user} />{/await}
    {:else if parts[0] === 'compte'}
      {#await import('./Account.svelte') then { default: Account }}<Account bind:user />{/await}
    {:else}
      <PlacesList {user} />
    {/if}
  {/if}
</div>

{#if toastVisible}
  <div class="toast" class:error={toast.kind === 'error'} role="status">{toast.message}</div>
{/if}

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 24px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
  }
  .tabs a {
    padding: 7px 14px;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .tabs a.active {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .spacer {
    flex: 1;
  }
  .who {
    font-size: 0.85rem;
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .tabs {
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tabs a {
      flex: none;
    }
    .who,
    .spacer {
      display: none;
    }
  }
  .toast {
    position: fixed;
    z-index: 100;
    left: 50%;
    bottom: calc(80px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    padding: 10px 18px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--bg);
    font-weight: 600;
    box-shadow: var(--shadow);
    animation: pop 0.2s ease-out;
  }
  .toast.error {
    background: var(--meh);
    color: #fff;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
</style>
