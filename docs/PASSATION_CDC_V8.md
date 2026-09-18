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

**Commit de référence du lot complet : `3fdafc0`** (il contient les précédents dans son historique).

**Vérifier par l'HISTOIRE, jamais par « ≥ SHA ».** Sur le VPS (`debian@51.255.39.79`, dépôt `/home/debian/tiktrends`) :

```bash
git -C /home/debian/tiktrends fetch --quiet
git -C /home/debian/tiktrends merge-base --is-ancestor 3fdafc0 HEAD && echo "présent" || echo "absent"
git -C /home/debian/tiktrends log --oneline | grep -E '#607|#608|#609|#610|#611'
```

`présent` = le commit servi descend de `3fdafc0`. Sans SSH : l'écran de diagnostic Jarvis affiche le champ `build` (les 8 premiers caractères de `BUILD_SHA`, posé au build, via `deploymentState`) · il doit valoir `3fdafc0` ou un descendant. Un `BUILD_SHA` absent n'affiche rien · dans ce cas on ne conclut rien.

Le timer systemd `tiktrends-deploy.timer` tire et redéploie chaque minute · le décalage build ↔ `main` se résorbe seul, sauf blocage.

---

## 2 · Migration 0051 · identification, vérification, migration seulement si absente

**Identification exacte** dans `product/packages/db/drizzle/meta/_journal.json` :

- `idx: 51`, `tag: "0051_market_creative_provenance"`, `version: "7"`, `when: 1788300000010`.
- Fichier SQL : `product/packages/db/drizzle/0051_market_creative_provenance.sql`.
- Compte embarqué : `MIGRATIONS_IN_BUILD = 52` dans `product/packages/db/src/journal.ts` (idx 0…51 = 52 migrations), gardé par le test du journal.
- Effet : `ALTER TABLE market_creatives ADD COLUMN IF NOT EXISTS provenance text;` + backfill `provenance = 'radar'` là où `radar_signal IS NOT NULL`. Nullable, sans défaut · rétro-compatible.

**Vérifier sa présence AVANT toute application** (lecture seule) :

```sql
-- (a) L'effet de schéma est-il là ?
SELECT 1 FROM information_schema.columns
 WHERE table_name = 'market_creatives' AND column_name = 'provenance';
-- 1 ligne = colonne présente.

-- (b) Combien de migrations tracées ? (drizzle inscrit 1 ligne par migration)
SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations;
-- 52 = 0051 appliquée ; 51 = 0051 non appliquée.
```

**Absence établie UNIQUEMENT si (a) ne renvoie rien ET (b) < 52.** Tant que ce
n'est pas établi, ne rien appliquer. « 51/51 » ou « 52/52 » seul ne prouve pas
QUELLE migration a tourné · c'est le couple (colonne, compte) qui tranche.

**Si — et seulement si — l'absence est établie :** le déploiement exécute
`drizzle-kit migrate` à chaque cycle, donc une 0051 présente dans le build
s'applique normalement d'elle-même. Une application manuelle n'est justifiée que
si le build contient déjà 0051 mais que le timer ne l'a pas passée :

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

Pour voir les octets exacts (espaces, casse) :

```sql
SELECT DISTINCT length_bucket, encode(convert_to(length_bucket,'UTF8'),'hex') AS octets
  FROM market_creatives
 WHERE brand_id = '<brandId>'
 ORDER BY length_bucket;
```

**Interprétation** (établir build ET données avant de conclure) :

- **Une seule ligne « <10s »** → donnée saine. Un doublon vu dans l'app vient alors du **build servi** · à confirmer par la section 1, pas à supposer.
- **Deux lignes « <10s » qui ne diffèrent que par l'espacement** (`<10s` vs `< 10 s`) → `cleDuree` les fusionne déjà à l'affichage depuis #597 (`bf9a043`) · un doublon persistant signe un **build antérieur à #597** · à confirmer par la section 1.
- **Deux lignes qui diffèrent au-delà de l'espacement** (`<10s` vs `moins de 10s`, `0-10s`…) → **donnée résiduelle historique** non canonique. Aucun écrivain actuel ne la produit (tous passent par `bucketDuree`) · c'est un reliquat d'import ancien.

Chemin de données vérifié en session : un seul point d'agrégation
(`computeMarketStats`), déduplication `cleDuree` depuis #597, tous les écrivains
de `length_bucket` passent par `bucketDuree` (buckets canoniques). Le code
courant ne peut pas émettre deux rangées « <10s ».

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

## Ce qui reste OUVERT

Le déploiement et la recette navigateur ne sont pas confirmables depuis la
session (le proxy bloque l'app en ligne, pas d'accès SSH). Restent donc à
vérifier dans l'application, par le propriétaire :

- application de 0051 en base (section 2, sans réappliquer avant d'établir l'absence) ;
- les trois transitions N04 dans le navigateur (section 3) ;
- le tag de canal / qualification sur le panneau marché (section N03) ;
- le doublon « <10s », build ET données (section 5).

Les constats concernés restent ouverts jusqu'à cette vérification.
