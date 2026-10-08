# F-C · Benchmark F01-F24 exécutable, budget explicite, approbation ADMIN

Lot F-C du chantier Studios v1.0 (vague 5). Chemins relatifs à `product/` sauf mention. Ce document dit ce qui
est tranché, pourquoi, et comment le vérifier. Il ne décrit aucun état : pour savoir si une campagne réelle a eu
lieu, lire `studio_prompt_evaluations` (`kind = 'benchmark'`) en base.

**Aucun appel réel, aucune dépense : 0 $.** Le mode réel est codé, refusé par défaut et prouvé refusé ; il n'a
jamais été exécuté.

## 1. Ce que livre le lot

| Livrable | Où |
| --- | --- |
| Noyau pur : lecture des 24 cas, rubrique figée, plans, devis agrégé, oracles, fiches, verdict, garde du réel, rapport | `packages/core/src/studios/benchmark/` (une ligne d'export en fin de `packages/core/src/index.ts`) |
| Jeu synthétique (13 médias dessinés par code), manifeste des empreintes et des droits | `apps/web/lib/studios/benchmark/jeu-synthetique.ts`, `docs/studios-v2/benchmark/jeu-synthetique/` |
| Scénarios des 24 cas (entrées communes, réponses simulées, calculs locaux) | `apps/web/lib/studios/benchmark/scenarios.ts` |
| Campagne, exécuteurs, dossiers de preuves | `apps/web/lib/studios/benchmark/campagne.ts` |
| Approbation ADMIN, lancements simulé et réel, rattachement à la release | `apps/web/lib/studios/benchmark/programme.ts`, `actions.ts` |
| Commande | `apps/web/scripts/bench-studios.ts` (+ `bench-studios-chargeur.mjs`), script `bench:studios` de `apps/web/package.json` |
| Preuve d'une campagne simulée complète | `docs/studios-v2/benchmark/<horodatage>-SIMULE/` |
| Tests | `packages/core/test/fc-benchmark.test.ts`, `apps/web/test/fc-{campagne-db,reel-db,jeu-synthetique,commande}.test.ts` |

## 2. La commande

Depuis `product/` :

```
pnpm --filter @tiktrends/web bench:studios -- --plan                      # devis agrégé, aucun appel, aucune écriture
DATABASE_URL=postgres://…@127.0.0.1:5433/… STUDIOS_PROMPTS_RECETTE_LOCALE=1 \
  pnpm --filter @tiktrends/web bench:studios                               # campagne SIMULÉE (recette locale seulement)
pnpm --filter @tiktrends/web bench:studios -- --reel --budget-usd X        # RÉEL : refusé sans les trois conditions
pnpm --filter @tiktrends/web bench:studios -- --jeu                       # régénère le jeu synthétique et son manifeste
```

Options : `--cas F04,F17` (sélection), `--release <uuid>` (réel, release publiée), `--sortie <dossier>`. Codes
de sortie : 0 succès, 1 erreur, 2 refus, 3 devis non chiffrable.

**Pourquoi `apps/web/scripts/`** : la campagne exécute le registre RÉEL de l'application (`executerTache`, dépôt
des releases, barrière de dépense). Un outil sous `tools/` devrait réexporter ces modules serveur. Le script est
lancé par `tsx` (fourni par `@tiktrends/workers`, aucune dépendance ajoutée) ; `bench-studios-chargeur.mjs`
neutralise la garde de bundle `server-only` hors de Next, comme l'alias de `vitest.config.mts`.

## 3. Décisions et pourquoi

**Rubrique figée.** `lireBenchmark` compare chaque seuil de `qualityRubric` à `RUBRIQUE_REFERENCE` (5 dimensions
0-2, moyenne ≥ 8/10, 0 défaut critique accepté, 2 sorties par cas stochastique visuel, invariants 100 %) et refuse
tout écart, dans les deux sens (`RUBRIQUE_MODIFIEE`). Un changement passera par une décision écrite.

**Plan par cas** (`DEFINITIONS_CAS`). Étapes `tache` (registre), `media` (barème existant), `calcul` (moteur local,
0 $). L'ensemble des templates d'un plan est EXACTEMENT celui de `09-BENCHMARK.json` (`PLAN_TEMPLATES_DIVERGENTS`
sinon). Deux sorties pour les cas stochastiques visuels (F01, F02, F05, F14, F15, F20), une sinon. Choix notables :
F08 sans synthèse vocale (aucun tarif de voix, l'oracle porte sur le texte préparé) ; F24 sans génération musicale
(la musique vient du catalogue licencié) ; F19 tente d'abord la source de A (attendue bloquée) ; F20 compte deux
images clés et deux clips par sortie.

**Devis agrégé.** Un appel texte coûte au plus ses bornes (`bornes-taches.ts` : 24 000 jetons d'entrée, 4 000 de
sortie) au tarif du modèle ROUTÉ pour le profil du template (`MODEL_RATES`) : 0,132 $ avec `claude-sonnet-5`. Une
image 0,08 $, un clip 0,60 $ (`GRILLE_STUDIO`, dérivée de `FIXED_COSTS`). Montants en micro-dollars entiers. Un
profil non routé, un modèle absent de `MODEL_RATES`, un média sans tarif : ligne « non chiffrable », jamais 0 $,
et le devis agrégé est REFUSÉ (le chiffrage partiel des autres cas est affiché pour information, pas comme total).
Aujourd'hui `vision_analysis` n'est routé vers aucun modèle : **F01, F02, F07, F12, F13 et F15 ne sont pas
chiffrables, et le devis du benchmark complet est refusé.** Chiffrage partiel des 18 autres : 6,604 $.

**Oracles déterministes** (`ORACLES`, 51 invariants) : ils lisent ce qui s'est réellement passé (sorties validées
du registre, messages reçus par l'adaptateur, compteurs relus en base avant et après, pixels mesurés). `passe:
null` = non évaluable (étape non aboutie), jamais compté réussi. Exemples : F04 zéro job, devis, approbation,
média, crédit et version ; F05 aucun pixel hors masque changé (comparaison brute avant encodage) ; F06 largeur du
document ET largeur rendue mesurée par boîte englobante à 594 ± 1 px ; F09 plan 1 et audio identiques par
empreinte après application du patch ; F12 injection absente de tout message système et transmise en donnée
`untrusted_data` ; F16 bloqué `LIPSYNC_SANS_CAPACITE` avant appel ; F17 ≤ 12 et `count` = lignes ; F21 intention
`inspect`/`help`, aucune cible, aucune mutation ; F24 narration relue par empreinte après un vrai mixage.
F13 et F23 sont lexicaux (limite écrite dans le plan).

**Fiches humaines.** Huit cas portent une revue (F01, F02, F05, F14, F15, F18, F20, F23). La fiche naît VIDE :
cinq dimensions à `null` par sortie, aucun relecteur. Le code ne note jamais ; une fiche non remplie donne
`REVUE_HUMAINE_REQUISE`, pas une note.

**Verdict** : fiches illisibles ou invariant en échec → `NON_CONFORME` ; cas absent, bloqué ou non évaluable →
`INCOMPLET` ; fiche vide → `REVUE_HUMAINE_REQUISE` ; moyenne < 8 ou critique accepté → `NON_CONFORME` ; sinon
`CONFORME`. `approuvable` exige en plus le mode RÉEL et les 24 cas : une campagne simulée ou partielle ne l'est
jamais.

**Mode réel.** Refusé, avec TOUS les motifs, tant que : budget explicite lisible ; devis agrégé chiffrable et
budget ≥ devis ; budget ≤ reste du plafond `AI_SPEND_CAP_USD` (`spendStatus`, 30 jours glissants) ; approbation
ADMIN non consommée, non expirée, sur ce devis (empreinte), cette release (empreinte) et un budget ≥ celui demandé ;
release exécutable ; exécuteurs réels présents pour chaque profil du plan. Toutes ces lectures précèdent la
première écriture : un refus ne laisse aucune ligne. Puis l'approbation est consommée (verrou consultatif), chaque
tâche passe par `executerTache` avec `adaptateurAnthropicGarde` (barrière `guardedAnthropic`, trace PromptRun),
chaque média par `sousPlafond` autour de l'exécuteur injecté, et la campagne s'arrête AVANT l'appel dont le
plafond ferait dépasser le budget (`peutLancer`).

**Support de l'approbation (aucune migration).** Une évaluation de release `studio_prompt_evaluations`
(`kind = 'manual'`, `result.type = 'approbation_budget_benchmark'`), écrite sous `prompt.evaluate` (ADMIN « IA et
Studios », accès total d'équipe seulement) par une personne nommée, avec audit `prompt.benchmark.approuver_budget`.
Le devis est recalculé par le serveur, jamais reçu du client. Validité 24 h (politique, pas une mesure). Usage
unique : la campagne écrit `campagne_reelle_demarree` sous verrou avant tout appel. Le devis approuvé L3
(`studio_quotes`/`studio_approvals`) a été écarté : il exige un projet, une version et une marque, et son
approbation met un job en file ; le benchmark évalue une release de la plateforme.

**Rattachement.** Le rapport (même simulé) est joint à la release en `kind = 'benchmark'`. `passed` n'est vrai que
si `refusEvaluationReelle` ne trouve rien : rapport RÉEL, scellé (empreinte recalculée), conforme et approuvable,
sur cette release, dont toutes les traces relues en base sont non simulées et servies par cette release. Le
pointeur, le statut et `evaluation.benchmarkApprouve` ne sont JAMAIS touchés : aucune publication automatique.
Basculer `benchmarkApprouve` reste un geste ADMIN à créer (§7).

**Simulé.** Réservé à la recette locale (`STUDIOS_PROMPTS_RECETTE_LOCALE=1` et base 127.0.0.1/localhost) ; le
résolveur refuse de toute façon un adaptateur simulé ailleurs. Le script sème un espace, une marque et une personne
synthétiques (identifiants fixes) et publie, en environnement « test », une release du pack embarqué si aucune
n'est pointée. L'adaptateur simulé vit dans `lib/studios/benchmark/` (et non `test/`) parce que la commande l'exécute ;
il porte `simule: true`. Les connaissances publiées ne sont pas injectées (`connaissances: false`) : le benchmark
évalue les prompts, pas le contenu d'un espace.

## 4. Preuves

Campagne simulée complète au SHA du lot : `docs/studios-v2/benchmark/<horodatage>-SIMULE/` (24 dossiers,
`rapport.json`, `RAPPORT.md`). Chaque fichier porte `"mode": "SIMULÉ"` et la bannière. Résultat : 18 cas exécutés,
tous leurs invariants passés ; 6 cas bloqués avant appel (vision), dits tels, aucun invariant en échec ; 48/51
invariants passés, 3 non évaluables ; 8 fiches vierges ; dépense 0 $ ; verdict `INCOMPLET`, approuvable non,
évaluation réelle non ; rapport joint à la release locale avec `passed = false` et les refus `RAPPORT_SIMULE`,
`VERDICT_NON_CONFORME`, `TRACES_SIMULEES`.

| Garde | Ce qui est lu |
| --- | --- |
| `fc-benchmark` (core, 39) | lecture du vrai fichier, rubrique, plans, devis (bornes, somme exacte, non chiffrable), oracles, verdict, garde du réel, rapport, pixels |
| `fc-campagne-db` (12) | campagne simulée sur pglite : 24 dossiers et leurs fichiers, marquage, traces PromptRun, rattachement, rapport maquillé, oracles cassés |
| `fc-reel-db` (14) | chaque refus du réel : 0 appel, 0 ligne dans 7 tables, 0 dossier ; contrôle positif ; usage unique séquentiel et CONCURRENT ; arrêt sur budget ; médias sous `sousPlafond` |
| `fc-jeu-synthetique` (3) | empreintes de contenu régénérées, fichiers commités, droits |
| `fc-commande` (6) | garde des arguments, `--plan` sans client de base |

Mutations (garde cassée volontairement, échec constaté, code restauré) :

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M01 cas non chiffrable ignoré dans l'agrégat | `fc-benchmark` | `expected { ok: true, …(3) } to match object { ok: false, nonChiffrables: [ …(2) ] }` |
| M02 modèle sans tarif compté 0 $ | `fc-benchmark` | `expected { ok: true, …(3) } to match object { ok: false, nonChiffrables: [ …(2) ] }` |
| M03 rubrique assouplie acceptée | `fc-benchmark` | `minimumMean=7 accepté: expected true to be false` |
| M04 plan aux templates divergents toléré | `fc-benchmark` | `expected { Object (ok, plan) } to match object { ok: false, constats: [ …(1) ] }` |
| M05 campagne simulée approuvable | `fc-benchmark` | `expected { mode: 'simule', …(11) } to match object { statut: 'CONFORME', …(2) }` |
| M06 budget < devis accepté | `fc-reel-db` | `la campagne réelle aurait dû être refusée: expected true to be false` |
| M07 reste du plafond ignoré | `fc-reel-db` | `la campagne réelle aurait dû être refusée: expected true to be false` |
| M08 approbation absente tolérée | `fc-reel-db` | `expected [] to deeply equal [ 'APPROBATION_ABSENTE' ]` |
| M09 arrêt sur budget retiré | `fc-reel-db` | `expected [ 'studio-prompt:jarvis.route', …(3) ] to have a length of 2 but got 4` |
| M10 consommation sans contrôle en transaction | `fc-reel-db` (concurrence) | `expected [ true, true ] to deeply equal [ false, true ]` |
| M11 médias réels hors `sousPlafond` | `fc-reel-db` | `expected [] to deeply equal [ [ 'fal', 'fal_image', 0.08 ], …(1) ]` |
| M12 rapport simulé accepté comme réel | `fc-campagne-db` | `expected { ok: true, …(3) } to match object { ok: true, evaluationReelle: false }` |
| M13 traces simulées non relues | `fc-campagne-db` | `expected { ok: true, …(3) } to match object { ok: true, evaluationReelle: false }` |
| M14 marquage SIMULÉ écrasé dans la fiche | `fc-campagne-db` | `F01/fiche-revue.json: expected 'simule' to be 'SIMULÉ'` |
| M15 oracle F21 toujours vrai | `fc-campagne-db` | `expected { …(4) } to match object { passe: false }` |
| M16 oracle F05 tolère 1 px hors masque | `fc-campagne-db` | `expected { id: 'F05.hors_masque_intact', …(3) } to match object { passe: false }` |
| M17 mixage F24 qui écrase la narration | `fc-campagne-db` | `F24: expected [ [ 'F24.instrumental', true ], …(3) ] to deeply equal …` |
| M18 composition F01 qui retouche le calque | `fc-campagne-db` | `F01: expected true to be false` |
| M19 simulé hors recette locale (programme) | `fc-campagne-db` | `Préparation d’une release réservée à la recette locale (environnement « test »).` |
| M20 simulé hors recette locale (commande) | `fc-commande` | `expected { ok: true, mode: 'simule', …(2) } to match object { Object (ok, raison) }` |
| M21 un pixel du jeu changé | `fc-jeu-synthetique` | `f01-lunettes-bleues: expected '2dae10a7…' to be 'eed502da…'` |

M10 a d'abord SURVÉCU : le second lancement séquentiel était déjà refusé par la lecture de l'approbation. Un test
de deux lancements simultanés a été ajouté ; la mutation tombe. M14 était un vrai défaut, trouvé par la garde au
premier passage (la fiche écrasait le marquage), corrigé avant commit.

## 5. Limites

- **Vision non routée** : 6 cas non chiffrables et bloqués ; le benchmark complet ne peut pas partir en réel tant
  que `vision_analysis` n'a pas de fournisseur (et que les médias produits ne sont pas joints comme `mediaBindings`
  aux contrôles `quality.visual`, ce que la campagne ne fait pas encore).
- **Release `staged`** : `executerTache` n'exécute qu'une release publiée (`RELEASE_NON_PUBLIEE`). Or la production
  exige un benchmark approuvé pour publier. En réel, la campagne vise donc une release publiée (pointeur ou
  `--release`) ; évaluer une release `staged` demande un mode évaluation dans le résolveur (§7).
- **Médias réels** : aucun exécuteur branché (lot F-A en parallèle, non importé). Tout plan qui génère est refusé
  en réel (`EXECUTEUR_NON_BRANCHE`).
- **Documents résolus** : briefs et concepts sont des documents `Fact` fixes du jeu (seuls `Shot`, `Style`, `Fact`,
  `Reference` ont un validateur) ; la sortie d'une étape n'alimente pas l'entrée de la suivante, sauf la consigne
  transmise à l'exécuteur média.
- **Concurrence** : prouvée sur pglite (transactions sérialisées) ; le verrou consultatif n'a pas été éprouvé sur
  deux connexions Postgres réelles.
- Les sorties simulées ne disent rien de la qualité : elles prouvent la chaîne.

## 6. Vérifier

Portes depuis `product/` : `pnpm -w run typecheck && pnpm -w run lint && pnpm -w run test && pnpm -w run build`.
Campagne : commande du §2 sur une base locale, puis comparer le dossier produit à celui commité (mêmes statuts et
invariants ; identifiants de release et horodatage différents). Restaurer la base ensuite.

## 7. Besoins hors périmètre (l'intégrateur tranche)

1. **Écran ADMIN** : brancher `devisBenchmarkAction` et `approuverBudgetBenchmarkAction`
   (`lib/studios/benchmark/actions.ts`) dans l'onglet Évaluations de `app/(app)/admin/ia-studios/` (devis affiché
   avant le clic, budget, motif, confirmation), et y lister les évaluations `kind = 'benchmark'`.
2. **Geste « benchmark approuvé »** : une commande ADMIN qui pose `evaluation.benchmarkApprouve = true` sur une
   release `staged` à partir d'une évaluation `benchmark` `passed = true` ET des fiches humaines remplies
   (`depot-prompts.ts`). Ce lot ne la crée pas : aucune publication ne doit découler d'un rapport sans décision humaine.
3. **Mode évaluation du résolveur** : `executerTache` doit accepter une release `staged` résolue par
   `resoudreReleaseEvaluation` (budget d'évaluation séparé), sans quoi aucune release initiale ne peut être
   benchmarkée en production (`lib/studios/prompts/resolveur.ts`).
4. **Routage vision** : un adaptateur `vision_analysis` sous la barrière, avec pièces jointes natives, rend F01,
   F02, F07, F12, F13, F15 chiffrables et exécutables.
5. **Exécuteur média F-A** : implémenter `ExecuteurMedias` (`campagne.ts`) avec `studios-fal.ts` et le passer à
   `lancerCampagneReelle` dans `scripts/bench-studios.ts` ; ne PAS reposer `sousPlafond` dans l'exécuteur (la
   campagne l'appelle déjà, double comptage sinon).
6. `docs/studios-v2/PROGRESS.json` : UX-07 reste `NON_EXECUTE` (aucune campagne réelle).
