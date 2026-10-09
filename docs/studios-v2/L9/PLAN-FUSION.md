# Plan de fusion · Studios v1.0 vers `main`

Lot L9-A (vague 8). Ce plan dit **dans quel ordre fusionner, ce que chaque fusion déclenche, quoi regarder après, et
comment revenir en arrière**. Il ne décide rien à la place du propriétaire : la fusion attend la recette indépendante
(cahier §14, « Recette indépendante avant fusion selon mandat existant »), et chaque relevé ci-dessous se refait avec
la commande donnée avant de s'en servir. Relevés du 2026-10-09 (`git fetch` puis `gh api …/pulls`).

## 1. Ce qui est en attente

### 1.1 Les PR et leur base

`main` = `bc33cec` (#728). Les lots Studios sont empilés : chaque vague a une branche de base
`claude/studios-base-vagueN` qui est un INSTANTANÉ D'INTÉGRATION (la vague précédente + ses raccords), et
`claude/studios-integration` (#741, tête `f2b9fc4`) les contient tous.

| Instantané (branche de base) | SHA | Apporte (PR dont la tête y entre pour la première fois) | Migration ajoutée |
| --- | --- | --- | --- |
| `claude/studios-base-vague2` | `beac17c` | #732 L1 fondations, #733 L2 noyau, #734 L0 lectures pures | **0054** |
| `claude/studios-base-vague3` | `119d2bf` | raccords SEC × L2 × L3 (têtes #735–#737 mises à jour plus tard) | · |
| `claude/studios-base-vague4` | `2ce211f` | raccords L4-A × L4-B × L4-C (#738–#740, voir 1.2) | · |
| `claude/studios-base-vague5` | `ad883e7` | #735 SEC, #742 L5-A, #743 L5-B, #744 L5-C, raccord L5 | · |
| `claude/studios-base-vague5b` | `bf99691` | fusion F-A | · |
| `claude/studios-base-vague5c` | `f2fd4bb` | #746 F-C | · |
| `claude/studios-base-vague6` | `66c2e8a` | #736 L3, #737 L2 serveur, #745 F-A, #747 F-B, #748 F-D, raccord tests | · |
| `claude/studios-base-vague7` | `0f6f836` | #749 G-A, #750 G-B, #751 L6-B, #752 L6-A, raccord L6-A × L6-B | · |
| `claude/studios-integration` (#741) | `f2b9fc4` | #753 R3, #754 L7-A, #755 L7-B, #756 E, raccords vague 7 | **0055** |
| vague 8 (à venir) | · | L8-A/B/C/D, R4, L9-A (ce lot) | 0056/0057 éventuelles |

Chaque instantané est ancêtre du suivant (vérifié : `git merge-base --is-ancestor <précédent> <suivant>`).

Hors de cette pile :

- **#731** L0 dossier (`claude/studios-l0-dossier`, base `main`, tête `a7b12ba`) : seulement `docs/studios-v2/`
  (PROGRESS). Ses commits récents ne sont dans aucun instantané.
- **#738, #739, #740** (L4) : leur dernier commit n'est pas dans `f2b9fc4`, mais son EFFET y est (pages de recette
  absentes de `f2b9fc4`, routes Projets dans `lib/navigation.ts` par la résolution de `0f6f836`). À fermer comme
  « livré par l'intégration » plutôt qu'à fusionner.
- **#729, #730** (Lot 21 D et E, base `main`) : indépendants de Studios. Aucun fichier en commun avec
  `bc33cec..f2b9fc4` ni entre eux (vérifié par `comm` des listes de fichiers). Aucune migration.

Pour refaire ces relevés :

```bash
git fetch origin
gh api 'repos/kglx80-oss/tiktrends/pulls?state=open&per_page=50' --jq '.[] | "\(.number) \(.base.ref) \(.head.ref) \(.head.sha[0:7])"'
git merge-base --is-ancestor <tête PR> <instantané> && echo dedans
git diff --name-only --diff-filter=A <instantané précédent> <instantané> -- product/packages/db/drizzle/*.sql
```

### 1.2 Raccords qui n'existent QUE sur les instantanés

Ces changements ne sont dans aucune PR de lot : ils vivent dans des commits d'intégration ou dans la résolution de
conflits d'une fusion. Un lot fusionné SEUL sur `main` ne les a pas.

| Où | Ce que c'est | Fichiers |
| --- | --- | --- |
| `119d2bf` | raccords SEC × L2 × L3 | (commit) |
| `2eb54ea`, `2ce211f` | raccords L4-A × L4-B, L4-C × L4-B | (commits) |
| `ad883e7` | photo du catalogue jusqu'à l'éditeur et au rendu | (commit) |
| `66c2e8a` | le moteur reçoit le décodeur obligatoire (tests F-A, F-B) | (commit) |
| `0f6f836` | fusion L6-A × L6-B, conflits résolus | `components/studios/projet/VueProjet.tsx`, `lib/navigation.ts`, `lib/studios/execution/commandes.ts`, `test/l4b-pages-rendu.test.tsx`, `test/l6b-identites-db.test.ts`, `packages/core/src/index.ts` |
| `66f9867` | fusion L3, conflit résolu | `lib/studios/execution/commandes.ts` |
| `2b0f6bd` | fusion L5-C, conflits résolus | `lib/navigation.ts`, `packages/core/src/index.ts` |
| `beac17c`, `c997654`, `e309f39`, `cf4d16f`, `6f0d6a0`, `3db7cea`, `422ad1f`, `f2fd4bb`, `bbe1b9a` | exports ajoutés par plusieurs lots | `packages/core/src/index.ts` |
| `f2b9fc4` | raccords L7-A × L7-B × R3 × E | 20 fichiers |

Pour les relister : `git show --cc --format= <fusion> | grep '^diff --cc'` et
`git log --no-merges --grep='^Intégration' bc33cec..f2b9fc4`.

## 2. Ordre recommandé

`CLAUDE.md` impose « une modification = une PR, créée ET fusionnée en squash, partie de `main` ». Fusionner en squash
une pile de PR empilées a un coût connu : après le squash de la première, la suivante (dont la base contient les
commits NON squashés) affiche à nouveau tout le travail précédent et se rebase avec conflits, et les raccords du §1.2
n'appartiennent à aucune PR. Trois chemins :

| Chemin | Fusions | États intermédiaires sur `main` | Retour arrière |
| --- | --- | --- | --- |
| **A · par instantané (recommandé)** | 1 squash par vague, depuis la branche de base de la vague suivante (puis #741, puis vague 8) | exactement les instantanés déjà intégrés et testés | par vague |
| B · une seule fusion | #741 (puis vague 8) en un squash | aucun | tout Studios d'un coup |
| C · lot par lot | 25 squash, chaque PR rebasée sur `main` (`git rebase --onto main <ancienne base> <branche>`) et raccords du §1.2 reportés à la main | jamais testés tels quels | par lot |

**A** est le seul chemin où chaque état de `main` est un état déjà intégré et passé aux portes, tout en gardant un
retour arrière par vague. Une fusion squash de l'instantané N+1 sur un `main` qui contient déjà l'instantané N (en
squash) est sans conflit : les deux côtés portent les mêmes changements depuis `bc33cec`, et le commit squash ne
contient que la vague N+1 (même si GitHub affiche le diff depuis `bc33cec`). #729/#730 ne touchent aucun fichier
Studios : ils peuvent passer avant, entre ou après.

Ordre A, avec la base effective de chaque fusion (= `main` au moment de fusionner) :

| # | Fusion vers `main` | Base effective | Contenu du squash | Migrations appliquées par `deploy.sh` |
| --- | --- | --- | --- | --- |
| 0 | #731 (dossier, docs seules) | `bc33cec` | `docs/studios-v2` | aucune (pas de rebuild : hors `product/`) |
| 0′ | #729 puis #730 (Lot 21, indépendants) | `main` du moment | 7 puis 9 fichiers | aucune |
| 1 | PR `claude/studios-base-vague2` → `main` | `main` (+0, 0′) | L0 lectures, L1, L2 noyau | **0054** |
| 2 | `…-base-vague3` | 1 | SEC × L2 × L3 (raccords) | aucune |
| 3 | `…-base-vague4` | 2 | L4 | aucune |
| 4 | `…-base-vague5` | 3 | L5, SEC | aucune |
| 5 | `…-base-vague5b` | 4 | F-A | aucune |
| 6 | `…-base-vague5c` | 5 | F-C | aucune |
| 7 | `…-base-vague6` | 6 | L3, L2 serveur, F-A/F-B/F-D | aucune |
| 8 | `…-base-vague7` | 7 | vague 6 | aucune |
| 9 | #741 `claude/studios-integration` | 8 | vague 7 | **0055** |
| 10 | intégration vague 8 | 9 | vague 8 | 0056/0057 éventuelles |

Puis fermer #732–#740, #742–#756 avec un lien vers la fusion qui les a apportés (ne supprimer aucune branche).

Si le propriétaire préfère une seule fusion (B), même procédure d'observation, un seul déploiement, un seul retour
arrière.

**Migrations de la vague 8.** Avant de fusionner une vague qui apporte 0056/0057 : `when` strictement supérieur à
`1791400823602` (0055), journal contigu. Le test `apps/web/test/l9-migration-additive.test.ts` le vérifie
(`violationsJournalMigrations`) ; sans ça, le migrateur IGNORERAIT la migration sans erreur. Et la rejouer en local
avec `ops/migration/verifier-migration.sh` (elle doit être additive et rejouable comme 0054/0055).

## 3. Ce que fait le déploiement automatique à chaque fusion

Lu dans `ops/deploy.sh` **tel que modifié par D1** (vague 9, `16a97d3` ; banc `ops/test-deploiement/banc.sh`,
garde `apps/web/test/d1-deploiement.test.ts`). Le timer tourne chaque minute :

1. `git fetch` ; si le marqueur `.tiktrends-deployed-sha` vaut déjà `origin/main`, rien.
2. `git pull --ff-only`. Si rien n'a changé sous `product/apps`, `product/packages`, Dockerfiles, compose, Caddyfile
   depuis le dernier SHA DÉPLOYÉ : marqueur avancé, **aucun rebuild** (cas de #731, et des fusions docs seules).
3. Sinon `BUILD_SHA` = 8 premiers caractères du commit, `docker compose build` : images reconstruites, **aucun
   conteneur remplacé** (l'ancienne version reste servie).
4. Base démarrée si absente (jamais remplacée), puis migrations dans un conteneur ÉPHÉMÈRE de la NOUVELLE image
   workers (`docker compose run --rm --no-deps … pnpm --filter @tiktrends/db migrate`, 6 essais espacés de 5 s).
5. Vérification : chaque migration du journal du dépôt est en base (inclusion ; une base en avance après un revert
   reste acceptée). Attrape aussi une migration ignorée par drizzle pour un `when` trop ancien.
6. Seulement alors `docker compose up -d --no-build` : activation du nouveau code. Marqueur avancé en dernier.
   Un échec en 3, 4, 5 ou 6 laisse le marqueur et **ne remplace aucun conteneur** : retenté à la minute suivante.

Conséquences pour les fusions 1 et 9 :

- La fenêtre « nouveau code sur ancien schéma » mesurée par L9-A (L9-MIGRATION §7 : écrans Studios en `42P01`,
  réservations refusées) **n'existe plus** : le nouveau code n'est activé qu'après une migration vérifiée.
- La fenêtre INVERSE (ancien code sur schéma étendu, pendant 4 et 5) est sûre : 0054 n'ajoute que des tables
  `studio_*` nouvelles et deux unicités sur des clés déjà primaires, 0055 une colonne nullable ; une garde permanente
  (`d1-deploiement`) refuse toute migration future non additive ou portant un déclencheur sur une table existante.
- Non éprouvé sans démon Docker : la recréation effective des conteneurs par `up -d` et la connexion du conteneur
  éphémère à la base · procédure réelle sur copie isolée : `ops/README.md`, projet `tiktrends-essai-d1`.
- 0054 pose deux unicités sur `brands` et `adsmap_ads` : écritures bloquées sur ces deux tables le temps de construire
  les index (proportionnel au nombre de lignes).
- Si la migration échoue 12 fois, le site tourne sur le nouveau code avec l'ancien schéma JUSQU'À la réussite d'un
  tick suivant. À surveiller (§4).

Amélioration possible (fichier hors lot, à décider) : lancer `migrate` AVANT de recréer le conteneur web
(`docker compose run --rm workers pnpm --filter @tiktrends/db migrate` puis `up -d`) ferme cette fenêtre : les
migrations étant additives, l'ancien code supporte le nouveau schéma (prouvé par MIG-03).

## 4. Après chaque fusion · observer, en lecture seule (MIG-06)

La session ne voit ni le VPS ni l'application (proxy) : **pour elle, le SHA servi est « inconnu »**. Le propriétaire
observe :

| Quoi | Commande ou écran | Attendu |
| --- | --- | --- |
| Dernier SHA déployé | `cat ~/tiktrends/.tiktrends-deployed-sha` | = `git rev-parse origin/main` |
| Image servie récente | `docker compose ps web` et `docker compose images web` (dans `~/tiktrends/product`) | conteneur recréé après l'heure de fusion. Depuis D1, `BUILD_SHA` est AUSSI dans l'environnement des conteneurs (`ENV` des images web et workers) : `docker compose exec web printenv BUILD_SHA` ; il reste figé dans le build Next et lu par `/console` |
| SHA vu par l'app | écran `/console` (bandeau de diagnostic, `lib/deployment.ts`) | même SHA ; « inconnu » si `BUILD_SHA` absent : le dire tel quel, ne pas le déduire |
| Migrations | `/console`, ou `select count(*), max(created_at) from drizzle.__drizzle_migrations` | 55 après fusion 1, 56 après fusion 9 ; comparer à `drizzle/meta/_journal.json` |
| Déploiement | `journalctl -u tiktrends-deploy -n 50 --no-pager` | « Déploiement terminé (<sha>) », pas d'« ÉCHEC · migrations » |
| Erreurs | `docker compose logs web --since 15m \| grep -iE "error\|42P01\|42703"` | rien après la fin de la migration |
| Parcours | ouvrir Accueil, Pubs IA, Image, Vidéo, Textes, Veille, Sauvegardes, Adsmap, puis Projets | 200, contenus historiques présents |

GitHub Pages ne prouve rien sur la version servie (cahier §14).

## 5. Retour arrière par vague

Procédure complète et preuve locale : `L9-MIGRATION.md` §5.

1. PR de `git revert <commit squash de la vague>` vers `main`, fusion normale (pas de force-push, pas de contournement
   des protections).
2. `deploy.sh` reconstruit l'état précédent. Son migrateur ne fait rien (aucune migration n'est défaite). Les tables
   `studio_*` et leurs lignes restent ; l'ancien code les ignore.
3. Observer comme au §4 ; `/console` dira « La base a N migration(s) de plus que ce build » : attendu.
4. Revenir en avant = fusionner le revert du revert : le migrateur ne refait rien, les projets créés avant le retour
   arrière réapparaissent (prouvé localement).
5. Ne jamais restaurer une sauvegarde pour défaire 0054/0055 (L9-MIGRATION §6.3) ; restaurer seulement en isolé pour
   vérifier.

Retour arrière par vague (chemin A) : revert de la fusion N seule si N ne porte pas de migration ; les fusions 1
(0054) et 9 (0055) se défont côté CODE de la même façon, le schéma restant en avance.

Points connus de l'ancien code sur base en avance : supprimer une marque qui porte un projet Studios échoue
(RESTRICT, voulu, sans message dédié dans l'ancien écran) ; les lignes `ai_spend` « à réconcilier » peuvent être
réglées par l'ancien code, qui ignore la colonne.
