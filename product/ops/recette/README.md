# Recette Studios · essai réel isolé

Kit pour lancer, **toi-même**, le premier rendu image réel (pas 1) puis le
benchmark (pas 2), dans un environnement qui ne partage **rien** avec la
production. La session de développement n'a aucune clé et ne voit aucun rendu :
elle a préparé les commandes, elle ne les a pas lancées pour de vrai.

Statut tant que ces deux pas n'ont pas été recettés : **Studios IA non
validés**. Ne pas les annoncer opérationnels avant parcours réel recetté.

---

## 1. Budget · ce qui est autorisé, et comment c'est tenu

Autorisation du propriétaire, **9 octobre**, verbatim :

> « J'autorise 15 $ maximum au total pour tous les tests nécessaires au
> chantier TikTrends, tous fournisseurs, étapes et relances confondus. Ce
> plafond remplace la précédente limite de 1 $ : ce n'est pas 15 $ par test ou
> par session. Déduis toute dépense déjà engagée et conserve les réservations
> dont le coût reste incertain. Aucune recharge ni dépassement autorisé. »

Il n'y a donc **plus de plafond de passe de 1 $** : il y a **15 $ au total**,
toutes passes, tous pas, toutes relances, toutes bases confondues.
Dépense déjà engagée à ce jour sur les fournisseurs pour ce chantier : 0 $
(aucun appel réel n'a été fait par la session). Si tes factures montrent une
dépense antérieure, saisis-la (§4.8) avant la première commande payante.

### Le registre cumulatif

`ops/recette/registre/budget-essais.json`, sur **ta machine**, ignoré par git,
**hors du volume Postgres** : il survit aux commandes, aux redémarrages et à
`down -v`. Une base de recette neuve dirait « 0 $ dépensé » ; le registre, lui,
garde tout ce qui a été vu.

- **Alimenté depuis `ai_spend`** avant et après chaque commande payante (`recette:pas1`, `recette:bench`) : réglé au coût réel ou au prix fixe, **incertain conservé au maximum réservé** (lignes à réconcilier, réservations sans issue).
- **Engagement durable AVANT chaque appel payant** : la commande écrit d'abord au registre un engagement (identifiant, commande, réservation maximale, heure), compté au bilan **dès son écriture**, puis appelle, puis le **règle** au coût réel des lignes nées (ou le passe **incertain**, au maximum, si elle a rencontré une erreur). Un processus tué pendant l'appel laisse son engagement **ouvert, compté au maximum**, même si la base est détruite ensuite : `recette:budget` le montre sous « engagé (ouvert) ». Le bilan compte donc antérieur + réglé + engagé + incertain.
- **Verrou entre processus** : lire le registre, décider et écrire l'engagement se font sous un verrou exclusif (`budget-essais.lock`, à côté du registre), pour toutes les commandes, toutes les bases et tous les conteneurs qui montent ce dossier. Deux commandes lancées en même temps ne peuvent plus dépenser deux fois le même restant. Un verrou n'est repris seul que si la mort de son détenteur est **établie** (même conteneur : même hôte, même démarrage, même espace de PID, et PID disparu). Il n'est **jamais repris sur son âge** : une commande figée peut encore reprendre et écrire (E4). Un verrou tenu par une commande en cours, ou laissé par un autre conteneur, n'est jamais pris : l'autre commande attend, puis refuse sans rien lancer et renvoie au déverrouillage (§4.8).
- **Écriture atomique** (fichier temporaire, `fsync`, version précédente gardée en `budget-essais.json.prec`, puis renommage) et **journal en ajout seul** `budget-essais.journal.jsonl`.
- **Avant toute dépense** : `antérieur + réglé + incertain + réservation maximale ≤ 15 $`, sinon refus sans aucun appel.
- **Refus** si le registre est **absent ou illisible alors que la base de recette contient des dépenses** (incohérence : restaure-le, ou sa copie `.prec`), ou s'il est illisible (ou si quelqu'un y a relevé l'autorisation). Base neuve et registre qui dit qu'on a déjà dépensé : **le registre fait foi**.
- **Lecture sans écriture** : `recette:budget` affiche autorisé / antérieur / réglé / incertain / restant (§4.8).

### Le devis du pas 1, à trois colonnes

La commande calcule le devis sur la **requête réellement envoyée**, avant tout
appel et sans rien écrire :

| Ligne | Estimation | Réservation maximale | Coût réglé |
| --- | --- | --- | --- |
| compilation de la consigne | 3,5 caractères par jeton sur la requête réelle | **borne de la requête réelle compilée** (octets UTF-8, sortie pleine) · la compilation est refusée avant l'envoi au-delà | lu dans `ai_spend` après coup |
| image (fal) | prix fixe | prix fixe du devis | idem |
| contrôle visuel | pas d'estimation distincte | borne prouvée par image | idem |

- **Estimation** : indicative, jamais confirmée ni réservée.
- **Réservation maximale** : ce que tu **recopies** pour confirmer. C'est le plafond DUR de la passe : le plafond du processus devient « ce que la base compte déjà + réservation maximale confirmée », la réservation commune refuse tout au-delà.
- **Coût réglé** : écrit au rapport après coup, ligne par ligne, avec l'incertain à part.

Mesuré en local sur le semis de recette (modèle texte par défaut) : compilation
0,0930 $, image 0,0800 $, contrôle visuel 0,1470 $, **réservation maximale
0,33 $ au plus**. Le montant qui fait foi est celui que **la commande affiche**
(une surcharge de modèle ou un semis différent le change).

Barrières qui tiennent même si une consigne est oubliée :

- la réservation commune (`reserverDepense`) refuse tout appel au-delà du plafond du processus ;
- la compilation et le contrôle visuel sont refusés avant l'envoi au-delà de leur ligne (`adaptateurBorne`) ;
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

## 3. Variables nécessaires (noms seulement, jamais de valeur ici)

### Dans `ops/recette/.env.recette` · créé par toi (§4.1), ignoré par git

Liste EXACTE :

| Variable | Obligatoire | Rôle | Où l'obtenir |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | oui | Mot de passe de la base de recette (hexadécimal, il entre dans une URL). | Généré sur place par `openssl rand -hex 24` (§4.1), jamais affiché. |
| `AUTH_SECRET` | oui | Signature des sessions du web de recette. | Généré sur place par `openssl rand -hex 32` (§4.1). |
| `FOUNDER_EMAILS` | non | Ton e-mail, pour l'accès ADMIN (approbation du budget du pas 2) si ton compte n'est pas déjà dans la liste codée. | Ton adresse. |
| `ANTHROPIC_GEN_MODEL` | non | Surcharge du modèle texte. Change le devis : relis-le. | Seulement si tu veux un autre modèle. |
| `FAL_IMAGE_MODEL`, `FAL_IMAGE_MODEL_EDIT`, `FAL_QUEUE_URL` | non | Surcharges du fournisseur d'images. | Idem. |

**Jamais** `FAL_KEY` ni `ANTHROPIC_API_KEY` dans ce fichier (la vérification
§4.2 le contrôle sans afficher le fichier). Et quoi qu'il contienne,
`ops/recette/neutralise.env` (versionné, chargé après lui) vide : le stockage
`S3_*`, les clés IA (`FAL_KEY`, `ANTHROPIC_API_KEY`, `HIGGSFIELD_*`),
`CRON_SECRET`, et toutes les clés de services externes (Trendtrack, Stripe,
Klaviyo, Slack, SMTP, Meta, Shopify, Google, TikTok, webhook studio).

### Interrupteurs Studios · posés par le compose, jamais par toi

Les nouveautés Studios incomplètes sont **coupées par défaut** (interrupteurs
F1). Le compose de recette ouvre EXPLICITEMENT ce que l'essai réel autorisé
exige, et rien d'autre ; `ops/recette/neutralise.env` vide les quatre
variables, de sorte qu'aucune valeur de `.env.recette` ne s'y ajoute.

| Variable (posée dans `docker-compose.recette.yml`) | Services | Ce qu'elle ouvre | Pourquoi |
| --- | --- | --- | --- |
| `STUDIOS_ESPACES_PILOTES` | web, worker, outils | l'espace de recette synthétique seul (`e5ec0000-…-e001`, semé par `recette:semer`) | une ouverture par espace pilote ne déborde sur aucun autre espace |
| `STUDIOS_CAPACITES_PILOTES` | web, worker, outils | `generation_image`, `controle_visuel` | pas 1 · image puis contrôle visuel du livrable |
| `STUDIOS_CAPACITES_GENERALES` | outils seulement | `benchmark_reel` | pas 2 · le benchmark réel est une capacité de plateforme (pas d'espace) : `recette:bench --reel` et `bench:studios --reel` refusent sans elle |
| `STUDIOS_CAPACITES_COUPEES` | aucun (vidée) | rien | coupure d'urgence, inutile ici |

Restent coupées en recette : `video`, `voix`, `shadow`. Le pas 1 vérifie les
capacités AVANT tout engagement (refus `INTERRUPTEUR_COUPE`, rien d'engagé ni
de dépensé) et donne au moteur du worker les mêmes interrupteurs que la boucle
de production : un job dont une capacité est coupée reste en file, rien n'est
soumis. Garde : `apps/web/test/e-compose-recette.test.ts` (toute capacité
ouverte au-delà, hors de l'espace de recette, ou manquante pour l'essai est
refusée et nommée), `apps/web/test/r6-pas1-interrupteurs.test.ts`.

### Dans ton shell, seulement le temps d'une commande payante

| Variable | Rôle | Où l'obtenir |
| --- | --- | --- |
| `FAL_KEY` | Génération d'image (pas 1, pas 2). | Ton tableau de bord fal (clés d'API). |
| `ANTHROPIC_API_KEY` | Compilation de la consigne, contrôle visuel, tâches texte. | Ta console Anthropic (clés d'API). |
| `STUDIO_FOURNISSEUR_REEL=autorise` | Autorisation explicite du fournisseur réel hors production. | Valeur fixe, à taper. |

Saisies sans écho (`read -rs`), effacées après la commande (`unset`). Seul le
service d'outils les reçoit, par `${FAL_KEY:-}` dans le compose.

## 4. Pas à pas

Toutes les commandes se lancent depuis `product/`. Un code de sortie non nul
veut dire refus ou échec : lis le message, rien n'est relancé tout seul.

**4.1 · Fichier d'environnement**, secrets générés sur place, jamais affichés :

```bash
umask 077
printf 'POSTGRES_PASSWORD=%s\nAUTH_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > ops/recette/.env.recette
grep -cE '^(FAL_KEY|ANTHROPIC_API_KEY)=' ops/recette/.env.recette   # doit afficher 0
```

**4.2 · Vérification de l'environnement** · vérifie point par point et affiche
« OK » ou « ÉCHEC » (aucune valeur sensible, même renvoyée par un outil ;
aucune commande payante), en deux phases :

1. **lecture seule**, rien n'est construit, démarré ni écrit : mémoire et disque au-dessus des seuils ; fichier d'environnement présent, `POSTGRES_PASSWORD` (hexadécimal) et `AUTH_SECRET` posés, sans clé payante ; **aucune clé payante dans ton shell** (fais `unset FAL_KEY ANTHROPIC_API_KEY STUDIO_FOURNISSEUR_REEL` avant) ; configuration résolue (ports sur 127.0.0.1 seulement, volumes et réseaux préfixés `tiktrends-recette`, aucun `.env.deploy`) ; port 3101 publié par aucun autre projet ; conteneurs déjà présents du projet sans montage étranger ;
2. **seulement si tout est OK** : construction, démarrage, inspection des conteneurs (aucun volume, réseau ou montage hors du projet de recette), migrations, `ffprobe` et `ffmpeg` dans le worker, sonde vidéo publiée PUIS relue en base, site de recette qui répond sur `127.0.0.1:3101` et nulle part ailleurs, registre du budget lisible.

**Le premier ÉCHEC arrête tout, sur-le-champ** : aucun build, démarrage,
commande ni écriture ne suit. L'inspection des conteneurs vérifie d'abord que
`docker ps` PUIS chaque `docker inspect` ont réussi et rendu une sortie
lisible : un échec ou un message inattendu n'est jamais pris pour « aucun
partage » (E4).

```bash
bash ops/recette/verifier-environnement.sh --a-blanc   # d'abord : la liste des commandes, rien n'est exécuté
bash ops/recette/verifier-environnement.sh
```

Code 0 et « Tout est OK » : continue. Un ÉCHEC : le script s'est déjà arrêté
(« ARRÊT à l'étape … »), corrige ce point ou transmets la sortie (elle ne
contient aucun secret).

**4.2 bis · Démarrage manuel** (si tu préfères les commandes une à une) du web, du worker, de la base et du Redis de recette :

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

**4.5 · Pas 1, lecture du devis et du budget** · sans clé et sans
confirmation, la commande affiche le devis à trois colonnes et le budget
cumulatif, puis refuse. Rien n'est dépensé, rien n'est écrit.

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:budget
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:pas1
```

Tu lis : par ligne, **estimation**, **réservation maximale**, « coût réglé :
après coup » ; puis `TOTAL … X $ au plus`, le budget cumulatif (autorisé 15 $,
déjà engagé, restant) et `Rien ne part sans --confirmer-usd X`. **X est la
réservation maximale**, jamais l'estimation.

**4.6 · Pas 1, lancement réel** · clés saisies sans écho, puis confirmation de
la réservation maximale recopiée (remplace `X` par le montant lu en 4.5) :

```bash
read -rs FAL_KEY && export FAL_KEY
read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
export STUDIO_FOURNISSEUR_REEL=autorise
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:pas1 -- --confirmer-usd X
unset FAL_KEY ANTHROPIC_API_KEY STUDIO_FOURNISSEUR_REEL
```

Ce qui se passe, dans l'ordre : devis recalculé et budget revérifié, registre
écrit, compilation de la consigne (bornée à sa ligne), consigne retenue, devis,
approbation, moteur du worker, fal, décodage réel des pixels, dépôt et
relecture du fichier, **contrôle visuel**, registre mis à jour, rapport.

**Reprises, sans double facturation.** Relance toujours **la même commande**
(une reprise ne demande pas de nouvelle confirmation : elle ne dépense que ce
qui était déjà approuvé, et revérifie le budget) :

- job encore en cours (code 3) ⇒ elle reprend le même job, sans nouvelle compilation, ni devis, ni approbation, ni seconde soumission à fal ;
- image produite mais contrôle visuel pas fait (interruption) ⇒ elle lance **seulement le contrôle visuel manquant** (aucune génération, aucun devis), dans le budget restant ;
- contrôle visuel **engagé** ailleurs ou interrompu pendant l'appel, ou à l'**issue incertaine** (coupure, délai, 5xx) ⇒ **aucune relance** : code 1, et le rapport dit quelle ligne de dépense rapprocher de la facture Anthropic et comment ; relis alors le média toi-même ;
- contrôle déjà tranché ⇒ rapport réécrit, aucun appel.

Un second rendu payant demande `--nouveau-rendu` et une nouvelle confirmation.

**4.7 · Ce que tu regardes** (sur la machine qui a lancé le compose) :

- `ops/recette/sorties/rapport-pas1.md` · identifiants ; le **coût en trois colonnes** (estimation, réservation maximale, coût réglé, et l'incertain à part) ; les lignes `ai_spend` ; l'état du job ; le **contrôle visuel** (exécuté, repris, refusé et pourquoi) ; empreinte SHA-256 et dimensions du livrable ; le **budget cumulatif restant** ;
- `ops/recette/sorties/a-transmettre/recette-pas1-<job>.png` · **l'image livrée, copiée à ce chemin pour être transmise au relecteur** ;
- le rapport ne contient aucune valeur sensible (clés, mots de passe, adresse de base) : elles sont masquées avant écriture, et un test le vérifie.

**Le pas 1 est réussi** quand tout est vrai :

1. la commande rend le code 0 ;
2. le rapport dit `État · completed` ;
3. SHA-256 enregistré et SHA-256 du fichier relu `identique`, dimensions `identiques` ;
4. le coût réglé total ne dépasse pas la réservation maximale confirmée ; aucun montant « incertain » ; le contrôle visuel a tourné et donne son verdict (qualité `passed`, `requires_review` ou `rejected`) ;
5. **toi seul** : en ouvrant l'image, le produit (lunettes et bandeau bleus) est présent et reconnaissable, la scène suit la consigne, aucun texte parasite ni logo ni marque réelle.

**4.8 · Budget, à tout moment** · lecture seule, rien n'est écrit :

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:budget
```

Dépense antérieure connue par facture (ajout seul, au registre et au journal) :

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:budget:saisir -- --usd 0,40 --motif "facture fal du 7 octobre"
```

Verrou du registre resté en place (une commande refuse avec « il n’est jamais repris sur son âge ») · d'abord, vérifie qu'AUCUNE commande de recette ne tourne :

```bash
docker ps --filter label=com.docker.compose.project=tiktrends-recette --filter label=com.docker.compose.service=outils_recette --format "{{.Names}} {{.Status}} {{.Command}}"
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:budget:deverrouiller
```

La seconde commande dit qui tient le verrou, compte les autres commandes de
recette encore connectées à la base, et affiche le jeton à recopier. Elle ne
retire rien sans `--confirmer-arret <jeton>` ; elle refuse si le détenteur
est vivant dans ce conteneur, si une autre commande est connectée, ou si le
verrou a changé depuis. Le registre lui-même n'est jamais touché.

**4.9 · Ce que tu transmets ensuite** (aucun secret dedans) :

1. la sortie de `bash ops/recette/verifier-environnement.sh` (les lignes OK / ÉCHEC) ;
2. `ops/recette/sorties/rapport-pas1.md` ;
3. l'image `ops/recette/sorties/a-transmettre/recette-pas1-<job>.png` ;
4. la sortie de `recette:budget` après le pas 1 ;
5. tes trois réponses du §4.7 point 5 (produit reconnaissable, scène conforme, aucun texte ni logo parasite).

Ne transmets jamais `ops/recette/.env.recette`, ni tes clés, ni le journal du shell.

## 5. Pas 2 · benchmark

Son plafond est le **restant du budget cumulatif** (15 $ moins tout ce qui est
déjà engagé, toutes bases), pas une cible.

1. **Budget** · lis `RESTANT` avec `recette:budget` (§4.8), ou à la fin de `rapport-pas1.md`.
2. **Devis** (aucun appel) :
   ```bash
   docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web bench:studios -- --plan
   ```
   Si le TOTAL dépasse le restant, **arrête-toi** : rien ne doit être lancé (la commande réelle le refuserait de toute façon).
3. **Approbation ADMIN** · ouvre `http://localhost:3101` (sur le VPS : `ssh -L 3101:127.0.0.1:3101 debian@51.255.39.79`, le port n'écoute que sur 127.0.0.1). Crée ton compte avec ton e-mail de fondateur, puis Admin, IA et Studios, onglet Évaluations : approuve un budget au plus égal au restant, sur la release notée en 4.4, avec un motif. L'approbation expire en 24 h et ne sert qu'une fois.
4. **Campagne réelle** · par l'enveloppe `recette:bench`, qui vérifie d'abord l'interrupteur `benchmark_reel` (ouvert dans le service d'outils, §3), puis revérifie le registre (`antérieur + réglé + incertain + budget ≤ 15 $`), l'écrit, pose le plafond du processus, puis met le registre à jour après coup. Mêmes saisies de clés qu'en 4.6, puis :
   ```bash
   docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:bench -- --reel --budget-usd <restant ou moins> --sortie /sorties/benchmark
   unset FAL_KEY ANTHROPIC_API_KEY STUDIO_FOURNISSEUR_REEL
   ```
   Avant CHAQUE appel payant, la campagne vérifie « dépensé + maximum de l'appel ≤ budget » (`peutLancer`) et s'arrête sinon. Les cas non joués sont dits « arrêtés », jamais réussis.
5. **Ce que tu regardes** · `ops/recette/sorties/benchmark/` (rapport scellé, fiches de revue à remplir, médias produits) et `recette:budget`.

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

Dans cet ordre (la première commande lit encore `.env.recette`). **Le
registre `ops/recette/registre/` n'est JAMAIS supprimé** : c'est lui qui
garde le cumul des 15 $ quand la base disparaît (garde :
`apps/web/test/e2-registre-runbook.test.ts`).

```bash
docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils down -v
docker image rm tiktrends-recette-web_recette tiktrends-recette-workers_recette tiktrends-recette-outils_recette
rm -f ops/recette/.env.recette
rm -rf ops/recette/sorties
```

`down -v` retire les conteneurs du projet, son réseau `tiktrends-recette-reseau`
et ses volumes `tiktrends-recette-pgdata` et `tiktrends-recette-redisdata`. Supprime `ops/recette/sorties`
seulement **après** avoir transmis l'image et les rapports. Ne supprime ni ne
déplace `ops/recette/registre` (ni `ops/recette` en entier) : le cumul des
dépenses passées serait perdu de vue.

Interdits, même pour « faire de la place » : `docker system prune`, tout
`prune`, toute commande `docker compose` sans `-p tiktrends-recette -f
docker-compose.recette.yml`, toute suppression d'un volume, réseau ou image
dont le nom ne commence pas par `tiktrends-recette`. Garde :
`apps/web/test/e-compose-recette.test.ts` relit ce fichier et le compose.

## 8. Ce que ce kit ne prouve pas

- Aucune commande payante de ce kit n'a été lancée pour de vrai : seulement en simulé (fournisseur factice, `apps/web/test/e-pas1-recette.test.ts`, `apps/web/test/e2-pas1-registre.test.ts`) et contre des bases Postgres locales sans clé.
- Le verrou et l'engagement sont éprouvés par de vrais processus sur une même machine (`apps/web/test/e3-registre-verrou.test.ts` : huit commandes concurrentes, deux bases, un processus tué en plein appel, base supprimée puis recréée). Entre deux conteneurs `docker compose run`, le PID d'un détenteur n'est pas sondable (espaces de PID distincts) : un verrou abandonné n'y est JAMAIS repris seul, il se retire par `recette:budget:deverrouiller` après arrêt vérifié des commandes (E4, `apps/web/test/e4-verrou-suspendu.test.ts` : détenteur suspendu, horloge avancée de dix minutes, aucun engagement accepté perdu). Ce cas n'a pas été joué avec Docker.
- Un engagement laissé ouvert par un processus tué reste compté au maximum : aucune commande ne le règle à ta place. Si la facture du fournisseur montre moins, le restant reste plus prudent que nécessaire ; il n'existe pas encore de commande de réconciliation (à demander si besoin).
- La construction des images et `verifier-environnement.sh` n'ont pas été joués avec Docker (pas de démon dans la session) : le script a été exécuté à blanc et contre de faux outils (`apps/web/test/e2-verifier-environnement.test.ts`).
- La borne de compilation est mesurée sur le semis de recette ; le montant qui fait foi est celui que la commande affiche au moment du lancement.
- Le benchmark évalue ici la release de la base de recette. Une évaluation réelle obtenue ici n'est pas inscrite en production. Rejoindre le rapport à la release de production (même empreinte ou non) reste une décision à prendre.
