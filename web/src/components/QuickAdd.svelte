<script lang="ts">
  import type { Category } from '../lib/types';
  import { formatKm, geocode, type GeoNear, type GeoResult } from '../lib/geocode';
  import { icon, iconBadge, triedBadge } from '../lib/icons';

  let { categories, getView }: { categories: Category[]; getView: () => GeoNear | undefined } = $props();

  let open = $state(false);
  let query = $state('');
  let results = $state<GeoResult[]>([]);
  let active = $state(0);
  let spot = $state<{ lat: number; lng: number; address: string; city: string } | null>(null);
  let name = $state('');
  let categoryId = $state<number | null>(null);
  let tried = $state(false);
  let score = $state<number | null>(null);
  let busy = $state(false);
  let error = $state('');
  let nameInput = $state<HTMLInputElement>();
  let timer: ReturnType<typeof setTimeout>;
  let ctrl: AbortController | undefined;

  function reset() {
    query = '';
    results = [];
    spot = null;
    name = '';
    categoryId = null;
    tried = false;
    score = null;
    error = '';
  }

  function search() {
    clearTimeout(timer);
    ctrl?.abort();
    if (query.trim().length < 3) return (results = []);
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        results = await geocode(query, getView(), ctrl.signal);
        active = 0;
      } catch {}
    }, 250);
  }

  // ↑/↓ move through the suggestions, Enter picks one (instead of submitting the form).
  function onResultsKey(e: KeyboardEvent) {
    if (!results.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
      document.getElementById(`quick-add-result-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    }
  }

  function choose(r: GeoResult) {
    spot = { lat: r.lat, lng: r.lng, address: r.address, city: r.city };
    if (!name && r.name) name = r.name;
    results = [];
    query = '';
    nameInput?.focus();
  }

  function useMapCenter() {
    const c = getView();
    if (c) spot = { lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)), address: '', city: '' };
  }

  function show() {
    reset();
    open = true;
  }

  // "N" (outside text fields) or ⌥N / Alt+N anywhere opens the form; Escape closes it.
  // ⌘N / Ctrl+N is reserved by browsers (new window) and can't be intercepted.
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) return (open = false);
    if (open || e.code !== 'KeyN' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if (e.altKey || !typing) {
      e.preventDefault();
      show();
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!spot) return (error = 'Choisis une adresse (ou le centre de la carte).');
    busy = true;
    error = '';
    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, category_id: categoryId, ...spot, tried, published: true }),
      });
      const place = await res.json();
      if (!res.ok) throw new Error(place.error ?? 'Impossible de créer l’adresse');
      if (tried && score !== null) {
        await fetch(`/api/places/${place.id}/review`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rating: score, comment: '' }),
        });
      }
      // Reload the map focused on the new place (server-rendered data stays the single source of truth).
      location.href = `/?lieu=${place.slug}`;
    } catch (err) {
      error = (err as Error).message;
      busy = false;
    }
  }
</script>

<svelte:window {onkeydown} />

{#if !open}
  <button class="fab" onclick={show} aria-label="Ajouter une adresse" aria-keyshortcuts="N Alt+N" title="Ajouter une adresse (N)">
    {@html icon('plus', 22, 2.75)}
  </button>
{:else}
  <form class="sheet" onsubmit={submit} aria-label="Ajouter une adresse">
    <header>
      <h2>Nouvelle adresse</h2>
      <button type="button" class="close" aria-label="Fermer" onclick={() => (open = false)}>{@html icon('x', 16)}</button>
    </header>

    <label class="field">
      <span>Où ?</span>
      {#if spot}
        <div class="spot">
          {@html icon('map-pin', 16)}
          <span>{spot.address || `${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}`}</span>
          <button type="button" class="link" onclick={() => (spot = null)}>Changer</button>
        </div>
      {:else}
        <!-- Focused as soon as the form opens (button or "N" shortcut) or the spot is changed. -->
        <input
          bind:value={query}
          oninput={search}
          onkeydown={onResultsKey}
          placeholder="Nom du lieu ou adresse…"
          autocomplete="off"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="quick-add-results"
          aria-activedescendant={results.length ? `quick-add-result-${active}` : undefined}
          {@attach (el) => el.focus()}
        />
      {/if}
    </label>
    {#if !spot}
      {#if results.length}
        <ul class="results" id="quick-add-results" role="listbox">
          {#each results as r, i}
            <li id="quick-add-result-{i}" role="option" aria-selected={i === active}>
              <button type="button" tabindex="-1" class:active={i === active} onclick={() => choose(r)} onmouseenter={() => (active = i)}>
                <strong>{r.label}</strong>
                <small>{r.km !== undefined ? `${formatKm(r.km)} · ` : ''}{r.detail}</small>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <button type="button" class="link center" onclick={useMapCenter}>{@html icon('map-pin', 14)}Utiliser le centre de la carte</button>
    {/if}

    <label class="field">
      <span>Nom</span>
      <input bind:this={nameInput} bind:value={name} required maxlength="120" placeholder="Chez Gégène" />
    </label>

    <div class="field">
      <span>Catégorie</span>
      <div class="cats">
        {#each categories as c (c.id)}
          <button type="button" class="cat" aria-pressed={categoryId === c.id} title={c.name} onclick={() => (categoryId = categoryId === c.id ? null : c.id)}>
            {@html iconBadge(c.icon, 30)}<small>{c.name}</small>
          </button>
        {/each}
      </div>
    </div>

    <button type="button" class="tried" class:on={tried} aria-pressed={tried} onclick={() => ((tried = !tried), !tried && (score = null))}>
      {@html triedBadge(tried, 28)}{tried ? 'Déjà testé' : 'Pas encore testé'}
    </button>

    {#if tried}
      <div class="field">
        <span>Ma note (facultatif)</span>
        <div class="scores">
          {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n}
            <button
              type="button"
              class="score"
              class:filled={score !== null && n <= score}
              aria-pressed={score === n}
              onclick={() => (score = score === n ? null : n)}>{n}</button
            >
          {/each}
        </div>
      </div>
    {/if}

    {#if error}<p class="error">{error}</p>{/if}
    <div class="actions">
      <button type="submit" class="submit" disabled={busy || !name.trim()}>{busy ? 'Ajout…' : 'Ajouter sur la carte'}</button>
    </div>
    <p class="hint">Photos, horaires et détails se complètent ensuite dans l'admin.</p>
  </form>
{/if}

<style>
  /* Small round "+" in the bottom-left corner. */
  .fab {
    position: fixed;
    z-index: 20;
    left: max(14px, env(safe-area-inset-left));
    bottom: max(24px + env(safe-area-inset-bottom), 14px + var(--tabbar-h));
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    box-shadow: 0 4px 14px rgb(209 56 47 / 0.35);
    cursor: pointer;
    transition: filter 0.12s;
  }
  .fab:hover {
    filter: brightness(1.08);
  }

  .sheet {
    position: fixed;
    z-index: 45;
    left: 12px;
    bottom: 12px;
    width: min(400px, calc(100vw - 24px));
    max-height: calc(100dvh - var(--header-h) - 36px);
    overflow-y: auto;
    padding: 16px 18px 18px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 20px;
    box-shadow: var(--shadow);
    animation: rise 0.2s ease-out;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  @media (max-width: 640px) {
    .sheet {
      left: 0;
      right: 0;
      /* Slides over the floating tab bar, which would otherwise cover its buttons. */
      z-index: 55;
      bottom: 0;
      width: auto;
      border-radius: 20px 20px 0 0;
      padding-bottom: calc(18px + env(safe-area-inset-bottom));
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 1.3rem;
  }
  .close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: var(--surface-2);
    cursor: pointer;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .field > span {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }
  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .spot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--ink);
    font-size: 0.9rem;
  }
  .spot span {
    flex: 1;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .center {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin: -4px 0 12px;
    padding: 0;
  }
  .results {
    list-style: none;
    margin: -4px 0 10px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .results button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 7px 9px;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .results button.active {
    background: var(--surface-2);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .results small {
    color: var(--muted);
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    width: 64px;
    padding: 6px 2px;
    border: 2px solid transparent;
    border-radius: 12px;
    background: none;
    cursor: pointer;
  }
  .cat small {
    font-size: 0.68rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .cat[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .tried {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 4px 14px 4px 4px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
  }
  .tried.on {
    border-color: var(--good);
    color: var(--good);
  }
  .scores {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
  }
  .score {
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--line);
    background: var(--surface);
    color: var(--muted);
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .score.filled {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .error {
    color: var(--accent);
    font-size: 0.85rem;
  }
  .submit {
    width: 100%;
    padding: 12px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
  }
  .submit:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .hint {
    margin: 10px 0 0;
    font-size: 0.78rem;
    color: var(--muted);
    text-align: center;
  }
</style>
