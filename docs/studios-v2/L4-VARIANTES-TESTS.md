# L4-C · Variantes, tests et apprentissage

Lot L4-C du chantier Studios v1.0. Base : `claude/studios-base-vague3` (`119d2bf`). Chemins relatifs à `product/`.
Ce document dit **ce qui est tranché, pourquoi, et comment le vérifier**. Il ne décrit aucun état de production.
Aucune migration, aucun appel réseau, aucune dépense : lots produits par le worker L3 avec fournisseur et stockage
SIMULÉS, relecture IA par un adaptateur SIMULÉ réservé aux tests.

## 1. Ce que L4-C livre

| Livrable | Où |
| --- | --- |
| Règles pures (identité d'une variante, admissibilité, saisie du test, unicité, isolation, registre, lecture du résultat, arbitrage modèle/règle, brief d'itération, coût annoncé, vue) | `packages/core/src/studios/variantes/` (une ligne en fin de `packages/core/src/index.ts`) |
| Commandes serveur | `apps/web/lib/studios/variantes/{commun,variantes,tests,apprentissage,acces}.ts` |
| Actions | `apps/web/app/actions/studios/variantes.ts` (`listerVariantes`, `filiationVariante`, `creerVariante`, `iterer`), `apps/web/app/actions/studios/tests.ts` (`rattacherVarianteAuTest`, `lireApprentissage`, `relireApprentissage`) |
| Écran autonome | `apps/web/components/studios/VariantesEtTests.tsx` (serveur, prend `projectId`) + `components/studios/variantes/{PanneauVariantes,FormulaireTest,styles}` |
| Page de recette | `apps/web/app/(app)/studio/recette-variantes/` (refusée en production, voir §5) |
| Tests | `packages/core/test/l4c-variantes.test.ts`, `apps/web/test/l4c-{variantes-db,relecture-db,rendu}.test.ts(x)`, `l4c-concurrence-pg.test.ts` (Postgres réel), harnais `l4c-harnais.ts`, semis de recette `l4c-semis-recette.test.ts` |

## 2. Où vit chaque objet (aucun objet de test nouveau)

| Objet logique (cahier §7, §4.8) | Stockage | Pourquoi |
| --- | --- | --- |
| Variante | `studio_variants` (L1) : média PRÉCIS (`media_asset_id`), version DU JOB, parente, libellé « Image 3 du lot 4 », hypothèse et variable du brief | Un média par variante ; la version est celle de l'instantané du job (FLOW-07) |
| Test | **`adsmap_ads` existant** (hypothèse, variable, valeur, offre, page, `source_ref_json`), créé en `draft` ou relu | On réutilise la fiche Adsmap, son verdict (`adsmap_verdicts`), ses itérations (`adsmap_iteration_edges`) ; aucun second modèle de test |
| Lien variante ↔ test | `studio_test_links` (L1, une ad = une variante en base) | Clé étrangère réelle, fin du double lien jsonb |
| Objectif, protocole, période, métrique, isolation ; filiation des itérations | `studio_projects.test_refs` (registre du projet, entrées `type: 'test'` et `type: 'iteration'`) | Champs que l'ad n'a pas ; les entrées d'une autre forme sont conservées telles quelles |
| Identité exacte dans Adsmap | `adsmap_ads.source_ref_json` = `{studioVariantId, studioProjectId, projectVersionId, mediaAssetId, sha256, jobId, operation, position, lot, libelle, parentVariantId, promptReleaseId}` | « image 3 du lot 4 et sa filiation, pas seulement un identifiant de génération » (FLOW-08). Les lecteurs existants ne lisent que `generationId`, absent ici |
| Résultat | `adsmap_verdicts` (moteur Adsmap existant) | Le minimum d'effectif et l'intervalle sont ceux d'Adsmap |
| Relecture IA | `studio_prompt_runs` (trace L2) + `studio_audit_events` `learning.review` (ajout seul) | Aucune connaissance ni prompt global modifié ; la relecture reste une lecture |

## 3. Commandes

| Commande | Permission | Effet |
| --- | --- | --- |
| `listerVariantes`, `filiationVariante`, `lireApprentissage` | `studio.read` | LECTURE PURE (prouvé : aucune ligne, aucun audit écrit) |
| `creerVariante` | `studio.propose` | Média stocké d'un job `completed` du projet, non écarté (accepté OU à relire). Verrou du média, idempotente. Parente : donnée, sinon celle de l'itération qui a créé la version du lot. Audit `variant.create` |
| `rattacherVarianteAuTest` (`linkVariantToTest`) | `studio.propose` + accès Adsmap (offre Plus, `FEATURES` existant) | Projet puis variante verrouillés ; double clic ⇒ même lien. Fiche désignée : relue dans la marque (par le graphe), champs vides complétés, désaccord refusé. Sinon fiche `draft` : graphe « À qualifier » (même logique que `lib/adsmap-path.ts`), concept du projet ou de la parente, code `v<n>` ou `<parent>-i<n>`, arête d'itération seulement si `checkIteration` l'autorise. Registre `test` + audit |
| `relireApprentissage` | `studio.propose` | Tâche `learning.review` par `executerTache` (release, traces, barrière de dépense). Coût maximal recalculé et comparé au coût annoncé avant le clic. Sans fournisseur ou sans release : refus honnête, lecture pure rendue, aucun appel. La règle pure prime |
| `iterer` | `studio.propose` | Nouvelle version (n+1) dont la parente est la version DE LA VARIANTE ; brief copié (faits et sources, références, hypothèse) avec la variable gardée ou la suivante ; devient courante. Base périmée ⇒ 409 avec le diff. Aucun devis, aucun job |

Hors portée ⇒ `NOT_FOUND` neutre (message et cibles forcés). Geste non permis ⇒ `FORBIDDEN`.

## 4. Décisions et pourquoi

**Nom d'une variante.** Position dans l'ordre des lignes du DEVIS (pas l'ordre alphabétique), rang du lot parmi TOUS
les jobs du projet par date de création : un lot plus récent ne renumérote jamais les anciens.

**Isolation.** Champs créatifs comparés entre la version de la parente et celle de l'enfant : `brief.{composition,
styleIntent, texts, formats, references, audience, exclusions}`, puis `productRef, styleRef, characterRefs, shots,
document, timeline`. Un champ ⇒ le test isole ; plusieurs ⇒ il ne PRÉTEND PAS isoler (dit à l'écran, conservé au
registre) ; aucun ⇒ l'écart viendrait du tirage. La variable déclarée et l'hypothèse ne sont pas des champs créatifs.

**Lecture du résultat (règles Adsmap réutilisées).** Verdict Adsmap (`validated ?? computed`), ramené par
`verdictEffectif` ; `inconclusive`/`insufficient_delivery` ⇒ « inconclusif · données insuffisantes » (les seuils du
moteur Adsmap sont le minimum d'effectif) ; non comparable ⇒ inconclusif ; variable non isolée ⇒ inconclusif. La
RÉFÉRENCE est la parente quand il y en a une : sans verdict comparable, inconclusif ; même niveau, inconclusif ;
sinon soutenue ou non. Sans parente : les seuils de la marque. Variable suivante : `proposeIterations` ; la même tant
que rien n'est tranché. Toujours la phrase « une association, pas une preuve de cause ».

**Relecture IA.** `arbitrerRelecture` : le modèle peut être plus prudent, jamais plus affirmatif que la règle ; un
désaccord donne « inconclusif ». La variable du brief suivant reste celle des règles. Coût annoncé : budget du
résolveur (24 000 jetons d'entrée, 4 000 de sortie) au tarif du modèle servi, arrondi au centime supérieur (0,14 $
pour `claude-sonnet-5`), « sur le plafond IA, aucun crédit ». Le registre de prompts ne connaît que les schémas
`Shot`, `Style`, `Fact`, `Reference` pour les documents résolus : test, hypothèse et mesure partent comme faits
typés (déclaré, hypothèse, mesuré).

**Itération.** La version enfant a pour parente la version de la variante (la vraie branche, même ancienne) ; elle
devient courante parce qu'elle est le brief sur lequel on travaille, sous contrôle de la version de base (409
sinon). Le registre garde `parentVariantId` : le lot suivant de cette version hérite de la parente sans la redemander.

**Concurrence.** `studio_variants` n'a pas d'unicité sur le média : la ligne du média est verrouillée avant la
recherche (READ COMMITTED). Rattachement : projet puis variante verrouillés (même ordre que `iterer`) ; deux variantes
vers une même fiche : `studio_test_links_ad_uq` tranche, le perdant reçoit `INVARIANT_CONFLICT`.

## 5. Écran

`VariantesEtTests({ projectId })` (serveur) : garde, lecture pure, refus neutres. `PanneauVariantes` (client) ne
décide rien : la vue vient de `vueVariantes` (noyau). Variantes avec version (courante ou antérieure), parente, média
exact (empreinte, dimensions, cadre aux proportions), statut TECHNIQUE et statut QUALITÉ séparés (pas de statut qualité
sur un lot non enregistré), comparaison à la parente, test (objectif, variable, protocole, période, métrique, verdict,
lien `/adsmap?ad=…&depuis=studio`), lecture « Inconclusif » dite comme telle, relecture IA (bouton seulement si
disponible, coût sur le bouton ; sinon la raison), « Itérer · nouveau brief, sans génération ». Sorties par version et
par lot avec « Choisir comme variante ». États : vide, premier usage, partiel, rempli, génération active, chargement
(bouton occupé), hors ligne, erreur récupérable (saisies conservées, identifiant support), lecture seule, quota,
conflit de version, résultat périmé (branche antérieure), échec qualité (écartée). Cibles 44 px, champs 16 px, labels
persistants, statut porté par un mot.

Aucun aperçu de pixels : aucune route ne sert encore `studio_assets` (besoin §8).

Page de recette `/studio/recette-variantes?projet=<id>[&etat=formulaire|erreur|hors-ligne|conflit|quota&variante=<id>]` :
`notFound()` en production, sauf drapeau `STUDIOS_RECETTE_PAGES=1` ET base locale (même règle que
`environnementPrompts`), pour pouvoir capturer un build `next start`.

## 6. Preuves

Recette : FLOW-08 (`l4c-variantes-db` « choisir l'image 3 du lot 4… »), FLOW-07 (« lot lancé sur v1, brief modifié
(v2) pendant la génération… »), FLOW-09 (verdict `inconclusive` ⇒ inconclusif ; relecture sans release ; itérer ;
lot suivant qui hérite), FLOW-01 contribution (hypothèse, variable et sources du brief sur la variante et sa
filiation), SEC-02 (membre restreint à A1 et autre espace ⇒ `NOT_FOUND` sur toutes les commandes, rien écrit).
Idempotence réelle : `L4C_PG_URL=postgres://postgres@127.0.0.1:5433/<base> pnpm exec vitest run
test/l4c-concurrence-pg.test.ts` (deux connexions, `pg_backend_pid` distincts, 10 manches). Restaurer la base ensuite.

Mutations (chaque garde cassée, échec constaté, code restauré) :

| Mutation | Garde | Phrase d'échec |
| --- | --- | --- |
| Ordre des lignes du devis ignoré | `l4c-variantes` | `expected [ '1:A', '2:M', '3:Z' ] to deeply equal [ '1:Z', '2:M', '3:A' ]` |
| Version courante au lieu de celle du job | `l4c-variantes-db` FLOW-07 | `expected '<v2>' to be '<v1>'` |
| Média écarté admis | `l4c-variantes`, `l4c-variantes-db` | `expected false to be 'QUALITY_REVIEW_REQUIRED'` |
| Plusieurs champs comptés comme isolés | `l4c-variantes`, `l4c-variantes-db` | `expected { statut: 'isole', … } to match object { statut: 'plusieurs', … }` |
| Données insuffisantes non détectées | `l4c-variantes`, `l4c-variantes-db` | `les seuils Adsmap (minimum d'effectif) tranchent avant tout le reste: expected 'meme_niveau' to be 'donnees_insuffisantes'` |
| Le modèle conclut malgré la règle | `l4c-variantes`, `l4c-relecture-db` | `expected { conclusion: 'inconclusif', …(2) } to match object { conclusion: 'inconclusif', …(2) }` (écart attendu absent) |
| Brief enfant sans les sources | `l4c-variantes`, `l4c-variantes-db` | `expected [] to deeply equal [ 'src_veille_1', 'src_veille_2' ]` |
| Parente sans résultat ignorée | `l4c-variantes` | `expected { conclusion: 'soutenue', … } to match object { conclusion: 'inconclusif', … }` |
| Verrou du média retiré | `l4c-concurrence-pg` | `manche 0: expected 'false/2/false,false/…' to be 'true/1/false,true/…'` |
| Verrous projet/variante retirés | `l4c-concurrence-pg` | `manche 0: expected 'true/1/false,true/false/2/2/2/…' to be '…/true/1/1/1/…'` |
| Fiche Adsmap sans l'image exacte | `l4c-variantes-db` FLOW-08 | `expected { …(8) } to match object { …(10) }` |
| Portée de marque ignorée (SQL et revérification) | `l4c-variantes-db` SEC-02 | `expected false to deeply equal [ Array(3) ]` |
| Coût annoncé non revérifié | `l4c-relecture-db` | `expected false to be 'VERSION_CONFLICT'` |
| Base périmée acceptée | `l4c-variantes-db` | `expected false to be 'VERSION_CONFLICT'` |
| Parente par itération oubliée | `l4c-variantes-db` | `expected { …(13) } to match object { …(2) }` |
| Rangement toujours « courant » | `l4c-variantes`, `l4c-rendu` | `expected '…' to contain 'Version 1 · antérieure'` |
| Arête d'itération sans `checkIteration` | `l4c-variantes-db` | `expected true to be false` |
| Accès Adsmap non vérifié | `l4c-variantes-db` | `expected false to deeply equal [ 'FORBIDDEN', … ]` |
| Recette ouverte en production | `l4c-rendu` | `expected true to be false` |
| « Inconclusif » non affiché | `l4c-rendu` | `expected '<section…' to contain 'data-lecture="inconclusif"'` |
| Bouton payant sans release | `l4c-rendu` | `… not to contain 'Relire avec l'IA'` |
| Statut qualité fondu dans le technique | `l4c-rendu` | `expected 'data-variante="…' to contain 'Qualité · À relire'` |

Premier passage : TROIS mutations restaient vertes (ordre alphabétique égal à l'ordre du devis dans le jeu de test ;
motif non lu car un autre chemin rendait aussi « inconclusif » ; écart de relecture non vérifié) et une quatrième
(statut qualité lu sur toute la page, les lots le portaient encore). Gardes renforcées, puis les quatre sont tombées.
La portée est une double garde : retirer seulement le filtre SQL laisse la revérification pure refuser (voulu).

## 7. Limites

- Pas d'aperçu des pixels (aucune route de lecture des médias studio). Le fournisseur simulé livre le même PNG 8×8
  pour chaque sortie : identifiants distincts, empreinte identique (propriété du simulateur, pas du code).
- Résultats saisis manuellement (cahier §4.8) non implémentés : seuls les verdicts Adsmap existants sont lus.
- Pas de liste des fiches Adsmap existantes dans le formulaire : l'action accepte `adsmapAdId`, l'écran crée la fiche.
- `l4c-concurrence-pg` et `l4c-semis-recette` sont ignorés en CI (pas de Postgres).

## 8. Besoins hors périmètre (l'intégrateur tranche)

1. Navigation · `test/navigation.test.ts` échoue tant que `/studio/recette-variantes` n'a pas son entrée dans
   `lib/navigation.ts` (ou retirer la page de recette après montage dans la page projet L4-B).
2. Page projet (L4-B) · monter `<VariantesEtTests projectId={…} />` (composant serveur) dans la page projet.
3. Migration · unicité `studio_variants (media_asset_id)` (aujourd'hui garantie par verrou), et, si l'on veut
   l'interroger en SQL, une colonne `job_id` sur `studio_variants` (aujourd'hui retrouvé par `result.assets`).
4. `lib/adsmap-path.ts` · `ensureGraphPath` et `nextVariant` acceptent un exécuteur (transaction) : L4-C en recopie la
   logique dans `tests.ts` pour rester transactionnel.
5. `lib/studios/depot.ts` · exporter `porteeSql`/`horsPortee` (recopiés, comme L3).
6. Registre de prompts · schémas `Test` et `MetricSnapshot` pour les documents résolus de `learning.review`
   (aujourd'hui rendus en `Fact`).
7. Route de lecture des médias studio (`studio_assets` → URL signée courte) pour les vignettes.
8. `studio_projects.test_refs` · forme écrite ici (`type: 'test' | 'iteration'`) à confirmer avec L4-B s'il y écrit.
