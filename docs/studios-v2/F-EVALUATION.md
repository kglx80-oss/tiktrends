# F-D · Lever les verrous du benchmark réel : vision routée, évaluation d'une release staged, ADMIN, exécuteur image

Lot F-D du chantier Studios v1.0 (vague 5). Base : `claude/studios-base-vague5c` (`f2fd4bb`, L0-L5 + F-A + F-C).
Chemins relatifs à `product/`. Ce document dit ce qui est tranché, pourquoi, et comment le vérifier. Il ne décrit
aucun état : pour savoir si une campagne réelle a eu lieu, lire `studio_prompt_evaluations` (`kind = 'benchmark'`,
`result.type = 'campagne_benchmark'` et `mode = 'reel'`).

**Aucun appel réel, aucune dépense : 0 $.** Tout est prouvé contre un client Anthropic ESPION (le SDK n'est jamais
appelé) et un `fetch` INJECTÉ qui rejoue la file fal. Aucune migration.

## 1. Ce que livre le lot

| Livrable | Où |
| --- | --- |
| Règle pure du routage vision : liaisons → pièces natives, bornes, contrat des adaptateurs | `packages/core/src/prompts/vision.ts` (réexporté par `packages/core/src/studios/benchmark/index.ts`) |
| Devis : jetons d'image comptés pour le profil vision | `packages/core/src/studios/benchmark/devis.ts` |
| Admissibilité d'une release `staged`, verdict avec fiches, contrôle du geste « benchmark approuvé » | `packages/core/src/studios/benchmark/evaluation.ts` |
| Adaptateur Anthropic : vision routée, blocs `image` natifs, contrat revérifié | `apps/web/lib/studios/prompts/adaptateur.ts` |
| Résolveur : médias lus par le serveur dans la portée, `mediaBindings` tracés, mode évaluation | `apps/web/lib/studios/prompts/resolveur.ts` |
| Dépôt : `lireCampagneBenchmark`, `approuverBenchmark` | `apps/web/lib/studios/prompts/depot-prompts.ts` (ajouts) |
| Campagne : sorties jointes aux contrôles vision, pièces dans `config.json`, arrêt sur issue incertaine, refus de l'exécuteur avant la barrière | `apps/web/lib/studios/benchmark/campagne.ts`, `scenarios.ts` |
| Programme : release `staged` exécutable en évaluation, fiches humaines jointes | `apps/web/lib/studios/benchmark/programme.ts`, `actions.ts` |
| Exécuteur image réel du benchmark (F-A) | `apps/web/lib/studios/benchmark/executeur-fal.ts`, branché par `apps/web/scripts/bench-studios.ts` en `--reel` |
| ADMIN « IA et Studios », onglet Évaluations | `apps/web/app/(app)/admin/ia-studios/{page,Ecrans,Commandes,donnees}.tsx`, `apps/web/app/actions/studios/prompts.ts` (ajout) |
| Tests | `packages/core/test/fd-vision-evaluation.test.ts`, `apps/web/test/fd-{vision-adaptateur,evaluation-db,executeur-fal}.test.ts`, `fd-admin-benchmark.test.tsx`, outils `fd-outils.ts` |

## 2. Décisions et pourquoi

**Vision : des octets lus par le serveur, jamais une adresse.** Le SDK installé (`@anthropic-ai/sdk` 0.27.3,
`resources/messages.d.ts`) décrit un seul bloc image : `{ type: 'image', source: { type: 'base64', media_type, data } }`,
`media_type` ∈ png, jpeg, gif, webp. On n'envoie donc que des octets : chaque liaison `mediaBindings` d'une tâche
`vision_analysis` est résolue par le SERVEUR dans la portée de la tâche (`resolveurMediasStudio` : `sta_<uuid>` =
ligne `studio_assets` de CET espace ET de CETTE marque, état `stored`, octets relus, taille et sha256 égaux à la ligne),
puis `planifierPiecesVision` (pur) vérifie version et empreinte de la liaison, relit le type dans les octets
(`inspecterMedia` : png, jpeg, webp ; le GIF n'est pas relu, donc refusé), applique les bornes et rend les pièces dans
l'ordre de leur `nativeAttachmentIndex`. Les images précèdent le texte compilé dans le message utilisateur. Toute
anomalie (hors portée, absent, altéré, vidéo ou audio, trop lourd, trop nombreux) BLOQUE la tâche avant l'appel :
trace `blocked`, 0 $. Les identifiants d'autres catalogues (photos produit `pph_`, logos, bibliothèque) ne sont pas lus
par ce lot : bloqués, jamais substitués.

**Une liste d'IDs ne prouve pas qu'une image a été vue.** La trace `studio_prompt_runs.config.mediaBindings` garde, pour
chaque pièce réellement envoyée : `bindingId`, `assetId`, `assetVersion`, `sha256` des octets lus, `nativeAttachmentIndex`,
type, taille, dimensions, borne de jetons. La campagne écrit en plus `piecesNatives` dans `config.json` de chaque cas.

**Le même contrat pour le réel et le simulé.** `exigerPiecesConformes` (`controlerPiecesAppel`) est appelé par
l'adaptateur réel AVANT de créer le client gardé, et par l'adaptateur simulé du benchmark : pièces seulement en vision,
index 0..n-1, empreinte égale aux octets, type relu, bornes. Les deux routent `reasoning_structured` et `vision_analysis`,
rien d'autre.

**Bornes, avec leur provenance.**

| Borne | Valeur | Provenance |
| --- | --- | --- |
| Images par appel | 6 | MESURÉ : au plus 3 images par tâche vision dans les 24 cas (F01 `quality.visual` : la sortie et deux références) ; marge ×2 |
| Jetons par image | 4 784 | Documenté pour `claude-sonnet-5` (modèle routé par défaut) : « up to 4784 tokens per image at the limit » (2 576 px) ; au-delà le fournisseur réduit l'image, le plafond tient |
| Octets par image | 3 750 000 | Mesuré : la plus grosse image du jeu synthétique fait 1 293 octets ; aucune sortie fal réelle lue. Choisi pour garder la pièce base64 sous 5 000 000 octets (lecture prudente de la limite par image du fournisseur, à reconfirmer sur la documentation vision avant la première exécution réelle) |

**Coût borné annoncé.** Une tâche vision coûte au plus (24 000 + 6 × 4 784) jetons d'entrée + 4 000 de sortie au tarif du
modèle routé : 0,218 $ avec `claude-sonnet-5`. Le devis agrégé du benchmark devient chiffrable pour les 24 cas :
**9,925 $** (empreinte `67935f16…`), contre « refusé, chiffrage partiel 6,604 $ » avant ce lot. Une vision sans borne de
jetons par image reste « non chiffrable », jamais 0 $.

**Mode évaluation du résolveur.** `DemandeTache.evaluation = { releaseId, approbationId }` (exclusif de l'épinglage)
exécute une release `staged` seulement si `admissibiliteEvaluation` ne trouve rien : release `staged` non révoquée
(`active` passe par le chemin normal, `retired` jamais), portée SYNTHÉTIQUE du benchmark (`PORTEE_BENCHMARK`, désormais
dans le noyau), approbation ADMIN de benchmark sur CETTE release et CETTE empreinte, CONSOMMÉE par le lancement réel,
campagne non close (aucun rapport joint pour cette approbation, `joindreCampagne` écrit désormais `approbationId`) et
démarrée il y a moins de 24 h. Les traces portent `config.evaluation = { mode: 'benchmark', approbationId,
releaseStatut: 'staged' }`. Jarvis (pointeur), les devis studio (`epinglerDevis`, pointeur) et les tâches épinglées
(`releaseDuJob` refuse `staged`) ne changent pas : une release staged ne leur est jamais servie. La release reste
`staged`, le pointeur ne bouge pas.

**Fiches humaines, puis décision.** Une campagne réelle finit forcément en `REVUE_HUMAINE_REQUISE` (les fiches naissent
vides) : `joindreCampagne` la joint `passed = false`. `joindreFichesRevue` reçoit le `rapport.json` et les fiches
remplies : il exige le rapport INTACT (empreinte recalculée, sinon `RAPPORT_ALTERE`, rien d'écrit) et DÉJÀ JOINT par la
campagne (`RAPPORT_NON_JOINT`), relit les traces en base (réelles, de cette release), valide les fiches (une par cas à
revue, mode réel, bon nombre de sorties, notes 0-2, relecteur nommé) et recalcule le verdict avec la rubrique figée.
`passed` n'est vrai que si plus rien ne s'y oppose. Le geste « Benchmark approuvé » (`approuverBenchmark`,
`prompt.evaluate`, nominatif, motif, audit `prompt.benchmark.approuver`) exige cette évaluation RÉELLE passée sur
l'empreinte courante ET relit les fiches (une ligne « passée » forgée sans fiches remplies est refusée). Il pose
`evaluation.benchmarkApprouve` (+ `approuvePar`, `benchmarkEvaluationId`) par compare-and-set sur `staged` et
l'empreinte ; il ne publie rien. La publication en production reste le geste séparé, désormais possible.

**Révocation jamais effacée (contre-recette du 8 octobre, P2).** Le lot n'ajoute qu'UNE écriture de
`studio_prompt_releases.evaluation` : le geste « Benchmark approuvé ». Il prend le verrou de ligne `SELECT … FOR UPDATE`
dans sa transaction AVANT de lire la release, relit la révocation sous ce verrou (une release révoquée est refusée,
`RELEASE_REVOQUEE`) et reprend explicitement tout ce que la ligne verrouillée porte, révocation comprise. Le rattachement
des rapports, la jonction des fiches, l'approbation de budget et sa consommation n'écrivent que des lignes
`studio_prompt_evaluations`, jamais la colonne `evaluation` de la release. La réévaluation (`evaluerRelease`) n'est pas de
ce lot (correctif sur #737) ; la garde vérifie qu'elle laisse la révocation intacte.

**Exécuteur image : une barrière, une ligne.** La campagne appelle `sousPlafond` autour de `produire` (une ligne
`ai_spend` par média). `FournisseurFal` exige une `BarriereDepenseStudio` : l'exécuteur lui donne un port « déjà
compté » qui n'écrit rien et refuse une seconde réservation pour la même demande. `preparer` (avant la barrière, 0 $)
applique la règle pure `requeteFalImage` (modèle routé `FAL_IMAGE_MODEL(_EDIT)`, corps natif, références du jeu en data
URI) ; une retouche masquée (F05) ou une image clé sans consigne compilée (F20) est refusée là (`EXECUTEUR_REFUS`).
`produire` : une soumission, sondage avec le recul de F-A borné à 10 min (politique), téléchargement borné, type relu.
Toute issue INCERTAINE (réponse perdue, délai, requête inconnue, annulation) lève `ErreurFournisseurIncertaine` : la
campagne s'arrête (`arrete_incertain`, nouveau statut de cas, compté « incomplet »), sans resoumission, la dépense reste
comptée. La commande ne construit l'exécuteur qu'avec une vraie `FAL_KEY` (`executeurDepuisEnv`) ; le construire n'appelle
rien, `lancerCampagneReelle` revérifie tout avant le premier appel.

**ADMIN plateforme seulement.** L'onglet Évaluations rend le devis (total et par cas, cas non chiffrables nommés), le
formulaire d'approbation (prix affiché avant le clic, répété dans la confirmation), les approbations, les rapports
joints (pastille et bannière SIMULÉ), la jonction des fiches, le geste « Benchmark approuvé ». La page exige
`prompt.read`, chaque commande `prompt.evaluate` (garde plateforme) : un owner, un admin d'espace ou un lecteur voient
l'écran de refus et chaque commande est refusée sans écriture.

## 3. Preuves (résultat lu)

| Exigence | Garde | Ce qui est lu |
| --- | --- | --- |
| Payload vision | `fd-vision-adaptateur` | le client espion reçoit `[image(base64 = octets de la sortie, image/png), image(référence), text]`, modèle `claude-sonnet-5`, aucune adresse ni clé de stockage ; deux lignes `ai_spend` écrites par `guardedAnthropic` ; trace `mediaBindings` = liaison, index, sha256 |
| Média hors portée | `fd-vision-adaptateur` | autre marque du même espace, autre espace, octets altérés : `blocked:MEDIA_NON_RESOLU`, 0 appel, 0 ligne de dépense ; `pph_…` et une URL : « absent » |
| Contrat commun | `fd-vision-adaptateur`, `fd-vision-evaluation` | pièce altérée ou hors vision : `PiecesInvalides` avant tout client (réel et simulé), 0 $ |
| Devis | `fd-vision-evaluation`, `fc-commande`, commande `--plan` | 24 cas chiffrables, total 9 925 120 µ$, ligne vision 218 112 µ$, aucune tâche à 0 $ |
| Staged hors campagne | `fd-evaluation-db` | tâche utilisateur `RELEASE_ACTIVE_ABSENTE`, devis épinglé `RELEASE_NON_PUBLIEE`, Jarvis `repli_1_0_0`, `epinglerDevis` refusé, `CAMPAGNE_ABSENTE`, `CAMPAGNE_NON_DEMARREE` : 0 appel, 0 trace |
| Staged dans la campagne | `fd-evaluation-db` | campagne RÉELLE (espion `simule: false`) des 24 cas sur la release staged : 24 `execute`, invariants 51/51, `REVUE_HUMAINE_REQUISE` ; chaque trace sur la release staged avec `evaluation` ; 10 appels vision, F07 = `[0 f07-boite, 1 f01-lunettes-bleues]` ; ensuite `CAMPAGNE_CLOSE` (et `PORTEE_NON_SYNTHETIQUE` pour un espace client) |
| Fiches et geste | `fd-evaluation-db` | fiches vides ⇒ `passed=false` ; remplies ⇒ `passed=true` ; rapport retouché ⇒ `RAPPORT_ALTERE`, rescellé ⇒ `RAPPORT_NON_JOINT`, rien d'écrit ; geste refusé (admin d'espace `FORBIDDEN`, rapport seul `FICHES_ABSENTES`, fiches vides `EVALUATION_NON_PASSEE, FICHES_NON_REMPLIES`) ; accepté ⇒ `benchmarkApprouve`, toujours `staged`, pointeur nul, audit nominatif ; publication en production refusée AVANT (`BENCHMARK_NON_APPROUVE`), acceptée APRÈS |
| Exécuteur fal | `fd-executeur-fal` | F14 en réel contre la file rejouée : 2 POST `…/nano-banana-2/edit`, corps `aspect_ratio 9:16`, référence en data URI, clé vers la file seulement, image relue (`text/html` annoncé, PNG relu) ; `ai_spend` = 2 lignes `fal_image 0,08` de la campagne, 0 ligne `studio.generation` |
| Incertain | `fd-executeur-fal` | coupure après envoi : `F14 arrete_incertain`, `F21 arrete_incertain`, 1 seul POST, F21 jamais appelé, 0,08 $ gardé |
| Refus avant barrière | `fd-executeur-fal` | F05 : `EXECUTEUR_REFUS` ×2, 0 requête, 0 ligne |
| Révocation (P2) | `fd-revocation-db`, `fd-revocation-pg` (Postgres réel, `FD_PG_URL`) | témoin non révoqué approuvé ; révoquée : geste refusé `RELEASE_REVOQUEE`, réévaluation acceptée, révocation identique avant et après ; course réelle (révocation tenue sous verrou, geste lancé pendant) : le geste attend, refuse, la révocation validée reste |
| `--reel` sans budget | commande sur la base locale | refusé (`APPROBATION_ABSENTE`, `EXECUTEUR_NON_BRANCHE` : aucun adaptateur ni clé fal), rien appelé ni écrit |
| ADMIN | `fd-admin-benchmark` | HTML : total 9,925 $, ligne F07 0,218 $, aucun « non chiffrable », formulaire et confirmation, rapport SIMULÉ et sa bannière, « Ne vaut pas évaluation », geste indisponible ; approbation listée « budget 10,000 $ pour un devis de 9,925 $ · non utilisée » ; owner, admin d'espace, lecteur : écran de refus, 3 commandes refusées, 0 écriture |
| Simulé complet | `fc-campagne-db` (mis à jour), commande simulée | 24 cas `execute`, 51/51 invariants, `REVUE_HUMAINE_REQUISE`, 0 $, `piecesNatives` dans `config.json` |

Les tests F-C qui affirmaient l'ancien état (« vision non routée », devis non chiffrable, `quality.visual` bloqué) ont
été mis à jour au nouveau résultat, sans relâcher ce qu'ils gardent (`fc-commande`, `fc-campagne-db`, `fc-reel-db`).

## 4. Mutations (cassées volontairement, échec constaté, code restauré)

M20 reproduit exactement le défaut P2 : sans verrou, le geste lit l'ancienne ligne, attend sur l'UPDATE et écrase la
révocation validée entre-temps.

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M01 images non jointes (texte seul) | `fd-vision-adaptateur` | `contenu.map is not a function` |
| M02 média lu sans filtre d'espace ni de marque | `fd-vision-adaptateur` | `expected [ 'ok', 'ok', …(1) ] to deeply equal [ 'blocked:MEDIA_NON_RESOLU', …(2) ]` |
| M03 jetons d'image nuls | `fd-vision-evaluation` | `expected { ok: false, …(5) } to match object { ok: true, totalUsdMicros: 9925120 }` |
| M03b images non ajoutées aux bornes | `fd-vision-evaluation` | `expected { ok: true, …(3) } to match object { ok: true, totalUsdMicros: 9925120 }` |
| M04 consommation de l'approbation ignorée | `fd-evaluation-db` | `expected { ok: false, statut: 'erreur', …(4) } to match object { ok: false, …(1) }` |
| M05 portée synthétique ignorée | `fd-evaluation-db` | `expected [ 'CAMPAGNE_CLOSE' ] to deeply equal [ 'PORTEE_NON_SYNTHETIQUE', …(1) ]` |
| M06 campagne close ignorée | `fd-evaluation-db` | `expected [] to deeply equal [ 'CAMPAGNE_CLOSE' ]` |
| M07 fiches non relues par le geste | `fd-vision-evaluation` | `expected [] to deeply equal [ 'FICHES_NON_REMPLIES' ]` |
| M08 évaluation simulée acceptée par le geste | `fd-vision-evaluation` | `expected [] to deeply equal [ 'EVALUATION_NON_REELLE' ]` |
| M09 seconde barrière dans l'exécuteur | `fd-executeur-fal` | `expected [ { …(10) }, { …(10) } ] to deeply equal []` |
| M10 resoumission après une réponse perdue | `fd-executeur-fal` | `expected [ { …(4) }, { …(4) } ] to have a length of 1 but got 2` |
| M11 campagne poursuivie après une issue incertaine | `fd-executeur-fal` | `expected [ [ 'F14', 'erreur' ], …(1) ] to deeply equal [ [ 'F14', 'arrete_incertain' ], …(1) ]` |
| M12 geste sans `prompt.evaluate` | `fd-evaluation-db` | `expected [ [], [ 'FICHES_ABSENTES' ], [ …(2) ] ] to deeply equal [ [ 'FORBIDDEN' ], …(2) ]` |
| M13 pièces non transmises à l'adaptateur | `fd-vision-adaptateur` | `contenu.map is not a function` |
| M14 `mediaBindings` non tracés | `fd-vision-adaptateur` | `expected [] to deeply equal [ [ …(4) ], [ …(4) ] ]` |
| M15 refus d'admissibilité ignorés | `fd-evaluation-db` | `expected { ok: true, sortie: { …(5) }, …(5) } to match object { ok: false, code: 'CAMPAGNE_ABSENTE' }` |
| M16 rapport non joint accepté | `fd-evaluation-db` | `expected { ok: true, …(3) } to match object { ok: false, …(1) }` |
| M17 simulé sans contrat des pièces | `fd-vision-adaptateur` | `expected Error: Aucune réponse simulée pour cet ap… to be an instance of PiecesInvalides` |
| M18 refus de l'exécuteur après la barrière | `fd-executeur-fal` | `expected [ 'PROVIDER_ERROR', 'PROVIDER_ERROR' ] to deeply equal [ Array(2) ]` |
| M20 geste sans `FOR UPDATE` avant la lecture | `fd-revocation-pg` (Postgres réel) | `la révocation a été effacée par le geste: expected undefined to be 'Révocation concurrente'` |
| M21 release révoquée acceptée par le geste | `fd-revocation-db` | `expected [] to deeply equal [ 'RELEASE_REVOQUEE' ]` |
| M19 bannière SIMULÉ retirée de l'écran | `fd-admin-benchmark` | `expected '<main style="padding:32px clamp(16px,…' to contain 'SIMULÉ · exécution sur fournisseurs s…'` |

Aucune n'a survécu au premier passage. M03 tombait par la branche « non chiffrable » ; M03b vise la somme elle-même.

## 5. Limites

- **Le benchmark complet ne peut toujours pas partir en réel.** Le devis est chiffrable, mais aucun exécuteur réel
  n'existe pour l'animation (F20, clips : F-A refuse vidéo et voix) et l'exécuteur image refuse la retouche masquée
  (F05) et l'image clé sans consigne compilée (F20). `--reel` sur les 24 cas est refusé (`EXECUTEUR_NON_BRANCHE
  animation`) ; une sélection sans ces cas peut partir, mais une campagne partielle n'approuve jamais une release. Le
  geste « benchmark approuvé » est donc prouvé de bout en bout avec un exécuteur FACTICE, jamais en réel.
- **Barrière web et images.** `guardedAnthropic` (non modifié) estime le coût avant l'appel en comptant les caractères
  du payload, base64 compris : une image de 1 Mo compte ~ 380 000 jetons estimés, soit un refus possible bien avant le
  plafond réel. Côté prudent, mais une vision sur des sorties fal lourdes peut être bloquée à tort par le plafond.
- **Limite d'octets par image** non reconfirmée sur la documentation du fournisseur (proxy) : à vérifier avant la
  première exécution réelle.
- **Catalogues lus en vision** : seuls les médias studio `sta_` ; photos produit, logos et bibliothèque bloquent.
- **Fiches** : saisies en collant le JSON (`rapport.json`, `fiche-revue.json`) ; aucun éditeur de fiches.
- **Concurrence du mode évaluation** prouvée sur pglite (transactions sérialisées), pas sur deux connexions Postgres ;
  la course révocation / geste l'est sur Postgres réel (`fd-revocation-pg`, ignoré sans `FD_PG_URL`).
- La preuve simulée commitée par F-C (`docs/studios-v2/benchmark/20261008T114529Z-SIMULE/`) date d'avant ce lot
  (vision bloquée) ; une nouvelle campagne simulée (24/24, 51/51) a été produite hors dépôt.

## 6. Vérifier

Portes depuis `product/` : `pnpm -w run typecheck && pnpm -w run lint && pnpm -w run test && pnpm -w run build`.
Devis : `pnpm --filter @tiktrends/web bench:studios -- --plan` (total 9,925 $). Campagne simulée : commande F-C §2 sur
une base locale, puis restaurer la base.

## 7. Besoins hors périmètre (l'intégrateur tranche)

1. **`lib/studios/prompts/traces.ts`** : ajouter `evaluation` et `mediaBindings` à `CONFIG_VISIBLE` pour que l'onglet
   Exécutions montre le marquage évaluation et la correspondance des pièces (elles sont en base, pas encore à l'écran).
2. **`lib/spend-guard.ts`** : estimer une image par sa borne de jetons (4 784) plutôt que par la longueur de son base64.
3. **Exécuteurs média** : animation (F20) et retouche masquée (F05) sous la barrière, sans quoi le benchmark complet
   ne part pas en réel.
4. **`docs/studios-v2/benchmark/`** : remplacer la preuve simulée de F-C par une campagne simulée au SHA intégré.
5. **`docs/studios-v2/PROGRESS.json`** : UX-07 reste `NON_EXECUTE` (aucune campagne réelle).
