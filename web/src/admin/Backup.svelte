<script lang="ts">
  import { notify } from './client.svelte';

  type Result = { counts: Record<string, number>; missing_images: number };

  let file = $state<File | null>(null);
  let restoring = $state(false);
  let result = $state<Result | null>(null);

  async function restore() {
    if (!file) return;
    const ok = confirm(
      `Restaurer « ${file.name} » ?\n\nTout le contenu actuel (adresses, avis, recettes, planning, membres, clés API et photos) sera remplacé par celui de la sauvegarde. Tout le monde devra se reconnecter.\n\nPense à télécharger une sauvegarde de l'état actuel avant.`,
    );
    if (!ok) return;
    restoring = true;
    try {
      // Sent as a raw body so the server can stream it to disk.
      const res = await fetch('/api/backup', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/gzip' }, body: file });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `Erreur ${res.status}`);
      result = data as Result;
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      restoring = false;
    }
  }
</script>

<section class="card backup">
  <h2>Sauvegarde</h2>
  <p class="muted hint">
    Une archive <code>.tar.gz</code> avec la base de données SQLite et toutes les photos. Elle contient les comptes des membres (mots de passe
    chiffrés) : garde-la en lieu sûr.
  </p>
  <a class="btn primary" href="/api/backup" download data-astro-prefetch="false">Télécharger une sauvegarde</a>

  <h3>Restaurer</h3>
  {#if result}
    <div class="done">
      <p>
        <strong>Sauvegarde restaurée :</strong>
        {result.counts.places} adresses, {result.counts.recipes} recettes, {result.counts.reviews} avis, {result.counts.images} photos,
        {result.counts.users} membres.
      </p>
      {#if result.missing_images}
        <p class="warn">{result.missing_images} photo(s) référencée(s) dans la base sont absentes de l'archive.</p>
      {/if}
      <p>Tout le monde a été déconnecté.</p>
      <a class="btn primary" href="/admin">Se reconnecter</a>
    </div>
  {:else}
    <p class="muted hint">Remplace tout le contenu du site par celui d'une sauvegarde. Une sauvegarde d'une version plus ancienne est mise à jour automatiquement.</p>
    <div class="restore">
      <input type="file" accept=".gz,.tgz,application/gzip" onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)} disabled={restoring} />
      <button class="btn danger" onclick={restore} disabled={!file || restoring}>{restoring ? 'Restauration en cours…' : 'Restaurer'}</button>
    </div>
  {/if}
</section>

<style>
  .backup {
    margin-top: 16px;
  }
  h2 {
    margin: 0 0 4px;
  }
  h3 {
    margin: 22px 0 4px;
    font-size: 1.05rem;
  }
  .hint {
    margin: 0 0 12px;
    font-size: 0.88rem;
  }
  .restore {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .restore input {
    flex: 1;
    min-width: 0;
  }
  .done {
    padding: 12px;
    border-radius: 10px;
    background: var(--surface-2);
    border-left: 3px solid var(--good);
  }
  .done p {
    margin: 0 0 8px;
  }
  .warn {
    color: var(--ok);
    font-weight: 600;
  }
</style>
