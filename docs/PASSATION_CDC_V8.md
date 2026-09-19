# Passation · CDC v8 · N03 + recette N04

Note de passation pour reprendre sans reconstruire le contexte. Trois statuts,
tenus séparés : **code validé** (vérifié en session), **déployé** (non
confirmé), **recette navigateur** (non confirmée). Rien ici ne suppose l'état
réel : on dit **où regarder** et **comment vérifier**.

Tout est en lecture seule, sauf la remise en état des tests N04 (que le
propriétaire exécute lui-même, sur données de test isolées).

---

## 1 · Commits des corrections · vérifier leur présence dans le build déployé

Lot CDC v8 mergé sur `main`, dans l'ordre :

| PR | Constat | SHA squash |
| --- | --- | --- |
| #607 | R04 · pré-score = estimation, pas promesse | `724bbcf` |
| #608 | N02 (P0) · l'apprentissage injecté porte sa confiance | `c5f960a` |
| #609 | N07 · règle d'itération unique (Mistakes/Suites) | `c0a3338` |
| #610 | N03 · canal d'acquisition stocké + agrégats | `8b78f17` |
| #611 | N03 (fix) · séparer canal d'acquisition et qualification métier | `3fdafc0` |
| #613 | N09 · « jamais synchronisé » ≠ dossier vide, portée du compteur | `41955d2` |
| #614 | N09 · bilan de synchro conservé, succès vs tentative (migration 0052) | `85151c8` |
| #616 | N02 · angle « qui a payé » suit le protocole (relatif/importé exclus) | `e287e59` |
| #617 | N02 · panneau nommé « mémoire de performance », réserve sur le reste | `868a810` |
| #619 | N03 · le doublon « <10s » vient de caractères invisibles (normalisation durcie) | `9e9d8cf` |
| #620 | Lot 0 · identifier le build · passer le commit à l'image Docker | `3bc0e7d` |
| #622 | R04 · lot importé · rendre visible sa nature « historique » | `de42e82` |
| #624 | Lot 0 · deploy.sh exporte le commit compilé (maillon `BUILD_SHA` manquant) | `debf8a4` |

**Commit de référence du lot complet : `debf8a4`** (il contient tous les précédents dans son historique).

**Vérifier par l'HISTOIRE, jamais par « ≥ SHA ».** Sur le VPS (`debian@51.255.39.79`, dépôt `/home/debian/tiktrends`) :

```bash
git -C /home/debian/tiktrends fetch --quiet
git -C /home/debian/tiktrends merge-base --is-ancestor debf8a4 HEAD && echo "présent" || echo "absent"
git -C /home/debian/tiktrends log --oneline | grep -E '#60[789]|#61[01346]|#61[79]|#62[024]'
```

Ce que ces commandes prouvent · que **l'arbre source** du VPS contient #624, pas
que **l'image servie** en a été bâtie. Le dépôt peut avoir avancé depuis le
build · `HEAD` n'est donc pas forcément le commit compilé. La preuve du build
servi est le champ `build` du bandeau (les 8 caractères de `BUILD_SHA`, posé au
build, via `deploymentState`) · c'est LUI qui dit de quel commit l'image tourne.

Pour prouver que ce commit inclut #624, il faut qu'il en soit un **descendant** ·
être ancêtre de `origin/main` ne suffit pas (un vieux commit l'est aussi) :

```bash
# <sha_bandeau> = les 8 caractères affichés par le bandeau.
git -C /home/debian/tiktrends merge-base --is-ancestor debf8a4 <sha_bandeau> \
  && echo "l'image servie inclut #624" || echo "image antérieure à #624"
```

**Attention** · le champ tombait à « inconnu » en production car la chaîne
`BUILD_SHA` était incomplète · #620 a posé le raccordement Docker, #624 le maillon
manquant (`ops/deploy.sh` l'exporte, cf. section 6). Un « inconnu » persistant
signe un build antérieur à #624 (ou un cycle pas encore reconstruit avec le
nouveau script, cf. section 6), pas une donnée absente en soi.

### Corrections par constat · commit + scénario de réception (navigateur)

| Constat | Commit(s) | Scénario de réception in situ |
| --- | --- | --- |
| **N02** · texte génération vs panneau | #603, #608, #616, #617 | Sur une marque à verdicts relatifs / importés · le panneau porte « Mémoire de performance utilisée pour la génération » + la réserve ; aucun angle relatif ou importé n'apparaît « gagnant » ni dans ce texte ni dans les recommandations ; taux validé et historique restent séparés. |
| **N03** · sources / doublons | #610, #611 | Le panneau marché affiche, par part, canal (Marque suivie / Radar / Origine inconnue) ET qualification (À qualifier tant que non établie) · distincts ; « <10s » n'apparaît qu'une fois (build ET données, cf. §5). |
| **N06** · détail mobile 360px | #605 | Dialogue à 360 px · l'image reste lisible (empilement), actions et fermeture atteignables, filtres et retour galerie préservés. |
| **R04** · pré-score / lot | #607, #622 | Le pré-score lit « X % de réussite estimée au vu des tests passés · estimation à confirmer par le test ». Un lot importé « Analysé » avec des ads « Brouillon » porte désormais un badge **« Importé · historique »** à côté du statut + une réserve qui explique la coexistence (verdicts importés non comparables, ads = enregistrements historiques) ; le rail liste « Analysé · importé ». Nature / statut / complétude restent trois axes distincts · cf. `natureLot` (§ ci-dessous). |
| **R06** · protocole | #606 | « Écart de budget toléré (%) » se saisit en % (0-100, pas 0.2), stocké en fraction. |
| **N09** · synchro Drive | #613, #614 | Cf. section N09 ci-dessous · dossier vide / ignorés / échec puis rechargement / jamais synchronisé. |

Le timer systemd `tiktrends-deploy.timer` tire et redéploie chaque minute · le décalage build ↔ `main` se résorbe seul, sauf blocage.

---

## 2 · Migrations 0051 et 0052 · identification, vérification, migration seulement si absente

**Identification exacte** dans `product/packages/db/drizzle/meta/_journal.json` :

- 0051 · `idx: 51`, `tag: "0051_market_creative_provenance"`, `version: "7"`, `when: 1788300000010`.
  Fichier : `product/packages/db/drizzle/0051_market_creative_provenance.sql`.
  Effet : `ALTER TABLE market_creatives ADD COLUMN IF NOT EXISTS provenance text;` + backfill `provenance = 'radar'` là où `radar_signal IS NOT NULL`.
- 0052 · `idx: 52`, `tag: "0052_drive_last_sync_bilan"`, `version: "7"`, `when: 1788300000011`.
  Fichier : `product/packages/db/drizzle/0052_drive_last_sync_bilan.sql`.
  Effet : `ALTER TABLE brands ADD COLUMN IF NOT EXISTS drive_last_sync jsonb;` (bilan de la dernière tentative de synchro Drive). Nullable, sans défaut, pas de backfill.
- Compte embarqué : `MIGRATIONS_IN_BUILD = 53` dans `product/packages/db/src/journal.ts` (idx 0…52 = 53 migrations), gardé par le test du journal.

Les deux colonnes sont nullables, sans défaut · rétro-compatibles.

**Vérifier leur présence AVANT toute application** (lecture seule) :

```sql
-- (a) Les effets de schéma sont-ils là ?
SELECT table_name, column_name FROM information_schema.columns
 WHERE (table_name = 'market_creatives' AND column_name = 'provenance')
    OR (table_name = 'brands' AND column_name = 'drive_last_sync');
-- 2 lignes = 0051 ET 0052 appliquées ; 1 ligne = une seule ; 0 = aucune.

-- (b) Combien de migrations tracées ? (drizzle inscrit 1 ligne par migration)
SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations;
-- 53 = jusqu'à 0052 appliquée ; 52 = 0052 manquante ; 51 = 0051 et 0052 manquantes.
```

**Absence établie UNIQUEMENT si (a) ne renvoie pas la colonne ET (b) < compte
attendu.** Tant que ce n'est pas établi, ne rien appliquer. Le compte seul ne
prouve pas QUELLE migration a tourné · c'est le couple (colonne, compte) qui
tranche.

**Si — et seulement si — l'absence est établie :** le déploiement exécute
`drizzle-kit migrate` à chaque cycle, donc une migration présente dans le build
s'applique normalement d'elle-même. Une application manuelle n'est justifiée que
si le build la contient déjà mais que le timer ne l'a pas passée :

```bash
cd /home/debian/tiktrends/product && pnpm --filter @tiktrends/db migrate
```

`drizzle-kit migrate` saute par empreinte ce qui est déjà appliqué.
« Idempotente » n'est pas « sans risque » · sauvegarder la base d'abord.

---

## 3 · Jeu isolé N04 · marque, créations, état initial par scénario

Toujours sur une **marque de test dédiée**, jamais une vraie campagne. Modèle
repris de la recette automatisée `product/apps/web/test/n04-suite-faits.test.ts`
(déjà verte sur pglite) :

- **Marque** : une marque jetable (le test utilise « Klorea »).
- **Création** : une pub `template = testimonial`, `headline = "Avis client"`, `quote = "Ma piscine n'a jamais été aussi nette"`.
- **Fait porté** : clé `temoignage`, libellé « Témoignage », contenu = `quote · headline`.
- **Preuves** : table `ad_fact_validations` (`generation_id`, `fact_cle`, `source`, `signature`, `version`, `validated_by`, `validated_at`), append-only.

État initial et résultat attendu par transition :

| Transition CDC v8 | État initial | Résultat attendu |
| --- | --- | --- |
| **3 · fait vérifié sans relecture technique** | Création testimonial, aucun contrôle technique lancé | Badge **« Contrôle technique à faire »**, jamais vert, même le fait vérifié |
| **1 · enregistrer une source + persistance** | Fait `temoignage` « à vérifier » | Après « Vérifier » + source réelle : fait **« vérifié »**, source/auteur/date **persistants après rechargement** ; « Vérifier » sans source est **refusé** |
| **2 · modifier l'accroche validée → caducité** | Fait `temoignage` déjà vérifié | Éditer la citation → fait **« caduc »**, « Prête à diffuser » se ferme, l'ancienne preuve **reste** dans l'historique |

Recette automatisée correspondante (verte, exécutable sans navigateur) :

```bash
cd /home/user/tiktrends/product
pnpm --filter @tiktrends/web exec vitest run test/n04-suite-faits.test.ts   # transitions 1 et 2
pnpm --filter @tiktrends/core exec vitest run test/carte-creative.test.ts    # transition 3 (ligne 147)
```

---

## 4 · Sources réelles, résultats attendus, remise en état

**Sources réelles utilisables** (de vraies pages consultables, pas d'exemple fictif) :

- Testimonial → URL d'un vrai avis (fiche Trustpilot / Google, ou preuve interne accessible).
- Offer / prix → URL de la vraie page produit ou tarif.
- Stat → URL de la source du chiffre avancé.

**Résultats attendus** : `état = vérifié`, `source` = l'URL saisie, `validateur`
= ton nom, `date` = maintenant, `version` = identifiant court `v·xxxxxxxx`
calculé sur le contenu. Éditer le contenu du fait → `version` change et l'état
devient caduc.

**Remise en état** (marque de test uniquement) :

```sql
-- Efface les preuves de test de cette création (écriture · données de test).
DELETE FROM ad_fact_validations WHERE generation_id = '<genId>';
```

Puis remettre la citation d'origine via le studio, ou supprimer la création /
la marque d'essai. Aucune vraie pub n'a été validée artificiellement.

---

## 5 · Diagnostic du doublon « <10s » · SQL lecture seule + interprétation

```sql
SELECT length_bucket, count(*) AS n
  FROM market_creatives
 WHERE brand_id = '<brandId>'
 GROUP BY length_bucket
 ORDER BY length_bucket;
```

Pour voir les octets exacts (espaces, casse, **caractères invisibles**) :

```sql
SELECT DISTINCT length_bucket, encode(convert_to(length_bucket,'UTF8'),'hex') AS octets
  FROM market_creatives
 WHERE brand_id = '<brandId>'
 ORDER BY length_bucket;
```

Deux « <10s » visuellement identiques mais d'`octets` différents portent un
caractère caché. Pour trancher **invisible** (corrigé par #619) vs **homoglyphe**
(hors périmètre de #619) sans lire l'hexa à l'œil :

```sql
-- Repère les clés qui contiennent un caractère de format Unicode invisible
-- (ZWSP U+200B, LRM/RLM, joiner U+2060, ZWNJ/ZWJ, trait conditionnel…).
SELECT length_bucket, encode(convert_to(length_bucket,'UTF8'),'hex') AS octets
  FROM market_creatives
 WHERE brand_id = '<brandId>'
   AND length_bucket ~ '[​‌‍‎‏⁠­﻿]';
```

**Interprétation** (établir build ET données avant de conclure) :

- **Une seule ligne « <10s »** → donnée saine. Un doublon vu dans l'app vient alors du **build servi** · à confirmer par la section 1, pas à supposer.
- **Deux lignes « <10s » qui ne diffèrent que par un caractère invisible** (`\p{Cf}` · ZWSP, LRM/RLM, word joiner…) → **cause code réelle, corrigée par #619** · `cleNormalisee` retire désormais les `\p{Cf}` avant de regrouper, donc `cleDuree` fusionne les deux. Un doublon de ce type persistant après #619 signe un **build antérieur à #619** · à confirmer par la section 1. (Avant #619, `\s` ne couvrait pas ces caractères · ils formaient deux groupes distincts.)
- **Deux lignes « <10s » qui ne diffèrent que par l'espacement** (`<10s` vs `< 10 s`) → `cleDuree` les fusionne déjà à l'affichage depuis #597 (`bf9a043`) · un doublon signe un **build antérieur à #597**.
- **Deux lignes qui diffèrent au-delà de l'espacement/invisible** (`<10s` vs `moins de 10s`, `0-10s`…) → **donnée résiduelle historique** non canonique. Aucun écrivain actuel ne la produit (tous passent par `bucketDuree`) · c'est un reliquat d'import ancien.
- **Deux lignes qui ne diffèrent que par un HOMOGLYPHE** (lettre confusable, ex. « ѕ » cyrillique U+0455 au lieu de « s » latin) → **hors périmètre de #619** · `\p{Cf}` ne couvre pas les lettres. Si la requête ci-dessus ne renvoie rien alors que l'hexa diffère, c'est la piste homoglyphe · le correctif s'étendrait alors (translittération ciblée), sans sur-corriger à l'aveugle.

Chemin de données vérifié en session : un seul point d'agrégation
(`computeMarketStats`), déduplication par `cleDuree` (= `cleNormalisee` sans les
espaces), et depuis #619 `cleNormalisee` retire les `\p{Cf}`. Tous les écrivains
de `length_bucket` passent par `bucketDuree` (buckets canoniques), mais une
donnée résiduelle porteuse d'un invisible ou d'un homoglyphe peut préexister ·
d'où la requête de tri ci-dessus avant de conclure.

Cœur de règle : `product/packages/core/src/adsmap/market-stats.ts`
(`cleNormalisee`, `cleDuree`). Garde : `adsmap-market.test.ts` (test « deux
« <10s » séparés par un caractère invisible fusionnent », prouvé en retirant le
`\p{Cf}` · 4 rangées au lieu d'une).

---

## 6 · Identité du build · le raccordement EXACT de BUILD_SHA (après #620 et #624)

Le bandeau de diagnostic affichait « inconnu » comme commit servi. Ce n'est ni le
bandeau ni la mécanique applicative qui étaient en cause · c'est le raccordement
de la variable, resté incomplet.

### La chaîne, maillon par maillon

Le commit doit traverser CINQ étapes · un seul maillon lâché et le bandeau
retombe à « inconnu ». De l'amont vers l'aval :

1. **Le script de déploiement** · `product/ops/deploy.sh`, lancé EN PLACE par le
   service systemd (`product/ops/tiktrends-deploy.service` · `ExecStart=/home/
   debian/tiktrends/product/ops/deploy.sh`, `WorkingDirectory=/home/debian/
   tiktrends`). Le dépôt utilisé est `/home/debian/tiktrends` (variable `REPO`
   dans le script), branche `main`. Le timer `tiktrends-deploy.timer` déclenche
   ce service chaque minute · le timer ne contient AUCUNE logique de build, il
   ne fait qu'appeler le service · rien à coller dedans.
   → #624 ajoute, APRÈS le `git pull` et le `cd "$REPO/product"`, juste avant le
   build :
   ```bash
   export BUILD_SHA
   BUILD_SHA=$(git rev-parse --short=8 HEAD)
   ```
   `git rev-parse` est évalué APRÈS le pull, donc `HEAD` = le commit réellement
   compilé. C'est un ordre de SHELL, dans le script `deploy.sh` · ce n'est PAS
   une directive systemd, et il n'a pas sa place dans un fichier `.service` ou
   `.timer`. (Export et affectation sont séparés à dessein · sous `set -e`,
   `export X=$(cmd)` masquerait un échec de `cmd`.)
2. **Docker Compose** · `product/docker-compose.yml`, service web ·
   `build: { context: ., dockerfile: Dockerfile.web, args: { BUILD_SHA: "${BUILD_SHA-}" } }`.
   Il LIT `BUILD_SHA` dans l'environnement (celui que `deploy.sh` vient
   d'exporter) et le passe en build-arg. Absent, `${BUILD_SHA-}` vaut la chaîne
   vide · rien ne casse, le bandeau dit « inconnu ».
3. **L'image** · `product/Dockerfile.web`, étage `build` · `ARG BUILD_SHA=""`
   promu en `ENV BUILD_SHA=$BUILD_SHA` AVANT `RUN pnpm --filter @tiktrends/web
   build`, pour que la variable existe quand Next compile.
4. **La compilation** · `apps/web/next.config.mjs` · `gitSha()` préfère
   `process.env.BUILD_SHA` (sinon tente `git rev-parse`, sinon `''`) et fige le
   résultat dans `env.BUILD_SHA`. Next l'INLINE dans le bundle · la valeur est
   gelée dans le code compilé, l'étage `run` de l'image n'a donc pas besoin de la
   variable.
5. **L'application** · `apps/web/lib/deployment.ts:46` relit
   `process.env.BUILD_SHA?.slice(0,8)` (la valeur inlinée) pour le champ `build`,
   rendu par le bandeau (`deploymentState`).

**Cause première du « inconnu »** · l'image se bâtit depuis le contexte
`product/`, qui ne contient PAS `.git`, sur `node:20-alpine` sans git · l'étape 4
ne pouvait pas déduire le commit seule. Il fallait le lui fournir par les étapes
1→3. #620 avait posé 2 et 3 ; SANS l'étape 1, le build-arg restait vide et la
chaîne était muette · #624 pose l'étape 1 (`deploy.sh`), donc raccorde le tout.

**Garde** · `apps/web/test/build-sha-wiring.test.ts` verrouille le RÉSULTAT du
maillon 4 (un `BUILD_SHA` fourni est bien figé dans `env`) ET la présence des
maillons 1, 2, 3 (deploy.sh exporte le SHA git avant le build, compose passe
l'arg, Dockerfile déclare ARG/ENV avant `pnpm build`), chacun prouvé en le
faisant tomber. Il ne PROUVE pas l'exécution réelle sur le VPS (un build Docker
complet, hors de portée d'un test unitaire) · seule la vérification ci-dessous le
fait.

### Ce qui reste à faire sur le VPS · rien à modifier à la main

`deploy.sh` étant lancé EN PLACE depuis le dépôt (pas une copie installée · seuls
les fichiers `.service`/`.timer` ont été copiés une fois dans `/etc/systemd/`, et
ils ne changent pas), le correctif #624 s'applique DE LUI-MÊME au prochain cycle
qui reconstruit. **Aucune édition du timer ni du service n'est requise · ne pas y
toucher.**

Décalage d'un cycle POSSIBLE, à confirmer selon l'exécution du script · quand le
cycle qui PULL #624 réévalue-t-il `deploy.sh` ? bash relit le fichier en cours
d'exécution de façon non garantie · ce cycle-là peut donc tourner sur l'ancien
script (sans export, « inconnu ») ou sur le nouveau. Dans tous les cas, à partir
du build suivant reconstruit avec le nouveau script, le SHA apparaît. **Inutile
de créer un commit artificiel pour forcer un build, et ne pas toucher au timer** ·
le prochain déploiement de code fera foi.

### Vérification que le SHA affiché correspond au code construit

Le SHA du bandeau est le commit dont l'IMAGE a été bâtie · il peut différer du
`HEAD` courant du VPS si le dépôt a avancé depuis ce build. On raisonne donc sur
le SHA du bandeau, pas sur `HEAD` :

1. Ouvrir le bandeau de diagnostic Jarvis · noter le champ `build` (« inconnu »
   = build sans `BUILD_SHA`, cf. décalage ci-dessus).
2. Prouver que ce commit inclut #624 · il doit en être un **descendant** (être
   ancêtre de `origin/main` ne suffit pas) :
   ```bash
   git -C /home/debian/tiktrends merge-base --is-ancestor debf8a4 <sha_bandeau> \
     && echo "l'image servie inclut #624" || echo "image antérieure à #624"
   ```
3. Un SHA absent de l'historique de `origin/main` signalerait un build local non
   poussé · à ne pas présenter comme la version servie.

---

## N03 · comportement attendu (après correction #611)

Deux axes tenus **séparés**, le canal ne conférant jamais la pertinence :

- **Canal d'acquisition** (fait, colonne `provenance`) · `followed` → « Marque suivie », `radar` → « Détectée par le Radar », `null` → « Origine inconnue », plusieurs canaux dans une part → « Provenances multiples ».
- **Qualification métier** (pertinence competitive, champ `qualification` explicite) · établie SEULEMENT par une qualification distincte et étayée, **jamais déduite du canal**. « À qualifier » tant que rien ne l'établit ; « Concurrent direct » / « Inspiration adjacente » / « Preuve propre » quand c'est prouvé ; « Pertinences mixtes » quand plusieurs qualifications établies coexistent.

**Sources historiques non qualifiées** · `provenance IS NULL` (sauf celles
rétro-remplies en `radar` sur preuve `radar_signal`). Canal « Origine inconnue »,
qualification « À qualifier ». Elles ne reçoivent aucune catégorie inventée ·
elles n'obtiennent une pertinence que si une qualification distincte l'établit.

**Tag par marque** · le canal vit sur la ligne `market_creatives` par
`brand_id`. La même pub externe peut donc porter un canal différent selon la
marque qui l'a acquise. Le tag d'une part reflète les canaux (et, séparément,
les qualifications établies) des créas qui alimentent la rangée de CETTE marque.
« Provenances multiples » (plusieurs canaux) ne se confond pas avec
« Pertinences mixtes » (plusieurs qualifications établies) · chaque décompte dit
ce qu'il mesure.

Cœur de la règle : `product/packages/core/src/adsmap/source-pertinence.ts` (pur,
testé). Gardes : `source-pertinence.test.ts`, `adsmap-market.test.ts`,
`n03-sources-marche.test.ts`.

---

## N09 · bilan de synchro Drive · comportement attendu (après #613 et #614)

Chemin vérifié côté code · le bilan trouvés/importés/ignorés/erreurs est
**produit** (`syncDriveAssets`), **conservé** (colonne `brands.drive_last_sync`,
migration 0052) et **affiché** au rechargement (tiroir « Dernier import »).

- **Dernier succès ≠ dernière tentative** · `driveSyncedAt` = dernier SUCCÈS ;
  `drive_last_sync` = dernière TENTATIVE `{ at, ok, found, added, skipped,
  errors }`. Un succès écrit les deux ; un échec écrit la tentative
  (`ok:false`) SANS toucher `driveSyncedAt`. Le tiroir signale « Dernière
  tentative · échec » quand un échec suit le dernier succès · un ancien succès
  ne masque plus l'échec.
- **« sans dossier » vs « jamais synchronisé »** · tranché par `driveFolderId`,
  pas par la date seule (`etatSyncDrive`). Sans dossier → « Aucun dossier » ;
  dossier choisi et jamais synchronisé → « Jamais synchronisé ».
- **Portée du compteur** · « N asset(s) en bibliothèque » = imports + téléversements
  (table `assets`) ; les créations générées (Pubs IA, Image IA) sont comptées à
  part, pas dans ce total. Aucune conflation en donnée (`listAssets` ne lit que
  `assets`).

Cœur de règle : `product/packages/core/src/connecteurs-catalogue.ts`
(`etatSyncDrive`, `derniereTentativeDriveEnEchec`, `resumeImportDrive`), purs et
testés. Écriture : `syncDriveNowAction` (`product/apps/web/app/actions/drive.ts`).

---

## R04 · nature d'un lot · comportement attendu (après #622)

Trois axes tenus **séparés**, pour qu'un lot importé « Analysé » contenant des
ads « Brouillon » ne se lise plus comme une contradiction :

- **Nature** (`natureLot`) · « suivi » ou « importé ». Lue dans les faits, jamais
  posée en base · un lot `status = 'analyzed'` SANS `launchedAt` ne peut pas
  venir du parcours (lancer écrit `launchedAt` avant tout verdict) · c'est un
  import. Aucun statut n'est réécrit. Aujourd'hui seul l'import pose « analyzed »,
  mais le gate reste juste si un jour le parcours l'atteint après un vrai test
  (`launchedAt` renseigné → « suivi »).
- **Statut opérationnel** (`batch.status`) · où le lot en est dans le parcours.
  Pour un lot importé, « Analysé » désigne le verdict repris de l'outil tiers,
  pas une étape de l'outil.
- **Complétude** de chaque ad (son propre statut · « Brouillon »…). Un import
  porte des enregistrements historiques parfois partiels · normal, pas un
  travail en attente.

Affichage · badge « Importé · historique » à côté du statut, réserve sous
l'en-tête qui explique la coexistence et la non-comparabilité, marqueur
« · importé » dans le rail. Actions inchangées · un import (analysé) était déjà
en lecture seule · on nomme désormais pourquoi. Aucune conversion d'historique
ni de verdict · les réserves d'estimation R04 (#607) sont préservées.

Cœur de règle : `product/packages/core/src/adsmap/lot-nature.ts` (`natureLot`,
`estLotImporte`, `LIBELLE_NATURE_LOT`, `lotEnLectureSeule`), pur et testé.
Affichage : `product/apps/web/app/(app)/adsmap/lots/NatureLot.tsx` (rendu vérifié
en lisant le HTML). Gardes : `lot-nature.test.ts`, `lot-nature-rendu.test.tsx`.

---

## Ce qui reste OUVERT

Le déploiement et la recette navigateur ne sont pas confirmables depuis la
session (le proxy bloque l'app en ligne, pas d'accès SSH). Restent donc à
vérifier dans l'application, par le propriétaire :

- **Identité du build** · le raccordement de `BUILD_SHA` est complet en code (#620 + #624), y compris `deploy.sh` qui l'exporte · aucune édition du timer/service à faire (section 6). Reste à CONFIRMER sur le VPS · le bandeau montre le SHA servi (plus « inconnu ») et ce SHA correspond au commit compilé. Attention au décalage d'un cycle · le premier build après #624 tourne encore sur l'ancien script · le SHA apparaît au commit de code suivant, ou par la commande de vérification manuelle de la section 6 ;
- application de 0051 et 0052 en base (section 2, sans réappliquer avant d'établir l'absence) ;
- **N02** · sur une marque à verdicts relatifs / importés · panneau renommé, aucun angle relatif ou importé présenté « gagnant » dans le texte injecté ni les recommandations ;
- les trois transitions N04 dans le navigateur (section 3) · les gardes automatisées sont vertes (`n04-suite-faits.test.ts`, `carte-creative.test.ts`), la recette DÉPLOYÉE reste ouverte ;
- **N03** · tag canal / qualification sur le panneau marché ; doublon « <10s » · **RESTE OUVERT jusqu'à reproduction réussie sur les données concernées** · après #619 la cause « caractère invisible » est corrigée en code, mais tant que le doublon n'est pas reproduit puis vu disparaître in situ, ne pas le clore. Si un doublon subsiste, trancher invisible / homoglyphe / résiduel par §5 · ne PAS étendre la normalisation aux homoglyphes sans preuve qu'ils interviennent dans CE défaut ;
- **N06** · détail de créa · confirmé dans Chrome à 360 px (#605) · reste ouvert le seul contrôle sur téléphone PHYSIQUE ;
- **R04 / R06** · lot 29 in situ · réussite estimée, unité budget · les données historiques sont CONSERVÉES ; la recette confirme que le badge « Importé · historique » et sa réserve rendent la coexistence avec les ads « Brouillon » compréhensible (#622), et que le marqueur « · importé » du rail est présent ;
- N09 in situ · les gardes automatisées couvrent les sept scénarios (§N09) et sont vertes ; la recette DÉPLOYÉE reste ouverte · dossier vide, fichiers ignorés, un échec PUIS rechargement (le bilan et l'échec doivent survivre), état jamais-synchronisé, fraîcheur, références de marque.

Les constats concernés restent ouverts jusqu'à cette vérification · la prochaine
étape est la recette de l'application, pas un nouveau chantier de développement.
Les tests automatisés (N04, N09) sont un acquis · ils ne remplacent pas la
recette déployée, qui seule confirme le comportement réel.
