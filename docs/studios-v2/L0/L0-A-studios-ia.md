# L0-A · Studios IA · inventaire de l'existant

SHA `bc33cec80a8c76db1ff7ffbbdec5e9297ae42fb0`, lecture seule. Tous les chemins sont relatifs à `product/`. Aucune exécution, aucun appel réseau : ce qui suit décrit le CODE, pas l'état de production (non vérifiable depuis la session, cf. CLAUDE.md).

Abréviations : `web/` = `apps/web/`, `ai/` = `packages/ai/src/`, `core/` = `packages/core/src/`, `int/` = `packages/integrations/src/`, `db/` = `packages/db/src/`.

---

## 1. Routes studio

Aucun `middleware.ts` dans `web/`. `next.config.mjs:33-38` ne redirige que `/inspo` vers `/veille`. Aucune redirection propre aux studios, hormis `redirect('/login')` sans session. `web/app/robots.ts:25` exclut `/studio`.

Rail et droits : `web/lib/rbac.ts:134-138` déclare `studio`, `ads`, `image`, `video`, `textes`, tous `minRole: 'member'`, `minPlan: 'core'`. La face équipe plateforme passe par la rubrique `studio` (`web/lib/rbac.ts:175`), sans verrou de formule (`web/lib/rbac.ts:200-203`, `234-237`). Le fondateur est forcé en `business` (`web/lib/access.ts:26-33`).

| Route | Fichier page | Composant principal | Garde (clé FEATURES) | Lit à l'ouverture | Écrit à l'ouverture | Actions appelées par l'écran |
|---|---|---|---|---|---|---|
| `/studio` | `web/app/(app)/studio/page.tsx` | `Hub` (`components/Hub`) | `studio` (`:16`, `:46`) | compteurs `generations` par `kind` ad/image/video/script (`:153-159`) ; jointure `adsmap_ads`→`concepts`→`angles`→`desires`→`personas` + `verdicts` (`:161-183`) ; présence de `FAL_KEY` / `HIGGSFIELD_API_KEY` / `ANTHROPIC_API_KEY` (`:68-70`) | rien | aucune (liens vers les 4 studios, `:74-103`) |
| `/studio/ads` | `web/app/(app)/studio/ads/page.tsx` | `AdsStudio` (`ads/AdsStudio.tsx`, 1610 l.) + `AssistantPub` (5 étapes, `core/assistant-pub.ts:36`), `CartePub`, `RailFicheCrea`, `DebriefLotPanel`, `PanneauIteration`, `RepriseIteration`, `SelecteurMoteur` | `image` (`:27`, `:80`) · **pas `ads`** | `essaiSuivantAction`, `spendStatus`, `bilanCopieAction` (`:60-64`, AVANT la garde) ; `listBrandAds`, `listSavedAdRefs`, `listAssets` (`:98`) ; `products`, `personas`, `brands.creativeRules` (`:106-117`) ; test Adsmap `?iter=` via `adsDeLaMarque` + `adDetailAction` (`:128-145`) | rien | `generateAdsAction`, `cloneAdAction`, `suggestAnglesAction`, `archiveAdAction`, `getAdTextAction`, `updateAdTextAction`, `scoreCreativeAction`, `declineAdAction` (`AdsStudio.tsx:4`) ; `setProductImagesAction`, `importAllProductImagesAction` (`AdsStudio.tsx:7`) ; `trackGeneratedAdAction`, `verifierFaitAction` (`CartePub.tsx:7-8`) ; `universeSamplesAction`, `universePreviewsAction`, `generateUniversePreviewsAction` (`web/components/UniversePicker.tsx:10-11`) ; `listPresetsAction`, `savePresetAction` (`web/components/useScenes.ts:5`) ; `preflightAction` (`web/components/usePreflight.ts:5`) |
| `/studio/image` | `web/app/(app)/studio/image/page.tsx` | `ImageStudio` + `AssistantImage` | `image` (`:19`, `:24`) | `pageImagesMarque`, `listAssets` (`:39`) ; `products`, `brands.colors` (`:46-51`) | rien | `generateImageAction`, `suggestImageBriefAction`, `setProductImageAction`, `scoreImageAction`, `pageImagesMarque` (`ImageStudio.tsx:4`) ; `archiveCreativeAction` (`ImageStudio.tsx:6`) |
| `/studio/video` | `web/app/(app)/studio/video/page.tsx` | `VideoStudioFull` + `AssistantVideo` | `video` (`:16`, `:21`) | `pageVideosMarque`, `listAnimatableAssets` (`:38`) ; `?prompt=` (`:18`) | rien | `startVideoAction`, `startImageVideoAction`, `pollVideoAction`, `deleteVideoAction`, `suggestVideoBriefAction`, `pageVideosMarque` (`VideoStudioFull.tsx:4`) |
| `/studio/textes` | `web/app/(app)/studio/textes/page.tsx` | `StudioClient` | `studio` (`:15`, `:33`) · **pas `textes`** | dernière `generations` `kind='script'` (`:56-64`) ; `?inspo=`, `?brand=` | rien | `generateAction` (`StudioClient.tsx:4`) |

Paramètres d'URL de `/studio/ads` : `mode`, `angle`, `ref`, `src`, `srcnom`, `iter`, `depuis`, `rv` (`ads/page.tsx:29`), fabriqués notamment par `web/lib/veille-link.ts:46`.

Routes API servant les studios :
- `GET /api/ad/[id]` (`web/app/api/ad/[id]/route.tsx`) : rendu PNG serveur de la maquette, session + `workspaceId` (`:104-118`).
- `GET /api/asset/[id]`, `GET /api/drive-img/[id]` : service des assets / Drive.
- Aucune route webhook fal ou Higgsfield (liste complète des `route.ts` : `api/ad`, `api/asset`, `api/cron/{adsmap,digest,radar,tracker}`, `api/drive-img`, `api/jarvis/chat`, `api/oauth/*`, `api/stripe/webhook`).

**Gardes des server actions (le point faible)** : la garde de formule/rôle n'est posée qu'au niveau des PAGES. Dans les actions qui dépensent :
- `generateAction` (Textes) vérifie `canAccess` (`web/app/actions/studio.ts:26`).
- `generateUniversePreviewsAction` vérifie `roleAtLeast(member)` (`web/app/actions/universe-previews.ts:131`).
- `savePresetAction` vérifie `roleAtLeast(member)` (`web/app/actions/presets.ts:171`).
- **Aucune** garde rôle/formule dans `ads.ts`, `image.ts`, `video.ts` (grep `canAccess|roleAtLeast` vide) : seuls `getSession` + marque active.

---

## 2. Capacités

Légende coût : crédits client (`core/credits.ts:7-21`, `core/economics.ts:146-157`) / dollars plafonnés (`core/spend-guard.ts:83-88` pour fal, jetons pour Anthropic). « Réel » = code branché sur un vrai fournisseur ; l'exécution en production n'est pas vérifiable d'ici.

| Capacité | Route / fichier | Producteur | Consommateur | Stockage | Droits (action) | Fournisseur / modèle | Coût | État |
|---|---|---|---|---|---|---|---|---|
| Génération image (studio Image) | `web/app/actions/image.ts:22-152` | `generateImageAction` | `ImageStudio.tsx:190`, `:216` | `generations` `kind='image'`, `assetUrls` = URLs fal brutes (`image.ts:144`) ; rien en S3 | session seule (`:41-42`) | fal, moteur `IMAGE_MODELS` (`core/economics.ts:146-157`) via `falModelFor` (`image.ts:139`) | `spec.credits × count` (`image.ts:55`) ; `sousPlafond('fal_image', units: count)` (`:135`) | réel |
| Optimisation de prompt image | `image.ts:92-104` | `enhanceImagePrompt` (`ai/generation.ts:107`) | `generateImageAction` | non stocké (seule la description d'origine est consignée, `image.ts:144`) | idem | Anthropic `GEN_MODEL` | **0 crédit** ; dollars via `guardedAnthropic` sans `workspaceId` (`:93`) | réel |
| Brief image suggéré | `image.ts:155-191` | `suggestImageBrief` (`ai/generation.ts:158`) | `ImageStudio.tsx:143` | non stocké | session | Anthropic | `costFor('suggest')` = 1 (`:162`) | réel |
| Relecture d'un visuel Image | `image.ts:341-368` | `scoreCreative` (`ai/critique.ts:103`) + `noteImage` | `ImageStudio.tsx:84` | **non stocké** (renvoyé seulement) | session | Anthropic vision `GEN_MODEL` | **0 crédit** ; `guardedAnthropic` avec `workspaceId` (`:344`) | réel |
| Édition / retouche | aucune action dédiée | « édition » = appel fal `.../edit` avec photo produit en référence (`int/fal.ts:97-98`, `image.ts:79-80`) | - | - | - | fal `nano-banana-2/edit`, `openai/gpt-image-2/edit` | idem image | **pas de retouche, pas de masque, pas d'inpainting** (grep `inpaint|mask|outpaint|upscal|remove.?background` vide) |
| Génération vidéo T2V | `web/app/actions/video.ts:99-137` | `startVideoAction` | `VideoStudioFull.tsx:137` | `generations` `kind='video'`, `status='processing'`, `jobId` (`video.ts:87-96`) ; URL fal posée au polling (`:295-297`) | session | fal Kling `v2.5-turbo/pro/text-to-video` (`int/fal.ts:46`) ; repli Higgsfield si `FAL_KEY` absent (`video.ts:105-106`) | `costFor('video') × videoUnits` = 20/5 s (`video.ts:110`) ; `sousPlafond('fal_video')` (`:128`) | réel (fal) ; Higgsfield : adaptateur à chemins devinés (`int/higgsfield.ts:39-43`) |
| Génération vidéo I2V | `video.ts:140-173` | `startImageVideoAction` | `VideoStudioFull.tsx:138` | idem, `input.imageUrl` (http ou `data:`, `:146`) | session | fal Kling `image-to-video` (`int/fal.ts:47`) | idem (`:153`, `:164`) | réel |
| Consigne vidéo suggérée | `video.ts:352-383` | `suggestVideoBrief` (`ai/generation.ts:181`) | `VideoStudioFull.tsx:83` | non stocké | session | Anthropic | 1 crédit (`:358`) | réel |
| Voix / TTS | - | - | - | - | - | - | - | **absent** (aucun fournisseur, aucun code) |
| Musique | - | - | - | - | - | - | - | **absent** |
| Lipsync | - | - | - | - | - | - | - | **absent** |
| Transcription | `int/trendtrack.ts:332-373` | `ttGetTranscript` (lecture d'une transcription Trendtrack, chemin deviné parmi 3, `:307-309`) | Adsmap / veille | `creatives.transcript` (lecture `adsmap-analyze.ts:334`) | - | Trendtrack (pas d'ASR propre) | `transcription_min` existe au barème (`core/credits.ts:8`) mais **aucun appelant** | partiel : lecture fournisseur tiers seulement |
| Textes / copies (studio Textes) | `web/app/actions/studio.ts:23-78` | `generateCreative` (`ai/generation.ts:72`) | `StudioClient.tsx` | `generations` `kind='script'`, `output` = `CreativeOutput` (`studio.ts:64-69`) | `canAccess(studio)` (`:26`) | Anthropic `GEN_MODEL` | `costFor('script')` = 3 (`:40`) | réel |
| Pubs IA · lot (`generateAdsAction`) | `web/app/actions/ads.ts:1003-1348` | `generateAdConcepts` (`ai/ads.ts:242`) puis `composeBatch` (`ads.ts:212-813`) | `AdsStudio.tsx:622`, `:435` | `generations` `kind='ad'`, `input` = `AdRecipe` + `angle`, `lot`, `sourceVeille` (`ads.ts:783-790`), `assetUrls=[sceneUrl]` fal | session + marque (`:1046-1056`) | Anthropic `GEN_MODEL` (concepts) + fal (scènes, `:462`) + Anthropic haiku (relecture, `:558`) | réservation `modelSpec.credits × imagesAReserver` ou `prixEssai` (`:1104-1113`), remboursement du non-produit (`:807-809`) | réel ; mode « entière » jamais passé par fal en prod selon CLAUDE.md |
| Pubs IA · relecture (« entière ») | `ads.ts:557-695` | `controlePubEntiere` (`ai/controle-pub.ts:119`) + `verifieCopie` (`core/copie-conforme.ts`) | `composeBatch` | rangé dans `input` (`copieConforme`, `produitFidele`, `texteLisible`…, `ads.ts:722-731`) | idem | Anthropic `claude-haiku-4-5-20251001` (`ai/controle-pub.ts:37`) | 0 crédit ; dollars `guardedAnthropic` avec `workspaceId` | réel |
| Pubs IA · rattrapage / repli composée | `ads.ts:613-692` | `genScene` rejoué, puis `genScene(c,i,'composee')` | `composeBatch` | remplace `scenes[i]` | idem | fal | puisé dans `reprisesBudget` réservé (`ads.ts:1099`) | réel |
| Pubs IA · clone (`cloneAdAction`) | `ads.ts:1435-1547` | `cloneAdFromReference` (`ai/ads.ts:202`) + `generateAdConcepts` + `composeBatch` | `AdsStudio.tsx:612` | idem ad ; référence = URL veille ou **data URI** envoyée telle quelle à fal (`ads.ts:1476`, `:1535`) | session + marque | Anthropic vision + fal | `modelSpec.credits × count` (`:1481-1485`) | réel ; mode toujours composé (pas de `mode` transmis, `:1529-1543`) |
| Pubs IA · angles suggérés | `ads.ts:1352-1385` | `suggestAdAngles` (`ai/ads.ts:117`) | `AdsStudio.tsx:482` | non stocké | session | Anthropic | 1 crédit | réel |
| Pubs IA · score Jarvis | `ads.ts:1765-1869` | `renderAdPng` 512×640 (`:1813`) + `scoreCreative` | `AdsStudio.tsx:417` | fusion jsonb `jarvisScore`, `copieConforme` (`:1859-1863`) | session | Anthropic vision | `costFor('score')` = 2 (`:1785`) | réel |
| Pubs IA · édition de textes | `ads.ts:1731-1759` | `updateAdTextAction` | `AdsStudio.tsx:396` | **écrase** `generations.input` en place (`:1755`), purge la mesure (`sansMesure`) | session | aucun | 0 | réel, sans historique |
| Déclinaisons (`declineAdAction`) | `ads.ts:1902-2063` | mise en page (calcul), accroche/offre (`rewriteAdCopy`, `ai/ads.ts:358`), scène/univers (fal) | `AdsStudio.tsx:453` | NOUVELLE ligne `generations` avec `parentId`, `variable` (`:2022-2056`) | session + marque | Anthropic ou fal selon variable | `prixDeclinaison` (`:1937`) ; remboursement `rendre()` (`:1941`) | réel |
| Déclinaison de FORMAT | `web/app/api/ad/[id]/route.tsx:13-17` (`?r=4:5|1:1|9:16`), vignette `?t=1` (`:38`, `:133-135`) | `renderAdPng` (`web/lib/ad-render.tsx:790`) | grille, aperçu, téléchargement | S3 `renders/{id}/{cle}.png` + `generations.output.renders` (`web/lib/ad-store.ts:52-75`) | session + même workspace (`route.tsx:118`) | satori (`next/og`) | 0 | réel pour « composée » ; « entière » = image contenue avec marges, pas de recomposition (`ad-render.tsx:760-787`, `core/apercu-format.ts:35-45`) |
| Format image / vidéo | choisi AVANT génération : image `9:16|4:5|1:1|16:9` (`ImageStudio.tsx:26`) ; vidéo `9:16|1:1|16:9` (`VideoStudioFull.tsx:21`) ; I2V ignore le ratio (`int/fal.ts:187-189`) | - | - | - | - | - | - | aucun recadrage a posteriori |
| Export / téléchargement | pub : lien `href` vers `/api/ad/{id}?v=…` (`CartePub.tsx:74`, `RailFicheCrea.tsx:213`) ; image/vidéo : URL fal brute (`ImageStudio.tsx:465`, `VideoStudioFull.tsx:313`) | navigateur | - | - | - | - | 0 | réel ; PNG uniquement pour les pubs ; pas de zip, pas de lot, pas de PSD/SVG/MP4 monté |
| Aperçus d'univers | `web/app/actions/universe-previews.ts:127-203` | `falGenerateImage` + prompt `BRIEF` (`:39`) + `directionScenePrompt` | `UniversePicker.tsx` | `generations` `kind='image'`, `status=UNIVERSE_PREVIEW_STATUS` (`:181-189`) | `member` (`:131`) | fal | réservation (`:151`), remboursement (`:200`) | réel |

---

## 3. Tous les appels IA

Deux barrières distinctes :
- **Anthropic** : `guardedAnthropic` (`web/lib/spend-guard.ts:122-197`) remplace `messages.create` par une vérification `checkBudget` puis un `record` dans `ai_spend`. Ce n'est PAS `sousPlafond`.
- **fal / Higgsfield** : `sousPlafond` (`web/lib/spend-guard.ts:279-291`) = `guardFixedCost` (forfait `FIXED_COSTS`, `core/spend-guard.ts:85-87`) + `annuleCoutFixe` sur échec.
- Le test `web/test/spend-guard-coverage.test.ts:36-72` le vérifie **par fichier** (présence de `sousPlafond(` dans le fichier), sur `web/app` et `web/lib` seulement.

Le plafond est **global à la plateforme** : `spentUsd` somme `ai_spend` sans filtre d'espace (`web/lib/spend-guard.ts:54-61`). `DEFAULT_CAP_USD = 50` (`:40`).

### 3.1 Anthropic

| Appelant (web) | Fonction `@tiktrends/ai` | Texte du prompt | Modèle | Barrière | Crédits (réserve / rembourse) | `ai_spend.workspace_id` |
|---|---|---|---|---|---|---|
| `ads.ts:1226` (lot), `:1517` (clone) | `generateAdConcepts` (`ai/ads.ts:242`) | en dur `ai/ads.ts:255` + `copyBudgetLine` (`core/copy-budget.ts:56`) + contexte DB (`creativeRules`, `jarvisLearnings`, mémoire, `learnedPreferences` `ads.ts:890`, `preferencesAngles` `:917`, `preferencesMarche` `:945`) | `GEN_MODEL` | `guardedAnthropic` `ads.ts:1051`, `:1455` | inclus dans la réservation du lot `:1111` / `:1483` ; **pas de remboursement si échec concepts** (`:1241`, `:1243`, `:1519`) | non |
| `ads.ts:1509` | `cloneAdFromReference` (`ai/ads.ts:202`) | en dur `ai/ads.ts:212` | `GEN_MODEL` | `ads.ts:1455` | inclus clone ; **pas de remboursement** `:1510-1511` | non |
| `ads.ts:1375` | `suggestAdAngles` (`ai/ads.ts:117`) | en dur `ai/ads.ts:118` | `GEN_MODEL` | `ads.ts:1355` | `:1362` / `:1382` | non |
| `ads.ts:1819` | `scoreCreative` (`ai/critique.ts:103`) | en dur `ai/critique.ts:105` | `GEN_MODEL` | `ads.ts:1768` | `:1786` / `:1825`, `:1866` | non |
| `ads.ts:564` | `controlePubEntiere` (`ai/controle-pub.ts:119`) | en dur `ai/controle-pub.ts:124-130` | `ANTHROPIC_CONTROLE_MODEL` ou `claude-haiku-4-5-20251001` (`:37`) | `ads.ts:558` | aucun crédit | **oui** |
| `ads.ts:1958` | `rewriteAdCopy` (`ai/ads.ts:358`) | en dur `ai/ads.ts:378` | `GEN_MODEL` | `ads.ts:1954` | `:1938` / `rendre()` | non |
| `image.ts:96` | `enhanceImagePrompt` (`ai/generation.ts:107`) | en dur `ai/generation.ts:116`, `:137` (mentionne encore « Flux Kontext », « Flux / Ideogram ») | `GEN_MODEL` | `image.ts:93` | **aucun** | non |
| `image.ts:181` | `suggestImageBrief` (`ai/generation.ts:158`) | en dur `:162` | `GEN_MODEL` | `image.ts:158` | `:163` / `:188` | non |
| `image.ts:358` | `scoreCreative` | `ai/critique.ts:105` | `GEN_MODEL` | `image.ts:344` | **aucun** | oui |
| `video.ts:377` | `suggestVideoBrief` (`ai/generation.ts:181`) | en dur `:185` | `GEN_MODEL` | `video.ts:355` | `:359` / `:380` | non |
| `studio.ts:47` | `generateCreative` (`ai/generation.ts:72`) | `buildCreativeSystem` `ai/generation.ts:49`, `buildCreativeUserPrompt` `:58` | `GEN_MODEL` | `studio.ts:33` | `:42` / `:75` | non |
| `assistant.ts` (`:23`) | `chatAssistant` (`ai/chat.ts:26`) | `TESS_SYSTEM` `ai/agent.ts:2` + `contextBlock` `ai/chat.ts:14-23` | `GEN_MODEL` | `assistant.ts:23` | `:30` / `:49` | non |
| `api/jarvis/chat/route.ts:112` (flux) | appel direct `messages.create` | `chatSystemPrompt` (`core/adsmap/jarvis-chat.ts:106`) + `consigneAvecConnaissances` (`web/lib/jarvis-connaissances.ts:126`, connaissances ADMIN+ versionnées dans `app_settings`) + `brands.creativeRules` | `ANTHROPIC_GEN_MODEL` ou `claude-sonnet-5` (`route.ts:39`) | `route.ts:56` | **aucun crédit** | oui |
| `jarvis.ts:79` | `proposeJarvisRules` (`ai/generation.ts:211`) | en dur `:212` | `GEN_MODEL` | `jarvis.ts:57` | `:73` / `:86`, `:90` | non |
| `jarvis.ts:164` | `distillWinningPatterns` (`ai/ads.ts:59`) | en dur `ai/ads.ts:66` | `GEN_MODEL` | `jarvis.ts:109` | `:157` / `:166`, `:170` | non |
| `assets.ts:227`, `:272` | `describeAssetImage` (`ai/generation.ts:258`) | en dur inline `:267` | `GEN_MODEL` | `assets.ts:212`, `:249` | `:222`, `:269` / `:229-233`, `:282` | non |
| `brand-detail.ts:53`, `brands.ts:66` | `generateBrandProfile` (`ai/brand.ts:88`) | `buildBrandSystem` `ai/brand.ts:69` | `GEN_MODEL` | `brand-detail.ts:36`, `brands.ts:50` | `:42`/`:86` ; `brands.ts:61`/`:69` | non |
| `brand-detail.ts:124` | `extractVisualDa` (`ai/da-visuelle.ts:62`) | `buildVisualDaSystem` `ai/da-visuelle.ts:41` | `GEN_MODEL` | `brand-detail.ts:108` | `:114` / `:132` | non |
| `brand-detail.ts:380` | `generateProducts` (`ai/brand.ts:134`) | inline `ai/brand.ts:141` | `GEN_MODEL` | `brand-detail.ts:363` | `:368` / `:396` | non |
| `competitor.ts:114` | `analyzeCompetitor` (`ai/brand.ts:198`) | inline `ai/brand.ts:206` | `GEN_MODEL` | `competitor.ts:105` | `:110` / `:116` | non |
| `adsmap-analyze.ts:240-259` | `analyzeAdAsset` (`ai/adsmap-asset.ts:103`) | `SYSTEM` `ai/adsmap-asset.ts:51` | `ANTHROPIC_GEN_MODEL` ou `claude-sonnet-5` (`ai/adsmap-asset.ts:20`) | `adsmap-analyze.ts:185` | `:231` / `:267`, `:273`, `:281` | non |
| `market-learn.ts:153` | `analyzeAdAsset` | idem | idem | `market-learn.ts:68` | `:140` / `:160`, `:172` | oui |
| `web/lib/radar.ts:200` (cron) | `analyzeAdAsset` | idem | idem | `radar.ts:187` | aucun crédit | oui (param) |
| `adsmap-draft.ts:76`, `:89` | `draftConcept` (`ai/adsmap-draft.ts:62`) | `draftPrompt` (`core/adsmap/draft.ts:103`) | `GEN_MODEL` | `adsmap-draft.ts:54` | **aucun crédit** | oui |
| `adsmap-propose.ts:124`, `:164`, `:214`, `:264` | `proposePersonas/Desires/Angles/Concepts` (`ai/adsmap-agents.ts:108`, `:154`, `:209`, `:265`) | `GARDE_FOUS` `ai/adsmap-agents.ts:25` + systèmes `:113`, `:161`, `:216`, `:272` | `ANTHROPIC_GEN_MODEL` ou `claude-sonnet-5` (`ai/adsmap-agents.ts:23`) | `adsmap-propose.ts:115`, `:151`, `:196`, `:245` | `:87` / `:92`, `:95` | non |

Fonctions IA exportées **sans aucun appelant** (code mort) : `tagCreative` (`ai/tagging.ts:32`, modèle `claude-sonnet-4-5`), `generateRadarRecommendations` (`ai/radar-reco.ts:15`, `claude-sonnet-4-5`), `generateScript` (`ai/generation.ts:285`, appel sans `system`), `TESS_TOOLS` (`ai/agent.ts:11-25`).

Le client brut `anthropicFromEnv` vit dans `ai/generation.ts:5-8` ; seul `web/lib/spend-guard.ts:123` l'utilise (garanti par `spend-guard-coverage.test.ts:36-40`).

### 3.2 fal / Higgsfield

| Appelant | Fonction `int/` | Prompt | Endpoint | `sousPlafond` | Crédits | `ai_spend.workspace_id` |
|---|---|---|---|---|---|---|
| `ads.ts:462` (`genScene`) | `falGenerateImage` (`int/fal.ts:90`) | `scenePrompt` `ads.ts:863-888`, `scenePromptClone` `:855`, `scenePromptBrandRef` `:837`, `promptPubEntiere` `core/production-mode.ts:176` (appel `ads.ts:428`), `directionScenePrompt` `core/ad-directions.ts:225`, `palettePourPrompt` `core/production-mode.ts:170`, `contrainteDaPourPrompt` `core/da-visuelle.ts:70`, `ancrageProduit` `core/ancrage-produit.ts:48`, `sceneFraming` `core/scene-framing.ts:65`, preset maison (DB) | `falModelFor(modelSpec)` | oui, `units:1` | réservé par l'appelant | oui |
| `ads.ts:2000` (déclinaison scène/univers) | `falGenerateImage` | `scenePrompt` + `VISUAL_UNIVERSES` (`ai/ads.ts:10`, ANCIEN catalogue) | idem | oui | `:1938` | oui |
| `image.ts:135` | `falGenerateImage` | description utilisateur (+ `enhanceImagePrompt`) + preset + `promptImage` (`core/studio-image.ts:19`) | idem | oui, `units: count` | `:57` / `:149` | oui |
| `universe-previews.ts:169` | `falGenerateImage` | `BRIEF` en dur `universe-previews.ts:39` + `directionScenePrompt` | idem | oui | `:151` / `:200` | oui |
| `brand-detail.ts:240` | `falGenerateImage` | inline FR `brand-detail.ts:237` | modèle par défaut env (`int/fal.ts:42`) | oui | `:233` / `:243`, `:249` | oui |
| `video.ts:128` | `falSubmitVideo` / `hfSubmitVideo` | description + mémoire (`video.ts:36-50`) + preset (`:70-76`) + `promptVideo` (`core/video-directions.ts:100`) | Kling T2V / Higgsfield `/v1/text2video` | oui, `units: videoUnits` | `:113` / `:134` | oui |
| `video.ts:164` | `falSubmitVideo` / `hfSubmitImageVideo` | idem | Kling I2V / `/v1/image2video` | oui | `:155` / `:170` | oui |
| `video.ts:261`, `:265` (polling) | `falGetVideo` (`int/fal.ts:209`), `hfGetJob` (`int/higgsfield.ts:111`) | - | - | non (gratuit) | remboursement `failAndRefund` `video.ts:231-250` | - |

### 3.3 Où vit le TEXTE des prompts (sources concurrentes aujourd'hui)

1. **Code `packages/ai`** : 20+ systèmes en dur (lignes ci-dessus).
2. **Code `packages/core`** : constructeurs de consignes (`production-mode.ts:176`, `ad-directions.ts:63` catalogue `AD_DIRECTIONS` + `:225`, `video-directions.ts:26` + `:100`, `studio-image.ts:19`, `scene-framing.ts:65`/`:87`, `durcir-entiere.ts:71`, `bilan-hypotheses.ts:105`, `adsmap/perf-par-angle.ts:138`, `adsmap/jarvis-chat.ts:106`, `adsmap/draft.ts:103`, `brief-concurrent.ts:126`).
3. **Code `apps/web` (fichiers `'use server'`)** : `scenePrompt*` (`ads.ts:837-888`, dont la phrase « a supplement bottle is roughly 12 cm tall » `ads.ts:869`), `BRIEF` (`universe-previews.ts:39`), prompt lifestyle (`brand-detail.ts:237`), mémoire vidéo (`video.ts:43`), note d'assets (`ads.ts:391`).
4. **Deux catalogues de directions** : `VISUAL_UNIVERSES` (`ai/ads.ts:10`, 8 entrées, utilisé par la déclinaison `ads.ts:1983-1987`) et `AD_DIRECTIONS` (`core/ad-directions.ts:63`, utilisé par la génération et les aperçus).
5. **Base, par espace/marque, éditable par l'utilisateur** : `creative_presets` (`db/schema.ts:734-753`, « prompts maison », `prompt` + `negative`, résolus par `resolvePreset` `web/app/actions/presets.ts:212-219`, écrits par `savePresetAction` `:168`) ; `brands.creative_rules` (« EDEN ») et `brands.jarvis_learnings`, injectés dans presque tous les prompts.
6. **Base, plateforme ADMIN+, versionnée** : Connaissances Jarvis dans `app_settings` (`connaissance:<id>`, `web/lib/jarvis-connaissances.ts:16-22`, `:126`), injectées **uniquement** dans le chat Jarvis.
7. **Variables d'environnement** : modèles seulement (`ANTHROPIC_*_MODEL`, `FAL_*_MODEL*`), aucun texte de prompt.

Il n'existe **aucun** registre de prompts unique, ni identifiant/version de prompt consigné sur les générations (seuls `presetId`, `universe`, `model` sont consignés, `web/lib/ad-render.tsx:46-110`).

---

## 4. Fournisseurs, adaptateurs, environnement

### Adaptateurs
- `int/fal.ts` : `falFromEnv` (`:34-49`), `falGenerateImage` synchrone `POST https://fal.run/{model}` avec replis 400/422 (`:90-169`), `falSubmitVideo` file d'attente `queue.fal.run` (`:181-206`), `falGetVideo` polling (`:209-241`). Aucun SDK, `fetch` brut.
- `int/higgsfield.ts` : soumission T2V/I2V + polling (`:62-135`), chemins et auth devinés (« Key id:secret » ou « Bearer », `:51-54`). N'est utilisé que si `FAL_KEY` est absent (`video.ts:106`, `:149`).
- `int/storage.ts` : SigV4 maison (pas d'`@aws-sdk`), `presignPutUrl` (`:70`), `putObject` (`:186`), `deleteObjectByUrl` (`:193`), `putBucketPublicRead` (`:146`).
- `int/trendtrack.ts` : veille + transcriptions (`:332`).
- Anthropic : `@anthropic-ai/sdk ^0.27.0` (`web/package.json:15`, `ai/../package.json`).
- Autres intégrations non-IA : `google-drive.ts`, `drive-sync.ts`, `meta*.ts`, `shopify-admin.ts`, `tiktok.ts`, `oauth.ts`, `secrets.ts`, `safe-fetch.ts`.

### Registre de modèles / moteurs existant
- Image : `IMAGE_MODELS` (`core/economics.ts:145-158`) : `nano`, `nano_high`, `gpt2`, `gpt2_high`, `gpt_image` (BYOK, sans `falModelNoRef`). Surcharge d'endpoint par env `FAL_IMAGE_MODEL_<CLÉ>[_NOREF]` (`core/economics.ts:182-195`), `imageModelByKey` (`:205`), `falModelFor` (`:201`), recommandation par mode (`:230-248`), délais (`:378-403`).
- Coûts réels estimés : `COST_MODEL` (`core/economics.ts:54-68`) ; barème crédits `CREDIT_COSTS` (`core/credits.ts:7-21`) ; tarifs Anthropic `MODEL_RATES` (`core/spend-guard.ts:38-43`) ; forfaits fal `FIXED_COSTS` (`core/spend-guard.ts:83-88`).
- Vidéo : pas de catalogue ; modèle par env (`int/fal.ts:46-47`) ; durées `[5, 10]` (`core/economics.ts:87-99`).
- Anthropic : constante `GEN_MODEL` redéclarée à 3 endroits (`ai/generation.ts:2`, `ai/adsmap-agents.ts:23`, `ai/adsmap-asset.ts:20`) + `web/app/api/jarvis/chat/route.ts:39` + `web/app/actions/adsmap-analyze.ts:277`.

### Variables d'environnement (noms seulement)
IA : `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` (tests), `ANTHROPIC_GEN_MODEL`, `ANTHROPIC_CONTROLE_MODEL`, `ANTHROPIC_RADAR_MODEL`, `ANTHROPIC_TAGGING_MODEL`, `AI_SPEND_CAP_USD`, `FAL_KEY`, `FAL_BASE_URL`, `FAL_QUEUE_URL`, `FAL_IMAGE_MODEL`, `FAL_IMAGE_MODEL_I2I`, `FAL_IMAGE_MODEL_TEXT`, `FAL_IMAGE_MODEL_EDIT`, `FAL_IMAGE_MODEL_<CLÉ>`, `FAL_IMAGE_MODEL_<CLÉ>_NOREF`, `FAL_VIDEO_MODEL`, `FAL_VIDEO_MODEL_I2V`, `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET`, `HIGGSFIELD_BASE_URL`, `HIGGSFIELD_T2V_PATH`, `HIGGSFIELD_I2V_PATH`, `HIGGSFIELD_JOB_PATH`, `HIGGSFIELD_MODEL`, `TRENDTRACK_API_KEY`, `TRENDTRACK_BASE_URL`.
Stockage / async : `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`, `REDIS_URL`, `CRON_SECRET`, `INTERNAL_APP_URL`, `DATABASE_URL`.
Économie : `CREDIT_MARKUP`, `CORPORATE_TAX_RATE`, `FOUNDER_EMAILS`.
Autres : `APP_URL`, `AUTH_SECRET`, `TOKEN_ENC_KEY`, `GOOGLE_*`, `META_*`, `SHOPIFY_*`, `TIKTOK_APP_ID`, `STRIPE_*`, `SMTP_URL`, `MAIL_FROM`, `KLAVIYO_API_KEY`, `SLACK_BOT_TOKEN`, `SIGNUP_OPEN`, `VEILLE_RECETTE`, `BUILD_SHA`, `BUILD_TIME`, `SEED_*`.
Aucune variable OpenAI, ElevenLabs, Replicate, Runway, Suno.

### Branché vs simulé
- Branché : Anthropic (tous les appels ci-dessus), fal image (5 moteurs), fal Kling vidéo, S3, Trendtrack.
- Repli non éprouvé : Higgsfield (chemins par défaut devinés, `int/higgsfield.ts:39-43`).
- Simulé / stub : worker `radar` (`apps/workers/src/worker.ts:9` TODO), worker `ingest` sur fixtures sans écriture (`apps/workers/src/ingest.ts:16`), jobs démo enfilés à chaque démarrage (`apps/workers/src/index.ts:65-66`), outils agent `TESS_TOOLS` jamais branchés.
- Absent : TTS, musique, lipsync, ASR propre, upscale, détourage, inpainting.

---

## 5. Asynchrone

- **BullMQ + Redis** (`apps/workers/package.json`, `docker-compose.yml:19-47`). Files déclarées : `ingest`, `tag`, `radar`, `generate`, `cron` (`apps/workers/src/queue.ts:9`). Workers réels : `radar` (stub), `ingest` (fixtures), `cron` (`apps/workers/src/index.ts:10-21`). **`generate` et `tag` n'ont aucun consommateur** ; rien ne les alimente côté web.
- Crons BullMQ (`index.ts:30-63`, `jobId` fixe = idempotence du planning) : `tracker-scan` 04:00, `radar-scan` 05:00, `daily-sync` 06:00, `adsmap-sync` 07:00. Le worker appelle les routes `web` `/api/cron/*` avec `CRON_SECRET` (`apps/workers/src/adsmap.ts:25-48`).
- **Génération image et pubs : synchrone** dans la server action (`composeBatch`, lots de 3 en parallèle `ads.ts:499-504`, délais jusqu'à 300 s par image `core/economics.ts:155`). Pas de job, pas de reprise : si la requête meurt, rien n'est enregistré (l'insertion arrive à la fin, `ads.ts:780-797`). L'état « en cours » est un store client en mémoire module (`web/lib/generation-store.ts`, `demarrerGeneration` `:45`), perdu au rechargement.
- **Vidéo : semi-asynchrone, piloté par le navigateur.** Soumission en file fal, ligne `generations` `status='processing'` + `jobId` (`video.ts:87-96`). Le client sonde toutes les 5 s, 80 fois max (`VideoStudioFull.tsx:119-128`), reprend à l'ouverture de page (`:103-117`). Le serveur ne sonde jamais seul : sans onglet ouvert, la ligne reste `processing`. Péremption serveur 15 min (`video.ts:228`, `:269-279`), client 20 min (`VideoStudioFull.tsx:111`).
- **Webhooks fal** : aucun.
- **Idempotence** : aucune clé d'idempotence sur les générations ; remboursement vidéo « une seule fois » par lecture-puis-écriture non atomique (`video.ts:238-248`) ; Stripe a sa table d'idempotence (`db/schema.ts:573`), pas les générations.
- Tables prévues pour l'asynchrone/agents mais **jamais écrites** : `agent_jobs` (`db/schema.ts:550`), `agent_threads` (`:536`), `adsmap_agent_runs` (`:1138`), `adsmap_ai_budgets` (`:1165`), `briefs` (`:491`) (grep d'usage vide hors schéma).

---

## 6. Stockage médias

- **S3-compatible (OVH par défaut, `int/storage.ts:1-15`)**, lecture publique du bucket (`int/storage.ts:146-153`), CDN optionnel `S3_PUBLIC_BASE_URL` (`:55-58`). CloudFront n'apparaît qu'en commentaire (`web/components/VignetteDepart.tsx:7`).
- Clés existantes : `assets/{workspaceId}/{ts}-{uuid8}-{nom}` (`int/storage.ts:61-64`) ; `assets/{ws}/drive-{id}.{ext}` (`web/app/actions/drive.ts:130`) ; `renders/{generationId}/{cle}.png` (`web/lib/ad-store.ts:60`) ; `assets/_healthcheck/…` (`int/storage.ts:167`).
- **Ce qui va en S3** : uploads d'assets par URL présignée (`web/app/actions/assets.ts:288-304`), imports Drive, rendus PNG des pubs composées, migration des data URI (`web/app/actions/storage.ts:121`).
- **Ce qui n'y va PAS** : toutes les sorties fal (scènes de pubs `input.sceneUrl` + `assetUrls`, images du studio Image, vidéos) restent des URL du fournisseur (`ads.ts:785`, `image.ts:144`, `video.ts:296`). La route de rendu prévoit déjà l'expiration (« adresse expirée chez le fournisseur », `route.tsx:127-131`).
- Photos produit : stockées en **data URI base64 dans Postgres** (`products.image_url`, `image_urls`, `web/app/actions/image.ts:206-211`, `:228-234`), jusqu'à 6 × ~6 Mo.
- **Rendu serveur des maquettes** : `renderAdPng` (`web/lib/ad-render.tsx:790-799`) via `next/og` `ImageResponse` (satori), polices Liberation Sans locales (`web/lib/ad-fonts.ts:4-24`). Arbre construit en synchrone avec une échelle globale de module (`ad-render.tsx:747-749`). Coquilles `AD_LAYOUTS`, gabarits `AD_TEMPLATES` (`ai/ads.ts:6`). Pub « entière » : image seule, `objectFit: contain` (`ad-render.tsx:780-787`).
- **`RENDER_VERSION = 9`** (`web/lib/ad-render.tsx:162`), lié au contenu du fichier par `web/test/render-version.test.ts`. Clé de cache `v{RENDER_VERSION}:{id}:{ratio}:{t|f}:{recipeHash}` (`route.tsx:140`) ; `recipeHash` = textes + `sceneUrl` + lumière (`route.tsx:69-78`), **sans** `layout`, `template`, `mode`, `accent`, `benefits`, `logoUrl`. Cache mémoire LRU 128 Mo (`route.tsx:44-68`), puis S3 (`route.tsx:152-153`, `:161`), en-tête `private, max-age=31536000, immutable` (`:53`), repli redirection vers la scène brute si la composition échoue (`:167`).
- Formats : pubs 4:5 1080×1350 par défaut, 1:1, 9:16, vignette ×0,4 ; PNG uniquement. Images fal en JPEG/PNG selon modèle ; vidéo MP4 Kling.

---

## 7. Dépendances présentes (package.json + `pnpm-lock.yaml`)

| Besoin du cahier | Présent ? | Où |
|---|---|---|
| Éditeur 2D (fabric, konva, tldraw, pixi) | **non** | lockfile : aucune entrée |
| Graphe / canvas nodal | **oui** : `@xyflow/react 12.11.5`, `elkjs 0.12.0` | `web/package.json:21`, `:24` ; utilisés par `web/app/(app)/adsmap/Canvas.tsx`, `Views.tsx` |
| Composition image serveur | **oui** : `next/og` (satori, via `next ^15`, lock `@next/* 15.5.x`), `sharp 0.34.5` | `web/lib/ad-render.tsx:1`, `web/lib/image-jointe.ts:43`, `web/lib/scene-light.ts:45` |
| FFmpeg / montage vidéo | **non** (ni paquet, ni binaire dans `Dockerfile.web` / `Dockerfile.workers`) | - |
| Remotion | **non** | - |
| JSON Schema / validation | `zod 3.25.76` + `zod-to-json-schema` dans `packages/ai` uniquement (`ai/radar-schema.ts`, `ai/taxonomy.ts`, `ai/tagging.ts`, ce dernier mort) ; `ajv 6.15.0` présent seulement comme dépendance transitive d'ESLint (`pnpm-lock.yaml:3913`, `:5307`) | les sorties d'outils Anthropic sont validées à la main, pas par schéma |
| File de jobs | **oui** : `bullmq 5.81.3`, `ioredis 5.11.1` | `apps/workers` seulement |
| SDK S3 | **non** (SigV4 maison) | `int/storage.ts` |
| SDK fal | **non** (`fetch` brut) | `int/fal.ts` |
| Tests DOM | `jsdom`, `vitest`, `@electric-sql/pglite` | `web/package.json` devDeps |

---

## 8. Écarts par capacité

Colonnes : projet créatif durable versionné / calques / masque / timeline / devis + approbation / ledger relié / jobs durables / registre de prompts ADMIN.

| Capacité | Projet durable versionné | Calques | Masque | Timeline | Devis / approbation | Ledger | Jobs durables | Registre de prompts |
|---|---|---|---|---|---|---|---|---|
| Pubs IA (lot, clone) | **Non** : unité = ligne `generations` isolée ; regroupement par `input.lot` (`ads.ts:780`) ; aucun objet « projet » ; textes écrasés en place (`ads.ts:1755`) | **Non** : recette plate (`AdRecipe`, `ad-render.tsx:6-110`) rendue par coquilles fixes, pas de pile de calques | Non | - | **Partiel** : prix annoncé avant clic (`creditsAnnoncesLot`, `AdsStudio.tsx:9`) mais pas de devis persistant ni d'approbation ; réservation immédiate (`ads.ts:1111`) | Partiel : `credit_ledger` sans `ref_id` renseigné (`db/schema.ts:565`, aucun écrivain) ; `ai_spend` sans lien génération | **Non** : synchrone dans la requête | **Non** : prompts en dur `ads.ts`, `ai/ads.ts`, `core/*` + presets par espace |
| Déclinaisons | Partiel : filiation `parentId` + `variable` (`ads.ts:2022-2034`), pas de versionnement du parent | Non | Non | - | Prix via `prixDeclinaison`, pas d'approbation | idem | Non | Non (2 catalogues de directions) |
| Format / export | Non (rendu à la volée, cache par clé) | Non | Non | - | - | - | Non | - |
| Image IA | Non : `generations` `kind='image'`, archive par statut | Non | **Non** (aucun masque/inpaint) | - | Prix sur bouton, pas d'approbation | idem | Non (synchrone) | Non (enhance en dur `ai/generation.ts:116`, `:137`) |
| Édition / retouche | **Absente** | Absente | Absente | - | - | - | - | - |
| Vidéo IA | Non | Non | Non | **Non** (clip unique 5 ou 10 s) | Prix annoncé, pas d'approbation | idem ; remboursement non atomique (`video.ts:238-248`) | **Partiel** : `jobId` en base, mais polling client seul, pas de webhook, pas de worker | Non (`promptVideo` en dur `core/video-directions.ts`) |
| Montage vidéo | **Absent** (ni FFmpeg, ni Remotion) | Absent | - | Absent | - | - | - | - |
| Voix / TTS / musique / lipsync | **Absents** | - | - | - | - | - | - | - |
| Transcription | Lecture Trendtrack seulement | - | - | - | - | - | - | - |
| Textes IA | Partiel : dernier `script` rechargé (`textes/page.tsx:56-64`), pas d'historique navigable ni de version | - | - | - | Prix fixe 3 crédits | idem | Non | Non (`ai/generation.ts:49`) |
| Relecture / score | Résultat fusionné dans `input` (`ads.ts:1859-1863`) ; score image non stocké (`image.ts:341-368`) | - | - | - | relecture gratuite (non annoncée en crédits) | `ai_spend` seul | Non | Non |

Existant réutilisable pour la refonte :
- Barrière dollars + journal `ai_spend` (`web/lib/spend-guard.ts`), règles pures `core/spend-guard.ts`, `core/spend-refund.ts`.
- Réservation atomique de crédits (`web/lib/credits.ts:44-53`).
- Catalogue moteurs image avec prix et surcharges env (`core/economics.ts:145-195`).
- Registre versionné ADMIN+ existant pour Jarvis (`web/lib/jarvis-connaissances.ts`), modèle possible d'un PromptResolver.
- Presets par espace/marque avec mesure de performance (`web/app/actions/presets.ts`, `creative_presets`).
- Rendu serveur versionné avec cache S3 (`ad-render.tsx`, `ad-store.ts`, `api/ad/[id]`).
- BullMQ/Redis en place mais inutilisé pour la génération.
- `@xyflow/react` + `elkjs` déjà en dépendance (canvas nodal Adsmap).

---

## Constats surprenants

1. **Plafond par défaut à 50 $, pas 10 $** : `DEFAULT_CAP_USD = 50` (`web/lib/spend-guard.ts:40`, commentaire `:34-39` « Relevé de 10 à 50 $ »), alors que CLAUDE.md énonce « Plafond dur à 10 $ ». Le commentaire `:237` et le test `spend-guard-coverage.test.ts` parlent encore de 10 $.
2. **Plafond global, pas par espace** : `spentUsd` somme toute la table (`web/lib/spend-guard.ts:54-61`). Vérifier-puis-écrire non atomique (`:136-138` puis `:180`) : les 3 scènes parallèles d'un lot (`ads.ts:499-504`) passent toutes le même contrôle.
3. **Server actions des studios sans garde de rôle ni de formule** : `ads.ts`, `image.ts`, `video.ts` ne contrôlent que la session (ex. `ads.ts:1046-1047`, `image.ts:41-42`, `video.ts:100-101`). Seul `studio.ts:26` vérifie `canAccess`. Un `client_viewer` ou un espace `starter` peut appeler `generateAdsAction` directement.
4. **La page Pubs IA garde avec la clé `image`, pas `ads`** (`ads/page.tsx:27`) ; Textes garde avec `studio`, pas `textes` (`textes/page.tsx:15`). Et `/studio/ads` lit `essaiSuivantAction`, `spendStatus`, `bilanCopieAction` AVANT sa garde (`ads/page.tsx:60-64` vs `:80`).
5. **Crédits perdus sur échec des concepts** : `generateAdsAction` réserve (`ads.ts:1111`) puis rend `{ error }` sans remboursement si l'écriture des concepts lève ou rend vide (`:1241`, `:1243`). Même trou dans le clone (`:1510`, `:1511`, `:1519`).
6. **Clé fal exfiltrable par le polling vidéo** : `pollVideoAction(jobId, …)` reçoit `jobId` du navigateur (`video.ts:253`, appelé `VideoStudioFull.tsx:122`) ; `falGetVideo` découpe `falq|statusUrl|responseUrl` et appelle ces URL avec `authorization: Key ${FAL_KEY}` (`int/fal.ts:211-214`, `:224`, `:234`), sans vérifier le domaine ni comparer au `jobId` stocké. Hors sujet Pubs IA, mais à signaler au propriétaire.
7. **Les sorties fal ne sont jamais copiées en S3** (`ads.ts:785`, `image.ts:144`, `video.ts:296`) : seules les maquettes composées le sont. Une pub dont la scène expire chez fal perd aussi son rendu (repli `route.tsx:167` vers la même URL).
8. **Photos produit en data URI dans Postgres** (`image.ts:206-211`, `:228-234`), et `imageJointe` refuse `data:` (`int/safe-fetch.ts:13`, `web/lib/image-jointe.ts:41`) : pour un produit dont la photo a été déposée à la main, la relecture « entière » part **sans référence**, donc `produitFidele = null` (`ai/controle-pub.ts:127-129`, `:162`). Une des trois questions ouvertes de CLAUDE.md (« l'étiquette tient-elle ») reste alors sans réponse automatique.
9. **Forfait fal unique à 0,08 $** (`core/spend-guard.ts:85`) quel que soit le moteur, alors que `gpt2_high` coûte 0,195 € (`core/economics.ts:155`) : le journal `ai_spend` sous-estime ce moteur d'un facteur ~2,5 et le plafond fuit d'autant.
10. **Le test « aucun chemin ne contourne le plafond » raisonne par fichier** (`web/test/spend-guard-coverage.test.ts:60-64`) : un second appel fal non enveloppé dans un fichier qui contient déjà un `sousPlafond(` passe au vert ; `packages/` et `apps/workers` ne sont pas scannés. C'est le motif « présence d'un appel » que CLAUDE.md met en garde.
11. **Déclinaison scène/univers d'une pub entière** : l'enfant hérite `mode: 'entiere'` du parent (`ads.ts:2022-2025`) mais reçoit une scène produite par `scenePrompt` (consigne « NO text », `ads.ts:879-883`) ; `PubEntiere` ne pose aucune couche (`ad-render.tsx:752`) : la déclinaison s'afficherait sans texte. Les constats de relecture du parent (`copieConforme`, `produitFidele`) sont aussi recopiés sur l'enfant (seuls `jarvisScore` et `rating` sont vidés, `:2035-2036`). À vérifier à l'écran par le propriétaire.
12. **Deux catalogues de directions coexistent** : génération et aperçus sur `AD_DIRECTIONS` (`core/ad-directions.ts:63`), déclinaison « univers » sur l'ancien `VISUAL_UNIVERSES` (`ai/ads.ts:10`, `ads.ts:1983-1987`).
13. **Phrase produit codée en dur dans toutes les scènes** : « a supplement bottle is roughly 12 cm tall » (`ads.ts:869`), quelle que soit la catégorie de la marque.
14. **Commentaires d'adaptateur périmés** : `int/fal.ts:10-13` annonce Flux / Ideogram par défaut, le code renvoie `nano-banana-2` partout (`:42-45`) ; `enhanceImagePrompt` écrit encore pour « Flux Kontext » et « Flux / Ideogram » (`ai/generation.ts:117`, `:138`).
15. **`credit_ledger.ref_id` n'est jamais renseigné** (colonne `db/schema.ts:565`, tous les `insert` : `web/lib/credits.ts:51`, `:61`, `billing.ts:44`, `credits.ts:19`, `stripe/webhook/route.ts:30`, `:54`) : impossible de relier un débit à une génération ou à une ligne `ai_spend`. Débit et écriture au ledger sont deux requêtes hors transaction (`web/lib/credits.ts:46-51`).
16. **Tables d'agents et de budgets jamais écrites** : `agent_jobs`, `agent_threads`, `adsmap_agent_runs`, `adsmap_ai_budgets`, `briefs` (`db/schema.ts:491`, `:536`, `:550`, `:1138`, `:1165`). Files BullMQ `generate` et `tag` sans consommateur (`apps/workers/src/queue.ts:9`).
17. **Jarvis chat, `adsmap-draft`, relecture image et optimisation de prompt ne débitent aucun crédit** (`api/jarvis/chat/route.ts:56-117`, `adsmap-draft.ts:54-89`, `image.ts:341-368`, `image.ts:92-104`), seulement des dollars plafonnés.
18. **`MODEL_RATES` ignore `claude-sonnet-4-5`** (`core/spend-guard.ts:38-43`), modèle par défaut de `tagging.ts:5` et `radar-reco.ts:4` : s'ils étaient rebranchés, ils seraient comptés au tarif Opus.
19. **`revalidatePath('/studio/prompts')`** (`web/app/actions/presets.ts:190`, `:200`) vise une route qui n'existe pas.
20. **`packages/core` lit l'environnement** (`core/economics.ts:184-185`) alors que CLAUDE.md le veut pur.
21. **Commentaires contradictoires dans la barrière** : « trente-cinq points d'appel » (`web/lib/spend-guard.ts:17`) vs « six points d'appel payants » (`:268`) ; le décompte réel est 30 sites `guardedAnthropic` + 7 `sousPlafond` (section 3).
22. **`recipeHash` n'inclut ni `layout` ni `mode`** (`route.tsx:69-78`) : sans danger tant que la mise en page ne change que par création d'une nouvelle ligne, mais un futur éditeur qui modifierait la mise en page EN PLACE servirait l'ancien PNG depuis S3 pour toujours.
