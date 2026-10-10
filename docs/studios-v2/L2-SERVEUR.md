# L2 · Registre de prompts · intégration serveur et ADMIN

Lot L2, partie SERVEUR : le noyau pur (`L2-REGISTRE.md`) branché aux tables L1 (`L1-MODELE.md`), au
PromptResolver unique, à Jarvis et à l'ADMIN « IA et Studios ». Chemins relatifs à `product/apps/web/`
sauf mention. Ce document dit ce qui est tranché, pourquoi, et comment le vérifier. Il ne décrit aucun
état de déploiement : pour savoir si une release est active, lire `studio_prompt_active` en base.

Aucun appel modèle réel, aucune dépense, aucune migration.

## 1. Ce que livre le lot

| Livrable | Où |
| --- | --- |
| Point d'entrée serveur du noyau | `lib/studios/prompts/noyau.ts` |
| Copie embarquée du pack | `lib/studios/prompts/pack-embarque.ts` (générée), `lib/studios/prompts/source.ts` |
| Complément TikTrends (politique de conversation Jarvis) | `lib/studios/prompts/complement-tiktrends.ts`, `lib/studios/prompts/conversation.ts` |
| Correspondance noyau ↔ tables | `lib/studios/prompts/correspondance.ts` |
| Dépôt du registre (import, versions, releases, évaluation, pointeur, audit) | `lib/studios/prompts/depot-prompts.ts` |
| Environnement (règle de production, drapeau de recette) | `lib/studios/prompts/environnement.ts` |
| PromptResolver, ContextResolver, adaptateur, traces | `lib/studios/prompts/{resolveur,contexte,adaptateur,traces}.ts` |
| Garde plateforme | `lib/studios/prompts/garde-prompts.ts` |
| Vues des écrans (champs, diff, variables) | `lib/studios/prompts/vue.ts` |
| Commandes ADMIN | `app/actions/studios/prompts.ts` |
| Écrans ADMIN | `app/(app)/admin/ia-studios/{page.tsx,Ecrans.tsx,Commandes.tsx,donnees.ts}` |
| Script d'import | `scripts/importer-pack-prompts.ts` |
| Route Jarvis branchée | `app/api/jarvis/chat/route.ts` |
| Tests | `test/l2-*.test.ts(x)` (75 tests + 2 sur Postgres réel), `test/l2-outils.ts`, `test/l2-adaptateur-simule.ts` |

Fichiers existants touchés : `app/api/jarvis/chat/route.ts` (branchement), `app/(app)/admin/page.tsx` (une
carte), `app/(app)/admin/connaissances/page.tsx` (un lien), et une ligne de semis dans
`test/lot19b-route-jarvis.test.ts` et `test/lot19b-m55-droits-jarvis.test.tsx` (la route exige désormais une
release publiée ; voir §10).

## 2. Point d'entrée serveur du noyau

`packages/core/src/prompts/*` n'est pas réexporté par `@tiktrends/core` : `index.ts` est importé par des
composants client, et `contrats.ts` tire Ajv (génération de code par `new Function`). Le serveur l'importe
par chemin profond (`@tiktrends/core/src/prompts/<module>`), **dans `lib/studios/prompts/noyau.ts`
seulement**. Gardes : `l2-regles-pures` échoue si un autre fichier importe ce chemin, ou si un fichier
`'use client'` importe `lib/studios/prompts/`. Vérifié au build : aucun texte du pack ni Ajv dans
`.next/static`.

`noyau.ts` n'importe pas `server-only` : le script d'import (tsx, hors Next) le charge. La frontière client
est tenue par la garde ci-dessus.

## 3. Source du pack : copie embarquée

L'image Docker est construite depuis `product/` (contexte `Dockerfile.web`), qui ne contient pas `docs/`.
Lire `docs/studios-v2/02-PROMPTS.json` à l'exécution échouerait en production. Mécanisme retenu :

- `scripts/importer-pack-prompts.ts`, mode `IMPORTER_PACK_MODE=embarquer`, recopie octet pour octet
  `02-PROMPTS.json`, `03-CONTRATS.schema.json`, `08-EXEMPLES-CONTRATS.json`, `09-BENCHMARK.json` et les
  identifiants de `04-RECETTE.csv` dans `lib/studios/prompts/pack-embarque.ts` (chaînes JSON + SHA-256).
- `source.ts` relit le TEXTE par `lirePackTexte` (clés dupliquées refusées avant le parse), valide avec les
  `$defs` du schéma et les cas de recette/benchmark, compile le schéma une fois (Ajv) pour le processus.
- Garde de dérive : `l2-regles-pures` compare chaque texte embarqué au fichier de `docs/studios-v2/` et le
  module entier à ce que le script produirait. Une correction du pack source sans régénération fait
  échouer la CI avec la commande à lancer.

## 4. Correspondance noyau ↔ tables L1

| Écart | Décision |
| --- | --- |
| Version « X.Y.Z » (noyau) / `version integer` (table) | X·1 000 000 + Y·1 000 + Z, composantes 0 à 999, X ≤ 2146. Injectif et croissant (testé). |
| Types du noyau (template, recette, socle, rendu) / `kind` (`template`, `style_recipe`, `common`) | socle = `common` clé `commonSystemInstructions` (contenu `{ commonSystemInstructions }`, empreinte = SHA-256 du texte), rendu = `common` clé `rendering`, politique de conversation = `common` clé `jarvis.conversation`. |
| Statut du contenu | Le champ `status` du CONTENU reste `draft` (il entre dans l'empreinte du pack) ; le cycle de vie est la colonne `status`. |
| Release | `entries` = `{ templates, recettes, socle, rendu, conversations, packHash }`. `packHash` = `empreinteRelease` du noyau. `release_hash` = `packHash` sans politique de conversation, sinon SHA-256 du JSON canonique `{ packHash, conversations }`. Une phrase de Jarvis modifiée change donc l'empreinte de release (testé). |
| Évaluation | `evaluation` jsonb `{ releaseHash (complète), testsStructurels, benchmarkApprouve, evaluationId, evalueeLe }`, transmise au noyau exprimée sur `packHash` seulement si elle vise exactement la ligne. |
| Révocation de sécurité | Aucune colonne : non implémentée ici (voir §11). |

## 5. Import, versions, releases

- **Import** (`importerPack`, script, bouton « Importer en brouillon ») : `prompt.draft`, une transaction,
  `pg_advisory_xact_lock` (deux imports simultanés se mettent en file), plan du noyau (`planifierImport`)
  étendu à la politique de conversation, puis insertion des brouillons et UN événement d'audit
  `prompt.import` (portée plateforme : `workspace_id` et `brand_id` nuls). Second passage : rien créé, rien
  écrit. Même (type, clé, version) avec une autre empreinte : rien écrit du tout.
  Script : sans `DATABASE_URL` refus ; sans `IMPORTER_PACK_CONFIRM=oui-importer-le-pack-en-brouillon` plan
  seul ; rejouable.
- **Brouillon** : champs éditables par type, jamais un champ de contrat (`CHAMPS_EDITABLES` : template
  `title`, `taskInstructions`, `userTemplate` ; recette `title`, `material`, `lighting`, `composition`,
  `invariants`, `forbiddenTransfers` ; socle ; politique `title` et sections ; rendu aucun). Base brouillon :
  mise à jour en place par compare-and-set sur l'empreinte. Base validée : nouvelle version de numéro
  supérieur (`controlerNouvelleVersion`). Motif obligatoire, audit `prompt.version.brouillon`.
- **Validation** : contrôles structurels = `validerPack` sur le pack embarqué où la version remplace son
  homologue (mêmes règles que l'import, aucune duplication), ou `validerPolitiqueConversation`. Puis
  `transitionVersion`, ligne d'évaluation `structural` sur la version, audit. Figée ensuite par le
  déclencheur L1.
- **Release** : par défaut la dernière version VALIDÉE de chaque clé, remplaçable par clé. Pré-contrôle de
  contenu par `controlerPublication` (validées, empreintes, variables, contrats consommateurs) et contrôle
  des politiques de conversation : une release incompatible n'est même pas créée (PROMPT-09). Idempotente
  sur l'empreinte complète.
- **Évaluation** (`prompt.evaluate`, release `staged` exacte, données synthétiques, 0 $) : contenu, politique
  serveur, exemples de `08-EXEMPLES` (entrée valide acceptée, sorties ready et blocked acceptées, sortie et
  entrée invalides rejetées) pour chaque template, assemblage de la politique Jarvis sur 12 combinaisons.
  Les cas F01-F24 qui touchent la release sont rendus « non exécutés · budget requis ». Écrit
  `studio_prompt_evaluations` et `evaluation` ; le pointeur n'est jamais touché.
- **Publication / rollback** : ligne du pointeur verrouillée (`FOR UPDATE`), règle du noyau
  (`publierRelease` / `rollbackRelease`) avec la release attendue, puis compare-and-set
  (`row_version` ET `release_id` attendue). Double protection éprouvée : retirer l'une des deux ne laisse
  rien passer, retirer les deux fait passer deux publications (mutation M05b). Rollback = pointeur seul.
  Retirer la release pointée est refusé.

### Permissions (cahier §8.1)

| Geste | Permission logique |
| --- | --- |
| Lire l'ADMIN « IA et Studios » | `prompt.read` |
| Importer, brouillon, valider, créer une release | `prompt.draft` |
| Évaluer | `prompt.evaluate` |
| Publier, retirer une release | `prompt.publish` |
| Revenir à une release | `prompt.rollback` |
| Traces d'exécution | `run.inspect_redacted` |

Calculées par `permissionsStudio` (L1) depuis les droits existants : seul l'accès total d'équipe
(adminplus, admin d'équipe, fondateur) les porte. Owner ou admin d'espace, membre, lecteur, manager
d'équipe : aucune (SEC-09, prouvé au résultat en base par `l2-releases-db` et `l2-admin-rendu`).

### Règle de production et recette locale

`environnementPrompts(env)` : `production` par défaut. `test` seulement si
`STUDIOS_PROMPTS_RECETTE_LOCALE=1` ET hôte de `DATABASE_URL` ∈ {127.0.0.1, localhost, ::1}. La base de
production est jointe par le nom de service `db` : le drapeau n'y vaut rien. En production, une release
sans benchmark approuvé sur son empreinte ne se publie pas (`BENCHMARK_NON_APPROUVE`), ni ne reprend le
pointeur par rollback. Aucune commande de ce lot n'approuve un benchmark.

## 6. PromptResolver unique

`lib/studios/prompts/resolveur.ts`, sans aucun texte de prompt :

1. Release : épinglée au devis/job (`releaseDuJob`) si fournie, sinon le pointeur global. Aucune : erreur
   `RELEASE_ACTIVE_ABSENTE`, aucun repli.
2. `resoudreTemplate` (overrides fermés : le pack ne déclare aucun champ extensible).
3. ContextResolver (`contexte.ts`) : connaissances PUBLIÉES et applicables relues à chaque résolution
   (`versionsApplicables` sur le stockage existant), sources fournies marquées `untrusted_data` et
   ajoutées aux sources autorisées ; le reste vient de l'appelant, sans valeur par défaut.
4. `allouerContexte` (24 000 jetons dont 4 000 réservés par défaut ; blocage chiffré sinon).
5. `compilerRequete` (validateur de documents par `$defs`, capacités, mode sans texte).
6. Adaptateur injectable : `adaptateurAnthropicGarde` (via `guardedAnthropic`, plafond et `ai_spend`
   imputé à l'espace) en production ; simulé dans `test/` seulement, refusé hors environnement de test
   (`ADAPTATEUR_SIMULE_INTERDIT`). Profils non routés dans ce lot : bloqué `UNSUPPORTED_CAPABILITY`.
7. `evaluerSortie` avec réparation 0 (aucun template de réparation au registre, `L2-REGISTRE.md` écart 3).
8. `studio_prompt_runs` à chaque tentative résolue (`succeeded`, `failed`, `blocked`).

`epinglerDevis()` rend la release que le pointeur désigne à l'instant du devis (L3 l'écrira dans
`studio_quotes.prompt_release_id`).

## 7. Traces (PROMPT-10)

Une trace garde : release et empreinte complète, `packHash`, template/version/`contentHash` (ou politique
et version), politique serveur, `compiledHash`, `contextSnapshotHash`, `taskInputsHash`, couches de
résolution, rapport de budget, sources retenues (type, id, version, titre), modèle, adaptateur, simulé ou
non, latence, coût en micro-dollars, jetons, codes de refus, épinglage. Elle ne garde ni le texte compilé,
ni la demande, ni la réponse, ni un secret : leurs empreintes seulement. Une source se retrouve par son
id et sa version (connaissances et versions du registre sont immuables par version). `expurgerRun`
(liste blanche) est la seule vue montrée en ADMIN ; l'utilisateur ne voit que le nom des sources utiles
(`nomsSourcesUtiles` ; pour Jarvis, l'écran existant `JarvisContexte` et `titresDesSources`).

## 8. Jarvis branché (PROMPT-05)

Le pack n'a pas de gabarit conversationnel : `jarvis.route` impose une sortie JSON validée, que la
conversation (texte en flux, marqueurs `[[ACTION]]` et `[[SOURCE]]`) ne produit pas. La consigne de
conversation est donc ajoutée au registre comme **politique de conversation** `jarvis.conversation`
1.0.0, origine « TikTrends, migré depuis le code », justification dans le contenu
(`complement-tiktrends.ts`, qui en est la source dans le dépôt).

- Le TEXTE (socle, titres, prudence, registre, « où envoyer ») vient du registre. L'ASSEMBLAGE reste une
  politique du code : ordre des blocs, seuils (0, < 10, < 40), plafonds (1 500, 9 000, 2 000), bloc
  d'actions (`actionsPromptBlock`, contrat du lecteur de marqueurs), bloc de connaissances (encodage des
  données non fiables).
- Comportement inchangé : `l2-jarvis-equivalence` prouve l'égalité au caractère près avec l'ancien
  `chatSystemPrompt` sur 16 800 combinaisons de contexte. Droits (`refusJarvis` avant toute lecture),
  barrière de dépense et absence de débit inchangés (prouvés par `l2-jarvis-route` et les tests lot19b).
- Sans release publiée, Jarvis garde la version 1.0.0 migrée du complément (le texte d'avant, prouvé identique)
  et la trace porte `origine: 'repli_1_0_0'`, sans release ni version (décision de l'intégrateur, §13). Une
  release publiée sans politique Jarvis coupe la conversation (« pas encore activé », 503) : c'est une erreur
  de configuration explicite, sans repli silencieux.
- Chaque tour écrit une trace `jarvis.conversation` (release, version de la politique, empreintes,
  connaissances, mémoire et règles par empreinte).

## 9. ADMIN « IA et Studios » (`/admin/ia-studios`)

Onglets : Prompts (liste, détail, empreinte, origine, motif, variables, schémas, modèle logique, coût de
test, exemples, contenu avec les champs de contrat signalés, diff ligne à ligne entre deux versions,
édition de brouillon, validation, import), Releases (environnement dit, création, évaluer, publier et
revenir sous confirmation dans la fenêtre partagée `Modal`, retirer), Recettes de style, Connaissances
(lien vers `/admin/connaissances`, comptes seulement), Évaluations (tests et cas du benchmark),
Routage (lecture seule, registre de capacités absent dit), Exécutions (traces expurgées). États : vide,
rempli, erreur avec identifiant support, accès refusé (aucune donnée). Cibles 44 px, champs 16 px,
focus visible global, statut porté par un mot. Captures 1440, 1280 et 390 sans défilement horizontal.

## 10. Inventaire des appels IA (PROMPT-12)

Relevé au SHA de ce lot (`grep guardedAnthropic( | sousPlafond(` sur `app/` et `lib/`), lignes de la barrière.
Départ : `L0/L0-A-studios-ia.md` §3.

| Appel (fichier:ligne de la barrière) | Fonction | Texte du prompt aujourd'hui | Template du registre visé | État |
| --- | --- | --- | --- | --- |
| `app/api/jarvis/chat/route.ts:68` | conversation Jarvis | registre · `jarvis.conversation` | `jarvis.conversation` | **Migré (ce lot)** |
| `lib/studios/prompts/adaptateur.ts:58` | tâches studio du registre | registre · 22 templates | les 22 | **Migré (ce lot)** · aucun appelant de production avant L4 |
| `app/actions/ads.ts:1051`, `:1455` | `generateAdConcepts`, `cloneAdFromReference` | `packages/ai/src/ads.ts` | `concept.plan`, `brief.build` | À migrer · L5 |
| `app/actions/ads.ts:1355` | `suggestAdAngles` | `packages/ai/src/ads.ts` | `concept.plan` | À migrer · L5 |
| `app/actions/ads.ts:1768`, `app/actions/image.ts:344` | `scoreCreative` | `packages/ai/src/critique.ts` | `quality.visual` | À migrer · L5 |
| `app/actions/ads.ts:558` | `controlePubEntiere` | `packages/ai/src/controle-pub.ts` | `quality.visual` | À migrer · L5 |
| `app/actions/ads.ts:1954` | `rewriteAdCopy` | `packages/ai/src/ads.ts` | `text.write` | À migrer · L5 |
| `app/actions/ads.ts:462`, `:2000` (fal) | scènes et pubs entières | `ads.ts` `scenePrompt*`, `core/production-mode.ts`, `core/ad-directions.ts` | `image.compile` | À migrer · L5 (le profil `image_generation` n'est pas routé) |
| `app/actions/image.ts:93`, `:158` | `enhanceImagePrompt`, `suggestImageBrief` | `packages/ai/src/generation.ts` | `image.compile`, `brief.build` | À migrer · L5 |
| `app/actions/image.ts:135` (fal) | génération d'image | `core/studio-image.ts` + saisie | `image.compile` | À migrer · L5 |
| `app/actions/video.ts:401` | `suggestVideoBrief` | `packages/ai/src/generation.ts` | `storyboard.plan` | À migrer · L5 |
| `app/actions/video.ts:128`, `:164` (fal / Higgsfield) | vidéo | `core/video-directions.ts` + saisie | `shot.image`, `animation.compile` | À migrer · L5 |
| `app/actions/studio.ts:33` | `generateCreative` (Textes IA) | `packages/ai/src/generation.ts` | `text.write` | À migrer · L5 |
| `app/actions/assistant.ts:23` | `chatAssistant` (ancien assistant) | `TESS_SYSTEM` `packages/ai/src/agent.ts` | `jarvis.route` ou retrait | À migrer · L5 (dette P1/P2 de L0-B) |
| `app/actions/jarvis.ts:57`, `:109` | `proposeJarvisRules`, `distillWinningPatterns` | `packages/ai/src/generation.ts`, `ads.ts` | `learning.review` | À migrer · L5 |
| `app/actions/assets.ts:212`, `:249` | `describeAssetImage` | `packages/ai/src/generation.ts` | `source.analyze` | À migrer · L5 |
| `app/actions/brand-detail.ts:36`, `app/actions/brands.ts:50` | `generateBrandProfile` | `packages/ai/src/brand.ts` | `brand.extract` | À migrer · L5 |
| `app/actions/brand-detail.ts:108` | `extractVisualDa` | `packages/ai/src/da-visuelle.ts` | `style.describe` | À migrer · L5 |
| `app/actions/brand-detail.ts:363` | `generateProducts` | `packages/ai/src/brand.ts` | `brand.extract` | À migrer · L5 |
| `app/actions/brand-detail.ts:240` (fal) | photo lifestyle | inline | `image.compile` | À migrer · L5 |
| `app/actions/universe-previews.ts:169` (fal) | aperçus d'univers | `BRIEF` inline + `ad-directions` | `image.compile` | À migrer · L5 |
| `app/actions/competitor.ts:105` | `analyzeCompetitor` | `packages/ai/src/brand.ts` | `source.analyze` | À migrer · L5 |
| `app/actions/adsmap-analyze.ts:185`, `app/actions/market-learn.ts:68`, `lib/radar.ts:187` | `analyzeAdAsset` | `packages/ai/src/adsmap-asset.ts` | `source.analyze` | À migrer · L5 |
| `app/actions/adsmap-draft.ts:54` | `draftConcept` | `core/adsmap/draft.ts` | `concept.plan` | À migrer · L5 |
| `app/actions/adsmap-propose.ts:115`, `:151`, `:196`, `:245` | personas, désirs, angles, concepts | `packages/ai/src/adsmap-agents.ts` | `test.hypothesize`, `concept.plan` | À migrer · L5 |

Texte résiduel : `packages/core/src/adsmap/jarvis-chat.ts` (`SOCLE`, `chatSystemPrompt`) n'est plus appelé
par aucune route ; il reste l'oracle de la garde d'équivalence. À retirer (ou réduire à un fixture de test)
par l'intégrateur une fois la release publiée en production. Les politiques déterministes (barrière de
dépense, refus d'accès, bloc d'actions, encodage des connaissances, politique serveur fixe) restent hors
templates, comme le veut PROMPT-12.

## 11. Preuves

Tests (`test/l2-*`) : `l2-import-db` (PROMPT-01), `l2-releases-db` (évaluation, production, SEC-09,
compare-and-set, PROMPT-07, PROMPT-09), `l2-resolveur-db` (PROMPT-03, 04, 06, 07, 08, 10, SEC-04),
`l2-jarvis-equivalence`, `l2-jarvis-route` (PROMPT-05, droits, débit), `l2-preuve-bout-en-bout` (journal
JSON quand `L2_JOURNAL` est posé), `l2-admin-rendu` (HTML rendu, SEC-09 au résultat), `l2-regles-pures`,
`l2-concurrence-pg` (Postgres réel, deux connexions, `L2_PG_URL`).

Mutations (chaque garde cassée volontairement, échec constaté, code restauré) :

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M01 · déjà présentes recréées | `l2-import-db` | `second import · idempotent, aucune ligne ni audit de plus` |
| M02 · conflit ignoré | `l2-import-db` | `expected { ok: true, crees: 32, …(1) } to match object { ok: true, crees: 33, …(1) }` |
| M03 · permission d'import retirée | `l2-import-db` | `sans prompt.draft (admin d’espace) · refus, rien d’écrit` : `expected true to be false` |
| M04 · environnement forcé à test | `l2-releases-db` | `expected [] to deeply equal [ 'BENCHMARK_NON_APPROUVE' ]` |
| M05 · attente ignorée par le noyau seul | survit (le compare-and-set SQL protège) | · |
| M05b · attente ignorée par le noyau ET le compare-and-set | `l2-releases-db` | `expected [ true, true ] to have a length of 1 but got 2` |
| M06 · rollback qui retire l'ancienne | `l2-releases-db` | `expected 'retired' to be 'active'` |
| M07 · contrat divergent toléré à la création | `l2-releases-db` | `expected [] to include 'SCHEMA_INCOMPATIBLE'` |
| M08 · `outputSchemaRef` éditable | `l2-releases-db` | `expected [] to deeply equal [ 'CHAMP_NON_EDITABLE' ]` |
| M09 · simulé accepté en production | `l2-resolveur-db` | `expected { ok: true, … } to match object { ok: false, …(1) }` |
| M10 · appel malgré une entrée bloquée | `l2-resolveur-db` | `expected [ { …(5) } ] to have a length of +0 but got 1` |
| M11 · source recopiée dans les consignes | `l2-resolveur-db` | `expected 'Tu es un composant de TikTrends, une …' not to contain 'IGNORE'` |
| M12 · sortie acceptée sans évaluation | `l2-resolveur-db` | `expected { ok: true, … } to match object { ok: false, code: 'SEMANTIQUE' }` |
| M13 · connaissances mises en cache | `l2-resolveur-db` | `expected 'Traite uniquement les données JSON su…' to contain 'CONNAISSANCE_PUBLIEE_L2'` |
| M14 · épinglage ignoré | `l2-resolveur-db` | `expected '<release B>' to be '<release A>'` |
| M15 · seuil de prudence 9 | `l2-jarvis-equivalence` | `consigne différente pour : {"memory":"","measuredAds":9,…}` |
| M16 · route sur la politique du code | `l2-jarvis-route` | `expected 'Tu es Jarvis, le stratège créatif de …' to contain 'Réponds court, et termine par la proc…'` |
| M17 · repli sans release | `l2-jarvis-route` | `expected 200 to be 503` |
| M18 · garde plateforme ouverte aux rôles d'espace | `l2-admin-rendu` | `owner d’espace (client) · écran de refus` (et admin d'espace, manager) |
| M19 · champs non listés montrés | `l2-regles-pures` | `expected '{"id":"r",…' not to contain 'TEXTE_INTERDIT'` |
| M20 · drapeau sans contrôle d'hôte | `l2-regles-pures` | `{"STUDIOS_PROMPTS_RECETTE_LOCALE":"1"} → production` |
| M21 · empreinte sans les politiques | `l2-jarvis-route` | `expected false to be true` (empreinte de release inchangée) |
| M22 · composant client qui importe le registre | `l2-regles-pures` | `composant client qui importe le registre : app/(app)/admin/ia-studios/Commandes.tsx` |
| M23 · pré-contrôle de release retiré | `l2-releases-db` | `expected [] to include 'SCHEMA_INCOMPATIBLE'` |
| Verrou consultatif retiré (Postgres réel) | `l2-concurrence-pg` | `PostgresError: duplicate key value violates unique constraint "studio_prompt_versions_uq"` |

Preuve locale de bout en bout (journal JSON joint au rapport) : Jarvis et un brief studio résolvent A ;
B publiée (recette et phrase Jarvis) : Jarvis reçoit la nouvelle phrase, sa trace et celle du brief portent
B ; le job épinglé garde A ; rollback : A revient ; connaissance publiée puis retirée : entre puis sort du
snapshot. Le message compilé du brief est identique sous A et B : ni le template ni la recette modifiée n'y
entrent ; seule l'empreinte de release change, comme attendu.

## 12. Besoins hors périmètre (décision de l'intégrateur)

1. (Fait par l'intégrateur.) `apps/web/lib/navigation.ts` · ROUTES :
   `{ path: '/admin/ia-studios', label: 'IA et Studios', parent: '/admin', section: 'Plateforme' },`
   (garde `test/navigation.test.ts` « chaque page.tsx a son entrée » rouge sans elle). Éventuellement une
   entrée dans `ADMIN_NAV` (`components/AppShell.tsx`).
2. Révocation de sécurité d'une release : colonne absente de `studio_prompt_releases` (seuls `status`,
   `evaluation`, `updated_at` sont mobiles). Proposition : `revocation jsonb` mobile (déclencheur
   `studio_colonnes_mobiles`), lue par `releaseDeLigne`.
3. `studio_prompt_runs` n'a pas de colonne pour `releaseHash`, `taskInputsHash`, couches et budget : ils
   vivent dans `config` (jsonb). Colonnes dédiées à prévoir si l'on veut les indexer.
4. `lib/studios/audit.ts` · `ajouterAudit` impose l'espace de la session : les événements de portée
   plateforme passent par un ajout local (`depot-prompts.ts`, `workspace_id` nul). Proposition : accepter
   `workspaceId: null`.
5. `packages/core/src/prompts/release.ts` : intégrer nativement les politiques de conversation au
   `ContenuRelease` et à `empreinteRelease` (aujourd'hui étendus côté serveur, §4), et un type d'entrée
   `conversation` dans `EntreeRegistre` (la validation passe `type: 'socle'` au noyau pour la permission).
6. `packages/core/src/adsmap/jarvis-chat.ts` : retirer le texte `SOCLE` / `chatSystemPrompt` une fois la
   release publiée en production (voir §10).
7. Les règles pures serveur (`conversation.ts`, `correspondance.ts`, `environnement.ts`, `vue.ts`,
   `traces.ts`) sont pures mais vivent sous `apps/web/lib/studios/prompts/` (périmètre attribué) ; leur
   place doctrinale est `packages/core`.

## 13. Décisions et limites

- **Déploiement (décision de l'intégrateur)** : la publication en production exige un benchmark approuvé,
  qu'aucune commande ne permet d'approuver sans budget. Couper Jarvis jusque-là retirerait une fonction en
  service. Sans release publiée, la conversation garde donc la version 1.0.0 migrée (texte identique au code
  d'avant), tracée `repli_1_0_0`. Les tests lot19b de la route Jarvis passent SANS semis de release, à leur
  forme d'avant L2. Mutations : repli retiré ⇒ `expected 503 to be 200` (l2-jarvis-route et lot19b) ; origine
  non tracée ⇒ `expected { …(5) } to match object { origine: 'repli_1_0_0', …(2) }`. Les tâches studio
  restent sans repli (`RELEASE_ACTIVE_ABSENTE`). La bascule vers une release reste une décision du
  propriétaire (benchmark à budgéter, ou approbation manuelle tracée).
- Le registre de capacités n'existe pas : seul `reasoning_structured` est routé (Anthropic via la barrière) ;
  les autres profils bloquent avant appel.
- Aucun override d'espace ou de marque (le pack ne déclare aucun champ extensible, et aucun droit d'espace
  n'existe) ; la portée des releases est la plateforme.
- Réparation de sortie : 0 tentative (pas de template de réparation au registre).
- Rétention des traces : aucune purge (cahier §12 : politique à valider avant toute suppression).
