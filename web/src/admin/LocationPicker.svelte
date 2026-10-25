<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl, { mapStyle } from '../lib/maplibre';
  import type { Map as MLMap, Marker } from 'maplibre-gl';

  import { geocode, type GeoResult as Result } from '../lib/geocode';

  let {
    lat = $bindable(0),
    lng = $bindable(0),
    address = $bindable(''),
    city = $bindable(''),
    onpick,
  }: { lat: number; lng: number; address: string; city: string; onpick?: (r: Result) => void } = $props();

  let container: HTMLDivElement;
  let map: MLMap;
  let marker: Marker;
  let query = $state('');
  let results = $state<Result[]>([]);
  let active = $state(0);
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  const hasPoint = () => lat !== 0 || lng !== 0;

  function place(lngLat: [number, number], zoom?: number) {
    marker.setLngLat(lngLat).addTo(map);
    map.easeTo({ center: lngLat, ...(zoom ? { zoom } : {}) });
  }

  function search() {
    clearTimeout(timer);
    if (query.trim().length < 3) return (results = []);
    timer = setTimeout(async () => {
      searching = true;
      try {
        results = await geocode(query, { ...map.getCenter(), zoom: map.getZoom() });
        active = 0;
      } finally {
        searching = false;
      }
    }, 300);
  }

  // ↑/↓ move through the suggestions, Enter picks one (instead of submitting the form), Escape closes them.
  function onkeydown(e: KeyboardEvent) {
    if (!results.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      results = [];
    }
  }

  function choose(r: Result) {
    lat = r.lat;
    lng = r.lng;
    address = r.address;
    city = r.city;
    results = [];
    query = '';
    place([r.lng, r.lat], 16);
    onpick?.(r);
  }

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: mapStyle(),
      center: hasPoint() ? [lng, lat] : [2.3488, 48.8534],
      zoom: hasPoint() ? 15 : 11,
      attributionControl: { compact: true },
    });
    marker = new maplibregl.Marker({ draggable: true, color: '#D1382F' });
    if (hasPoint()) marker.setLngLat([lng, lat]).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      lat = Number(p.lat.toFixed(6));
      lng = Number(p.lng.toFixed(6));
    });
    map.on('click', (e) => {
      lat = Number(e.lngLat.lat.toFixed(6));
      lng = Number(e.lngLat.lng.toFixed(6));
      place([lng, lat]);
    });
    return () => map.remove();
  });
</script>

<div class="picker">
  <div class="search">
    <input
      type="search"
      placeholder="Rechercher un lieu ou une adresse…"
      bind:value={query}
      oninput={search}
      {onkeydown}
      role="combobox"
      aria-expanded={results.length > 0}
      aria-controls="location-results"
      aria-activedescendant={results.length ? `location-result-${active}` : undefined}
    />
    {#if results.length}
      <ul id="location-results" role="listbox">
        {#each results as r, i}
          <li id="location-result-{i}" role="option" aria-selected={i === active}>
            <button type="button" tabindex="-1" class:active={i === active} onclick={() => choose(r)} onmouseenter={() => (active = i)}><strong>{r.label}</strong><small>{r.detail}</small></button>
          </li>
        {/each}
      </ul>
    {:else if searching}
      <p class="muted hint">Recherche…</p>
    {/if}
  </div>
  <div class="map" bind:this={container}></div>
  <p class="muted hint">
    {hasPoint() ? `Position : ${lat.toFixed(5)}, ${lng.toFixed(5)} — clique ou déplace le marqueur pour ajuster` : 'Recherche une adresse ou clique sur la carte pour placer le point.'}
  </p>
</div>

<style>
  .search {
    position: relative;
  }
  ul {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    list-style: none;
    margin: 0;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: var(--shadow);
  }
  li button {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  li button.active {
    background: var(--surface-2);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  li small {
    color: var(--muted);
  }
  .map {
    height: 260px;
    margin-top: 10px;
    border-radius: 12px;
    overflow: hidden;
  }
  .hint {
    margin: 6px 0 0;
    font-size: 0.82rem;
  }
</style>
