<script lang="ts">
  import type { Photo } from '../lib/types';
  import { icon } from '../lib/icons';

  let { photos, index = $bindable<number | null>(null) }: { photos: Photo[]; index: number | null } = $props();
  let dialog: HTMLDialogElement;

  $effect(() => {
    if (index !== null && !dialog.open) dialog.showModal();
    if (index === null && dialog.open) dialog.close();
  });

  const current = $derived(index !== null ? photos[index] : null);
  const step = (d: number) => index !== null && (index = (index + d + photos.length) % photos.length);
</script>

<dialog
  bind:this={dialog}
  onclose={() => (index = null)}
  onclick={(e) => e.target === dialog && (index = null)}
  onkeydown={(e) => (e.key === 'ArrowRight' ? step(1) : e.key === 'ArrowLeft' ? step(-1) : null)}
>
  {#if current}
    <figure>
      <img src={current.urls.lg} alt={current.alt} width={current.width} height={current.height} />
      <figcaption>
        {#if current.alt}<span>{current.alt}</span>{/if}
        {#if current.author}<span class="credit inline-icon">{@html icon('camera', 14)}{current.author}</span>{/if}
      </figcaption>
    </figure>
    {#if photos.length > 1}
      <button class="nav prev" aria-label="Photo précédente" onclick={() => step(-1)}>‹</button>
      <button class="nav next" aria-label="Photo suivante" onclick={() => step(1)}>›</button>
    {/if}
    <button class="close" aria-label="Fermer" onclick={() => (index = null)}>✕</button>
  {/if}
</dialog>

<style>
  dialog {
    width: 100vw;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: rgb(0 0 0 / 0.92);
    color: #fff;
  }
  dialog::backdrop {
    background: transparent;
  }
  figure {
    height: 100%;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 48px 12px 24px;
    pointer-events: none;
  }
  img {
    max-height: calc(100% - 40px);
    width: auto;
    object-fit: contain;
    border-radius: 6px;
    pointer-events: auto;
  }
  figcaption {
    display: flex;
    gap: 16px;
    font-size: 0.9rem;
    opacity: 0.85;
  }
  button {
    position: absolute;
    border: 0;
    background: rgb(255 255 255 / 0.12);
    color: #fff;
    border-radius: 999px;
    width: 44px;
    height: 44px;
    font-size: 1.4rem;
    cursor: pointer;
  }
  .close {
    top: max(12px, env(safe-area-inset-top));
    right: 12px;
    font-size: 1rem;
  }
  .nav {
    top: 50%;
    transform: translateY(-50%);
    font-size: 2rem;
    line-height: 1;
  }
  .prev {
    left: 12px;
  }
  .next {
    right: 12px;
  }
</style>
