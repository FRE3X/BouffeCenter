<script lang="ts">
  import type { Photo } from '../lib/types';
  import { icon } from '../lib/icons';
  import Lightbox from './Lightbox.svelte';

  let { photos }: { photos: Photo[] } = $props();
  let index = $state<number | null>(null);
</script>

<div class="gallery">
  {#each photos as photo, i (photo.id)}
    <button onclick={() => (index = i)}>
      <img src={photo.urls.sm} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" />
      {#if photo.author}<span class="inline-icon">{@html icon('camera', 12)}{photo.author}</span>{/if}
    </button>
  {/each}
</div>
<Lightbox {photos} bind:index />

<style>
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  button {
    position: relative;
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: 12px;
    overflow: hidden;
    cursor: zoom-in;
    background: var(--surface-2);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  span {
    position: absolute;
    left: 6px;
    bottom: 6px;
    padding: 1px 8px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.55);
    color: #fff;
    font-size: 0.75rem;
  }
</style>
