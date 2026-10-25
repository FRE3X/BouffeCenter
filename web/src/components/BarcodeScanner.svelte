<!-- Loaded on demand (members only): its styles travel with the JS, not with the page CSS. -->
<svelte:options css="injected" />

<script lang="ts">
  import { icon } from '../lib/icons';

  /**
   * Camera barcode scanner (EAN/UPC). Uses the browser's BarcodeDetector when it exists, otherwise a WASM polyfill
   * served by the site itself. This component is only ever loaded on demand (dynamic import).
   */
  let { ondetect, onclose }: { ondetect: (code: string) => void; onclose: () => void } = $props();

  let video = $state<HTMLVideoElement>();
  let error = $state('');
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

  type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

  async function createDetector(): Promise<Detector> {
    const Native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } })
      .BarcodeDetector;
    if (Native && (await Native.getSupportedFormats()).includes('ean_13')) return new Native({ formats: FORMATS });
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
    return new BarcodeDetector({ formats: FORMATS as never });
  }

  $effect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped || !video) return stream.getTracks().forEach((t) => t.stop());
        video.srcObject = stream;
        await video.play();
        const detector = await createDetector();
        while (!stopped) {
          const codes = await detector.detect(video).catch(() => []);
          const code = codes.find((c) => /^\d{6,14}$/.test(c.rawValue));
          if (code) {
            navigator.vibrate?.(60);
            ondetect(code.rawValue);
            return;
          }
          await new Promise((r) => setTimeout(r, 180));
        }
      } catch (err) {
        const name = (err as Error).name;
        error =
          name === 'NotAllowedError'
            ? "L'accès à la caméra a été refusé."
            : name === 'NotFoundError'
              ? 'Aucune caméra trouvée.'
              : 'Scan impossible sur cet appareil (HTTPS requis).';
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  });
</script>

<div class="scanner">
  {#if error}
    <p class="error">{error}</p>
  {:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} playsinline muted></video>
    <span class="frame" aria-hidden="true"></span>
    <p class="hint">Visez le code-barres du produit</p>
  {/if}
  <button type="button" class="close" onclick={onclose} aria-label="Arrêter le scan">{@html icon('x', 16)}</button>
</div>

<style>
  .scanner {
    position: relative;
    overflow: hidden;
    margin-bottom: 12px;
    border-radius: 14px;
    background: #000;
    aspect-ratio: 4 / 3;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .frame {
    position: absolute;
    inset: 30% 12%;
    border: 3px solid var(--accent);
    border-radius: 10px;
    box-shadow: 0 0 0 999px rgb(0 0 0 / 0.35);
  }
  .hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 8px;
    margin: 0;
    text-align: center;
    color: #fff;
    font-size: 0.85rem;
    text-shadow: 0 1px 3px #000;
  }
  .error {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    padding: 16px;
    color: #fff;
    text-align: center;
  }
  .close {
    position: absolute;
    top: 8px;
    right: 8px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.9);
    color: #000;
    cursor: pointer;
  }
</style>
