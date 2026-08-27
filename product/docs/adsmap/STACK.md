# ADSMAP · Phase 0 — Adaptation au stack réel

Lecture du dépôt `app.tiktrends` au 27/08/2026, en réponse au §0 du cahier des charges v2.
À relire par Kévin avant la Phase 1. Les points à trancher sont regroupés en fin de document.

---

## 0. Le résultat le plus important de cette lecture

**Une grande partie du modèle de données d'ADSMAP existe déjà dans le schéma, et n'est utilisée par aucune ligne de code.**

Sept tables ont été déclarées lors d'un sprint antérieur puis jamais branchées :

| Table dormante | Colonnes existantes | Correspondance CDC |
|---|---|---|
| `creatives` | `transcript`, `ocr_text`, `duration_s`, `embedding vector(1536)`, `fingerprint_hash`, `thumb_url` | ≈ `AssetAnalysis` (§4) |
| `ad_instances` | `external_ad_id`, `campaign_name`, `adset_name`, **`name_dims_json`**, `status` | ≈ face plateforme de `Ad` + sortie du parser §8.6 |
| `metrics_daily` | `spend`, `impressions`, `reach`, `clicks`, `conv`, `revenue`, `v2s/v3s/v6s/v15s`, **`p25/p50/p75/p100`**, `avg_watch` | ≈ `MetricSnapshot` (§4) |
| `creative_tags` | `dimension`, `value`, `confidence`, `source (ai\|human)` | ≈ sortie A0 corrigeable (§8.3) |
| `radar_scores` | **`grade_hook`, `grade_hold`, `grade_ctr`, `grade_conv`**, `bucket`, `diagnosis_json`, `recommendations_json` | ≈ funnel §2.2 + `failed_stage` §6.6 |
| `briefs` | `origin_type`, `origin_id`, `content_json`, `status` | ≈ sortie A3 (§8.3) |
| `insights` | `type`, `text`, `frequency`, `verbatims[]` | ≈ `Learning` partiel (§4) |

Vérification : `grep` sur `schema.creatives`, `schema.adInstances`, `schema.metricsDaily`, `schema.creativeTags`, `schema.radarScores`, `schema.briefs`, `schema.insights` → **0 fichier** hors `schema.ts`.

**Recommandation ferme : ADSMAP étend cette couche, il ne la double pas.** Créer `Ad`, `MetricSnapshot` et `AssetAnalysis` à côté de `ad_instances`, `metrics_daily` et `creatives` produirait deux modèles concurrents pour la même réalité, avec deux synchronisations Meta et deux vérités sur la performance. C'est le risque n° 1 de ce chantier.

`metrics_daily` est d'ailleurs **plus riche** que ce que la synchro Meta actuelle remonte : elle prévoit déjà `reach`, `p25`, `p50`, `p100` et `avg_watch`, que le connecteur ne va pas chercher aujourd'hui.

### Tables vivantes qui portent déjà un concept du CDC

| Table utilisée | Concept CDC | Décision |
|---|---|---|
| `brands` | `Brand` | **Étendre** : ajouter `vertical`, `naming_pattern`, `portfolio_opt_in`. `BrandMemory` est en partie là (`tone`, `usp`, `audience`, `creativeRules`, `jarvisLearnings`, `competitors`, `preferredWords`, `avoidWords`). |
| `personas` (`brand_id`, `name`, `description`, `pains[]`, `desires[]`) | **`Avatar`** | **Renommer conceptuellement, pas physiquement.** C'est le même objet. Ajouter `objections[]`, `sources`, `status`. Le CDC parle d'Avatar, le produit affiche « Persona » : garder un seul mot dans l'UI. |
| `products` | contexte produit | Réutiliser tel quel. |
| `generations` (`kind='ad'`) | créa produite par le Studio | Passerelle : une créa générée doit pouvoir devenir un `Ad` ADSMAP sans ressaisie. |
| `saved_ads`, `followed_brands`, `brand_tracker_events` | veille concurrentielle | Source des ads `IMITATION` (§5). |
| `assets` | bibliothèque média | Source des `asset_url`. |
| `credit_ledger` + `reserveCredits` | coût des agents | Voir §5 ci-dessous. |

---

## 1. Stack réel

| Domaine | Réalité du dépôt | Conséquence pour ADSMAP |
|---|---|---|
| Front | Next.js 15 App Router, React 19, **styles inline** (pas de Tailwind en pratique, bien qu'installé), aucune bibliothèque de composants | Le canvas §7 impose deux dépendances nouvelles : `@xyflow/react` et `elkjs`. Recommandation du CDC applicable telle quelle. |
| Données | Drizzle ORM + Postgres, migrations SQL à la main appliquées au déploiement, journal `_journal.json` | Pseudo-Prisma du §4 à transposer en Drizzle. Migration courante : **0032**. |
| Vecteurs | **`CREATE EXTENSION vector` déjà posé (migration 0000)**, colonnes `vector(1536)` sur `creatives` et une autre table | Les `embedding` du CDC (`CreativeElement`, `Learning`) passent de COULD à faisables d'emblée. La dédup sémantique §9 n'a pas besoin de repli lexical. |
| Auth / RBAC | Cookie JWT signé (`jose`) + bcrypt ; rôles `owner \| admin \| member \| **client_viewer**` | Le rôle de la vue client §12 **existe déjà**. Reste à créer `ClientShareLink` (aucune table de partage à ce jour). |
| Jobs | BullMQ + IORedis, service `workers` en production (docker-compose), files `ingest \| tag \| radar \| generate \| cron`, job répétable déjà en place (`daily-sync`, 06:00) | `nightly_orchestrator` (§10) et la file A0 s'insèrent dans l'existant. Rien à monter. |
| Cron HTTP | `/api/cron/tracker` protégé par `Authorization: Bearer $CRON_SECRET` | Motif à réutiliser pour un déclenchement externe. |
| IA | `packages/ai`, modèle via `ANTHROPIC_GEN_MODEL` (défaut `claude-sonnet-5`) | **Le JSON strict du §8 est déjà résolu** : le dépôt force la sortie par `tools` + `tool_choice: { type: 'tool' }`. Motif à reprendre pour A0-A8, pas à réinventer. |
| Vision | `describeAssetImage` accepte `data:` et `url` | A0 peut s'appuyer dessus pour les frames. |
| Stockage | S3 compatible, URL présignées (`presignPutUrl`) | Stockage des frames échantillonnées d'A0. |
| Observabilité | `error_log` + `/admin/incidents` + `logAndTranslate` (livrés aujourd'hui) | Les échecs d'agent y atterrissent sans travail supplémentaire. |
| Qualité | CI GitHub Actions : typecheck + lint + test + build ; 121 tests | Annexe A (cas de verdict) s'ajoute directement à `packages/core`. |

---

## 2. Corrections à apporter au cahier des charges

Trois hypothèses techniques du document ne correspondent pas au dépôt. Elles touchent des points structurants.

### 2.1 Higgsfield `video_analysis_create` n'est pas branché dans le produit

Le §8.3 A0 et le §17.5 supposent que la transcription est « déjà branchée ». Le connecteur `packages/integrations/src/higgsfield.ts` n'expose que la **génération** vidéo : `hfSubmitVideo`, `hfSubmitImageVideo`, `hfGetJob`. Aucune fonction d'analyse.

`video_analysis_create` existe comme outil MCP dans mon environnement de travail, pas dans le produit déployé. La confusion est compréhensible mais la conséquence est nette : **la transcription est du travail neuf, pas un branchement.**

Trois options, à trancher (§17.5) :

| Option | Effort | Coût récurrent | Remarque |
|---|---|---|---|
| Ajouter `hfVideoAnalysis` au connecteur | 0,5 j | tarif Higgsfield | Cohérent avec l'existant, dépend de la disponibilité réelle de l'endpoint sur le compte |
| ffmpeg (extraction audio) + API de transcription | 1 j | ~0,006 €/min | Maîtrisé, mais ffmpeg à ajouter à `Dockerfile.workers` |
| Claude vision seul, sans transcription | 0 j | inclus | Dégrade `transcript` et `hook_spoken` à null ; les champs visuels restent. Repli honnête pour la v1 |

Recommandation : **option 2**, avec l'option 3 en repli automatique si la transcription échoue. `AssetAnalysis.confidence` reflète alors l'absence de transcript.

### 2.2 Trendtrack : `brief_competitor` et `find_similar_shops` ne sont pas dans le produit

Le §8.3 A1 les cite comme sources. Le connecteur expose `ttSearchAds`, `ttSearchTikTok`, `ttSearchGoogle`, `ttGetMe` — et rien d'autre. Même explication : ce sont des outils MCP de mon environnement.

Conséquence : A1 travaille sur `ttSearchAds` (déjà suffisant pour nourrir avatars et angles depuis la copy concurrente) ; « brief concurrent » et « boutiques similaires » deviennent COULD, à ajouter au connecteur si l'API Trendtrack les expose.

### 2.3 La synchro Meta actuelle ne suffit pas au protocole ni au verdict

`metaAdsSync` remonte une fenêtre de 30 jours agrégée, au niveau compte et au niveau ad, avec `video_3_sec_watched_actions` et `video_p75_watched_actions`.

Manquent, et chacun bloque une exigence précise :

| Manquant | Bloque |
|---|---|
| `time_increment=1` (lignes quotidiennes) | `MetricSnapshot` par jour (§4), sparkline 7 j (§7.2), `evaluation_window_days` (§6.3) |
| `adset_id`, `campaign_id`, `campaign_name` au niveau ad | Contrôle de protocole §6.2, rattachement au batch |
| `daily_budget` des ad sets (appel `/adsets` séparé) | Variance de budget §6.2, `min_spend_share` §6.3 |
| `reach`, `thruplays`, `video_p25/p50/p100` | `hold_rate` avec repli p50 (§6.4) |
| `landing_page_views`, `add_to_cart` | Diagnostic CONVERT §8.4 |

C'est environ **1 jour** de travail sur le connecteur, à placer en **début de Phase 3**, avant le moteur de verdict. Bonne nouvelle : `metrics_daily` a déjà les colonnes pour tout accueillir.

### 2.4 Shopify n'expose pas de CVR

`shopifyCommerceSync` interroge l'Admin GraphQL sur les **commandes** : il n'y a ni session ni visite, donc pas de taux de conversion. `LandingPage.cvr_30d` (§4, §8.4) exige `shopifyqlQuery` (analytics), qui est une autre surface d'API avec ses propres droits.

Conséquence : `cvr_30d` reste **saisie manuelle en v1** (le CDC le prévoit en repli), et la requête ShopifyQL devient un SHOULD de Phase 5. Le diagnostic CONVERT fonctionne quand même : il compare le CVR de l'ad à une baseline saisie.

### 2.5 Notion n'existe pas dans le produit

Le §8.3 A3 « SHOULD push Notion » : aucune intégration Notion dans le dépôt. À traiter comme du neuf ou à abandonner — le brief est déjà stocké en base (`briefs.content_json`) et exportable.

---

## 3. Ce que le canvas implique

Aucune bibliothèque de canvas n'est installée, et le produit n'utilise aucun composant tiers : tout est écrit à la main en styles inline. `@xyflow/react` + `elkjs` sont les deux premières dépendances UI du projet.

Deux points de vigilance :

- **Thème.** Le produit pilote ses couleurs par variables CSS (`--ink`, `--surface`, `--accent-strong`, `--grad-accent`) avec un thème ADMIN+ distinct. Le canvas devra consommer ces variables, pas les couleurs par défaut de la bibliothèque, sinon il jurera avec le reste.
- **Poids.** `@xyflow/react` pèse ~50 ko gzip. Le premier chargement de l'application est à 102 ko partagés aujourd'hui : le canvas doit être chargé dynamiquement (`next/dynamic`, `ssr: false`) pour ne pas alourdir les pages qui ne l'utilisent pas.

L'exigence « fluide jusqu'à 2 000 nœuds » (§14) est atteignable avec `onlyRenderVisibleElements` et le repli sur la vue Table au-delà.

---

## 4. Le moteur de verdict va dans `packages/core`

`packages/core` est pur, sans dépendance serveur, et déjà testé (31 tests). C'est l'endroit exact pour :

- les métriques dérivées et les intervalles (§6.4) — Wilson et Poisson sont du calcul pur ;
- les règles de verdict (§6.6) et les kill rules (§6.5) ;
- le score de pré-lancement A7 v1, que le CDC demande explicitement **en code et non par LLM** ;
- le parser de nommage (§8.6).

Tout cela devient testable sans base ni réseau, comme `applyPlanAllocation` livré aujourd'hui. L'Annexe A se transpose directement en table de cas.

**Un manque à combler dans le CDC** : l'intervalle de Poisson par quantiles chi² (§6.4) suppose une fonction quantile chi², absente de la bibliothèque standard JS. Deux voies : implémenter l'inverse de la gamma incomplète régularisée (~40 lignes, testable contre des valeurs de référence), ou approximer par Wilson-Poisson. Recommandation : l'implémenter proprement — c'est le cœur statistique du produit, et une approximation silencieuse fausserait les verdicts limites de l'Annexe A.

---

## 5. Crédits : les agents doivent être tarifés

Le CDC parle de « coût affiché par run » et de `AgentRun.cost_eur`. Le produit a déjà une mécanique complète et **atomique** : `reserveCredits` / `settleCredits` / `refundCredits`, barème `CREDIT_COSTS` dans `packages/core`, grand livre, page `/usage`.

ADSMAP doit s'y brancher plutôt que d'inventer un compteur parallèle. Actions à prévoir en Phase 4 :

- ajouter les actions ADSMAP au barème (`adsmap_tag`, `adsmap_concept`, `adsmap_analyst`, `adsmap_iteration`, `adsmap_research`, `adsmap_brief`) avec leur coût réel estimé, comme le reste ;
- A0 est le poste le plus lourd (transcription + jusqu'à 25 frames en vision) : le plafond de frames du §14 est une décision **économique**, à refléter dans le barème ;
- l'orchestrateur nocturne consomme des crédits **sans utilisateur devant l'écran**. Il faut une règle explicite : plafond nocturne par marque, et arrêt propre quand le solde est insuffisant, avec un `DecisionItem` plutôt qu'un échec silencieux. **Ce point n'est pas traité par le CDC et doit l'être.**

---

## 6. Estimation révisée

Le CDC annonce 24-28 jours. La lecture du dépôt déplace des choses dans les deux sens.

| | Écart | Motif |
|---|---|---|
| Phase 1 (schéma, import) | **−1 j** | Sept tables déjà modélisées ; travail d'extension plutôt que de création |
| Phase 3 (sync, verdict) | **+1 j** | Connecteur Meta à compléter (§2.3) avant tout moteur |
| Phase 4 (A0) | **+0,5 à 1 j** | Transcription non branchée (§2.1) |
| Phase 5 (CVR Shopify) | **+0,5 j** | ShopifyQL à ajouter, ou repli manuel |
| Transverse | **−0,5 j** | pgvector, JSON strict par outil, files BullMQ, RBAC `client_viewer`, CI : tout est en place |

Net : **+0,5 à 1 jour**, soit **25-29 jours**. L'estimation du CDC tient. Le risque principal n'est pas la durée mais la **duplication du modèle de données** décrite au §0.

---

## 7. Ce que je recommande de trancher avant la Phase 1

Le §17 pose neuf questions. Six peuvent attendre la Phase 2 ; **trois bloquent la Phase 1** parce qu'elles déterminent le schéma :

1. **§17.8 — Multi-marque.** Une marque ADSMAP = une `brands` du workspace, ou une organisation séparée ? Le produit est déjà multi-marque par workspace, avec une marque active. Recommandation : réutiliser `brands` tel quel. Décision structurante pour toutes les clés étrangères.
2. **Avatar / Persona.** Le CDC dit « Avatar », le produit dit « Persona », et c'est le même objet avec la même forme. Recommandation : **garder la table `personas`, l'étendre, et n'employer qu'un seul mot dans l'interface** — je propose « Avatar », le terme du métier. Sans cette décision, on aura deux notions pour une seule réalité.
3. **§17.1 — Blocage READY sans hypothèse, offre et landing.** Recommandation : oui, c'est le cœur du produit. Mais l'import du Sheet ne peut pas le respecter rétroactivement : le CDC le prévoit déjà (`legacy_missing_hypothesis`), il faut confirmer que des lignes historiquement « Prête » redescendent en `DRAFT`.

Les six autres (§17.2 protocole ABO, §17.3 KPI et seuils, §17.4 nommage, §17.5 transcription, §17.6 Shopify, §17.7 opt-in portefeuille, §17.9 vue client) peuvent être tranchées pendant la Phase 1, sans bloquer le schéma.

---

## 8. Ordre d'attaque proposé pour la Phase 1

1. Migration d'extension : `brands` (+ vertical, naming_pattern, portfolio_opt_in), `personas` (+ objections, sources, status), et les nouvelles tables du graphe (`desires`, `angles`, `concepts`, `batches`, `iteration_edges`, `learnings`, `offers`, `landing_pages`, `verdicts`, `test_protocols`, `verdict_configs`, `brand_stats`, `creative_elements`, `decision_items`).
2. Réveil de la couche dormante : `ad_instances` et `metrics_daily` reliés au nouveau `Ad`, `creatives` porteur de `AssetAnalysis`.
3. Invariants du §2.4 en contraintes SQL quand c'est possible, en garde applicative sinon, chacun avec son test.
4. Import du Sheet (§13) avec rapport.
5. Vue Table + export CSV aux 19 colonnes.
6. Configuration protocole et verdict, avec l'assistant de réglage.

Le canvas (Phase 2) n'est pas un préalable : la vue Table permet de valider tout le modèle avant d'investir dans le rendu.
