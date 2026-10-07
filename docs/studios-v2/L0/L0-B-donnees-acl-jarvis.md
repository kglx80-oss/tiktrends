# L0-B · Données, droits, Jarvis · inventaire en lecture seule

SHA lu : `bc33cec80a8c76db1ff7ffbbdec5e9297ae42fb0` (checkout détaché, aucun fichier du dépôt modifié, aucun réseau).
Tous les chemins sont relatifs à `product/`.

---

## 1. Schéma

### 1.1 Migrations

- **54 migrations** (`0000_tiny_silhouette` à `0053_modern_quasar`), journal `packages/db/drizzle/meta/_journal.json` (54 entrées, dernière `idx 53`, tag `0053_modern_quasar`).
- Le compte est recopié à la main dans `packages/db/src/journal.ts:15` (`MIGRATIONS_IN_BUILD = 54`) et un test le compare au journal · **toute migration additive doit incrémenter ce nombre**.
- Dernière migration `packages/db/drizzle/0053_modern_quasar.sql` : enum `platform_role`, tables `platform_staff` et `platform_role_rights`, amorçage des deux fondateurs. Son en-tête dit que le snapshot drizzle était figé à 0035 jusqu'ici · `0053_snapshot.json` est désormais complet (`drizzle/meta` ne contient que `0035_snapshot.json` et `0053_snapshot.json`).
- Contraintes SQL métier (seules du dépôt) : `drizzle/0033_panoramic_agent_zero.sql:790` (`adsmap_ads_ready_requires_test_setup`, hypothèse/variable/offre/page exigées dès `ready`), `:800` (`changed_variable <> 'none_control'`), `:806` (`comparable OR computed <> 'winner'`), `:812` (pas d'auto-filiation). Aucun trigger, aucune RLS.

### 1.2 Tables pertinentes (colonnes clés)

| Table | Où | Colonnes clés | Remarques |
| --- | --- | --- | --- |
| `workspaces` | `packages/db/src/schema.ts:22` | `plan` (texte), `credits_balance`, `account_kind`, `trial_*`, `onboarding_json`, Stripe, Drive | Le solde de crédits vit ICI (pas de table de solde) |
| `users` | `schema.ts:45` | `email` unique, `password_hash`, `session_epoch` | **Aucune colonne de vérification d'e-mail** |
| `workspace_members` | `schema.ts:60` | PK (`workspace_id`,`user_id`), `role` enum `owner/admin/member/client_viewer` | |
| `platform_staff` | `schema.ts:68` | PK `email`, `role` enum plateforme (8 valeurs) | Lié par e-mail, pas par `user_id` |
| `platform_role_rights` | `schema.ts:78` | PK `role`, `rubriques_json` | Matrice éditable |
| `brands` | `schema.ts:84` | `workspace_id`, identité (palette, fonts, tone, usp, audience...), `creative_rules`, `jarvis_learnings`, `jarvis_trained_at`, tokens chiffrés Shopify/Meta/Drive, `radar_*` | Règles maison Jarvis = 1 champ texte écrasé |
| `products` | `schema.ts:157` | `brand_id`, `name`, `description`, `usp`, `price`, `url`, `image_url`, `image_urls[]` | Pas de `workspace_id`, **aucune version**, mise à jour en place |
| `assets` | `schema.ts:172` | `workspace_id`, `brand_id` nullable, `kind`, `source`, `url` (data URI ou URL), `thumb_url`, `external_id`, `tags[]`, `use_for_ai` | |
| `generations` | `schema.ts:501` | `brand_id`, `kind` (`script/copy/image/video/ad`), `input_json` (recette), `output_json` (cache des rendus S3), `asset_urls[]`, `credits_cost`, `status` texte, `job_id` | **Pas de `workspace_id`, pas d'auteur, pas de parent en colonne**. Tout le reste est dans `input_json` |
| `ad_fact_validations` | `schema.ts:523` | `generation_id`, `fact_cle`, `source`, `signature`, `version`, `validated_by`, `validated_at` | **Append-only**, seul modèle d'approbation signée du dépôt |
| `saved_ads` | `schema.ts:682` | `workspace_id`, `brand_id`, `platform`, `external_id`, `snapshot_json`, `folder` | Unique (`workspace_id`,`platform`,`external_id`) |
| `market_creatives` | `schema.ts:367` | `workspace_id`, `brand_id`, analyse A0, `provenance`, `radar_signal` | |
| `library_ads`, `library_brands`, `boards`, `board_items` | `schema.ts:405-463` | | Tables de sprint ancien, peu ou pas branchées |
| `creative_presets` | `schema.ts:734` | `workspace_id`, `brand_id` nullable, `name`, `kind`, `prompt`, `negative`, `archived` | Prompt maison · **édité en place, pas de version** |
| `jarvis_messages` | `schema.ts:763` | `workspace_id`, `brand_id`, `user_id`, `role` texte, `content` | Un fil par (marque, personne) |
| `agent_threads`, `agent_memory`, `agent_jobs` | `schema.ts:536`, `:543`, `:550` | | `agent_memory` utilisé par `actions/competitor.ts:130`; `agent_threads` et `agent_jobs` non branchés |
| `ai_spend` | `schema.ts:343` | `workspace_id` **nullable**, `provider`, `model`, `action`, `estimated_usd`, `actual_usd`, tokens | Dollars réels, plafond global |
| `credit_ledger` | `schema.ts:560` | `workspace_id`, `delta`, `reason`, `ref_id` | `ref_id` jamais renseigné par `lib/credits.ts` |
| `app_settings` | `schema.ts:625` | PK `key`, `value` jsonb | Héberge les **connaissances** (`connaissance:<id>`) et leur usage |
| `invites` | `schema.ts:658` | `workspace_id`, `email`, `role`, `token`, `status`, `expires_at` | |
| `error_log`, `notifications`, `tickets`, `ticket_messages`, `stripe_events`, `password_resets`, `api_keys` | `schema.ts:587-680` | | |
| `adsmap_*` (21 tables) | `schema.ts:835-1189` | voir §6 | |

`connaissances/knowledge` : **aucune table dédiée**, stockage dans `app_settings` (voir §3). `jobs` : **aucune table de job générique** ; `agent_jobs` (non branchée), `generations.job_id/status` (vidéo fal), file BullMQ `apps/workers/src/queue.ts:9` dont le seul worker est un `TODO` (`apps/workers/src/worker.ts:5-12`).

### 1.3 Objets logiques → existant

| Objet logique | Équivalent existant | Degré |
| --- | --- | --- |
| **CreativeProject** | Aucun. Le plus proche : la **marque active** (portée de tout le studio) + `generations.input.lot` (UUID de lot, `apps/web/app/actions/ads.ts:780`) + `adsmap_concepts` (promesse) | absent |
| **ProjectVersion immuable** | Aucun. `generations.input` est **muté en place** (`updateAdTextAction` `apps/web/app/actions/ads.ts:1731`, `rateCreativeAction` `apps/web/app/actions/creatives.ts:35`, pont Adsmap `apps/web/app/actions/adsmap-bridge.ts:100`). Seul modèle immuable : `ad_fact_validations` et les versions de connaissances | absent |
| **ProductReference épinglée** | `products` (mutable) + `productId` dans la recette (`apps/web/lib/ad-render.tsx:87`). Aucun instantané de l'image ou du texte produit au moment de la génération | partiel faible |
| **SourceReference** | `adsmap_concepts.source_ref_json`, `adsmap_ads.source_ref_json` (`schema.ts:905`, `:954`), `generations.input.sourceVeille` (`ads.ts:787`), `saved_ads`, `market_creatives`, `brand_tracker_events`, `library_ads` | partiel (jsonb non typé, pas de FK) |
| **Asset** | `assets` (`schema.ts:172`) + `generations.asset_urls` + `generations.output.renders` (`apps/web/lib/ad-store.ts`) | existant, à unifier |
| **Shot** | Aucun. Statique : `sceneUrl` / `sceneBrief` dans la recette ; vidéo : un prompt, un job | absent |
| **Document à calques** | `AdRecipe` (`apps/web/lib/ad-render.tsx:6-112`) · calques implicites (scène, headline, kicker, subhead, cta, badge, logo, layout, light), rendu par `ad-render.tsx` avec `RENDER_VERSION = 9` (`:162`) dans la clé de cache | partiel (plat, non versionné) |
| **Timeline** | Aucun | absent |
| **Proposal** | Nœuds Adsmap à statut `proposed` (`adsmap_node_status`, `schema.ts:788`), `adsmap_decision_items` (`:1123`), marqueurs `[[ACTION:...]]` de Jarvis (éphémères, `packages/core/src/adsmap/jarvis-actions.ts`), `proposeJarvisRulesAction` (non enregistrée, `apps/web/app/actions/jarvis.ts:51`) | partiel, dispersé |
| **ImpactPlan** | `iterationPlanAction` (calculé, non stocké, `apps/web/app/actions/adsmap-iterate.ts:70`), `essaiSuivantAction` (`adsmap-attribution.ts:511`) | absent en base |
| **Quote / Approval** | Quote : aucun (prix calculé par `costFor`, affiché côté écran). Approval : `ad_fact_validations` (signature + version), `adsmap_verdicts.validated_by/override_reason` (`schema.ts:1022-1023`), publication de connaissance avec confirmation explicite | Quote absent · Approval partiel |
| **Job / Attempt** | `generations.status/job_id` (vidéo), `agent_jobs` (non branché), store client en mémoire `apps/web/lib/generation-store.ts`, `ai_spend` (une ligne par appel facturé, annulable) | partiel |
| **PromptTemplate / Release** | `creative_presets` (sans version), connaissances `app_settings` (versions + brouillon/publié/retiré = vrai cycle de release), directions et univers en dur dans `packages/core` (`ad-directions.ts`, `video-directions.ts`, `visual-universes.ts`) | partiel · le modèle de release existe pour les connaissances seulement |
| **PromptRun** | `ai_spend` (action, modèle, tokens, coût) ; `adsmap_agent_runs` (`schema.ts:1138`, entrée/sortie/modèle/coût/accepted) **déclarée mais jamais écrite** | partiel |
| **Variant / TestLink** | `adsmap_ads.variant_code` + `source_ref.generationId` ↔ `generations.input.adsmapAdId` (lien double jsonb, sans FK), `generations.input.essai {variable, groupe}`, `generations.input.parentId/variable` (déclinaison, `ads.ts:2031`), `ad_instances` (face régie) | partiel mais riche |
| **AuditEvent** | Aucun journal générique. Traces partielles : `credit_ledger`, `error_log`, `ad_fact_validations`, champs `creePar/publiePar/retirePar` des connaissances, `adsmap_verdicts.validated_by` | absent |

---

## 2. Droits

### 2.1 Deux systèmes qui ne se mélangent pas

**Client (espace)** · `apps/web/lib/rbac.ts`
- Rôles `owner > admin > member > client_viewer` (`rbac.ts:10`), `roleAtLeast` (`:21`).
- Offres `starter < core < plus < business` (`:12`), `planAtLeast` (`:24`).
- Catalogue `FEATURES` avec `minRole` + `minPlan` (`:104-164`).
- `canAccess(a, f)` (`:234`) : client = rôle ET offre ; équipe = rubrique seule.

**Équipe plateforme** · `packages/core/src/equipe-plateforme.ts`
- 8 rôles `adminplus, admin, manager, dev, moderateur, membre, freelance, lecture` (`:22-28`).
- `accesTotal` = `adminplus` et `admin` (`:41-45`) · hors matrice, crédits illimités.
- 17 rubriques dont `coulisses` et `finances` (`:60-78`).
- `DROITS_DEFAUT` pour les 6 rôles matriciels (`:88-95`), surchargés par `platform_role_rights`.
- `roleVoitRubrique` (`:107`).
- Branchement session : `apps/web/lib/equipe-plateforme.ts:49` (`equipeDeSession`, lu par **e-mail** dans `platform_staff`, repli `adminplus` si fondateur), appelé dans `getSession` (`apps/web/lib/auth.ts:144`).

**Fondateurs** · `apps/web/lib/founder.ts:19-33` : liste en dur (2 e-mails) unie à `FOUNDER_EMAILS`. `effectiveAccess` (`apps/web/lib/access.ts:26`) force l'offre `business` pour fondateur ou accès total, **sans relever le rôle d'espace**.

### 2.2 Matrice existante (features du rail)

| Feature | minRole | minPlan | Rubrique équipe |
| --- | --- | --- | --- |
| dashboard, analytics | client_viewer | starter | dashboard, analytics |
| veille, scale, saved, formats | member | core | veille / saved |
| tags | member | starter | veille |
| radar créatif | member | core | radar |
| jarvis | member | core | jarvis |
| studio, ads, image, video, textes | member | core | studio |
| assets | member | core | assets |
| adsmap, suites, tri, protocole | member | plus | adsmap |
| lots, ttradar, import | admin | plus | adsmap |
| brands, team, connect, usage, billing, settings | admin | starter | marques, equipe, connexions, usage, facturation, reglages |
| support | client_viewer | starter | (aucune · toujours) |

Source : `apps/web/lib/rbac.ts:104-178`.

### 2.3 Où c'est appliqué

- **Aucun middleware.** Le layout `apps/web/app/(app)/layout.tsx:22-23` n'exige qu'une session ; le rail (`railNav`) ne protège rien.
- Pages : chacune porte son garde (relevé complet en §4 P3). Studio : `canAccess` + `denyReason` sur `studio/*/page.tsx`.
- Actions :
  - `adsmapGuard` (`apps/web/lib/adsmap-guard.ts:26`) · `canAccess(adsmap)` + `minRole` optionnel + marque active obligatoire. Utilisé par 15 fichiers `actions/adsmap-*.ts` et `market-learn.ts`.
  - `refusJarvis` (`apps/web/lib/jarvis-acces.ts:27`) · `member` minimum PUIS `canAccess(jarvis)`. Utilisé par la route chat, `jarvis-chat.ts`, `jarvis.ts`.
  - `studio.ts:23-27` (Textes IA) · `canAccess(studio)`. **Les actions Pubs IA, Image IA et Vidéo IA n'ont aucun garde de rôle ni d'offre** (voir P3).
  - `exigerAccesTotal` (`apps/web/app/actions/equipe.ts:22`) · accès total plateforme.
  - `peutGererConnaissances` (`packages/core/src/connaissances.ts:733`) · accès total plateforme.
  - `isFounder` · plans, crédits, bêta, Stripe diag, pages `/admin/*`, `/console`, `/credits`.

### 2.4 Admin d'espace vs admin plateforme

- **Admin d'espace** = `workspace_members.role` `admin|owner`. Toute inscription libre crée un `owner` (`apps/web/app/actions/auth.ts:47`).
- **Admin plateforme** = `platform_staff.role` en accès total, OU fondateur (repli `adminplus`).
- Incohérence : `/admin`, `/admin/finance`, `/admin/depenses`, `/admin/incidents`, `/admin/intelligence`, `/admin/paiement`, `/admin/plans`, `/admin/signups`, `/console`, `/credits` exigent **`roleAtLeast(admin)` d'espace ET `isFounder`** (ex. `apps/web/app/(app)/admin/page.tsx:22-23`), tandis que `/admin/equipe` (`admin/equipe/page.tsx:32`) et `/admin/connaissances` (`admin/connaissances/page.tsx:24`) exigent l'**accès total d'équipe**. Un Admin plateforme non fondateur gère l'équipe et les connaissances mais n'ouvre pas le hub `/admin`. Les rubriques `coulisses` et `finances` existent dans la matrice mais **aucune page ne les lit** (seul lecteur : `rbac.ts:197` et l'écran d'équipe).

### 2.5 Portée marque

- Cookie `tt_brand` (`apps/web/lib/brands.ts:6`), validé contre l'espace par `getActiveBrand` (`:19-27`). `null` = « toutes les marques ».
- **Aucune ACL par marque** : tout membre de l'espace voit toutes les marques. La portée marque est un filtre de travail, pas un droit.
- `getSession` prend la **première** appartenance sans tri (`apps/web/lib/auth.ts:126-130`) · un utilisateur n'a en pratique qu'un espace (l'invitation refuse un e-mail existant, `actions/invites.ts:27-28`).

---

## 3. Jarvis et connaissances

### 3.1 Construction du contexte (route `apps/web/app/api/jarvis/chat/route.ts`)

1. Session, puis `refusJarvis` AVANT toute lecture (`:42-47`).
2. Marque active obligatoire (`:49-50`).
3. Corps : seul `message` est lu (`:52-54`).
4. **Historique relu en base** (`jarvis_messages`, 40 derniers, filtrés marque + utilisateur, `:63-70`), plus la question, passés à `trimThread` (`packages/core/src/adsmap/jarvis-chat.ts:214`, 20 tours, 4 000 car., commence par `user`).
5. Mémoire mesurée + stats Adsmap seulement si `canAccess(adsmap)` (`:77-80`), via `apps/web/lib/jarvis-memory.ts:364` (`jarvisFullMemory`) et `:212` (`jarvisStats`).
6. Identité et `creative_rules` de la marque, niveau d'accueil de l'espace (`:81-90`).
7. `chatSystemPrompt` (`packages/core/src/adsmap/jarvis-chat.ts:106`) : socle, marque, mémoire (9 000 car. max), prudence selon l'effectif, registre, « où envoyer », bloc d'actions, règles maison en dernier.
8. `consigneAvecConnaissances` (`apps/web/lib/jarvis-connaissances.ts:126`) insère le bloc de connaissances publiées et applicables.
9. Question écrite en base AVANT l'appel (`:107-110`), réponse en flux, écrite à la fin (`:142-147`), usage des connaissances compté (`:149`).
10. Dépense : `guardedAnthropic({ workspaceId, action: 'jarvis-chat' })` (`:56`). **Aucun débit de crédits** sur le chat Jarvis (contrairement à `askAssistant`).

### 3.2 Ce qui est versionné / publié

- **Connaissances** (`packages/core/src/connaissances.ts`) : 4 types (`instruction`, `methode`, `savoir`, `donnees`), états `brouillon/publie/retire`, chaque édition = nouvelle version (`nouvelleVersion` `:279`, contrôle de concurrence sur la version de base), publication de la dernière seulement (`publierVersion` `:293`), retrait sans effacement (`:313`). Portée `plateforme | espace | marque` (`:49-52`), applicabilité stricte (`porteeApplicable` `:421`), bloc délimité et neutralisé sous plafond mesuré de 6 000 car. (`:132`, `assemblerConnaissances` `:533`). Confirmation explicite pour publier en portée plateforme (`:679-692`).
- Stockage : une ligne `app_settings` par connaissance (`connaissance:<id>`, toutes versions dans le jsonb), écriture conditionnelle sur `rev` (`apps/web/lib/jarvis-connaissances.ts:91-107`), cache invalidé par empreinte en base (`:52-77`), compteurs d'usage `connaissance-usage:<id>:v<n>`.
- Écran : `apps/web/app/(app)/admin/connaissances/page.tsx` + `EcranConnaissances.tsx` ; actions `apps/web/app/actions/connaissances.ts` (création `:107`, version `:132`, publication `:158`, retrait `:170`), garde `:44`.
- **Non versionnés** : `brands.creative_rules` (écrasé par `saveJarvisRulesAction` `apps/web/app/actions/jarvis.ts:27-36`), `brands.jarvis_learnings` (écrasé par `trainJarvisAction` `:103-174`), `creative_presets`, consigne système (recomposée à chaque tour, jamais stockée, volontairement).

### 3.3 Ce que Jarvis peut déjà faire

- **Aucun outil (tool use) et aucune mutation déclenchée par le modèle.** L'appel n'a pas de `tools` (`route.ts:112-118`).
- Il peut **proposer** jusqu'à 2 actions par marqueur `[[ACTION:cle]]` dans un vocabulaire fermé (`draft, suites, lots, radar, studio, carte`, `packages/core/src/adsmap/jarvis-actions.ts:36-80`), parsé côté écran (`parseAnswer`). Cinq sont de la navigation ; `draft` appelle sur clic `draftConceptAction` (`apps/web/app/actions/adsmap-draft.ts:46`), qui rédige un concept et se relit, **sans l'enregistrer** (aucune insertion dans ce fichier).
- Il cite des connaissances par `[[SOURCE:ref]]` (`connaissances.ts:464`), compté si la question ne dictait pas le marqueur.
- Mutations autour de Jarvis, toutes humaines : règles maison, apprentissages, entraînement (admin d'espace + `refusJarvis`, `jarvis.ts`), effacement du fil (`jarvis-chat.ts:161`).
- `JarvisContexte.tsx` (`apps/web/app/(app)/jarvis/JarvisContexte.tsx`) montre en lecture l'identité, les règles, les accroches (offre Plus) et les **titres** des connaissances incluses ; il ne déclenche rien.

### 3.4 Assistant d'accueil (`askAssistant`)

- `apps/web/app/actions/assistant.ts:17` · session seule, `guardedAnthropic({ action: 'assistant' })` **sans workspaceId** (`:23`), débit de crédits atomique (`:30`), historique **fourni par le client** (`:44`), envoyé à `chatAssistant` (`packages/ai/src/chat.ts:26`) qui garde les 12 derniers et tronque à 4 000 car. (`:35`). Persona `TESS_SYSTEM` (`packages/ai/src/agent.ts:2`), contexte léger (marque, solde, plan). Rendu sur l'accueil pour tous les rôles (`apps/web/app/(app)/dashboard/page.tsx:77`).

---

## 4. Dettes historiques requalifiées sur le code actuel

| Dette | Statut | Preuve |
| --- | --- | --- |
| **P1** `askAssistant` sans garde de rôle | **OUI, toujours vraie** | `apps/web/app/actions/assistant.ts:18-19` ne vérifie que la session. Ni rôle, ni offre, ni `canAccess`. Un `client_viewer` ou un espace Starter dépense des dollars (plafond global) et des crédits. Composant affiché sur l'accueil pour tous (`dashboard/page.tsx:77`). |
| **P2** historique client non validé | **OUI pour `askAssistant`, NON pour Jarvis** | `askAssistant(history: ChatMessage[], ...)` : le type n'est qu'une annotation TypeScript, aucune validation à l'exécution des rôles ni du type de `content` ; un client peut forger des tours `assistant`. Seules bornes : `slice(-12)` et `slice(0, 4000)` (`packages/ai/src/chat.ts:35`). Aucune garantie que le fil commence par `user`. La route Jarvis relit le fil en base et n'accepte du client que `message` (`route.ts:52-75`). |
| **Crédits non atomiques** | **PARTIEL** | Débit par action atomique (UPDATE conditionnel, `apps/web/lib/credits.ts:44-53`), mais solde et `credit_ledger` en deux requêtes **hors transaction** (`:46-51`, idem remboursement `:56-61`). Changement de formule et allocation Stripe en **lecture puis écriture** (`apps/web/app/actions/billing.ts:39-42`, `apps/web/app/api/stripe/webhook/route.ts:26-29`) · un débit concurrent entre les deux est écrasé. Le plafond en dollars est aussi non atomique : `spendStatus` puis `record` (`apps/web/lib/spend-guard.ts:136-138`, `:214-223`) · des appels simultanés passent le même contrôle. Une seule transaction dans tout `apps/web` : `adsmap-verdict.ts:275` et `:393`. |
| **`ai_spend.workspace_id` manquant** | **OUI, 24 points d'appel** | Colonne nullable (`schema.ts:345`). Sans `workspaceId` : `assistant.ts:23` ; `assets.ts:212`, `:249` ; `brand-detail.ts:36`, `:108`, `:363` ; `studio.ts:33` ; `brands.ts:50` ; `video.ts:355` ; `image.ts:93`, `:158` ; `adsmap-analyze.ts:185` ; `jarvis.ts:57`, `:109` ; `ads.ts:1051`, `:1355`, `:1455`, `:1768`, `:1954` ; `adsmap-propose.ts:115`, `:151`, `:196`, `:245` ; `competitor.ts:105` (tous sous `apps/web/app/actions/`). Avec : `market-learn.ts:68`, `image.ts:344`, `adsmap-draft.ts:54`, `ads.ts:558`, `api/jarvis/chat/route.ts:56`, `lib/radar.ts:187`, et les 7 appels `sousPlafond` fal (`universe-previews.ts:169`, `brand-detail.ts:240`, `video.ts:128`, `:164`, `image.ts:135`, `ads.ts:462`, `:2000`). Conséquence : la génération Anthropic des Pubs IA (`ads.ts:1051`) n'est pas imputable à un espace. |
| **E5** invitation à un e-mail non vérifié | **OUI** | `acceptInviteAction` (`apps/web/app/actions/invites.ts:60-87`) crée le compte avec l'e-mail de l'invitation et le mot de passe choisi par **quiconque détient le lien** ; le lien est affiché en clair à l'admin qui invite (`apps/web/app/(app)/team/page.tsx:101`). Aucune colonne ni étape de vérification d'e-mail dans `users`, ni à l'inscription (`actions/auth.ts:24-55`). Acceptation non transactionnelle (user, membership, statut en 3 requêtes). Aggravant : `platform_staff` est lié par e-mail (`apps/web/lib/equipe-plateforme.ts:53-58`) · un e-mail ajouté à l'équipe avant que la personne ait un compte donne le rôle plateforme à quiconque s'inscrit ou accepte une invitation avec cet e-mail. |
| **P3** pages masquées sans garde serveur | **OUI, sur des ACTIONS plus que sur des pages** | Pages : toutes gardées sauf `/tags` (données de démonstration seulement, `app/(app)/tags/page.tsx`) et `/assets` (rôle `member` sans contrôle d'offre Core, `assets/page.tsx:19`). Actions sans garde de rôle ni d'offre (session + marque seulement) : **`ads.ts`** (11 exports dont `generateAdsAction` `:1003`, `updateAdTextAction` `:1731`, `declineAdAction` `:1902`), **`image.ts`** (`generateImageAction` `:22`, `setProductImageAction` `:194` qui modifie les produits), **`video.ts`** (`startVideoAction` `:99`), `creatives.ts` (note, archivage), `ads-faits.ts:22` (**un `client_viewer` peut valider un fait**), `assistant.ts`, `tracker.ts`, `decouverte.ts`, `layout-marche.ts`, `video-marche.ts`. `adsmap-protocol.ts:46` vérifie le rôle mais pas l'offre Plus. Les pages correspondantes, elles, appellent `canAccess`. |

---

## 5. ADMIN existant (`apps/web/app/(app)/admin/**`)

| Route | Garde | Ce qui y est géré |
| --- | --- | --- |
| `/admin` (`page.tsx:20-23`) | admin d'espace + fondateur | KPI plateforme (MRR, ARR, payants, actifs, crédits, générations, tickets), tuiles vers les outils |
| `/admin/finance` | admin + fondateur | MRR et marges par formule (`workspaces`) |
| `/admin/depenses` | admin + fondateur | 25 dernières lignes `ai_spend`, postes de dépense |
| `/admin/incidents` | admin + fondateur | `error_log` par famille et espace |
| `/admin/intelligence` | admin + fondateur | Intelligence marché (`ads`, `generations`, `market_creatives`, `verdicts`) |
| `/admin/paiement` | admin + fondateur | Diagnostic Stripe + test manuel |
| `/admin/plans` | admin + fondateur | Formules, crédits, allocations (actions `credits.ts`, `billing.ts`, `platform.ts`, `beta.ts`) |
| `/admin/signups` | admin + fondateur | Inscriptions et onboarding |
| `/admin/equipe` | accès total d'équipe | `platform_staff` (e-mail → rôle) et matrice `platform_role_rights` (`actions/equipe.ts`) |
| `/admin/connaissances` | accès total d'équipe | Connaissances Jarvis (versions, portées, publication, usage) |

Hors `/admin` mais plateforme : `/console`, `/credits` (admin + fondateur). Le hub pointe aussi vers `/jarvis` (règles par marque, pas plateforme), `/billing`, `/settings` (pages d'espace).

---

## 6. Adsmap et boucle

| Concept | Table / action | Où |
| --- | --- | --- |
| Graphe | Persona → Desire → Angle → Concept → Ad | `personas` `schema.ts:194`, `adsmap_desires` `:835`, `adsmap_angles` `:849`, `adsmap_concepts` `:895`, `adsmap_ads` `:936` |
| **Hypothèse** | `adsmap_ads.hypothesis` (obligatoire dès `ready`, CHECK SQL) ; côté studio, `generations.input.angle` = hypothèse d'angle, mesurée par 👍/👎 (`packages/core/src/bilan-hypotheses.ts`) | `schema.ts:945` |
| **Variable** | `adsmap_ads.tested_variable` (enum 14 valeurs) + `variable_value` ; côté studio `generations.input.essai {variable, groupe}` et `input.variable` (déclinaison) | `schema.ts:946-947`, `ads.ts:2031-2032` |
| **Test** | `adsmap_batches` (lot, campagne, `protocol_check_json`), `adsmap_test_protocols`, `ad_instances` + `metrics_daily` | `schema.ts:913`, `:988`, `:249`, `:269` ; actions `adsmap-batch.ts` |
| **Verdict** | `adsmap_verdicts` (calculé + validé, motif d'écart, `comparable`, `failed_stage`, `kill_flag`), `adsmap_verdict_configs` | `schema.ts:1008`, `:1000` ; `validateVerdictAction` `adsmap-verdict.ts:228` (transaction `:275`) |
| **Apprentissage** | `adsmap_learnings` (portée, étape, preuve chiffrée, confiance, `refuted`, embedding) ; `adsmap_brand_stats`, `adsmap_stat_milestones` ; `brands.jarvis_learnings` (texte libre, autre chose) | `schema.ts:1027`, `:1069`, `:1056` |
| **Itération / filiation** | `adsmap_iteration_edges` (enfant unique, parent, `mode more/better/new`, `changed_variable`, `stage_targeted`, `rationale`) | `schema.ts:970` ; **deux** `createIterationAction` : `adsmap-iterate.ts:221` (sans transaction) et `adsmap-verdict.ts:347` (transaction `:393`) |
| Éléments | `adsmap_creative_elements`, `adsmap_ad_elements` | `schema.ts:1087`, `:1101` |
| Décisions | `adsmap_decision_items` | `schema.ts:1123`, `actions/adsmap-decisions.ts` |
| Déclarées, non écrites par l'app | `adsmap_agent_runs`, `adsmap_ai_budgets`, `adsmap_portfolio_insights`, `adsmap_brand_stats` (seul `jarvis-memory.ts` lit `ad_elements`) | |

**Lien génération → ad** (`apps/web/app/actions/adsmap-bridge.ts`)
- `trackGeneratedAdAction` (`:34`) : génération de la marque active → chemin de graphe « À qualifier (Studio) » (`ensureGraphPath`) → concept (réutilisé si même titre et angle, `source_ref {generationId}`) → ad `draft` avec `source_ref {generationId}` (`:90-96`) → écrit `adsmapAdId` dans `generations.input` (`:100-102`). Format déduit du type (`formatAdPourGeneration`).
- `trackSavedAdAction` (`:123`) : sauvegarde de veille → concept `imitation` + ad `v1`.
- `conceptBriefAction` (`:185`) : concept → pré-remplissage du studio.
- Migrations liées : `0044_ad_source_ref.sql`, `0045_backfill_ad_source_ref.sql`.

---

## 7. Écarts par objet logique · ajouter vs réutiliser

| Objet | Réutiliser | Ajouter (migration additive) |
| --- | --- | --- |
| CreativeProject | `brands` (portée), `adsmap_concepts` (promesse), `lot` UUID | Table `creative_projects` (`workspace_id`, `brand_id`, `concept_id` nullable, titre, statut, auteur) ; colonne `project_id` nullable sur `generations` |
| ProjectVersion | Cycle de vie des connaissances comme modèle (versions, `rev`, concurrence optimiste) | Table `project_versions` append-only (`project_id`, `n`, `document_json`, `parent_version_id`, auteur, date) ; ne plus muter `generations.input` |
| ProductReference | `products` | Table `product_references` instantanée (copie nom, usp, prix, `image_urls`, empreinte) épinglée par version |
| SourceReference | `saved_ads`, `market_creatives`, `library_ads`, `source_ref_json` | Table `source_references` typée (`kind`, `ref_id`, plateforme, `external_id`, instantané) ; garder les jsonb comme lecture héritée |
| Asset | `assets`, `asset_urls`, `output.renders` | Colonnes `workspace_id` / `project_id` sur les sorties, ou table de liaison `asset_links` ; sortir les data URI de la base |
| Shot | `sceneUrl`, `sceneBrief` | Table `shots` (projet, ordre, prompt, asset, durée) |
| Document à calques | `AdRecipe` + `ad-render.tsx` + `RENDER_VERSION` | Schéma de document versionné (`schema_version`) stocké dans `project_versions.document_json`, calques explicites |
| Timeline | rien | Table ou document `timeline` (pistes, plans, durées) |
| Proposal | statut `proposed` Adsmap, `decision_items`, marqueurs Jarvis | Table `proposals` (origine `jarvis/agent/humain`, cible, diff, statut, `decided_by`) |
| ImpactPlan | `iterationPlanAction`, `essaiSuivantAction` (calculés) | Table `impact_plans` liée à la proposal (objets touchés, coût estimé) |
| Quote / Approval | `costFor`, `estimateCallCost`, `ad_fact_validations` (signature) | Tables `quotes` (montant crédits + dollars estimés, expiration) et `approvals` (append-only, signature, qui, quand) · prix annoncé AVANT le clic devient une ligne |
| Job / Attempt | `generations.status/job_id`, `ai_spend`, `agent_jobs` dormant | Tables `jobs` et `job_attempts` (statut, erreur, `ai_spend_id`, `credit_ledger` lié par `ref_id`) |
| PromptTemplate / Release | `creative_presets`, connaissances | `prompt_templates` + `prompt_releases` (immuables, publié/retiré) ; référencer `release_id` depuis la génération au lieu de `presetId` mutable |
| PromptRun | `ai_spend`, `adsmap_agent_runs` (dormante, réutilisable) | Colonnes `workspace_id` non nul de fait, `job_attempt_id`, `prompt_release_id` sur `ai_spend` ou réveil de `adsmap_agent_runs` |
| Variant / TestLink | `adsmap_ads`, `iteration_edges`, `essai`, `parentId`, `adsmapAdId` | Table `variants` (version source, variable, valeur) + `test_links` (variant ↔ `adsmap_ads`) avec FK au lieu du lien jsonb double |
| AuditEvent | `credit_ledger`, `error_log`, `ad_fact_validations` | Table `audit_events` append-only (acteur, rôle effectif, espace, marque, objet, action, avant/après) |

Prérequis transverses avant tout : `MIGRATIONS_IN_BUILD` (`packages/db/src/journal.ts:15`) ; tables sans `workspace_id` à rattacher (`generations`, `products`) ; garde serveur unique pour les actions studio.

---

## Constats surprenants

1. **Le plafond par défaut est de 50 $, pas 10 $.** `DEFAULT_CAP_USD = 50` (`apps/web/lib/spend-guard.ts:40`), relevé « sur demande explicite du propriétaire » selon le commentaire, alors que `CLAUDE.md` annonce 10 $. Le plafond est **global** (somme de tout `ai_spend`), pas par espace.
2. **Les actions Pubs IA, Image IA et Vidéo IA n'ont aucun contrôle de rôle ni d'offre**, alors que la seule action Textes IA en a un (`studio.ts:25`). Un `client_viewer` ou un espace Starter peut appeler `generateAdsAction` directement.
3. **Un `client_viewer` peut valider un fait** (`ads-faits.ts:22`), seul mécanisme d'approbation signée du dépôt.
4. **`platform_staff` est indexé par e-mail et aucun e-mail n'est jamais vérifié** · combiné à l'inscription libre et aux liens d'invitation visibles, un rôle plateforme peut être capté par la première personne qui crée un compte avec l'e-mail inscrit.
5. **Deux gardes « admin plateforme » concurrents** : `isFounder` (liste en dur + env) pour 10 pages, accès total d'équipe pour 2 pages. Les rubriques `coulisses` et `finances` ne gardent rien.
6. **Deux fonctions `createIterationAction`** homonymes (`adsmap-iterate.ts:221` sans transaction, rôle `member` ; `adsmap-verdict.ts:347` en transaction, sans rôle minimum), avec des règles de verdict parent différentes (`validated` seul vs `validated ?? computed`).
7. **`generations` n'a ni `workspace_id`, ni auteur, ni parent en colonne** · note, essai, lot, filiation, relecture, lien Adsmap, mesure, preset et provenance vivent tous dans `input_json`, muté en place par au moins quatre actions.
8. **Une vidéo sans marque active est payée mais jamais enregistrée** : `recordGeneration` sort si `brandId` est nul (`video.ts:87-91`) après `sousPlafond`. Les vidéos Higgsfield sont comptées `provider: 'fal'`.
9. **Le chat Jarvis ne débite aucun crédit**, l'assistant d'accueil (moins gardé) en débite.
10. **Les workers ne font rien** : un seul worker `radar` en `TODO` (`apps/workers/src/worker.ts:8`), alors que le commentaire pose « aucun job IA dans une requête HTTP » · toute génération tourne dans des actions serveur synchrones.
11. **Tables déclarées mais jamais écrites** : `adsmap_agent_runs`, `adsmap_ai_budgets`, `adsmap_portfolio_insights`, `adsmap_brand_stats`, `agent_threads`, `agent_jobs` · `adsmap_agent_runs` est presque exactement un PromptRun prêt à réveiller.
12. Les connaissances sont le **seul** objet du dépôt qui implémente déjà version immuable, brouillon/publié/retiré, concurrence optimiste et portée stricte · c'est le patron le plus proche de ProjectVersion et PromptRelease, mais il vit en jsonb dans `app_settings`.
