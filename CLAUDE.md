# bouffe-center

## But du projet

Bouffe Center est une application web **légère et rapide** pour partager entre amis :

1. **Une carte des bonnes adresses** (dans l'esprit de Mapstr) : restaurants, bistrots, boulangeries… notés **sur 10** par les membres, avec avis, photos créditées au pseudo de leur auteur, catégories, tags, gamme de prix et infos pratiques.
2. **Des recettes maison** affichées en cards (image, description, tags), avec ingrédients et une préparation rédigée dans un éditeur par blocs façon Notion (sortie Markdown).
3. **Un planning des menus de la semaine** : du lundi au dimanche, matin / midi / soir, avec une ou plusieurs recettes par case.
4. **Des produits recommandés** (section « Produits », optionnelle) avec le stock de la maison, et **une cave** (section « Cave », optionnelle) pour les vins, spiritueux et alcools.

On passe d'un mode à l'autre grâce au **toggle « Carte / Recettes / Planning / Produits / Cave » centré en haut** ; sur téléphone (≤ 640 px), il est remplacé par une **barre d'onglets flottante en bas**, en « liquid glass » (icônes Lucide seules ; la pastille `--accent` de l'onglet actif s'élargit pour afficher son nom, les autres noms restent lisibles par les lecteurs d'écran). Les changements de page passent par les View Transitions natives (`@view-transition` dans `global.css`, sans routeur client) : en-tête et barre restent fixes, la pastille active glisse vers le nouvel onglet. Sa hauteur est exposée en `--tabbar-h` (0 ailleurs) : tout élément fixé en bas (bouton « + », fiches, contrôles de carte) se place au-dessus. Les sections privées n'apparaissent ni dans le toggle ni dans la barre pour les visiteurs. La recherche est en haut à gauche, et le nom « Bouffe Center » en haut à droite mène discrètement au back-office. Juste à côté, un rond indique la connexion : initiale sur fond rouge avec une pastille verte si l'on est connecté, profil gris sinon.

**Identité visuelle** : ambiance brasserie parisienne. Les titres, le toggle et le nom utilisent **Playfair Display** (auto-hébergée et préchargée, sous-ensemble latin uniquement). Le texte courant reste en police système. Il n'y a **pas de barre de header** : la recherche, le toggle (sans icônes) et le nom flottent sur la carte en pastilles « verre dépoli » (fond translucide + `backdrop-filter: blur`).

- **Couleur principale `#D1382F`** (`--accent`) : boutons principaux, sélections (toggle, puces, onglets, interrupteurs) et contours (focus, marqueurs).
- **Icônes** : jamais d'emoji ni d'icône colorée. On utilise des icônes Lucide en trait, **blanches sur disque `#D1382F`** (`iconBadge()` dans `web/src/lib/icons.ts`). Les clés d'icône sont stockées en base (`categories.icon`, `places.icon`).
- **Icône sur la carte** : `places.icon`, sinon l'icône de la catégorie, sinon `utensils` (fourchette et couteau).
- **Catégories** : une couleur au choix parmi les 12 de `CATEGORY_COLORS`, et une portée `applies_to` (`all` | `places` | `recipes`) : la barre de la carte et l'éditeur d'adresse n'affichent pas les catégories « recettes », l'éditeur de recette (et Ollama) pas les catégories « adresses ».
- **Carte** : toutes les catégories publiées (`categories.published`), même sans adresse, s'affichent en petites icônes dans une barre verticale à droite, qui sert de filtre. Une catégorie non publiée disparaît de la barre, mais ses adresses restent sur la carte. On peut aussi filtrer en appuyant sur la catégorie dans la fiche d'une adresse. Les tags d'une fiche sont aussi cliquables : ils filtrent la carte par tag (combinable avec la catégorie, `?tag=` dans l'URL, une pastille « × » par filtre actif). Au survol d'une icône de la barre (souris ou clavier, pas au toucher), les adresses des autres catégories et les regroupements passent en gris translucide (classe `.pin.dimmed`) : c'est un simple aperçu, le clic reste le filtre.
- **Notes** : de 1 à 10, toujours affichées « x/10 » en diagonale (le « /10 » plus petit, en bas à droite) **dans un rond parfait**. La couleur va du gris chaud (1) au `#D1382F` (10), voir `ratingColor()` dans `web/src/lib/format.ts`.
- **Déjà essayé** : `places.tried`, une case dans l'admin. Sur la carte et dans les résultats de recherche, un rond ✓ de la même taille que la note s'affiche à côté : vert si l'adresse est testée, gris sinon (`triedBadge()`).
- **Tags des recettes** : puces à choix multiple avec compteur (`/recettes?tag=a,b`, l'API exige tous les tags), bords en fondu tant que la rangée défile.
- **Recherche** : raccourci ⌘K / Ctrl+K ou « / ». ↑/↓ parcourent les résultats (carte) ou les cards (recettes), Entrée ouvre. Les résultats de la carte affichent la première photo du lieu.
- **Raccourcis membres** : le cookie lisible `bc_member=1` (posé au login, resynchronisé par `/api/auth/me`, sans secret) ajoute la classe `html.member` avant le premier rendu. Sans ce cookie, un seul appel `/api/auth/me` par session de navigateur (script inline de `Base.astro`) confirme la session et émet `bc:member`. Côté composants : `isMember()` / `onMember()` dans `web/src/lib/member.ts`. Cette classe affiche les boutons « Modifier » (`.member-only`) et active le ✓ cliquable et l'ajout rapide.
- **Mon avis** : 10 ronds numérotés de 1 à 10, blancs, remplis en `--accent` jusqu'à la note choisie (le dégradé de `ratingColor()` est réservé à l'affichage des notes). Publier un avis marque l'adresse comme « déjà testée ».
- **Sur la carte, pour les membres** : cliquer le rond ✓ d'un marqueur, ou le bouton de la fiche, bascule « déjà testé » (`PUT /api/places/:id/tried`, ouvert à tout membre). Un bouton « + » en bas à gauche (raccourci « N », ou ⌥N / Alt+N même dans un champ) ouvre l'ajout rapide : lieu (Photon : restaurants puis autres lieux où manger en premier, puis tri par distance au centre de la carte ; ↑/↓ + Entrée au clavier) ou centre de la carte, nom, catégorie, déjà testé et note. Le reste se complète dans l'admin.
- **Survol d'un marqueur** (souris uniquement) : un encadré affiche la première photo, le nom, la catégorie et la ville.
- **Planning** (`/planning`, `GET /api/planning?week=`) : des semaines datées, identifiées par leur lundi et calculées en `Europe/Paris`, avec navigation ← →. La page est rendue en SSR, sans îlot. Les puces Matin / Midi / Soir masquent des repas : le choix est gardé dans `localStorage`, et au moins un repas reste toujours visible. Chaque case (`meal_plan` : date, `breakfast|lunch|dinner`, position) contient jusqu'à 6 recettes. Le public n'y voit que les recettes publiées. Tout membre remplit le planning dans l'admin (`PUT /api/planning/:date/:meal { recipe_ids }`). Le planning peut être rendu privé comme les autres sections (voir « Sections privées »).
- **Recherche sur la carte** : sous les adresses, un encadré « Recettes liées » (`/api/recipes?q=`) puis « Produits liés » (`/api/products?q=` sans `kind`), inclus dans la navigation ↑/↓. La page Recettes affiche aussi « Produits liés » sous les cards.

- **Produits et Cave** (`products`, `kind = 'pantry' | 'wine'`, pages `/produits` et `/cave`, `GET /api/products?kind=`) :
  - Activées par défaut, désactivables par un admin (`settings.products_enabled`, `cellar_enabled`) : la section disparaît du toggle et de l'admin, et répond 404 aux visiteurs. Privées comme les autres (`products_private`, `cellar_private`).
  - **Stock commun** en nombre entier (`products.quantity`), jamais renvoyé aux visiteurs (ni `purchase_price_cents`, ni `location`) : les visiteurs voient toutes les recommandations. Tout membre ajuste le stock (`PUT /api/products/:id/stock { delta | quantity }`, jamais sous 0) avec le stepper −/+ (`StockStepper.svelte`, optimiste, clics regroupés par `changeStock()` dans `web/src/lib/products.ts`).
  - Côté membres, `ProductBrowser` recharge avec `in_stock=1` : seuls les produits en stock s'affichent ; la puce « Afficher tout » ou une recherche montre aussi ceux à 0, grisés. Vue cards ou liste (`localStorage` `bc_products_view`).
  - Ajout rapide pour les membres : bouton « Ajouter un produit / un vin » dans la barre d'outils, rond « + » en bas à gauche ou « N » (`QuickAddProduct.svelte`, chargé à la demande) et préremplissage dans l'admin (`ProductLookup.svelte`) : Open Food Facts par nom ou **scan du code-barres** (`BarcodeScanner.svelte` : `BarcodeDetector` natif, sinon le polyfill `barcode-detector` avec son WASM servi par le site, jamais chargé sur les pages publiques). Les photos OFF sont importées par le serveur (`POST /api/products/:id/import-image`, hôtes OFF uniquement) et créditées « Open Food Facts (CC BY-SA) ».
  - Les composants chargés à la demande depuis un îlot déclarent `<svelte:options css="injected" />` : Astro n'inclut pas le CSS des composants qu'ils importent.
- **Recettes ↔ produits** (`recipe_products`, `PUT /api/recipes/:id/products { product_ids }`) : « Produits conseillés » (pantry) et « Accords mets-vins » (wine) sur la recette, avec ✓ / ✗ de stock pour les membres (`stockBadge()`), « Utilisé dans » / « Accords » sur la fiche produit. **Liste de courses** des membres sur `/planning` : produits à 0 liés aux recettes de la semaine (`GET /api/planning/shopping?week=`).
- **GrapeMinds** (facultatif, cave) : un admin enregistre une clé API dans Paramètres (`PUT /api/integrations/grapeminds`, session uniquement, vérifiée par `/ping`). Elle est stockée dans la table `secrets`, jamais renvoyée, exclue des sauvegardes et conservée lors d'une restauration. `GET /api/settings` n'expose que `grapeminds_enabled`. Recherche par nom à l'appui sur Entrée (`/api/products/wine-lookup?q=`) puis fiche (`/wine-lookup/:id`) : on copie une seule fois des **données factuelles** (producteur, type, région, pays, cépages, période de dégustation), jamais le texte de description. Un compteur mensuel (`grapeminds_usage`) s'affiche face au quota gratuit de 250 requêtes.

- **Ollama** (facultatif, recettes) : un admin enregistre l'adresse du serveur, le modèle (liste lue via `/api/tags` d'Ollama) et un jeton facultatif dans Paramètres (`PUT /api/integrations/ollama`, session uniquement, vérifié avant enregistrement). Stocké dans `secrets` (jeton jamais renvoyé, hors sauvegardes). `GET /api/settings` expose `ollama_enabled`. Dans l'éditeur de recette, « Proposer une recette » appelle `POST /api/recipes/generate { prompt }` (membre) : `/api/chat` avec un schéma JSON (`format`), catégories et tags existants proposés au modèle, une génération à la fois (`server/src/lib/ollama.ts`). Le brouillon préremplit le formulaire ; rien n'est enregistré sans relecture.

- **Éditeur de recette (admin)** : sur mobile (≤ 900 px), une seule colonne dans l'ordre de cuisine (titre, photos, ingrédients, préparation, « Détails » repliable, produits). « Brouillon / Publiée » est dans la barre d'enregistrement (publier enregistre ; titre obligatoire pour publier, vide autorisé en brouillon). « Supprimer » est dans le menu « ⋯ ». La préparation démarre en liste numérotée, avec une barre « Étape · Titre · Photo · Astuce » (le menu « / » reste pour les habitués). Une nouvelle recette quittée sans rien saisir est supprimée (pas de brouillon vide). L'en-tête du site n'est pas fixe dans l'admin.

- **Clés API** (`api_keys`, `/api/api-keys`) : chaque membre en crée dans « Mon compte », avec un nom et une validité au choix (7 jours, 30 jours, 90 jours, 1 an, une date précise, ou sans expiration). Une clé `bc_…` s'envoie en `Authorization: Bearer` et donne les droits de son propriétaire. Elle n'est affichée qu'une fois : seule son empreinte sha256 est stockée. Une clé API ne peut pas gérer les clés (`c.get('apiKey')`). Un admin voit et révoque les clés de tous les membres.

- **Sections privées** (`settings.map_private`, `recipes_private`, `planning_private`, `products_private`, `cellar_private`, défaut `false`, `PATCH /api/settings` admin, onglet Paramètres) : une section privée est réservée aux membres connectés (session ou clé API). Côté API, `assertSectionVisible()` / `isLocked()` (`server/src/lib/settings.ts`) répondent 401 aux visiteurs sur les lectures de la section (`/places*`, `/recipes*`, `/planning`, `/products*`, `/tags?kind=`) ; les liens croisés sont masqués (recettes liées d'une adresse, lieu d'une recette). Côté SSR, `sectionAccess()` (`web/src/lib/api.ts`) ne transmet le cookie du visiteur **que** pour une section privée et passe alors la page en `Cache-Control: private, no-store` ; sur 401, la page rend `MembersOnly.astro` (bouton « Se connecter » → `/admin?next=…`, retour après connexion). `/uploads` reste servi publiquement par URL.
- **Public** : lecture seule (carte, fiches, avis, recettes, planning), sauf sections privées.
- **Membres** (sur invitation, rôles `admin` / `editor`) : publient adresses, avis, recettes et photos.

### Priorités non négociables

- **Performance et légèreté** : affichage public rapide, peu de JS côté public, un seul conteneur, faible empreinte RAM (environ 65 Mo).
- **API-first** : tout passe par l'API REST `/api`. Le site web n'en est qu'un client. Une **app mobile** (toujours avec le toggle carte/recettes/planning) et un **serveur MCP** viendront plus tard et consommeront la même API (auth par `Authorization: Bearer <token>`).
- **Mobile-first** : tout doit être utilisable sur téléphone (bottom sheet sur la carte, header compact, safe areas).
- **Déploiement Coolify** : c'est la plateforme de déploiement centrale (Dockerfile + volume `/data`). Le dev local doit rester simple.

## Architecture

Monorepo npm workspaces, un seul process Node en production :

```
server/   API Hono (TypeScript exécuté nativement par Node ≥ 24, sans build)
  src/index.ts        serveur HTTP : /api et /uploads → Hono, le reste → handler Astro SSR (web/dist)
  src/app.ts          montage des routes, garde d'origine (CSRF), ETag, erreurs JSON
  src/db.ts           SQLite via node:sqlite (aucune dépendance native) + migrations versionnées
  src/routes/*.ts     auth, api-keys, backup, users, categories, tags, places (+ reviews), recipes, images, planning, settings, products, integrations
  src/lib/            auth (scrypt, sessions), images (sharp → WebP sm/lg), text (slug, recherche sans accents), openfoodfacts, grapeminds, secrets
web/      Astro 7 SSR (adapter node, mode standalone sans autostart) + îlots Svelte 5
  src/pages/          / (carte), /recettes, /recettes/[slug], /planning, /produits, /cave (+ [slug]), /admin (SPA client-only)
  src/components/     MapView (MapLibre + OpenFreeMap), PlacePanel, RecipeBrowser, ProductBrowser, Lightbox…
  src/admin/          back-office Svelte (routes en hash), éditeur Tiptap (BlockEditor + menu « / »)
  src/lib/api.ts      appel de l'API depuis les pages SSR (en mémoire en prod, via HTTP en dev)
data/     (gitignored) base SQLite + images uploadées. En prod, c'est le volume /data.
```

Choix structurants à respecter :

- **SQLite + fichiers locaux** dans `DATA_DIR`. Pas de Postgres ni de S3 : sauvegarder le volume suffit.
- **Sauvegarde / restauration** (`/api/backup`, admin, onglet Paramètres) :
  - **Export** : un `.tar.gz` qui contient `manifest.json`, `bouffe-center.db` (copie cohérente via `VACUUM INTO`, sans les sessions ni les `secrets`) et `uploads/`. L'archive est produite en flux par `server/src/lib/tar.ts`, sans dépendance. La route est montée avant `etag()`, qui sinon garderait toute l'archive en mémoire. On peut l'appeler avec une clé API admin.
  - **Restauration** : réservée à une session (pas de clé API). L'envoi est écrit sur disque dans `DATA_DIR/.tmp`, vidé au démarrage. On vérifie ensuite l'intégrité et la version du schéma ; une sauvegarde plus ancienne est mise à niveau par `migrate()`. Les données sont remplacées table par table en une transaction (`ATTACH`), puis le dossier `uploads/` est échangé. Toutes les sessions sont supprimées.
- **Contenu par défaut** : `server/seed/data.json` et ses images (Wikimedia Commons, sous licence libre et créditées via `images.credit`). Il est injecté automatiquement au premier démarrage d'une base vide (`SEED_ON_EMPTY=false` pour désactiver). Les recettes y sont rédigées avec nos propres mots.
- **Images** : réduites côté navigateur avant l'upload, puis converties par sharp en deux WebP (`-sm` 480 px, `-lg` 1600 px), servies avec un cache `immutable`. Les métadonnées EXIF sont supprimées.
- **Tags** stockés en JSON sur les lignes. **Catégories partagées** entre adresses et recettes.
- **Notes** : un avis par membre et par adresse (`reviews`, 1–10 par pas de 0,5). La carte affiche la moyenne.
- **Recherche** : colonne `search` normalisée (minuscules, sans accents), requêtes `LIKE` par mot. Sur la carte, le filtrage se fait côté client sur le GeoJSON.
- Les libs lourdes (MapLibre, Tiptap) ne sont chargées que là où elles servent. Elles sont en `devDependencies` du web car bundlées au build.
- Le Markdown des recettes est rendu côté serveur avec `marked`, et le HTML brut est échappé (`web/src/lib/markdown.ts`).

## Commandes

```bash
npm install
cp .env.example .env          # ADMIN_EMAIL / ADMIN_PASSWORD créent le 1er admin
npm run dev                   # API :3000 (SERVE_WEB=false : jamais le build web) + Astro :4321 (proxy /api et /uploads)
npm run build                 # build Astro (web/dist)
npm start                     # prod locale : tout sur :3000
npm run check                 # typecheck du serveur (tsc)
npm run user:create -w server -- <email> <pseudo> <password> [admin|editor]
npm run seed -w server        # contenu par défaut (idempotent), voir server/seed/
docker compose up --build     # image de prod en local
```

## Conventions

- Interface et messages d'erreur de l'API **en français**. Code, identifiants et commentaires en anglais.
- Dépôt public sur GitHub : `README.md` en anglais (version de référence) et `README.fr.md` en français, à garder synchronisés (fonctionnalités, variables d'environnement, routes d'API). Licence MIT. La CI (`.github/workflows/ci.yml`) lance `npm run check` et `npm run build`.
- Serveur : imports relatifs avec l'extension `.ts` et uniquement de la syntaxe TypeScript « effaçable » (pas d'`enum`), car Node exécute le TS directement.
- Valider les entrées avec `validate()` (zod) dans `server/src/lib/validate.ts`. Les erreurs sont renvoyées sous la forme `{ error: string }`.
- Toute nouvelle fonctionnalité passe d'abord par un endpoint d'API documenté dans `GET /api`.
- Nouvelle migration : ajouter une entrée à la fin du tableau `migrations` dans `server/src/db.ts`, sans jamais modifier une migration existante.
- Garder le JS public minimal : préférer le rendu SSR Astro, et n'hydrater qu'au besoin (`client:visible` / `client:load`).
