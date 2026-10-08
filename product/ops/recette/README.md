# Recette Studios · essai réel isolé

Kit pour lancer, **toi-même**, le premier rendu image réel (pas 1) puis le
benchmark (pas 2), dans un environnement qui ne partage **rien** avec la
production. La session de développement n'a aucune clé et ne voit aucun rendu :
elle a préparé les commandes, elle ne les a pas lancées pour de vrai.

Statut tant que ces deux pas n'ont pas été recettés : **Studios IA non
validés**. Ne pas les annoncer opérationnels avant parcours réel recetté.

---

## 1. Budget · ce qui est approuvé, ce qui est proposé

| Montant | Statut |
| --- | --- |
| **15 $** pour l'ensemble de l'essai (pas 1 + pas 2) | **Approuvé** par le propriétaire le 8 octobre. Posé comme plafond dur de tout l'environnement (`AI_SPEND_CAP_USD=15` dans le compose, vérifié par test). |
| **1 $** au plus pour une passe du pas 1 | **PROPOSITION, à approuver avant lancement.** Ce n'est pas une dépense approuvée. Tu peux la baisser (`--plafond-passe-usd`), jamais la monter. |
| **0,22 $** au plus pour le pas 1 tel qu'il est chiffré aujourd'hui | Annonce calculée par le code (compilation texte 0,14 $ + image 0,08 $). C'est ce montant que tu recopies pour confirmer. Rien ne part sans cette saisie. |
| Pas 2 · **15 $ moins tout ce qui est déjà compté** | Le devis benchmark annoncé (9,925 $) est **en cours de recalcul par R3** (réessais, borne d'entrée). **Le pas 2 attend ce recalcul.** |

Barrières qui tiennent même si une consigne est oubliée :

- la réservation commune (`reserverDepense`) refuse tout appel au-delà du plafond, dans la base de recette ;
- pendant le pas 1, le plafond du processus est abaissé à « déjà compté + montant que tu as tapé » ;
- le web et le worker de recette n'ont aucune clé payante (`neutralise.env`), ils ne peuvent rien dépenser.

## 2. Où lancer · vérification OBLIGATOIRE avant démarrage

Deux possibilités :

- **A · recommandée** · ta machine, avec Docker Desktop (macOS, Windows) ou Docker Engine (Linux). Rien ne touche le VPS.
- **B** · le VPS, dans le projet compose séparé `tiktrends-recette`. La production continue de tourner à côté : la construction des images lui prend de la mémoire.

Avant `up`, **dans les deux cas**, depuis `product/` :

```bash
free -m                      # colonne « available »
df -h .                      # partition qui porte Docker (souvent /)
docker stats --no-stream     # ce que consomment déjà les conteneurs (la prod sur le VPS)
```

Seuils, à ne pas franchir · **en dessous, ne démarre pas** :

| Ressource | Seuil minimal | D'où il vient |
| --- | --- | --- |
| Mémoire disponible (`available`) | **3 500 Mo** | Pic MESURÉ de `next build` : 2 375 Mo (4 cœurs, 211 s). Plus Postgres, Redis, et le pic mesuré d'une commande d'outils (623 Mo) qui ne tourne pas en même temps que le build. Marge d'environ 30 %. |
| Disque libre | **10 Go** | Dépendances MESURÉES : 804 Mo, copiées dans deux images (web, worker), plus le cache de construction, les images de base (Node, Postgres pgvector, Redis) et la base. Environ 5 Go estimés, seuil doublé. |

Sur le VPS, si `docker stats` montre la production déjà proche de la mémoire
totale, passe par l'option A même si `available` passe le seuil.

## 3. Variables nécessaires (sans valeur ici)

### Dans `ops/recette/.env.recette` · créé par toi, ignoré par git

| Variable | Rôle |
| --- | --- |
| `POSTGRES_PASSWORD` | Mot de passe de la base de recette (hexadécimal, il entre dans une URL). |
| `AUTH_SECRET` | Signature des sessions du web de recette. |
| `FOUNDER_EMAILS` | *Facultatif* · ton e-mail, pour l'accès ADMIN (approbation du budget du pas 2) si ton compte n'est pas déjà dans la liste codée. |
| `ANTHROPIC_GEN_MODEL`, `FAL_IMAGE_MODEL`, `FAL_IMAGE_MODEL_EDIT`, `FAL_QUEUE_URL` | *Facultatives* · surcharges de modèles. Une surcharge change l'annonce du pas 1 : relis-la. |

**Jamais** `FAL_KEY` ni `ANTHROPIC_API_KEY` dans ce fichier. Et quoi qu'il
contienne, `ops/recette/neutralise.env` (versionné, chargé après lui) vide :
le stockage `S3_*`, les clés IA (`FAL_KEY`, `ANTHROPIC_API_KEY`,
`HIGGSFIELD_*`), `CRON_SECRET`, et toutes les clés de services externes
(Trendtrack, Stripe, Klaviyo, Slack, SMTP, Meta, Shopify, Google, TikTok,
webhook studio).

### Dans ton shell, seulement le temps d'une commande payante

| Variable | Rôle |
| --- | --- |
| `FAL_KEY` | Génération d'image (pas 1, pas 2). |
| `ANTHROPIC_API_KEY` | Compilation de la consigne et tâches texte. |
| `STUDIO_FOURNISSEUR_REEL=autorise` | Autorisation explicite du fournisseur réel hors production. |

Seul le service d'outils les reçoit, par `${FAL_KEY:-}` dans le compose.

## 4. Pas à pas

Toutes les commandes se lancent depuis `product/`. Un code de sortie non nul
veut dire refus ou échec : lis le message, rien n'est relancé tout seul.

**4.1 · Fichier d'environnement**, secrets générés sur place, jamais affichés :

```bash
umask 077
printf 'POSTGRES_PASSWORD=%s\nAUTH_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > ops/recette/.env.recette
grep -cE '^(FAL_KEY|ANTHROPIC_API_KEY)=' ops/recette/.env.recette   # doit afficher 0
```

**4.2 · Démarrage** du web, du worker, de la base et du Redis de recette :

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette up -d --build
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette ps
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette logs workers_recette
```

Dans les journaux du worker, tu dois lire ces deux lignes, et rien d'autre de planifié :
`[recette] worker de recette · boucle Studios seule · aucun cron …` et
`[studios] aucun fournisseur de génération branché (FAL_KEY absente) · worker studio non démarré, jobs laissés en file, rien facturé.`

**4.3 · Migrations** de la base de recette :

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm -w /app outils_recette pnpm --filter @tiktrends/db migrate
```

**4.4 · Semis synthétique** (espace, marque, produit et photos dessinés par
code, projet avec brief et produit épinglé, release de prompts de recette).
Aucun appel, aucune dépense. Il refuse de tourner hors de la base de recette.
Un second passage ne duplique rien.

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:semer
```

Note l'identifiant de release affiché (il sert au pas 2).

**4.5 · Pas 1, lecture du devis** · sans clé et sans confirmation, la commande
affiche le coût maximal puis refuse. Rien n'est dépensé.

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:pas1
```

Tu lis : compilation 0,14 $, image 0,08 $, **TOTAL 0,22 $ au plus**, plafond de
passe PROPOSÉ 1,00 $. C'est le moment d'approuver (ou non) la proposition.

**4.6 · Pas 1, lancement réel** · clés saisies sans écho, puis confirmation du
TOTAL recopié :

```bash
read -rs FAL_KEY && export FAL_KEY
read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
export STUDIO_FOURNISSEUR_REEL=autorise
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:pas1 -- --confirmer-usd 0,22
unset FAL_KEY ANTHROPIC_API_KEY STUDIO_FOURNISSEUR_REEL
```

Ce qui se passe, dans l'ordre : compilation de la consigne (texte), consigne
retenue, devis, approbation (réserve de crédits, job en file), moteur du worker,
fal, décodage réel des pixels, dépôt et relecture du fichier, rapport.

Si la commande s'interrompt ou rend « job toujours en cours » : **relance la
même commande**. Elle reprend le même job sous la même identité d'exécuteur,
sans nouvelle compilation, ni nouveau devis, ni nouvelle approbation, ni
seconde soumission à fal. Si un livrable existe déjà, elle réécrit le rapport
et ne lance rien (un second rendu payant demande `--nouveau-rendu` et une
nouvelle confirmation).

**4.7 · Ce que tu regardes** (sur la machine qui a lancé le compose) :

- `ops/recette/sorties/rapport-pas1.md` · identifiants, coût réservé et réglé par ligne, état du job, empreinte SHA-256 et dimensions du livrable ;
- `ops/recette/sorties/a-transmettre/recette-pas1-<job>.png` · **l'image livrée, copiée à ce chemin pour être transmise au relecteur** ;
- le rapport ne contient aucune valeur sensible (clés, mots de passe, adresse de base) : elles sont masquées avant écriture, et un test le vérifie.

**Le pas 1 est réussi** quand tout est vrai :

1. la commande rend le code 0 ;
2. le rapport dit `État · completed` ;
3. SHA-256 enregistré et SHA-256 du fichier relu `identique`, dimensions `identiques` ;
4. le total réglé ne dépasse pas 0,22 $ ;
5. **toi seul** : en ouvrant l'image, le produit (lunettes et bandeau bleus) est présent et reconnaissable, la scène suit la consigne, aucun texte parasite ni logo ni marque réelle.

## 5. Pas 2 · benchmark (en attente du recalcul R3)

**Ne pas lancer avant que R3 ait livré le devis recalculé.** Ensuite :

1. **Budget** · lis `Budget restant pour le pas 2` à la fin de `rapport-pas1.md` (15 $ moins tout ce qui est compté dans la base de recette). C'est le plafond du pas 2, pas une cible.
2. **Devis** (aucun appel) :
   ```bash
   docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web bench:studios -- --plan
   ```
   Si le TOTAL dépasse le budget restant, **arrête-toi** : rien ne doit être lancé (la commande réelle le refuserait de toute façon).
3. **Approbation ADMIN** · ouvre `http://localhost:3101` (sur le VPS : `ssh -L 3101:127.0.0.1:3101 debian@51.255.39.79`, le port n'écoute que sur 127.0.0.1). Crée ton compte avec ton e-mail de fondateur, puis Admin, IA et Studios, onglet Évaluations : approuve un budget égal au budget restant, sur la release notée en 4.4, avec un motif. L'approbation expire en 24 h et ne sert qu'une fois.
4. **Campagne réelle** · mêmes saisies de clés qu'en 4.6, puis :
   ```bash
   docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web bench:studios -- --reel --budget-usd <budget restant> --sortie /sorties/benchmark
   unset FAL_KEY ANTHROPIC_API_KEY STUDIO_FOURNISSEUR_REEL
   ```
   Avant CHAQUE appel payant, la campagne vérifie « dépensé + maximum de l'appel ≤ budget » (`peutLancer`) et s'arrête sinon. Les cas non joués sont dits « arrêtés », jamais réussis.
5. **Ce que tu regardes** · `ops/recette/sorties/benchmark/` (rapport scellé, fiches de revue à remplir, médias produits).

## 6. Tâches automatiques · état dans la recette

Tout ce que le web et le worker lancent seuls en production, et son état ici.
Garde : `apps/workers/test/e-worker-recette.test.ts` (aucune file, aucun worker,
aucune planification, aucune connexion Redis au démarrage du worker de recette)
et `apps/web/test/e-compose-recette.test.ts` (commande du worker, variables
neutralisées).

| Tâche | Où | Payant | Recette |
| --- | --- | --- | --- |
| Cron `tracker-scan` 04:00 | `apps/workers/src/index.ts` | non (scan de concurrents) | **désactivé** · `index.ts` n'est pas lancé, `CRON_SECRET` vide |
| Cron `radar-scan` 05:00 | `index.ts` → `/api/cron/radar` | **oui** (IA) | **désactivé** · idem, et route fermée (503) |
| Cron `daily-sync` 06:00 | `index.ts` → `sync.ts` | API Shopify, Meta | **désactivé** · `index.ts` non lancé, aucune clé ni jeton |
| Cron `adsmap-sync` 07:00 | `index.ts` → `/api/cron/adsmap` | API Meta | **désactivé** · idem |
| Worker d'ingestion | `index.ts` → `ingest.ts` | non | **désactivé** · non lancé |
| Worker radar (BullMQ) | `worker.ts` → `startWorkers` | non | **désactivé** · non lancé |
| Jobs de démonstration (ingest, radar) | `index.ts` | non | **désactivés** · non lancés |
| Routes `/api/cron/*` (digest, tracker, adsmap, radar) | web | radar : oui | **fermées** · `CRON_SECRET` vide ⇒ 503 |
| Boucle Studios (jobs approuvés) | `worker.ts` → `demarrerWorkerStudio` | **oui** (fal) | **seule tâche admise**, mais non démarrée : `FAL_KEY` et `S3_*` vides. Le pas 1 exécute le moteur lui-même |
| Relectures et reprises automatiques des pubs générées (Pubs IA) | web, après une génération | **oui** (IA) | **impossibles** · aucune clé IA dans le web |
| Webhooks entrants (Stripe, fournisseur studio) | web | non | **inertes** · secrets vides |
| Pas 1, pas 2 | service d'outils | **oui** | **lancés par toi seulement**, commande explicite et confirmation |

## 7. Tout détruire · uniquement la recette

Dans cet ordre (la première commande lit encore `.env.recette`) :

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils down -v
docker image rm tiktrends-recette-web_recette tiktrends-recette-workers_recette tiktrends-recette-outils_recette
rm -f ops/recette/.env.recette
rm -rf ops/recette/sorties
```

`down -v` retire les conteneurs du projet, son réseau `tiktrends-recette-reseau`
et son volume `tiktrends-recette-pgdata`. Supprime `ops/recette/sorties`
seulement **après** avoir transmis l'image et les rapports.

Interdits, même pour « faire de la place » : `docker system prune`, tout
`prune`, toute commande `docker compose` sans `-p tiktrends-recette -f
docker-compose.recette.yml`, toute suppression d'un volume, réseau ou image
dont le nom ne commence pas par `tiktrends-recette`. Garde :
`apps/web/test/e-compose-recette.test.ts` relit ce fichier et le compose.

## 8. Ce que ce kit ne prouve pas

- Aucune commande de ce kit n'a été lancée pour de vrai : seulement en simulé (fournisseur factice, `apps/web/test/e-pas1-recette.test.ts`) et contre une base Postgres locale sans clé (refus et annonce vérifiés).
- La construction des images dans ce compose n'a pas été jouée (pas de démon Docker dans la session) : seul `docker compose config` l'a validé.
- Le benchmark évalue ici la release de la base de recette. Une évaluation réelle obtenue ici n'est pas inscrite en production. Rejoindre le rapport à la release de production (même empreinte ou non) reste une décision à prendre.
