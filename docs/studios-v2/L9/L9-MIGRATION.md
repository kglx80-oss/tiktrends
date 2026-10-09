# L9-A · Migration vérifiée, legacy, rollback, restauration, baseline

Lot L9-A du chantier Studios v1.0 (vague 8). Base figée : `f2b9fc4` (intégration vague 7). Chemins relatifs à
`product/` sauf mention. Ce document dit **ce qui a été vérifié, comment, et comment le refaire**. Il ne décrit aucun
état de production : la session n'a aucun accès au VPS, à la base de production ni à l'application en ligne. Toutes les
preuves ci-dessous viennent de bases Postgres 16 LOCALES (`127.0.0.1:5433`, bases `l9_*` / `copie_*`, supprimées en
fin de lot) remplies de données SYNTHÉTIQUES. Aucune dépense : 0 $.

Le plan de fusion est à part : [`PLAN-FUSION.md`](PLAN-FUSION.md).

## 1. Ce que le lot livre

| Livrable | Où | Garde |
| --- | --- | --- |
| Règle pure · une migration est-elle additive, rejouable ; le journal drizzle masque-t-il une migration ? | `packages/core/src/migration-additive.ts` | `apps/web/test/l9-migration-additive.test.ts` (CI) |
| MIG-01 · migration interrompue (coupure, échec forcé) puis rejouée, empreintes avant/après | `ops/migration/verifier-migration.sh` | exécution locale + mutations (§3) |
| MIG-02 · ouverture de l'historique sur base migrée | `apps/web/test/l9-legacy-pg.test.ts` (Postgres local, `L9_PG_URL`) | mutations (§4) |
| MIG-03 · retour à l'app précédente sur base migrée, puis ré-avance | `ops/migration/rollback-local.sh` | exécution locale (§5) |
| MIG-04 · restauration isolée d'une sauvegarde `backup.sh`, validation | `ops/migration/restaurer-isole.sh` | exécution locale + mutations (§6) |
| BASE-05 · temps et erreurs des parcours, main puis f2b9fc4 | `ops/migration/mesurer-parcours.mjs`, `ops/migration/lancer-et-mesurer.sh` | mesures (§7), fichiers bruts dans `mesures/` |
| Semis synthétiques (schéma 0053, puis projets Studios après 0054) | `ops/migration/semis-synthetique.sql`, `ops/migration/semis-studios.sql` | `apps/web/test/l9-ops-gardes.test.ts` (CI) |
| Garde « jamais la production » de tous les scripts | `ops/migration/lib.sh` (`l9_garde_locale`) | `apps/web/test/l9-ops-gardes.test.ts` (CI) |

Aucune migration ajoutée, aucune migration existante modifiée, `ops/deploy.sh` non modifié, aucun code applicatif
modifié. Seul fichier partagé touché : `packages/core/src/index.ts` (une ligne d'export en fin de fichier).

`packages/db` n'a pas d'exécuteur de tests (`package.json` sans script `test`) : les tests du lot vivent dans
`apps/web/test/l9-*`, comme les autres tests sur base réelle du dépôt.

## 2. Ce que 0054 et 0055 font aux données existantes · lecture du SQL

Lu instruction par instruction par `analyserMigrationSql` (et relu à l'œil) :

| Migration | Instructions | Écritures de données | Destructions | Non rejouables |
| --- | --- | --- | --- | --- |
| `0054_studios_fondations` | 57 · 21 `CREATE TABLE IF NOT EXISTS`, 18 `CREATE INDEX IF NOT EXISTS`, 4 `CREATE OR REPLACE FUNCTION`, 11 `CREATE OR REPLACE TRIGGER`, 3 `DO $$ … EXCEPTION WHEN duplicate_object` | 0 | 0 | 0 |
| `0055_ai_spend_reconciliation` | 1 · `ALTER TABLE "ai_spend" ADD COLUMN IF NOT EXISTS "reconcile_reason" text` (nullable, sans défaut) | 0 | 0 | 0 |

**Il n'y a aucun backfill.** Les deux migrations sont purement additives. Ce que 0054 fait aux tables EXISTANTES :
deux contraintes d'unicité composites, `brands (id, workspace_id)` et `adsmap_ads (id, workspace_id)`, sans effet sur
les lignes (`id` y est déjà unique) mais qui construisent un index sous verrou (écritures bloquées sur ces deux tables
le temps de la construction ; instantané sur les volumes synthétiques, à proportion du nombre de lignes en production).
0055 ajoute une colonne nullable sans défaut : changement de catalogue seul, aucune réécriture de table.

La même règle VOIT les backfills historiques (0045, 0050, 0051, 0053 écrivent des données ; 0035 détruit) : le test le
vérifie, la règle ne répond pas « additif » à tout. Une instruction qu'elle ne sait pas classer est `inconnue`, jamais
additive.

**Le piège du migrateur.** `drizzle-orm` 0.33 (`pg-core/dialect.js`) applique, dans UNE transaction, chaque migration
dont le `when` du journal est STRICTEMENT supérieur au `created_at` de la DERNIÈRE ligne de
`drizzle.__drizzle_migrations`. Une migration fusionnée avec un `when` plus ancien est ignorée sans erreur. Garde :
`violationsJournalMigrations` (journal contigu et strictement croissant, testé sur le vrai journal) et
`migrationsMasquees` ; `verifier-migration.sh` signale aussi toute migration masquée sur la base qu'il vérifie.

**Base vierge.** Le migrateur réel échoue sur une base VIERGE (`New enum values must be committed before they can be
used`, code 55P04) : 0011 et 0034 ajoutent des valeurs d'enum utilisées plus loin dans la même transaction. La
production n'est pas concernée (elle a reçu les migrations au fil de l'eau), mais une base neuve ne se monte pas d'un
seul `migrate`. `l9_migrer_jusqua` (`ops/migration/lib.sh`) applique donc le journal par tranches closes après chaque
migration `ADD VALUE`, avec le VRAI migrateur et les fichiers copiés à l'octet (mêmes empreintes, mêmes horodatages).
Constat hors périmètre, non corrigé (migrations en lecture seule).

## 3. MIG-01 · interrompre puis rejouer · `verifier-migration.sh`

```bash
# Base synthétique neuve, montée jusqu'à 0053 puis semée, puis vérification complète :
ops/migration/verifier-migration.sh --base postgres://postgres@127.0.0.1:5433/l9_mig01 --preparer 0053
# Copie restaurée de la production (cf. §6), déjà à 0053, non semée :
ops/migration/verifier-migration.sh --base postgres://postgres@127.0.0.1:5433/copie_20261009
```

Déroulé : relevé d'AVANT (colonnes, empreinte md5 de chaque ligne de chaque table triée, empreinte du schéma ·
colonnes, contraintes, index, déclencheurs, fonctions, enums · journal drizzle). Puis, pour chaque table existante
nommée par un `ALTER TABLE` du lot en attente (`brands`, `adsmap_ads`, `ai_spend`), une session tient un verrou
exclusif ; le VRAI migrateur (`pnpm --filter @tiktrends/db migrate`, celui de `deploy.sh`) démarre, se bloque
transaction ouverte, puis est interrompu en alternant :

| Point | Façon | Travail déjà fait dans la transaction | Cause relevée | Après |
| --- | --- | --- | --- | --- |
| `brands` | coupure (`pg_terminate_backend`) | 0 verrou · bloqué sur la 1re instruction | `CONNECTION_CLOSED` | base identique à l'avant |
| `adsmap_ads` | échec forcé (`lock_timeout` 4 s posé sur la base) | 3 verrous · contrainte de `brands` déjà posée | `canceling statement due to lock timeout` | base identique à l'avant |
| `ai_spend` | coupure | 229 verrous · TOUT 0054 exécuté (21 tables, déclencheurs) | `CONNECTION_CLOSED` | base identique à l'avant |

Puis reprise, second passage du migrateur, et ré-exécution brute de 0054 et 0055 par `psql` sur la base déjà migrée.

Résultat (2026-10-09, 4 cœurs, 16 Go, charge 3,0 à 5,3 · relevé complet `mesures/verifier-migration-l9_mig01.txt`) :
69 tables existantes, 9 674 lignes, identiques ligne à ligne après chaque interruption, après reprise et après rejeu ;
56 migrations en base pour 56 au journal, chaque empreinte = sha256 du fichier du dépôt, aucune inscrite deux fois ;
21 nouvelles tables, toutes vides ; 1 colonne ajoutée (`ai_spend.reconcile_reason`), 0 ligne renseignée ; schéma
identique au rejeu (aucune contrainte, aucun index, aucun déclencheur en double). Reprise : 2,9 s.

Mutations (chaque garde est tombée avec sa phrase, puis restaurée) :

| Mutation | Phrase obtenue |
| --- | --- |
| M1 · après l'interruption n°1, la contrainte `brands_id_workspace_uq` posée hors transaction | `ÉCHEC · interruption-1-coupure-brands · schéma modifié, travail partiel resté en base` |
| M2 · après l'interruption n°2, une ligne `ai_spend` modifiée | `ÉCHEC · interruption-2-echec-adsmap_ads · données modifiées` puis `ÉCHEC · données · des lignes existantes ont changé` |
| M3 · au rejeu, une unicité en double sur `brands` | `ÉCHEC · rejeu · le schéma a changé au rejeu` |

Côté CI (`l9-migration-additive.test.ts`, pglite) : 0000→0053, lignes existantes, 0054+0055, puis deux rejeux, puis une
base interrompue au milieu de 0054 (moitié des 57 instructions passées hors transaction) et reprise · même schéma et
mêmes lignes qu'une application d'un seul trait. Mutations : un `UPDATE "brands"` ajouté à 0054 →
`écriture de données au passage de la migration (backfill)` et `lignes existantes modifiées par 0054/0055` ; un index
sans `IF NOT EXISTS` → `instruction non rejouable` et échec du rejeu pglite ; le `when` de 0055 rendu antérieur à 0054
→ `« 0055_ai_spend_reconciliation » … n’est pas postérieure à « 0054_studios_fondations » … le migrateur l’ignorerait` ;
la règle rendue aveugle aux `UPDATE` → `expected 'inconnue' to be 'ecriture_donnees'`.

**Redémarrage du conteneur pendant le lot.** Le conteneur de la session a redémarré vers 06:00 ; `l9_mig01` avait fini
sa vérification à 05:56 (56 migrations, base cohérente). Ce n'était donc PAS une migration interrompue exploitable ; la
base a simplement survécu à l'arrêt de Postgres. Les interruptions ci-dessus restent la preuve.

## 4. MIG-02 · l'historique s'ouvre, sans calque ni provenance inventés

Sur la base migrée (`l9_mig01` + `semis-studios.sql`), `L9_PG_URL=… pnpm exec vitest run test/l9-legacy-pg.test.ts`
(7 tests, verts) appelle le VRAI code de `f2b9fc4` :

- Pubs IA (`listBrandAds`), Image IA (`pageImagesMarque`), Vidéo IA (`pageVideosMarque`), bibliothèque
  (`listAssets`) : les créations historiques sortent telles qu'en base (nombre, URL, titres) ; une vidéo en échec garde
  son erreur et n'a pas d'URL inventée.
- Catalogue Studios (`chargerCatalogueProjet`) : chaque média historique de la bibliothèque y figure sous son nom,
  avec l'empreinte sha256 de SES octets (recalculée par le test depuis la data URI), sans produit, position ni
  annonceur ; le média référencé `origin = legacy` porte l'empreinte des octets d'origine, rien d'autre.
- Éditeur (`lireEditeurPour`) : ce média se présente « Ancien média · 96 × 96 », le document reste `null` : aucun
  calque n'est créé pour lui ; `parent_asset_id` nul, `legacy_ref` pointe sa ligne `assets` d'origine.
- Toutes ces lectures n'ont rien écrit (empreinte de toutes les tables identique avant/après).

Côté écran, les deux applications servent ces mêmes historiques sur la base migrée (§5, §7 : « contenu attendu » =
le texte d'une création historique trouvé dans le HTML).

**Pas d'import legacy dans le code.** Aucune fonction n'importe aujourd'hui `assets` / `generations` vers
`studio_assets` (l'origine `legacy` et `legacy_ref` existent au schéma, rien ne les remplit). Les médias historiques
restent lus à leur place. `semis-studios.sql` pose UNE ligne `legacy` telle qu'un import devrait la poser, pour
vérifier comment le code la décrit.

Mutations : empreinte du média legacy remplacée par `aaaa…` → le test du catalogue tombe (`expected 'aaaa…' to be
'64b95f…'`) ; origine passée à `generated` → `- "nom": "Ancien média · 96 × 96" + "nom": "Image produite · 96 × 96"` ; une écriture glissée après la lecture de l'éditeur (`app_settings`) → le test « aucune de ces lectures n’a écrit » tombe (empreintes des tables différentes).

Constat à raccorder (fichier d'un autre lot, non touché) : le catalogue (`lib/studios/produit/catalogue.ts`) libelle
tout média `studio_assets` « Média du studio · … » sans lire `origin` ; un média `legacy` y serait présenté comme
produit par le studio, alors que l'éditeur dit bien « Ancien média ».

## 5. MIG-03 · rollback · procédure écrite et éprouvée

### 5.1 Désactiver la fonction Studios

**Il n'existe aucun drapeau Studios** (recherché dans `apps`, `packages`, `ops`, compose : seuls
`STUDIOS_PROMPTS_RECETTE_LOCALE`, qui n'ouvre qu'un environnement de test des prompts, et `STUDIO_FOURNISSEUR_REEL`,
qui n'agit qu'hors production). Ce qui existe déjà :

- le worker studio ne démarre que si `decisionFournisseurStudio` l'autorise (`FAL_KEY` réelle, `S3_*`) : sans lui, un
  job approuvé reste `queued`, rien n'est facturé. Mais `FAL_KEY` sert aussi Pubs IA : la retirer coupe plus que
  Studios. Ce n'est pas un interrupteur de fonction.

Le plus petit moyen SÛR, sans supprimer de code, est donc **le retour à l'application précédente** (§5.2) : l'ancienne
app n'a ni route ni action Studios. Proposition pour un lot ultérieur (fichiers d'autres lots, non touchés ici) : une
règle pure `studiosActifs(env)` dans `packages/core` (défaut DÉSACTIVÉ en production tant que la recette n'est pas
passée, cahier §14), lue par un `layout.tsx` de `/studio/projets` (`notFound()`), par l'entrée de navigation, par
`/api/studios/*` et en tête des actions `app/actions/studios/*` (une action serveur reste appelable même lien masqué).

### 5.2 Revenir à l'application précédente

Sur le VPS (le propriétaire ; la session n'y a pas accès) :

1. Une PR `git revert -m 1 <commit de fusion>` (ou `git revert <commit squash>`) vers `main`, fusionnée normalement.
2. `deploy.sh` voit `product/apps` changer : il reconstruit l'ancienne app, la démarre, puis lance l'ANCIEN migrateur.
   Celui-ci ne fait rien : ses 54 migrations ont toutes un `when` ≤ dernier appliqué (0055). **Aucune migration n'est
   défaite** : tables `studio_*` et `ai_spend.reconcile_reason` restent, avec leurs lignes.
3. Ne JAMAIS restaurer une sauvegarde pour « défaire » 0054/0055 : inutile (additives) et dangereux (§6.3).

Prouvé en local par `ops/migration/rollback-local.sh` (base `l9_mig01` migrée, 3 projets Studios, 11 lignes
`studio_*` ; ancien checkout `bc33cec`, nouveau `f2b9fc4` ; relevé `mesures/rollback-local-l9_mig01.txt`) :

| Étape | Résultat |
| --- | --- |
| Ancien migrateur sur base en avance | terminé sans erreur ; journal, schéma, données inchangés |
| Ancienne app (`next start`, build `bc33cec`) | tous ses écrans en 200, 0 erreur, journal serveur sans erreur, contenus historiques rendus ; `/studio/projets` en 404 (route absente de l'ancienne app) |
| Projets Studios pendant le retour arrière | 3 projets, 11 lignes `studio_*` identiques (empreintes) |
| Ré-avance (nouveau migrateur) | sans erreur ; aucune migration rejouée, aucun doublon |
| Nouvelle app après ré-avance | écrans en 200, les projets créés avant le retour arrière s'affichent |

Ce que l'ancienne app fait autrement sur la base migrée :

- **Supprimer une marque qui porte un projet Studios échoue** : `deleteBrandAction` (ancien) fait un `DELETE` brut, que
  `studio_projects_brand_fk` (RESTRICT) refuse (`violates foreign key constraint "studio_projects_brand_fk"`, vérifié
  en SQL). C'est voulu (l'historique Studios n'est pas effacé) mais l'ancien écran n'a pas de message pour ce cas.
- **Le bandeau de diagnostic** de l'ancienne app (`/console`) dira « La base a 2 migration(s) de plus que ce build »
  (`MIGRATIONS_IN_BUILD = 54` à `bc33cec`, 56 appliquées) : c'est l'état attendu d'un retour arrière.
- Une ligne `ai_spend` marquée « à réconcilier » par le nouveau code peut être réglée ou libérée par l'ancien, qui
  ignore `reconcile_reason`. À rapprocher à la main si un retour arrière dure.

## 6. MIG-04 · restauration isolée · `restaurer-isole.sh`

### 6.1 Procédure

1. Copier la sauvegarde voulue (`~/backups/tiktrends-AAAAMMJJ-HHMMSS.sql.gz`, format `backup.sh` : `pg_dump --clean
   --if-exists | gzip`) sur une machine ISOLÉE (poste local, ou VPS dans un Postgres séparé qui n'écoute que sur
   127.0.0.1 ; la base de production n'est joignable que par le réseau docker, sous le nom `db`).
2. `ops/migration/restaurer-isole.sh --sauvegarde <fichier> --base postgres://…@127.0.0.1:<port>/copie_<date>
   --sans-proprietaires` (le rôle `tiktrends` n'existe pas sur la machine isolée ; sans le drapeau le script s'arrête et
   le dit).
3. Lire le verdict : fichier intègre et complet, restauration sans aucune erreur en une transaction, lignes par table,
   clés étrangères vérifiées sur les DONNÉES (orphelins comptés), contraintes toutes validées, déclencheurs
   d'immuabilité présents et actifs, journal drizzle conforme au dépôt (et nombre de migrations à appliquer).
4. Sur cette copie, `verifier-migration.sh --base …/copie_<date>` rejoue MIG-01 sur les VRAIS volumes.
5. Supprimer la copie (`dropdb`) : elle contient des données client.

### 6.2 Éprouvée en local

Sauvegarde produite par la commande de `backup.sh` (sans le conteneur) sur `l9_mig01` migrée + projets Studios
(392 Ko gzip, pg_dump 16.13) : restaurée en 1,1 s ; 90 tables, 9 685 lignes ; 199 clés étrangères, 0 orphelin ;
382 contraintes validées ; 11 déclencheurs `studio_*`, UPDATE refusé sur l'audit ; 56/56 migrations conformes ;
données et schéma IDENTIQUES à la source. Variante production (propriétaire `tiktrends` absent) : arrêt sans le
drapeau, restauration identique avec `--sans-proprietaires`.

Mutations : SQL tronqué → `pg_dump incomplet : la ligne de fin « dump complete » manque` ; gzip coupé →
`fichier gzip corrompu ou tronqué` ; ligne orpheline ajoutée au flux (`session_replication_role = replica`) →
`ÉCHEC · relations · 1 clé(s) étrangère(s) avec orphelins : personas.personas_brand_id_brands_id_fk|1` et
`ÉCHEC · source · données différentes` ; base de production en cible → `ARRÊT · garde · base non locale`.

### 6.3 Ce que la procédure « Restaurer » du README fait sur une base migrée (constat)

`ops/README.md` restaure EN PLACE avec `psql` sans `ON_ERROR_STOP`. Essayé en local : une sauvegarde d'AVANT 0054
restaurée ainsi sur une copie de base migrée produit **35 erreurs et un code de sortie 0**. Les `DROP` de `workspaces`,
`users`, `workspace_members`, `brands`, `adsmap_ads` échouent (les tables `studio_*`, absentes de la sauvegarde,
en dépendent) : ces cinq tables gardent leurs lignes ACTUELLES, toutes les autres reviennent à la sauvegarde, le journal
dit 54 migrations alors que les tables `studio_*` sont là et que `ai_spend.reconcile_reason` a disparu. Base
incohérente, sans alerte. D'où : restaurer en isolé (§6.1), et pour une restauration en place, `-v ON_ERROR_STOP=1
--single-transaction` (échoue proprement au lieu d'appliquer à moitié). Section ajoutée à `ops/README.md`.

## 7. BASE-05 · baseline mesurée (environnement, pas objectifs)

Mesuré le 2026-10-09 entre 06:08 et 06:09 UTC, conteneur de développement partagé avec cinq autres agents (Intel Xeon
2,1 GHz, 4 cœurs, 16 Go ; **charge 10 à 11,7** pendant les mesures, soit 2,5 à 3 fois le nombre de cœurs ; Node 22 ;
Postgres 16.13 local). App en `next start` (build de production), base locale synthétique (§3), session forgée avec
un secret LOCAL. 11 requêtes par route et par passe, séquentielles : 1 « froide » (après le démarrage et une requête
`/login`) puis 10 « chaudes » ; médiane et p95 des 10 chaudes. `main` = `bc33cec` sur base à 0053 ; `f2b9fc4` sur base
migrée (0055) + 3 projets Studios. Deux passes alternées. Fichiers bruts : `mesures/mesures-*.json`.

| Parcours | Route | main p1 méd./p95 (ms) | main p2 | f2b9fc4 p1 | f2b9fc4 p2 | Erreurs (4 passes) |
| --- | --- | --- | --- | --- | --- | --- |
| Accueil | /dashboard | 140 / 224 | 71 / 89 | 56 / 132 | 67 / 125 | 0 · 0 · 0 · 0 |
| Pubs IA | /studio/ads | 212 / 491 | 112 / 208 | 125 / 200 | 124 / 151 | 0 · 0 · 0 · 0 |
| Studio historique | /studio | 74 / 100 | 41 / 67 | 46 / 74 | 49 / 80 | 0 · 0 · 0 · 0 |
| Studio historique | /studio/image | 63 / 88 | 67 / 98 | 60 / 100 | 51 / 92 | 0 · 0 · 0 · 0 |
| Studio historique | /studio/video | 55 / 85 | 70 / 86 | 63 / 133 | 47 / 57 | 0 · 0 · 0 · 0 |
| Studio historique | /studio/textes | 26 / 31 | 45 / 71 | 42 / 88 | 34 / 48 | 0 · 0 · 0 · 0 |
| Veille | /veille | 41 / 84 | 65 / 85 | 53 / 102 | 56 / 75 | 0 · 0 · 0 · 0 |
| Veille | /veille/scale | 26 / 48 | 34 / 42 | 44 / 104 | 28 / 44 | 0 · 0 · 0 · 0 |
| Veille | /saved | 122 / 178 | 126 / 152 | 155 / 254 | 128 / 330 | 0 · 0 · 0 · 0 |
| Adsmap | /adsmap | 67 / 98 | 75 / 109 | 62 / 73 | 65 / 84 | 0 · 0 · 0 · 0 |
| Studios v1 | /studio/projets | 404 (absente) | 404 | 37 / 47 | 46 / 77 | 0 · 0 · 0 · 0 |
| Studios v1 | /studio/projets/[id] | 404 (absente) | 404 | 49 / 55 | 56 / 82 | 0 · 0 · 0 · 0 |

Première requête de `/dashboard` (compilation des modules au premier rendu) : 2 043 et 1 123 ms sur main, 276 et
1 443 ms sur f2b9fc4. Erreurs = statut ≥ 500, connexion refusée, ou page d'erreur rendue en 200 ; journal serveur : 0
ligne d'erreur sur les quatre passes. Les contenus historiques attendus sont rendus partout.

Lecture honnête : sous cette charge, l'écart entre deux passes du MÊME build (ex. Pubs IA 212 puis 112 ms) dépasse
l'écart entre builds ; ces chiffres ne permettent de conclure à aucune régression ni amélioration. Ce sont des repères
de cet environnement, à refaire sur une machine au repos avant d'en tirer une cible.

**Fenêtre de déploiement mesurée.** `f2b9fc4` servi sur une base encore à 0053 (ce que fait `deploy.sh` entre
`docker compose up` et la fin de `migrate`) : tous les écrans historiques en 200 avec leurs contenus ; les deux écrans
Studios en 200 mais sans contenu (6 erreurs `42P01` « relation does not exist » au journal serveur). Toute réservation
de dépense (`reserverDepense`) échoue pendant cette fenêtre (`column "reconcile_reason" of relation "ai_spend" does not
exist`, vérifié en transaction annulée) : la génération est refusée AVANT l'appel payant · erreur visible, aucune
dépense non comptée. Voir `PLAN-FUSION.md` §4.

## 8. Refaire tout le lot en local

```bash
cd product
ops/migration/verifier-migration.sh --base postgres://postgres@127.0.0.1:5433/l9_mig01 --preparer 0053
psql postgres://postgres@127.0.0.1:5433/l9_mig01 -f ops/migration/semis-studios.sql
L9_PG_URL=postgres://postgres@127.0.0.1:5433/l9_mig01 pnpm --filter @tiktrends/web exec vitest run test/l9-legacy-pg.test.ts
ops/migration/verifier-migration.sh --base postgres://postgres@127.0.0.1:5433/l9_base53 --preparer 0053 --preparer-seulement
ops/migration/lancer-et-mesurer.sh --produit <checkout main>/product --base postgres://postgres@127.0.0.1:5433/l9_base53 --etiquette main
ops/migration/lancer-et-mesurer.sh --produit "$PWD" --base postgres://postgres@127.0.0.1:5433/l9_mig01 --etiquette f2b9fc4
ops/migration/rollback-local.sh --base postgres://postgres@127.0.0.1:5433/l9_mig01 --ancien <checkout main>/product --nouveau "$PWD"
pg_dump -h 127.0.0.1 -p 5433 -U postgres -d l9_mig01 --clean --if-exists | gzip > /tmp/l9.sql.gz
ops/migration/restaurer-isole.sh --sauvegarde /tmp/l9.sql.gz --base postgres://postgres@127.0.0.1:5433/copie_l9 --reference postgres://postgres@127.0.0.1:5433/l9_mig01
```

Les deux checkouts doivent avoir leurs dépendances (`pnpm install --frozen-lockfile`) et leur app construite
(`pnpm --filter @tiktrends/web build`). Les scripts refusent toute base qui n'est pas locale et nommée `l9_*` ou
`copie_*`, et toute app qui n'écoute pas en local.

## 9. Statut des exigences

| ID | Statut | Preuve | Limite |
| --- | --- | --- | --- |
| MIG-01 | LOCAL_VERIFIED | §3 | Volumes synthétiques ; à rejouer sur une copie restaurée des vrais volumes (procédure §6.1 étape 4). Aucun backfill à reprendre : migrations additives. |
| MIG-02 | LOCAL_VERIFIED | §4 | Aucun import legacy n'existe dans le code ; libellé du catalogue à raccorder. |
| MIG-03 | LOCAL_VERIFIED (retour app) · IMPLEMENTED (procédure VPS écrite) | §5 | Aucun drapeau Studios : proposition §5.1, non implémentée (fichiers d'autres lots). Le revert réel sur le VPS n'a pas été exécuté. |
| MIG-04 | LOCAL_VERIFIED | §6 | Sauvegarde produite localement par la même commande que `backup.sh`, pas tirée du VPS. |
| BASE-05 | LOCAL_VERIFIED (mesures d'environnement) | §7 | Machine très chargée ; pas de cible, pas de conclusion de régression. |
