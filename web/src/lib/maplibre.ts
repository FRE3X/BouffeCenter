import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre 6 ships its worker as a separate ES module; let Vite bundle it and tell MapLibre where it is.
maplibregl.setWorkerUrl(workerUrl);

export const mapStyle = () =>
  `https://tiles.openfreemap.org/styles/${matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'positron'}`;

export default maplibregl;
