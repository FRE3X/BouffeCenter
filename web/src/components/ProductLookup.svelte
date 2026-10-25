<!-- Loaded on demand (members only): its styles travel with the JS, not with the page CSS. -->
<svelte:options css="injected" />

<script lang="ts">
  import type { Component } from 'svelte';
  import type { ProductKind, WineType } from '../lib/types';
  import { icon } from '../lib/icons';
  import { type Existing, type Prefill, WINE_TYPE_LABELS } from '../lib/products';

  /**
   * Prefill a product from Open Food Facts (name search, debounced, or barcode scan) or, for wines when an admin
   * configured a key, from GrapeMinds (search on Enter only: the free plan has a monthly quota).
   */
  let {
    kind,
    grapeminds = false,
    onpick,
    onexisting,
  }: { kind: ProductKind; grapeminds?: boolean; onpick: (fields: Prefill) => void; onexisting?: (p: Existing) => void } = $props();

  type Result = { key: string; title: string; detail: string; image: string | null; existing?: Existing | null; pick: () => Promise<Prefill> };

  let source = $state<'off' | 'grapeminds'>(kind === 'wine' && grapeminds ? 'grapeminds' : 'off');
  let query = $state('');
  let results = $state<Result[]>([]);
  let active = $state(0);
  let busy = $state(false);
  let message = $state('');
  let Scanner = $state<Component<{ ondetect: (code: string) => void; onclose: () => void }>>();
  let scanning = $state(false);
  let timer: ReturnType<typeof setTimeout>;
  let requestId = 0;

  async function api<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Recherche impossible');
    return data;
  }

  type OffItem = { barcode: string | null; name: string; brand: string; size: string; image_url: string | null; existing: Existing | null };
  const offResult = (p: OffItem): Result => ({
    key: `off-${p.barcode}`,
    title: p.name,
    detail: [p.brand, p.size].filter(Boolean).join(' · '),
    image: p.image_url,
    existing: p.existing,
    pick: async () => ({ name: p.name, brand: p.brand, barcode: p.barcode, image_url: p.image_url }),
  });

  type GmItem = { grapeminds_id: string; name: string; producer: string; wine_type: WineType | null };
  const gmResult = (w: GmItem): Result => ({
    key: `gm-${w.grapeminds_id}`,
    title: w.name,
    detail: [w.producer, w.wine_type ? WINE_TYPE_LABELS[w.wine_type] : ''].filter(Boolean).join(' · '),
    image: null,
    pick: () => api<Prefill>(`/api/products/wine-lookup/${encodeURIComponent(w.grapeminds_id)}`),
  });

  async function run(fn: () => Promise<Result[]>) {
    const id = ++requestId;
    busy = true;
    message = '';
    try {
      const items = await fn();
      if (id !== requestId) return;
      results = items;
      active = 0;
      if (!items.length) message = 'Aucun résultat.';
    } catch (err) {
      if (id === requestId) message = (err as Error).message;
    } finally {
      if (id === requestId) busy = false;
    }
  }

  function search(now = false) {
    clearTimeout(timer);
    const q = query.trim();
    if (source === 'grapeminds') {
      if (now && q.length >= 3)
        run(async () => (await api<{ items: GmItem[] }>(`/api/products/wine-lookup?q=${encodeURIComponent(q)}`)).items.map(gmResult));
      return;
    }
    if (q.length < 3) return (results = []);
    timer = setTimeout(
      () => run(async () => (await api<{ items: OffItem[] }>(`/api/products/lookup?q=${encodeURIComponent(q)}`)).items.map(offResult)),
      now ? 0 : 450,
    );
  }

  async function lookupBarcode(code: string) {
    scanning = false;
    query = code;
    source = 'off';
    await run(async () => (await api<{ items: OffItem[] }>(`/api/products/lookup?barcode=${code}`)).items.map(offResult));
    // Unknown to Open Food Facts: keep the code anyway.
    if (!results.length) {
      message = 'Produit inconnu d’Open Food Facts : code-barres conservé.';
      onpick({ barcode: code });
    } else if (results.length === 1) {
      choose(results[0]);
    }
  }

  async function startScan() {
    Scanner ??= (await import('./BarcodeScanner.svelte')).default;
    scanning = true;
  }

  async function choose(r: Result) {
    if (r.existing && onexisting) return onexisting(r.existing);
    busy = true;
    try {
      onpick(await r.pick());
      results = [];
      message = '';
    } catch (err) {
      message = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length) choose(results[active]);
      else search(true);
    } else if (results.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
    }
  }
</script>

<div class="lookup">
  {#if kind === 'wine' && grapeminds}
    <div class="sources" role="tablist" aria-label="Source">
      <button type="button" role="tab" aria-selected={source === 'grapeminds'} onclick={() => ((source = 'grapeminds'), (results = []))}>GrapeMinds</button>
      <button type="button" role="tab" aria-selected={source === 'off'} onclick={() => ((source = 'off'), (results = []))}>Open Food Facts</button>
    </div>
  {/if}

  {#if scanning && Scanner}
    <Scanner ondetect={lookupBarcode} onclose={() => (scanning = false)} />
  {/if}

  <div class="bar">
    <input
      bind:value={query}
      oninput={() => search()}
      {onkeydown}
      placeholder={source === 'grapeminds' ? 'Nom du vin, puis Entrée…' : 'Chercher un produit (Open Food Facts)…'}
      autocomplete="off"
      enterkeyhint="search"
      aria-label="Rechercher pour préremplir"
    />
    {#if source === 'grapeminds'}
      <button type="button" class="go" onclick={() => search(true)} disabled={busy || query.trim().length < 3}>Chercher</button>
    {/if}
    <button type="button" class="scan" onclick={startScan} title="Scanner un code-barres" aria-label="Scanner un code-barres">
      {@html icon('scan-barcode', 20)}
    </button>
  </div>

  {#if busy}<p class="message">Recherche…</p>{:else if message}<p class="message">{message}</p>{/if}

  {#if results.length}
    <ul class="results" role="listbox" aria-label="Résultats">
      {#each results as r, i (r.key)}
        <li role="option" aria-selected={i === active}>
          <button type="button" tabindex="-1" class:active={i === active} onclick={() => choose(r)} onmouseenter={() => (active = i)}>
            {#if r.image}<img src={r.image} alt="" loading="lazy" />{:else}<span class="noimg">{@html icon(kind === 'wine' ? 'wine' : 'package', 18)}</span>{/if}
            <span class="text">
              <strong>{r.title}</strong>
              <small>{r.existing ? 'Déjà enregistré · ' : ''}{r.detail}</small>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if source === 'grapeminds'}
    <p class="credit">Données factuelles issues de GrapeMinds, modifiables ensuite.</p>
  {/if}
</div>

<style>
  .lookup {
    margin-bottom: 12px;
  }
  .sources {
    display: inline-flex;
    gap: 4px;
    margin-bottom: 8px;
    padding: 3px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .sources button {
    padding: 4px 12px;
    border: 0;
    border-radius: 999px;
    background: none;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
  }
  .sources button[aria-selected='true'] {
    background: var(--accent);
    color: #fff;
  }
  .bar {
    display: flex;
    gap: 6px;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .scan,
  .go {
    flex: none;
    display: grid;
    place-items: center;
    min-width: 42px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .message,
  .credit {
    margin: 6px 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .results {
    list-style: none;
    max-height: 260px;
    overflow-y: auto;
    margin: 6px 0 0;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .results button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 6px 8px;
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
  .results img,
  .noimg {
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    object-fit: contain;
    background: #fff;
  }
  .noimg {
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--muted);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .text strong,
  .text small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .text small {
    color: var(--muted);
  }
</style>
