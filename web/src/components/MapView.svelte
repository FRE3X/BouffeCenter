<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl, { mapStyle } from '../lib/maplibre';
  import type { GeoJSONSource, Map as MLMap, Marker, Popup, PositionAnchor } from 'maplibre-gl';
  import type { Category, Product, ProductList, RecipeCard, RecipeList } from '../lib/types';
  import { productHref, productSubtitle } from '../lib/products';
  import { isMember, onMember } from '../lib/member';
  import QuickAdd from './QuickAdd.svelte';
  import { rating, ratingColor } from '../lib/format';
  import { iconBadge, triedBadge } from '../lib/icons';
  import PlacePanel from './PlacePanel.svelte';

  // The phone tab bar covers the bottom of the map: keep fitted places and the selected one above it.
  const tabbarHeight = () => document.querySelector<HTMLElement>('.tabbar')?.offsetHeight ?? 0;

  type Props = {
    id: number;
    slug: string;
    name: string;
    city: string;
    category: string | null;
    icon: string;
    color: string;
    rating: number | null;
    reviews: number;
    tried: boolean;
    price: number | null;
    tags: string[];
    thumb: string | null;
    search: string;
  };
  type Feature = { type: 'Feature'; id: number; geometry: { type: 'Point'; coordinates: [number, number] }; properties: Props };

  let { features, categories }: { features: Feature[]; categories: Category[] } = $props();

  let container: HTMLDivElement;
  let map: MLMap | undefined;
  let activeCategory = $state<string | null>(null);
  let query = $state('');
  // Read before the URL-sync effect below runs, so a shared `?lieu=` link survives mount.
  const initialSlug = new URL(location.href).searchParams.get('lieu');
  let selected = $state<string | null>(null);
  let searchOpen = $state(false);
  let activeResult = $state(0);
  let relatedRecipes = $state<RecipeCard[]>([]);
  let relatedProducts = $state<Product[]>([]);
  // Members can tick "tried" straight from the map; overrides keep the UI in sync without reloading.
  let triedOverrides = $state<Record<number, boolean>>({});
  let member = $state(isMember());
  onMember(() => (member = true));
  const markers = new Map<number, Marker>();

  let message = $state('');
  let messageTimer: ReturnType<typeof setTimeout>;
  function flash(text: string) {
    message = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (message = ''), 3500);
  }

  const isTried = (p: Props) => triedOverrides[p.id] ?? p.tried;
  const selectedFeature = $derived(features.find((f) => f.properties.slug === selected));

  async function setTried(id: number, tried: boolean) {
    let res: Response;
    try {
      res = await fetch(`/api/places/${id}/tried`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tried }),
      });
    } catch {
      flash('Serveur injoignable, réessaie dans un instant.');
      return false;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      flash(res.status === 401 ? 'Session expirée : reconnecte-toi dans l’admin.' : (body.error ?? 'Impossible d’enregistrer, réessaie.'));
      return false;
    }
    triedOverrides[id] = tried;
    const feature = features.find((f) => f.properties.id === id);
    const el = markers.get(id)?.getElement();
    if (feature && el) renderMarker(el, feature.properties);
    return true;
  }

  const normalize = (s: string) =>
    s.replace(/[œŒ]/g, 'oe').replace(/[æÆ]/g, 'ae').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  const visible = $derived.by(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return features.filter(
      (f) =>
        (!activeCategory || f.properties.category === activeCategory) &&
        words.every((w) => f.properties.search.includes(w)),
    );
  });

  const activeInfo = $derived(categories.find((c) => c.slug === activeCategory));

  function filterBy(slug: string | null) {
    activeCategory = activeCategory === slug ? null : slug;
    if (selected && activeCategory && features.find((f) => f.properties.slug === selected)?.properties.category !== activeCategory) {
      selected = null;
    }
    fitTo(visible);
  }

  /** Frames the given places, keeping the zoom reasonable for a single one. */
  function fitTo(list: Feature[]) {
    if (!map || !list.length) return;
    const bounds = new maplibregl.LngLatBounds();
    list.forEach((f) => bounds.extend(f.geometry.coordinates));
    map.fitBounds(bounds, { padding: { top: 120, bottom: 80 + tabbarHeight(), left: 60, right: 90 }, maxZoom: 15, duration: 600 });
  }

  // Every published category appears in the rail, even before it has places.
  const usedCategories = $derived(categories.filter((c) => c.published !== false));
  const results = $derived(query.trim() ? visible.slice(0, 8) : []);
  const resultCount = $derived(results.length + relatedRecipes.length + relatedProducts.length);

  // Recipes, then products and wines matching the search, shown under the places.
  $effect(() => {
    const q = query.trim();
    if (q.length < 2) {
      relatedRecipes = [];
      relatedProducts = [];
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/recipes?limit=4&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        // Private recipes answer 401 to visitors: no related box then.
        .then((r) => (r.ok ? (r.json() as Promise<RecipeList>) : null))
        .then((data) => (relatedRecipes = data?.items ?? []))
        .catch(() => {});
      // Without a kind, the API leaves out product sections that are private or switched off.
      fetch(`/api/products?limit=4&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<ProductList>) : null))
        .then((data) => (relatedProducts = data?.items ?? []))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  });

  function openResult(i: number) {
    if (i < results.length) select(results[i]);
    else if (relatedRecipes[i - results.length]) location.href = `/recettes/${relatedRecipes[i - results.length].slug}`;
    else if (relatedProducts[i - results.length - relatedRecipes.length])
      location.href = productHref(relatedProducts[i - results.length - relatedRecipes.length]);
  }

  // Hovering a category in the rail greys out the places of other categories (preview only, mouse users).
  let previewCategory = $state<string | null>(null);
  const pointerHover = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

  function applyDim(el: HTMLElement, p: Props) {
    el.classList.toggle('dimmed', previewCategory !== null && p.category !== previewCategory);
  }

  $effect(() => {
    const preview = previewCategory;
    for (const [id, marker] of markers) {
      const feature = features.find((f) => f.properties.id === id);
      if (feature) applyDim(marker.getElement(), feature.properties);
    }
    // Clusters mix categories: fade them too while previewing.
    if (map?.getLayer('clusters')) {
      map.setPaintProperty('clusters', 'circle-opacity', preview ? 0.3 : 1);
      map.setPaintProperty('clusters', 'circle-stroke-opacity', preview ? 0.3 : 1);
      map.setPaintProperty('cluster-count', 'text-opacity', preview ? 0.4 : 1);
    }
  });

  // Members can tick markers: refresh existing ones when membership is confirmed after mount.
  $effect(() => {
    const ready = member;
    for (const [id, marker] of markers) {
      const feature = features.find((f) => f.properties.id === id);
      if (feature) renderMarker(marker.getElement(), feature.properties);
      marker.getElement().classList.toggle('can-tick', ready);
    }
  });

  // Keep the map source in sync with filters.
  $effect(() => {
    const data = { type: 'FeatureCollection' as const, features: visible };
    (map?.getSource('places') as GeoJSONSource | undefined)?.setData(data);
  });

  // Reflect the selected place in the URL so it can be shared.
  $effect(() => {
    const url = new URL(location.href);
    if (selected) url.searchParams.set('lieu', selected);
    else url.searchParams.delete('lieu');
    history.replaceState(null, '', url);
  });

  function select(f: Feature, fly = true) {
    hideHoverCard();
    selected = f.properties.slug;
    searchOpen = false;
    if (fly && map) {
      const mobile = matchMedia('(max-width: 720px)').matches;
      map.flyTo({
        center: f.geometry.coordinates,
        zoom: Math.max(map.getZoom(), 15),
        padding: mobile ? { bottom: innerHeight * 0.55 + tabbarHeight(), top: 0, left: 0, right: 0 } : { left: 420, top: 0, bottom: 0, right: 0 },
        essential: true,
      });
    }
  }

  function renderMarker(el: HTMLElement, p: Props) {
    const tried = isTried(p);
    el.setAttribute('aria-label', `${p.name}${p.rating !== null ? `, ${rating(p.rating)} sur 10` : ''}, ${tried ? 'déjà testé' : 'à tester'}`);
    // Category icon, rating circle and "tried" check: three circles of the same size.
    const score = p.rating !== null ? `<span class="pin-rating" style="background:${ratingColor(p.rating)}">${rating(p.rating)}<small>/10</small></span>` : '';
    el.innerHTML = `${iconBadge(p.icon, 34)}${score}${triedBadge(tried, 34)}`;
    el.classList.toggle('can-tick', member);
  }

  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // Hover card (photo + name), only for devices with a real pointer: a single popup, moved from marker to marker.
  // It sits above the marker, or below the point when there isn't room above (floating header included),
  // and shifts sideways near the left/right edges.
  let hoverCard: Popup | undefined;
  let hoverAnchor = '';
  function showHoverCard(f: Feature) {
    if (!map || selected === f.properties.slug) return;
    const p = f.properties;
    const { x, y } = map.project(f.geometry.coordinates);
    const roomAbove = (p.thumb ? 185 : 60) + 60 + 70; // card + marker + floating header
    const halfCard = 120;
    const anchor = ((y < roomAbove ? 'top' : 'bottom') +
      (x < halfCard ? '-left' : x > map.getContainer().clientWidth - halfCard ? '-right' : '')) as PositionAnchor;
    if (!hoverCard || hoverAnchor !== anchor) {
      hoverCard?.remove();
      hoverAnchor = anchor;
      // Above: clear the marker (anchored by its bottom on the point). Below: just under the point.
      const offset: [number, number] = [0, anchor.startsWith('top') ? 10 : -50];
      hoverCard = new maplibregl.Popup({ closeButton: false, closeOnClick: false, anchor, offset, className: 'hover-card', maxWidth: '220px' });
    }
    const photo = p.thumb ? `<img src="${escapeHtml(p.thumb)}" alt="" decoding="async">` : '';
    const where = [p.category, p.city].filter(Boolean).join(' · ');
    hoverCard
      .setLngLat(f.geometry.coordinates)
      .setHTML(`${photo}<div><strong>${escapeHtml(p.name)}</strong>${where ? `<small>${escapeHtml(where)}</small>` : ''}</div>`)
      .addTo(map);
  }
  const hideHoverCard = () => hoverCard?.remove();

  function markerElement(p: Props) {
    const el = document.createElement('div');
    el.className = 'pin';
    el.role = 'button';
    el.tabIndex = 0;
    renderMarker(el, p);
    return el;
  }

  onMount(() => {
    const bounds = new maplibregl.LngLatBounds();
    features.forEach((f) => bounds.extend(f.geometry.coordinates));

    map = new maplibregl.Map({
      container,
      style: mapStyle(),
      center: [2.3488, 48.8534],
      zoom: 11,
      attributionControl: { compact: true },
      ...(features.length ? { bounds, fitBoundsOptions: { padding: { top: 120, bottom: 70 + tabbarHeight(), left: 70, right: 90 }, maxZoom: 14 } } : {}),
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }),
      'bottom-right',
    );

    const byId = new Map(features.map((f) => [f.properties.id, f]));
    const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let onScreen = new Map<number, Marker>();

    function syncMarkers() {
      if (!map?.getSource('places') || !map.isSourceLoaded('places')) return;
      const next = new Map<number, Marker>();
      for (const f of map.querySourceFeatures('places')) {
        const props = f.properties as { cluster?: boolean; id?: number };
        if (props.cluster || !props.id || next.has(props.id)) continue;
        const feature = byId.get(props.id);
        if (!feature) continue;
        let marker = markers.get(props.id);
        if (!marker) {
          const el = markerElement(feature.properties);
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            // Members tick the check circle to mark the place as tried; anywhere else opens it.
            if (member && (e.target as HTMLElement).closest('.tried-badge')) {
              setTried(feature.properties.id, !isTried(feature.properties));
            } else {
              select(feature);
            }
          });
          el.addEventListener('keydown', (e) => e.key === 'Enter' && select(feature));
          if (canHover) {
            el.addEventListener('mouseenter', () => showHoverCard(feature));
            el.addEventListener('mouseleave', hideHoverCard);
          }
          applyDim(el, feature.properties);
          marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(feature.geometry.coordinates);
          markers.set(props.id, marker);
        }
        next.set(props.id, marker);
        if (!onScreen.has(props.id)) marker.addTo(map);
      }
      for (const [id, marker] of onScreen) if (!next.has(id)) marker.remove();
      if (onScreen.size !== next.size) hideHoverCard();
      onScreen = next;
    }

    map.on('load', () => {
      map!.addSource('places', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: visible },
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 14,
      });
      map!.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'places',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#D1382F',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
      map!.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'places',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Noto Sans Bold'], 'text-size': 13 },
        paint: { 'text-color': '#ffffff' },
      });
      map!.on('click', 'clusters', async (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const source = map!.getSource('places') as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
        map!.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      map!.on('mouseenter', 'clusters', () => (map!.getCanvas().style.cursor = 'pointer'));
      map!.on('mouseleave', 'clusters', () => (map!.getCanvas().style.cursor = ''));
      map!.on('render', syncMarkers);

      const feature = initialSlug && features.find((f) => f.properties.slug === initialSlug);
      if (feature) select(feature);
    });
    map.on('click', () => (selected = null));

    // The search field lives in the shared header.
    const input = document.getElementById('site-search') as HTMLInputElement | null;
    const onInput = () => {
      query = input!.value;
      searchOpen = true;
      activeResult = 0;
    };
    // ↑/↓ move through the results, Entrée opens the highlighted place.
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && resultCount) {
        e.preventDefault();
        searchOpen = true;
        const n = resultCount;
        activeResult = e.key === 'ArrowDown' ? (activeResult + 1) % n : (activeResult - 1 + n) % n;
        document.querySelector(`.results [data-i="${activeResult}"]`)?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && activeResult < resultCount) {
        openResult(activeResult);
        input!.blur();
      } else if (e.key === 'Escape') {
        searchOpen = false;
      }
    };
    input?.addEventListener('input', onInput);
    input?.addEventListener('keydown', onKey);
    input?.addEventListener('focus', () => (searchOpen = true));
    if (input?.value) query = input.value;

    return () => {
      input?.removeEventListener('input', onInput);
      input?.removeEventListener('keydown', onKey);
      map?.remove();
    };
  });
</script>

<div class="map" bind:this={container}></div>

{#if usedCategories.length}
  <!-- Published categories as a small icon rail on the right; tap to filter, tap again to show all. -->
  <nav class="rail" aria-label="Filtrer par catégorie" class:filtering={activeCategory !== null}>
    {#each usedCategories as c (c.id)}
      <button
        class="rail-btn"
        aria-pressed={activeCategory === c.slug}
        aria-label={c.name}
        onclick={() => filterBy(c.slug)}
        onmouseenter={() => pointerHover && (previewCategory = c.slug)}
        onmouseleave={() => (previewCategory = null)}
        onfocus={() => pointerHover && (previewCategory = c.slug)}
        onblur={() => (previewCategory = null)}
      >
        {@html iconBadge(c.icon, 28)}
        <span class="rail-label">{c.name}</span>
      </button>
    {/each}
  </nav>
{/if}

{#if activeInfo}
  <div class="active-filter" role="status">
    {@html iconBadge(activeInfo.icon, 24)}
    <span><strong>{activeInfo.name}</strong> · {visible.length} adresse{visible.length > 1 ? 's' : ''}</span>
    <button aria-label="Retirer le filtre" onclick={() => filterBy(null)}>✕</button>
  </div>
{/if}

{#if searchOpen && query.trim()}
  <div class="results" role="listbox">
    {#each results as f, i (f.id)}
      <button
        role="option"
        data-i={i}
        aria-selected={i === activeResult}
        class:active={i === activeResult}
        class:can-tick={member}
        onmouseenter={() => (activeResult = i)}
        onclick={(e) => {
          if (member && (e.target as HTMLElement).closest('.tried-badge')) setTried(f.properties.id, !isTried(f.properties));
          else select(f);
        }}
      >
        {#if f.properties.thumb}
          <img class="thumb" src={f.properties.thumb} alt="" loading="lazy" decoding="async" />
        {:else}
          <span class="thumb">{@html iconBadge(f.properties.icon, 30)}</span>
        {/if}
        <span class="text">
          <strong>{f.properties.name}</strong>
          <small>{f.properties.city}{isTried(f.properties) ? '' : ' · À tester'}</small>
        </span>
        {#if f.properties.rating !== null}
          <span class="rating" style:background={ratingColor(f.properties.rating)}>{rating(f.properties.rating)}<small>/10</small></span>
        {/if}
        {@html triedBadge(isTried(f.properties), 41)}
      </button>
    {:else}
      <p class="empty">Aucune adresse trouvée</p>
    {/each}

    {#if relatedRecipes.length}
      <div class="related">
        <p class="related-title">Recettes liées</p>
        {#each relatedRecipes as r, j (r.id)}
          {@const i = results.length + j}
          <a href={`/recettes/${r.slug}`} role="option" data-i={i} aria-selected={i === activeResult} class:active={i === activeResult} onmouseenter={() => (activeResult = i)}>
            {#if r.cover}
              <img class="thumb small" src={r.cover.sm} alt="" loading="lazy" decoding="async" />
            {:else}
              <span class="thumb small">{@html iconBadge(r.category?.icon ?? 'cooking-pot', 26)}</span>
            {/if}
            <span class="text">
              <strong>{r.title}</strong>
              {#if r.tags.length}<small>{r.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}</small>{/if}
            </span>
          </a>
        {/each}
      </div>
    {/if}

    {#if relatedProducts.length}
      <div class="related">
        <p class="related-title">Produits liés</p>
        {#each relatedProducts as p, j (p.id)}
          {@const i = results.length + relatedRecipes.length + j}
          <a href={productHref(p)} role="option" data-i={i} aria-selected={i === activeResult} class:active={i === activeResult} onmouseenter={() => (activeResult = i)}>
            {#if p.cover}
              <img class="thumb small" src={p.cover.sm} alt="" loading="lazy" decoding="async" />
            {:else}
              <span class="thumb small">{@html iconBadge(p.category?.icon ?? (p.kind === 'wine' ? 'wine' : 'package'), 26)}</span>
            {/if}
            <span class="text">
              <strong>{p.name}</strong>
              {#if productSubtitle(p)}<small>{productSubtitle(p)}</small>{/if}
            </span>
          </a>
        {/each}
      </div>
    {/if}
  </div>
{/if}

{#if message}
  <div class="flash" role="alert">{message}</div>
{/if}

{#if member && !selected}
  <QuickAdd categories={usedCategories} getView={() => map && { ...map.getCenter(), zoom: map.getZoom() }} />
{/if}

{#if selected}
  <PlacePanel
    slug={selected}
    onclose={() => (selected = null)}
    onfilter={(slug) => activeCategory !== slug && filterBy(slug)}
    ontried={member ? setTried : undefined}
    tried={selectedFeature ? isTried(selectedFeature.properties) : undefined}
  />
{/if}

<style>
  .map {
    position: fixed;
    inset: 0;
  }
  .flash {
    position: fixed;
    z-index: 80;
    left: 50%;
    bottom: max(28px + env(safe-area-inset-bottom), 16px + var(--tabbar-h));
    transform: translateX(-50%);
    padding: 10px 18px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    box-shadow: var(--shadow);
  }
  .active-filter {
    position: fixed;
    z-index: 10;
    top: calc(var(--header-h) + env(safe-area-inset-top) + 8px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 4px;
    border-radius: 999px;
    background: var(--surface);
    border: 1.5px solid var(--accent);
    box-shadow: var(--shadow);
    font-size: 0.9rem;
    white-space: nowrap;
    animation: pop-in 0.18s ease-out;
  }
  .active-filter button {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 50%;
    background: var(--surface-2);
    cursor: pointer;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translate(-50%, -6px);
    }
  }
  .rail {
    position: fixed;
    z-index: 10;
    top: calc(var(--header-h) + env(safe-area-inset-top) + 10px);
    right: max(14px, env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    backdrop-filter: saturate(1.8) blur(16px);
    -webkit-backdrop-filter: saturate(1.8) blur(16px);
    border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
    box-shadow: 0 4px 20px rgb(31 27 22 / 0.12);
  }
  .rail-btn {
    position: relative;
    display: grid;
    place-items: center;
    padding: 2px;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
    transition:
      opacity 0.15s,
      transform 0.15s;
  }
  .rail-btn:hover {
    transform: scale(1.08);
  }
  .rail.filtering .rail-btn:not([aria-pressed='true']) {
    opacity: 0.4;
  }
  .rail-btn[aria-pressed='true'] {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }
  .rail-label {
    position: absolute;
    right: calc(100% + 12px);
    top: 50%;
    transform: translateY(-50%);
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--bg);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .rail-btn:hover .rail-label,
  .rail-btn:focus-visible .rail-label {
    opacity: 1;
  }
  @media (hover: none) {
    .rail-btn[aria-pressed='true'] .rail-label {
      opacity: 1;
    }
  }
  .results {
    position: fixed;
    z-index: 60;
    top: calc(var(--header-h) + env(safe-area-inset-top) + 6px);
    left: 12px;
    width: min(380px, calc(100vw - 24px));
    max-height: 60vh;
    overflow: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 6px;
  }
  .results button,
  .related a {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .related {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
  }
  .related a {
    text-decoration: none;
  }
  .related-title {
    margin: 4px 10px 6px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .results .thumb.small {
    width: 40px;
    height: 40px;
  }
  .results button.active,
  .related a.active {
    background: var(--surface-2);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .results .thumb {
    width: 52px;
    height: 52px;
    flex: none;
    border-radius: 10px;
    object-fit: cover;
    background: var(--surface-2);
    display: grid;
    place-items: center;
  }
  .results .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .results small {
    color: var(--muted);
  }
  .empty {
    margin: 0;
    padding: 10px;
    color: var(--muted);
  }

  :global(.pin) {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 2px;
    border: 2px solid var(--accent);
    border-radius: 999px;
    background: var(--surface);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
    cursor: pointer;
    transition:
      opacity 0.15s,
      filter 0.15s;
  }
  /* Category preview from the rail: other categories fade to grey. */
  :global(.pin.dimmed) {
    /* !important: MapLibre sets an inline opacity on markers. */
    opacity: 0.35 !important;
    filter: grayscale(1);
  }
  /* No transform here: MapLibre positions markers with an inline transform. */
  :global(.pin:hover) {
    z-index: 2;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.3);
  }
  :global(.pin::after) {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -7px;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--accent);
    border-bottom: 0;
  }
  .results .can-tick :global(.tried-badge),
  :global(.pin.can-tick .tried-badge) {
    cursor: pointer;
    transition: filter 0.12s;
  }
  .results .can-tick :global(.tried-badge svg),
  :global(.pin.can-tick .tried-badge svg) {
    transition: transform 0.12s;
  }
  /* Hover stays inside the circle: darker disc and a slightly bigger check, no overflow. */
  .results .can-tick :global(.tried-badge:hover),
  :global(.pin.can-tick .tried-badge:hover) {
    filter: brightness(0.88);
  }
  .results .can-tick :global(.tried-badge:hover svg),
  :global(.pin.can-tick .tried-badge:hover svg) {
    transform: scale(1.18);
  }
  /* Hover card next to a marker: photo + name. */
  :global(.hover-card) {
    pointer-events: none;
    z-index: 3;
  }
  :global(.hover-card .maplibregl-popup-content) {
    padding: 0;
    overflow: hidden;
    border-radius: 14px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow);
  }
  :global(.hover-card[class*='anchor-bottom'] .maplibregl-popup-tip) {
    border-top-color: var(--surface);
  }
  :global(.hover-card[class*='anchor-top'] .maplibregl-popup-tip) {
    border-bottom-color: var(--surface);
  }
  :global(.hover-card img) {
    display: block;
    width: 220px;
    height: 124px;
    object-fit: cover;
    background: var(--surface-2);
  }
  :global(.hover-card div) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 9px 12px 10px;
  }
  :global(.hover-card strong) {
    font-family: var(--font-display);
    font-size: 1rem;
    line-height: 1.2;
  }
  :global(.hover-card small) {
    color: var(--muted);
    font-size: 0.78rem;
  }
  :global(.pin-rating) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding-bottom: 2px;
    border-radius: 50%;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.03em;
  }
  :global(.maplibregl-ctrl-bottom-right),
  :global(.maplibregl-ctrl-bottom-left) {
    margin-bottom: max(env(safe-area-inset-bottom), var(--tabbar-h));
  }

  /* Map controls in the house style (frosted glass), readable in light and dark mode. */
  :global(.maplibregl-map .maplibregl-ctrl-group) {
    overflow: hidden;
    border-radius: 14px;
    background: var(--glass);
    backdrop-filter: saturate(1.8) blur(16px);
    -webkit-backdrop-filter: saturate(1.8) blur(16px);
    border: 1px solid var(--glass-border);
  }
  :global(.maplibregl-map .maplibregl-ctrl-group:not(:empty)) {
    box-shadow: 0 4px 20px rgb(31 27 22 / 0.12);
  }
  :global(.maplibregl-map .maplibregl-ctrl-group button) {
    width: 38px;
    height: 38px;
  }
  :global(.maplibregl-map .maplibregl-ctrl-group button + button) {
    border-top: 1px solid var(--glass-border);
  }
  :global(.maplibregl-map .maplibregl-ctrl button:not(:disabled):hover),
  :global(.maplibregl-map .maplibregl-ctrl button:not(:disabled):active) {
    background-color: color-mix(in srgb, var(--ink) 8%, transparent);
  }
  :global(.maplibregl-map .maplibregl-ctrl-attrib.maplibregl-compact) {
    background: var(--glass);
    color: var(--muted);
    border: 1px solid var(--glass-border);
  }
  :global(.maplibregl-map .maplibregl-ctrl-attrib a) {
    color: var(--muted);
  }
  @media (prefers-color-scheme: dark) {
    :global(.maplibregl-map .maplibregl-ctrl-group:not(:empty)) {
      box-shadow: 0 4px 20px rgb(0 0 0 / 0.4);
    }
    /* MapLibre draws its icons dark: invert them, and turn the hue back so the geolocation blue stays blue. */
    :global(.maplibregl-map .maplibregl-ctrl-icon),
    :global(.maplibregl-map .maplibregl-ctrl-attrib-button) {
      filter: invert(1) hue-rotate(180deg);
    }
  }
</style>
