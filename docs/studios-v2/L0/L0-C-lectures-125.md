# L0 · C · « #125 » et les lectures qui écrivent

SHA audité · `bc33cec80a8c76db1ff7ffbbdec5e9297ae42fb0` (checkout détaché, aucun fichier modifié, aucun appel réseau).
Chemins relatifs à `product/`. Exigence · BASE-03 « Comparer données métier et appels après GET, refresh, préchargement : zéro écriture métier, génération, débit ou quota consommé ».

---

## Verdict en tête

**#125 est toujours présent sur ce SHA.** `GET /api/ad/[id]` écrit dans `generations` par deux chemins distincts, déclenchés par le simple affichage d'une vignette du Studio :

1. `generations.input_json` (la recette, donnée métier) · `rattraperMesure`, pour toute pub dont la recette n'a pas de clé `light`.
2. `generations.output_json.renders` (index des rendus) + un objet S3 `renders/<id>/<clé>.png` · `rangerRendu`, à chaque rendu absent du cache mémoire et de l'index.

Aggravant non signalé jusqu'ici · le paramètre `?r=` n'est pas borné. Toute valeur inconnue produit une nouvelle clé de cache, donc un nouveau rendu satori, un nouvel objet S3 et une nouvelle entrée dans `output_json.renders`. La croissance est illimitée et n'importe quel membre de l'espace peut la provoquer.

Le garde existant `apps/web/test/lecture-seule.test.ts` ne peut pas voir #125 : il ne scanne que `page|layout|template|loading|default` (`:28`) et ne cherche que des modules d'enrichissement (`:41-42`). Les route handlers, `rangerRendu`, `recordMilestones` et Trendtrack lui échappent.

Autres lectures qui écrivent ou consomment (détail en section 2) :
- **métier** · `recordMilestones` (insert `adsmap_stat_milestones`) au rendu de `/jarvis/sources` et à chaque frappe dans les Studios (préflight), y compris au montage d'un Studio prérempli (`?iter=`, `?angle=`).
- **débit / crédit** · ouvrir `/studio/video` relance le suivi des vidéos en cours. Ce suivi peut basculer une génération en échec et **rembourser des crédits** (`workspaces.credits_balance` + `credit_ledger`). La vérification n'est pas atomique, donc deux onglets ouverts peuvent produire un double remboursement.
- **quota fournisseur** · `/veille` (même sans requête, vue par défaut) et `/veille/scale` appellent Trendtrack au rendu. `/veille/scale` écrit aussi `app_settings`. Sur `/veille`, `?refresh=1` contourne le cache sans plancher.
- **technique** · `error_log` (insert + purge `delete`) quand une lecture échoue.
- **par conception** (commandes en GET) · callbacks OAuth (`brands`) et crons (`/api/cron/*`, protégés par Bearer).

Lectures vérifiées pures : le rendu de `/studio/ads` (toute la chaîne), le layout `(app)` (seul exécuté au préchargement), `/analytics`, `/api/asset/[id]`, `/api/drive-img/[id]` (sans écriture en base, mais avec appels Google), `getSession`. Il n'existe ni `generateMetadata`, ni `prefetch` explicite, ni `router.prefetch`.

---

## 1. `apps/web/app/api/ad/[id]/route.tsx` et ses appelés

### 1.1 Déroulé d'un GET

| Étape | Code | Effet |
| --- | --- | --- |
| Session | `route.tsx:104` → `lib/auth.ts:114-155` | Lectures `users`, `workspace_members`, `workspaces`, `platform_staff`, `platform_role_rights`. `noterCreditsStaff` (`lib/credits.ts:20-25`) ne modifie qu'un `Set` en mémoire du processus. **Aucune écriture en base.** Aucun contrôle de rôle : un `client_viewer` déclenche les écritures ci-dessous. |
| Lecture de la génération | `route.tsx:111-118` | `select` generations ⋈ brands, contrôle de l'espace. |
| **Rattrapage de mesure** | `route.tsx:131` → `rattraperMesure` `route.tsx:88-99` | Condition `!('light' in base)`. Appel externe `mesurerScene(base.sceneUrl, 4_000)` (`lib/scene-light.ts:30-40` → `safeFetch`, GET de l'image de scène chez fal CDN ou S3, 12 Mo au plus, puis décodage `sharp`). **UPDATE `generations.input_json`** (`route.tsx:94-96`). |
| Clé de cache | `route.tsx:107, 140` | `v${RENDER_VERSION}:${id}:${r \|\| '4:5'}:${t\|f}:${recipeHash}`. **`r` vient brut de l'URL** (`q.get('r') \|\| ''`). Seul `RATIO_SIZE[r]` (`:13-17`) est filtré, pour les dimensions. La clé, elle, ne l'est pas. |
| Cache mémoire | `route.tsx:142-146` | `Map` du processus, bornée à 128 Mo. Technique, rien de persistant. |
| Index persistant | `route.tsx:152-153` → `lib/ad-store.ts:39-43` | Lecture de `output.renders[clé]` → 302 vers S3. |
| Composition | `route.tsx:156` → `lib/ad-render.tsx:790-799` | `ImageResponse` satori, polices lues sur disque (`lib/ad-fonts.ts`). L'`<img src={sceneUrl}>` de la maquette est téléchargée par satori : GET externe de la scène. Aucun appel IA. |
| **Rangement** | `route.tsx:161` `void rangerRendu(...)` → `lib/ad-store.ts:52-79` | **PUT S3** `renders/<id>/<clé nettoyée>.png` (`:60`, `putObject` `packages/integrations/src/storage.ts:186-190`), puis **UPDATE `generations.output_json`** via `jsonb_set(... '{renders}' ...)` (`:66-75`). Écriture non attendue (fire and forget), erreurs avalées. Ne s'exécute que si `S3_*` est configuré (`storageFromEnv`, `storage.ts:27-41`). |
| Repli | `route.tsx:165-168` | 302 vers la scène. Pas d'écriture. |

Extraits déterminants :

```ts
// route.tsx:131
const light = 'light' in base ? base.light ?? null : await rattraperMesure(id, base);
// route.tsx:94-96
await db!.update(schema.generations)
  .set({ input: sql`coalesce(${schema.generations.input}, '{}'::jsonb) || ${JSON.stringify({ light })}::jsonb` })
  .where(eq(schema.generations.id, id));
// route.tsx:161
void rangerRendu(id, cacheKey, png).catch(() => { /* le cache mémoire reste */ });
// ad-store.ts:66-75
await db.update(schema.generations).set({ output: sql`jsonb_set(coalesce(output,'{}'), '{renders}', coalesce(output->'renders','{}') || {cle:url}, true)` }) ...
```

### 1.2 Ce qui n'arrive pas

- **Aucun débit de crédits**, aucun `reserveCredits`, aucune ligne `ai_spend`, aucun appel fal ou Anthropic, aucun `sousPlafond`. La « génération » au sens payant n'est jamais relancée par ce GET.
- Aucun quota fournisseur, en dehors de la bande passante de téléchargement de la scène et de l'écriture S3 (stockage facturé au propriétaire du bucket, mais hors `ai_spend`).

### 1.3 Classement

| Écriture | Nature | Justification |
| --- | --- | --- |
| `generations.input_json.light` (rattrapage) | **MÉTIER** | `input` est la recette : l'objet métier que l'utilisateur retouche, que le contrôle de copie relit et que le bridge Adsmap reprend. L'écriture se fait au premier affichage, sans geste ni trace. Le résultat change ensuite le rendu (voiles), donc ce que l'utilisateur voit dépend de qui a ouvert la grille et quand. Le déclencheur ne concerne que les pubs **antérieures à la mesure** : les nouvelles portent toujours `light`, même `null` (`app/actions/ads.ts:713`, `:2028`). Le périmètre est donc fini (un stock historique), ce qui rend un rattrapage par commande unique trivial. |
| `generations.output_json.renders` | **MÉTIER par l'emplacement, technique par le contenu** | C'est un index de cache dérivé et déterministe (la clé porte `RENDER_VERSION` et l'empreinte de recette). Il est pourtant rangé dans une ligne métier, ce qui la modifie à la consultation. Avec `?r=` libre, ce JSON grossit sans borne. |
| Objet S3 `renders/<id>/<clé>.png` | **Cache technique acceptable sous conditions** | Il est dérivé, déterministe, versionné (`RENDER_VERSION`, `ad-render.tsx:162`), régénérable et sans effet sur les données métier. Condition : clé bornée (`r` dans `RATIO_SIZE`, `t` dans {0,1}). Ce n'est pas le cas aujourd'hui. |
| Cache mémoire `RENDER_CACHE` | Technique | Volatile, borné en octets. |

### 1.4 Défaut annexe · clé non bornée (amplification)

`GET /api/ad/<id>?r=a`, `?r=b`, `?r=c`... produit à chaque fois un rendu satori (coût CPU de plusieurs secondes), un PUT S3 et une nouvelle entrée dans `output.renders`. Le nettoyage `cle.replace(/[^a-zA-Z0-9:_-]/g, '-')` (`ad-store.ts:59`) protège le préfixe S3 mais ne borne pas le nombre de clés. Ouvrir le Studio suffit déjà à déclencher jusqu'à 240 GET en parallèle, sans `loading="lazy"` (`listBrandAds` `limit(240)` à `app/actions/ads.ts:1557-1559`, `<img>` à `components/AdMedia.tsx:45`, vignette `?t=1` à `AdsStudio.tsx:386, 1305`). Les URL `/api/ad/<id>` sont aussi posées comme `assetUrl` Adsmap (`app/actions/adsmap-bridge.ts:94`), donc la carte Adsmap déclenche les mêmes écritures.

### 1.5 Correctif proposé pour #125

1. **Rendre la mesure pure au GET.** Mesurer en mémoire pour ce rendu, ou ne pas mesurer et rendre avec les voiles par défaut, mais **ne pas persister**. Le rattrapage du stock devient une **commande explicite et idempotente** : script ou action ADMIN+ « rattraper les mesures », `UPDATE generations SET input_json = input_json || {light} WHERE kind='ad' AND NOT (input_json ? 'light')`. Elle est rejouable sans effet, puisqu'elle cible seulement les lignes sans clé, et le nombre de lignes concernées est affiché avant exécution.
2. **Sortir l'index de rendu de `generations`.** Au choix :
   - (a) clé S3 **déterministe** dérivée de `cacheKey`. Au MISS, `HEAD` sur l'objet, puis 302 s'il existe, sinon rendu + PUT. Aucune écriture SQL.
   - (b) table technique dédiée `render_cache(key pk, url, created_at)`, hors périmètre métier, explicitement classée cache.
3. **Borner la clé** · `r` hors de `RATIO_SIZE` → 400, `t` ∈ {`1`, absent}. La garde doit être un test qui appelle le handler avec `?r=zzz` et attend 400.
4. **Préproduire à la génération** (commande payante déjà explicite) les deux variantes affichées (4:5 plein et vignette). Le GET devient alors une lecture S3 dans le cas nominal.
5. **Garde par résultat** (doctrine du dépôt) · test vitest qui monte `GET` avec `db` remplacé par un proxy qui enregistre `insert/update/delete/execute`, `getSession`, `renderAdPng`, `mesurerScene` et `putObject` simulés. Trois cas : recette sans `light`, cache vide, `?r=` exotique. Attendu : **zéro écriture SQL**. À éprouver par mutation : remettre `rattraperMesure`, vérifier l'échec avec la bonne phrase, restaurer.

---

## 2. Recensement de toutes les lectures qui écrivent (`apps/web`)

Méthode · liste exhaustive des `route.ts(x)` et de leurs méthodes. Liste des 67 fichiers de rendu et de leurs imports `lib/` et `actions/`. Extraction du corps de chaque chargeur appelé au rendu. Liste des fichiers qui contiennent `insert/update/delete` et remontée de leurs appelants. Liste des `useEffect` qui appellent une server action au montage. Recherche de `prefetch`, `generateMetadata`, `next/image`, `router.prefetch` et `<link rel=preload>`.

### 2.a Handlers `GET` de `app/**/route.ts(x)` (17 routes, 15 GET)

| Route | fichier:ligne | Écrit / appelle | Déclencheur | Gravité | Proposition |
| --- | --- | --- | --- | --- | --- |
| `/api/ad/[id]` | `app/api/ad/[id]/route.tsx:94-96, 161` ; `lib/ad-store.ts:60, 66-75` | UPDATE `generations.input_json` (si pas de `light`), PUT S3, UPDATE `generations.output_json.renders`, GET externe de la scène | Visite du Studio et d'Adsmap (chaque vignette), refresh après redéploiement (cache mémoire perdu), téléchargement | **Métier** (input, output) + technique (S3) | Section 1.5 |
| `/api/asset/[id]` | `app/api/asset/[id]/route.ts:89-93` | Aucune écriture en base. Cas Drive : POST `oauth2` Google (refresh du jeton) puis téléchargement Drive | Affichage d'une vignette Drive | Technique (quota API Google, gratuit) | Acceptable. Possible amélioration : mettre en cache le jeton d'accès (TTL 50 min) |
| `/api/drive-img/[id]` | `app/api/drive-img/[id]/route.ts:29-37` | Idem | Idem | Technique | Idem. Route redondante avec `/api/asset` (`asset/route.ts:36-46`) |
| `/analytics` | `app/(app)/analytics/route.ts:46-55` | Rien | Visite, préchargement (géré : `Vary: Next-Router-Prefetch`) | Aucune | Pure |
| `/api/oauth/tiktok` | `app/api/oauth/tiktok/route.ts:6-13` | Rien | Clic | Aucune | Pure |
| `/api/oauth/{shopify,google,meta}` | `.../shopify/route.ts:10-31`, `.../google/route.ts:11-19`, `.../meta/route.ts:11-28` | Rien (état HMAC, `lib/oauth-state.ts:15-19`) | Clic | Aucune | Pures |
| `/api/oauth/shopify/callback` | `app/api/oauth/shopify/callback/route.ts:35-41` | POST Shopify (échange du code), UPDATE `brands.shopify_domain, shopify_token` | Redirection du fournisseur | Métier **par conception** | Acceptable. OAuth 2 impose une redirection GET. L'appel est protégé par l'état signé (15 min), la session de l'espace et le HMAC Shopify. Il ne peut pas être préchargé (navigation externe) et le code est à usage unique chez le fournisseur |
| `/api/oauth/google/callback` | `.../google/callback/route.ts:22-24` | Échange du code, UPDATE `brands.drive_refresh_token` | Idem | Métier par conception | Idem |
| `/api/oauth/meta/callback` | `.../meta/callback/route.ts:34-57` | 3 GET Graph, UPDATE `brands.meta_token, meta_ad_accounts, meta_ad_account_id` | Idem | Métier par conception | Idem |
| `/api/cron/adsmap` | `app/api/cron/adsmap/route.ts:17-30` → `lib/adsmap-sync.ts` (insert `creatives`, `ad_instances`, `metrics_daily`, update `adsmap_ads`, `refreshDecisions`) | Appels Meta, écritures massives | Cron, `Authorization: Bearer` | Commande | Passer en **POST** : un navigateur ne peut pas déclencher ce GET (en-tête requis), mais la sémantique GET invite aux relances par les proxys et les outils |
| `/api/cron/digest` | `app/api/cron/digest/route.ts:59-83` | INSERT `notifications`, envoi de courriels | Cron | Commande **non idempotente** | POST + verrou hebdomadaire (clé `digest:<semaine>` en `app_settings` avec `onConflictDoNothing`). Aujourd'hui, une relance double notifications et courriels |
| `/api/cron/radar` | `app/api/cron/radar/route.ts:30` → `lib/radar.ts:187` (`guardedAnthropic`), `:161, 210, 274, 284, 333` | **Dépense IA** (sous barrière), écritures `market_creatives`, `brands.radar_last_run_at`, `notifications` | Cron | Commande dépensière | POST. La dépense passe déjà par la barrière |
| `/api/cron/tracker` | `app/api/cron/tracker/route.ts:20` → `lib/tracker.ts:47-77` | Appels Trendtrack, UPDATE `followed_brands`, INSERT `brand_tracker_events`, `notifications` | Cron | Commande + quota | POST |

Hors périmètre GET · `POST /api/stripe/webhook`, `POST /api/jarvis/chat`.

### 2.b Rendu serveur (`page.tsx`, `layout.tsx`) et fonctions appelées au rendu

Aucun fichier de rendu ne contient `insert/update/delete` directement. Les écritures passent par des fonctions appelées :

| Écran | fichier:ligne | Écrit / appelle | Déclencheur | Gravité | Proposition |
| --- | --- | --- | --- | --- | --- |
| `/jarvis/sources` | `app/(app)/jarvis/sources/page.tsx:88` (`jarvisSnapshot` → `lib/jarvis-state.ts:116`) et `:94` → `lib/jarvis-memory.ts:212-215` `void recordMilestones(...)` → `lib/milestones.ts:42-49` | INSERT `adsmap_stat_milestones` (`onConflictDoNothing`), deux fois par rendu | Visite, refresh | **Métier dérivé** · `reached_at` vaut « le jour où quelqu'un a regardé ». Le récapitulatif hebdomadaire le lit (`lib/digest.ts:166`, `learnedSinceFor`). Son contenu dépend donc des visites | Rendre `jarvisStats` pure. Appeler `recordMilestones` depuis les **commandes qui changent les verdicts** (arbitrage `adsmap-verdict`, synchro `lib/adsmap-sync.ts:373` à côté de `refreshDecisions`), ou depuis le cron adsmap. Idempotence déjà assurée par la contrainte |
| `/veille/scale` | `app/(app)/veille/scale/page.tsx:84-101` (`ttSearchAds` `:94`, `setVeilleCache` `:97` → `lib/veille-cache.ts:47-54`) | **Appel Trendtrack** (quota payant) + UPSERT `app_settings` (`veille:<pays>:<niche>`) | Visite si le cache est absent ou a plus de 7 j. `?refresh=1` avec un plancher de 6 h (`veille-cache.ts:22-27`). **Chaque `?q=` nouveau** = un appel + une écriture | **Quota / dépense** + technique (cache) | Le cache `app_settings` est un cache technique acceptable. L'appel au rendu ne l'est pas au sens de BASE-03. Il faut servir **uniquement depuis le cache** au rendu et déplacer la récupération vers une commande explicite (bouton « Actualiser », server action POST, plancher conservé), avec affichage du coût avant le clic |
| `/veille` | `app/(app)/veille/page.tsx:146-182` (requête), `:186-216` (vue par défaut **sans requête**), `:151` (`sp.refresh` ignore le cache) | **Appels Trendtrack** (`ttSearchAds/TikTok/Google` `:162, 168, 170, 196`). Cache **mémoire** seulement (`lib/veille-search-cache.ts:32` TTL 15 min, perdu à chaque déploiement). Pas d'écriture en base | Visite de `/veille` nue (vue par défaut), refresh au-delà de 15 min ou après redéploiement, `?refresh=1` **sans plancher** | **Quota** | Vue par défaut servie depuis un cache persistant partagé (comme scale), avec un plancher sur `refresh`. La recherche tapée reste un geste explicite (formulaire), mais l'appel devrait passer par une commande comptée |
| `/studio/ads` | `app/(app)/studio/ads/page.tsx:60-64, 98, 107-111, 131-132` | **Rien** (chaîne vérifiée : `essaiSuivantAction`, `essaisViewAction`, `bilanNotesAction`, `bilanCopieAction`, `spendStatus`, `listBrandAds`, `listSavedAdRefs`, `listAssets`, `adsDeLaMarque`, `adDetailAction`, `chargerValidationsActives`, `adsmapGuard`) | · | Aucune, hors `error_log` en cas d'échec | Pure. La page déclenche toutefois les GET `/api/ad` (2.a) et le préflight (2.c) |
| Toutes les pages qui appellent une action de lecture (`listBatchesAction`, `getSettingsAction`, `chargerConnaissancesAction`, `adDetailAction`, `bilanCopieAction`, etc.) | `lib/error-log.ts:36-52` (INSERT `error_log`) et `:23-31` (DELETE purge, au plus une fois par heure) | Journal d'échec | Échec d'une lecture | **Technique** | Acceptable : observabilité, aucune donnée métier, purge bornée. À exclure explicitement de l'empreinte, ou à vérifier à 0 sur un parcours nominal |
| `(app)/layout.tsx`, `/dashboard`, `/console`, `/brands/[id]`, `/assets`, `/connections`, `/adsmap*`, `/studio/image`, `/studio/video`, `/studio/textes`, `/c/[token]`, `/invite/[token]`, `/reset/[token]`, `/onboarding` | Imports listés et corps vérifiés | Rien | · | Aucune | Pures. Le commit #712 (`75b037a`) a retiré `ensureBrandEnriched` du rendu |

### 2.c Préchargement et effets au montage

| Vecteur | fichier:ligne | Effet | Gravité | Proposition |
| --- | --- | --- | --- | --- |
| `<Link>` (prefetch automatique, Next 15.5.23) | Aucun `prefetch` explicite, aucun `router.prefetch`, aucun `generateMetadata` | Sur route dynamique, Next précharge jusqu'au premier `loading.tsx`. Le seul est `app/(app)/loading.tsx`, donc seul `app/(app)/layout.tsx` s'exécute, et il est pur (`:22-38`). Les pages `/veille`, `/veille/scale` et `/jarvis/sources` **ne sont pas** exécutées au préchargement. **À confirmer par la mesure** (section 3), car le comportement dépend de la version | Aucune aujourd'hui | Garde · test qui échoue si un `prefetch={true}` apparaît sur un lien vers une page qui écrit, ou si `(app)/loading.tsx` disparaît |
| `<img src="/api/ad/...">` | `components/AdMedia.tsx:45`, `AdsStudio.tsx:1305` | Chargement immédiat (pas de `loading="lazy"`) · voir 2.a | Métier (via #125) | Corriger #125. `loading="lazy"` réduit le volume, pas le principe |
| Préflight des Studios | `components/usePreflight.ts:48-60` → `app/actions/preflight.ts:73, 90, 96` → `jarvisStats` / `briefConceptBeforeLaunch` (`lib/jarvis-memory.ts:447-452`) → `recordMilestones` | INSERT `adsmap_stat_milestones` | **Métier dérivé** · à chaque saisie stabilisée (900 ms, au moins 25 caractères, `MIN_TEXT` `packages/core/src/adsmap/preflight.ts:51`), et **dès le montage** si le Studio est prérempli (`?angle=`, brief d'itération `?iter=`, `AdsStudio.tsx:132, 345`), dans `ImageStudio.tsx:124` et `VideoStudioFull.tsx:74` | Même correctif que `/jarvis/sources` : `jarvisStats` pure |
| Suivi vidéo au montage | `app/(app)/studio/video/VideoStudioFull.tsx:104-117` (effet) → `poll` `:119-128` → `app/actions/video.ts:253-305` | GET de statut chez fal ou Higgsfield. UPDATE `generations.status/asset_urls` (`:295-297`). `failAndRefund` (`:231-250`) → UPDATE `generations.status='failed'` + **`refundCredits`** (`lib/credits.ts:56-62` · UPDATE `workspaces.credits_balance`, INSERT `credit_ledger`) quand le job a échoué ou a plus de 15 min (`:228, 269-278`) | **Débit / crédit** · le remboursement suit un `select` puis un `update` non conditionnel (`video.ts:238-247`). Deux onglets ou deux polls concurrents peuvent rembourser deux fois. Un job déclaré périmé à 15 min puis terminé reste remboursé | Rendre le remboursement **atomique** : `UPDATE generations SET status='failed' WHERE id=$1 AND status NOT IN ('failed','completed') RETURNING credits_cost`, puis rembourser seulement si une ligne revient. À terme, déplacer la réconciliation vers un webhook fal ou le worker, pour que l'ouverture de l'écran ne fasse que lire |
| Autres effets au montage | `NotificationBell.tsx:43-50` (`fetchNotifications`), `adsmap/AdsMapTable.tsx:80` (`listAdsAction`), `adsmap/Inbox.tsx:67` (`listDecisionsAction`), `adsmap/radar/Radar.tsx:47`, `adsmap/suites/Suites.tsx:66`, `adsmap/tri/Curation.tsx:240`, `components/ContexteCreation.tsx:47` (`marketCoverageAction`), `SupportWidget.tsx:60`, `StorageConfigurator.tsx:33` | Lectures (corps vérifiés). `error_log` seulement en cas d'échec | Aucune | Pures. `refreshDecisionsAction` (écrit `adsmap_decision_items`) n'est appelé que par le bouton « recalculer » (`Inbox.tsx:72`) |

---

## 3. Plan de preuve locale « zéro écriture métier »

### 3.1 Banc

- `docker-compose.yml` (pgvector pg16) + migrations `packages/db/drizzle` (vérifier le nombre d'entrées de `drizzle/meta/_journal.json`) + `packages/db/scripts/seed-fixtures.mjs`.
- **Build de production** (`pnpm -w run build` puis `next start`), car le préchargement `<Link>` n'existe pas en dev.
- S3 · un MinIO local (ou un faux S3 en loopback qui journalise les PUT) avec `S3_*` renseigné. Sans cela, `rangerRendu` sort tout de suite (`ad-store.ts:54`) et la preuve serait verte pour une mauvaise raison.
- Trendtrack · mode recette `VEILLE_RECETTE=1` et mock loopback (`lib/veille-recette-base.ts`), qui journalise chaque requête reçue.
- fal, Anthropic, Higgsfield, Google · variables posées vers un hôte loopback qui répond 599 et journalise. Une sonde réseau sur le processus Next (`NODE_OPTIONS=--require ./sonde.cjs` qui enveloppe `globalThis.fetch` et `undici` et écrit hôte, méthode et chemin dans un fichier) donne le **compte des appels sortants**.
- Postgres · `ALTER SYSTEM SET log_statement = 'mod'; SELECT pg_reload_conf();` · toute instruction `INSERT/UPDATE/DELETE/TRUNCATE` est journalisée. C'est le filet universel : il voit aussi les tables oubliées dans l'empreinte.

### 3.2 Jeu de données à semer (pour que chaque chemin fautif soit exercé)

1. Une pub `generations(kind='ad')` **sans clé `light`** dans `input_json` (exerce `rattraperMesure`).
2. Une pub avec `light` et `output_json` vide (exerce `rangerRendu`).
3. Une pub dont `output_json.renders` contient déjà la clé (exerce la 302).
4. Des `adsmap_verdicts` arbitrés assez nombreux pour qu'une dimension franchisse le seuil, avec `adsmap_stat_milestones` vide (exerce `recordMilestones`).
5. Une génération vidéo `status='processing'`, `job_id` fal factice, `created_at` à moins 20 min, `credits_cost > 0` (exerce `failAndRefund`).
6. Aucun cache `app_settings` `veille:*` (exerce l'appel Trendtrack de scale).
7. Deux comptes : `owner` et `client_viewer`.

### 3.3 Empreinte avant / après

Pour chaque table : `SELECT count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) FROM <table> t;`

| Groupe | Tables |
| --- | --- |
| Pubs et recettes | `generations` (empreintes séparées de `input_json`, `output_json`, `status`, `asset_urls`), `ad_fact_validations` |
| Adsmap | `adsmap_ads`, `adsmap_verdicts`, `adsmap_learnings`, `adsmap_stat_milestones`, `adsmap_decision_items`, `adsmap_batches`, `adsmap_iteration_edges`, `adsmap_brand_stats`, `adsmap_agent_runs`, `adsmap_ai_budgets` |
| Dépense et crédits | `ai_spend` (plus `count(*)`, `sum(estimated_usd)`, `sum(actual_usd)`), `credit_ledger`, `workspaces.credits_balance` |
| Marque et contenus | `brands`, `products`, `personas`, `assets`, `creatives`, `market_creatives`, `saved_ads`, `followed_brands`, `brand_tracker_events`, `jarvis_messages` |
| Système | `app_settings`, `notifications`, `error_log` (attendu inchangé sur parcours nominal) |
| Hors base | Liste des objets du bucket sous `renders/`, journal de la sonde réseau, journal du mock Trendtrack, journal Postgres `log_statement=mod` entre deux marqueurs (`SELECT 'MARQUEUR_DEBUT'`) |

En complément, l'écart de `pg_stat_user_tables` (`n_tup_ins`, `n_tup_upd`, `n_tup_del`) après `SELECT pg_stat_force_next_flush()` sert de contrôle croisé.

### 3.4 Routes à visiter (owner, puis client_viewer)

Chaque route trois fois : visite (`curl` avec cookie de session), **refresh** (même requête, `Cache-Control: no-cache`) et **préchargement** (en-têtes `RSC: 1`, `Next-Router-Prefetch: 1`, `Next-Router-State-Tree`). Ensuite un parcours navigateur headless (Playwright) qui survole les liens du rail et reste **30 s** sur chaque écran, pour laisser jouer les effets : préflight, suivi vidéo, cloche.

- Studio · `/studio`, `/studio/ads`, `/studio/ads?iter=<adId>` (préremplissage de plus de 25 caractères), `/studio/ads?angle=<texte de 30 caractères>`, `/studio/ads?mode=clone&ref=<id>`, `/studio/image`, `/studio/video`, `/studio/textes`.
- Rendus · `/api/ad/<pub1>?t=1`, `/api/ad/<pub1>?r=4:5`, `/api/ad/<pub2>?t=1` (deux fois), `/api/ad/<pub3>?r=4:5`, `/api/ad/<pub2>?r=zzz` et `?r=zzz2` (borne), puis **redémarrage de `next start`** et nouvelle passe (cache mémoire vidé).
- Mémoire · `/jarvis/sources`, `/jarvis`.
- Veille · `/veille`, `/veille?q=café`, `/veille?refresh=1`, `/veille/scale`, `/veille/scale?q=niche-inedite`, `/veille/scale?refresh=1`.
- Adsmap · `/adsmap`, `/adsmap/lots`, `/adsmap/protocole`, `/adsmap/radar`, `/adsmap/suites`, `/adsmap/tri`.
- Autres · `/dashboard`, `/analytics`, `/brands`, `/brands/<id>`, `/assets`, `/connections`, `/credits`, `/usage`.

### 3.5 Critères

- Toutes les empreintes métier sont identiques. `ai_spend` ne change ni en nombre ni en somme. `credits_balance` et `credit_ledger` sont inchangés.
- Zéro ligne `log_statement=mod` sur le parcours, ou seulement des lignes classées techniques et listées nommément.
- Zéro requête sortante vers fal, Anthropic, Higgsfield ou Trendtrack. Les PUT S3 ne sont tolérés que si l'objet de rendu est formellement classé cache (et alors, zéro écriture SQL associée).
- **Attendu sur ce SHA (le banc doit le montrer rouge avant correctif)** :
  - `generations.input_json` change pour pub1 et `output_json` change pour pub1 et pub2 (#125). `?r=zzz` ajoute des clés.
  - `adsmap_stat_milestones` gagne des lignes (`/jarvis/sources`, préflight).
  - `credit_ledger` et `credits_balance` bougent (`/studio/video`).
  - Le mock Trendtrack reçoit des requêtes (`/veille`, `/veille/scale`) et `app_settings` gagne `veille:FR:niche-inedite`.
  - En préchargement seul, rien ne bouge (à confirmer).
- Le banc doit d'abord **échouer** sur ce SHA (garde éprouvée), puis passer après correctif.

---

## Verdict

**#125 est présent** sur `bc33cec`. `GET /api/ad/[id]` écrit :
- `generations.input_json` (`route.tsx:94-96`, recettes antérieures à la mesure) ;
- `generations.output_json.renders` et un objet S3 (`ad-store.ts:60, 66-75`, à chaque rendu absent de l'index).

Ces écritures se déclenchent à la visite et au refresh du Studio et d'Adsmap, et sans borne via `?r=`. Le GET ne débite rien, ne dépense rien en IA et ne relance aucune génération payante.

**Autres lectures qui écrivent ou consomment :**
1. `recordMilestones` (métier dérivé) au rendu de `/jarvis/sources` et dans le préflight des trois Studios, y compris au montage prérempli.
2. Suivi vidéo au montage de `/studio/video` · statut de `generations` et **remboursement de crédits non atomique**.
3. Trendtrack au rendu de `/veille` (vue par défaut incluse, `?refresh=1` sans plancher) et de `/veille/scale` (avec UPSERT `app_settings`).
4. `error_log` en cas d'échec de lecture (technique, acceptable).
5. Callbacks OAuth et crons en GET (commandes par conception). À passer en POST, et `digest` est à rendre idempotent.

Le préchargement `<Link>` n'exécute que `(app)/layout.tsx`, qui est pur. C'est à confirmer par la mesure de la section 3.
