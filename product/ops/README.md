# Ops — Auto-déploiement TikTrends (VPS OVH)

Déploiement continu **sans secret** : un timer systemd interroge `origin/main`
toutes les minutes et, s'il y a du nouveau, déploie automatiquement.

## Installation (une seule fois, sur le VPS)

```bash
cd ~/tiktrends
git pull
chmod +x product/ops/deploy.sh
sudo cp product/ops/tiktrends-deploy.service /etc/systemd/system/
sudo cp product/ops/tiktrends-deploy.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tiktrends-deploy.timer
```

## Vérifier / superviser

```bash
systemctl status tiktrends-deploy.timer     # le timer est-il actif ?
systemctl list-timers tiktrends-deploy       # prochain déclenchement
journalctl -u tiktrends-deploy -n 50 --no-pager   # journal des déploiements
```

## Déployer manuellement (sans attendre la minute)

```bash
sudo systemctl start tiktrends-deploy.service
```

## Suspendre / réactiver l'auto-déploiement

```bash
sudo systemctl disable --now tiktrends-deploy.timer   # stop
sudo systemctl enable  --now tiktrends-deploy.timer   # relance
```

## Ce que fait `deploy.sh` (ordre D1 · construire, migrer, vérifier, PUIS activer)

1. `git fetch` · si le marqueur `~/tiktrends/.tiktrends-deployed-sha` vaut déjà `origin/main`, rien.
2. `git pull --ff-only`. Si rien n'a changé sous `product/apps`, `product/packages`, Dockerfiles, compose,
   Caddyfile depuis le dernier SHA DÉPLOYÉ : marqueur avancé, aucun rebuild (modif `ops/` ou docs seule).
3. **Construire** · `docker compose build` (web et workers, `BUILD_SHA` = 8 caractères du commit). Aucun
   conteneur n'est remplacé : l'ancienne version reste servie.
4. **Migrer** · la base est démarrée si elle ne tourne pas, jamais remplacée (`up -d --no-recreate db`), puis
   `docker compose run --rm --no-deps -T -w /app workers pnpm --filter @tiktrends/db migrate` : un conteneur
   ÉPHÉMÈRE de la NOUVELLE image workers, sur le réseau et avec le `.env.deploy` du service. 6 essais espacés
   de 5 s (drizzle applique tout le lot en attente dans une transaction : un échec n'en laisse aucune à moitié).
5. **Vérifier** · chaque migration du journal du dépôt (`packages/db/drizzle/meta/_journal.json`) doit être
   dans `drizzle.__drizzle_migrations` (lu par `psql` dans le conteneur `db`). L'inclusion, pas l'égalité :
   après un retour arrière par revert, la base garde ses migrations en avance (PLAN-FUSION §5). Ce contrôle
   attrape aussi la migration que drizzle ignore SANS erreur (`when` plus ancien que la dernière appliquée).
6. **Activer** · `docker compose up -d --no-build` : les conteneurs dont l'image a changé sont recréés.
7. Marqueur avancé EN DERNIER.

Échec à 3, 4 ou 5 ⇒ arrêt, **aucun conteneur remplacé**, marqueur inchangé, nouvel essai au tick suivant.
Journal : `ÉCHEC · construction des images`, `ÉCHEC · migrations non appliquées après 6 essais · l'ancienne
version reste servie`, `ÉCHEC · vérification · migration(s) du journal absente(s) de la base : <étiquettes>`.
Échec à 6 ⇒ marqueur inchangé, retenté au tick suivant (build en cache, migration sans effet).

`BUILD_SHA` est aussi dans l'environnement des deux images : `docker compose exec web printenv BUILD_SHA` et
`docker compose exec workers printenv BUILD_SHA` rendent le SHA que montre `/console`.

### La fenêtre est inverse · l'ANCIEN code tourne pendant la migration

Avant D1, le nouveau code tournait sur l'ancien schéma le temps de la migration (L9-MIGRATION §7 : écrans
Studios en `42P01`, réservation de dépense refusée), et indéfiniment si elle échouait. Désormais c'est
l'ancien code qui voit le schéma étendu, entre l'étape 4 et l'étape 6. Lu pour 0054 et 0055 (aucune 0056 sur
la base `b35ce9b`) :

- **0054** : 21 tables, 18 index, 4 fonctions, 11 déclencheurs, tous sur des tables `studio_*` NOUVELLES,
  vides pendant la fenêtre (leurs clés étrangères `RESTRICT` vers `brands`, `workspaces`… ne bloquent rien
  tant qu'aucune ligne Studios n'existe). Deux contraintes sur l'existant, `UNIQUE (id, workspace_id)` sur
  `brands` et `adsmap_ads` : `id` étant la clé primaire, aucune écriture de l'ancien code ne peut les violer ;
  les écritures sur ces deux tables attendent le temps de construire l'index (proportionnel au nombre de
  lignes), elles n'échouent pas.
- **0055** : une colonne `ai_spend.reconcile_reason` NULLABLE ; les insertions de l'ancien code la laissent
  nulle (= ligne ordinaire), ses lectures drizzle nomment leurs colonnes.
- Épreuve : l'ancien build `bc33cec` sur la base à 56 migrations, écrans en 200, 0 erreur
  (L9-MIGRATION §5, `ops/migration/rollback-local.sh`).

Garde pour toute migration à partir de 0054, y compris celles à venir : `apps/web/test/d1-deploiement.test.ts`
(« fenêtre inverse ») refuse une migration non additive, un déclencheur sur une table existante, ou une
contrainte ajoutée à une table existante sans raison écrite. Une migration qui casserait l'ancien code ne doit
pas partir par ce chemin : à décider avant de fusionner, pas à laisser passer.

### Le banc (sans Docker)

```bash
cd product
ops/test-deploiement/banc.sh succes   # ou build_ko, migration_ko, verification_ko, activation_ko, ops_seul, rien…
```

Exécute le VRAI `deploy.sh` dans un monde git temporaire, avec de faux `docker`, `git` et `sleep` qui
journalisent chaque appel, son étape et son issue. Garde : `apps/web/test/d1-deploiement.test.ts` (ordre,
marqueur, cause écrite, et mutants : l'ancien ordre, un échec de migration ignoré, la vérification retirée,
le marqueur écrit trop tôt, la migration dans le conteneur en service). Ce banc ne prouve PAS que Docker
recrée les conteneurs dont l'image a changé ni que le conteneur éphémère joint la base : c'est l'objet de la
vérification réelle ci-dessous.

### Vérifier le déploiement en réel sur une copie isolée (propriétaire)

À faire une fois, à une heure creuse (plusieurs builds de quelques minutes sur le VPS), ou sur un poste avec
Docker Compose v2. Rien n'est partagé avec la production : projet compose `tiktrends-essai-d1` (volumes et
réseau préfixés par ce nom), Caddy retiré (`ops/test-deploiement/essai-isole.override.yml`), dépôt et marqueur
à part, `.env.deploy` d'essai sans aucune clé. **Chaque commande compose tapée à la main porte
`-p tiktrends-essai-d1` en toutes lettres** : sans lui, depuis un dossier `product`, compose viserait le
projet de PRODUCTION. `deploy.sh` refuse de tourner sur une copie sans `COMPOSE_PROJECT_NAME` distinct
(`ARRÊT · copie d'essai sans COMPOSE_PROJECT_NAME distinct`).

```bash
# 0. La copie : une origine locale (jamais GitHub) et deux clones, hors ~/tiktrends.
#    Son `main` est la CIBLE (la branche à fusionner), jamais le `main` servi : sinon l'essai
#    éprouverait le deploy.sh déjà en production. Le fetch emprunte l'accès du dépôt de prod
#    sans toucher à son arbre de travail ni à ses branches.
ESSAI=~/essai-d1
CIBLE=claude/studios-integration
git clone -q --bare ~/tiktrends "$ESSAI/origine.git"
git -C "$ESSAI/origine.git" fetch -q "$(git -C ~/tiktrends remote get-url origin)" "+$CIBLE:refs/heads/main"
git -C "$ESSAI/origine.git" log --oneline -1 main   # doit être la tête de la CIBLE, pas celle du main servi
git clone -q "$ESSAI/origine.git" "$ESSAI/tiktrends"      # ce que deploy.sh déploie
git clone -q "$ESSAI/origine.git" "$ESSAI/dev"            # d'où partent les commits d'essai
cd "$ESSAI/tiktrends/product"
MDP=$(openssl rand -hex 16)
printf 'POSTGRES_PASSWORD=%s\nDATABASE_URL=postgres://tiktrends:%s@db:5432/tiktrends\nREDIS_URL=redis://redis:6379\nAI_SPEND_CAP_USD=0\n' "$MDP" "$MDP" > .env.deploy
export TIKTRENDS_REPO="$ESSAI/tiktrends" COMPOSE_PROJECT_NAME=tiktrends-essai-d1 \
       COMPOSE_FILE=docker-compose.yml:ops/test-deploiement/essai-isole.override.yml
DEPLOY="$ESSAI/tiktrends/product/ops/deploy.sh"
J=product/packages/db/drizzle/meta/_journal.json
pousser() { ( cd "$ESSAI/dev" && git add -A && git -c user.name=essai-d1 -c user.email=essai-d1@localhost commit -qm "$1" && git push -q origin main ); }
ajouter_migration() {   # $1 étiquette · $2 when · $3 SQL
  ( cd "$ESSAI/dev" && printf '%s\n' "$3" > "product/packages/db/drizzle/$1.sql" && python3 -c 'import json,sys;f=sys.argv[1];j=json.load(open(f));j["entries"].append({"idx":len(j["entries"]),"version":"7","when":int(sys.argv[3]),"tag":sys.argv[2],"breakpoints":True});json.dump(j,open(f,"w"),indent=2)' "$J" "$1" "$2" )
}
etat() { docker compose -p tiktrends-essai-d1 ps -q web workers | sort | tr '\n' ' '; echo; cat "$TIKTRENDS_REPO/.tiktrends-deployed-sha"; }

# 1. Base d'essai = dernière sauvegarde. Une base VIERGE ne passe pas : drizzle applique tout le lot dans
#    une transaction et 0011/0034 ajoutent des valeurs d'enum utilisées ensuite (constat L9, hors D1).
docker compose -p tiktrends-essai-d1 up -d db
gunzip -c "$(ls -t ~/backups/tiktrends-*.sql.gz | head -1)" \
  | docker compose -p tiktrends-essai-d1 exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

# 2. Premier déploiement (pas de marqueur) · attendu : « Déploiement terminé ».
"$DEPLOY"; etat > "$ESSAI/avant.txt"; cat "$ESSAI/avant.txt"

# 3. Construction en échec · attendu : « ÉCHEC · construction des images », état identique.
( cd "$ESSAI/dev" && echo 'RUN false' >> product/Dockerfile.workers ); pousser "essai D1 · build KO"
"$DEPLOY"; etat | diff "$ESSAI/avant.txt" - && echo "OK · rien remplacé, marqueur inchangé"

# 4. Migration en échec · attendu : 6 essais, « ÉCHEC · migrations non appliquées », état identique.
( cd "$ESSAI/dev" && git -c user.name=essai-d1 -c user.email=essai-d1@localhost revert -q --no-edit HEAD )
N=$(cd "$ESSAI/dev" && python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["entries"]))' "$J")
W=$(cd "$ESSAI/dev" && python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["entries"][-1]["when"])' "$J")
TAG=$(printf '%04d_essai_d1' "$N")
ajouter_migration "$TAG" "$((W + 1000))" 'SELECT 1/0;'; pousser "essai D1 · migration KO"
"$DEPLOY"; etat | diff "$ESSAI/avant.txt" - && echo "OK · rien remplacé, marqueur inchangé"

# 5. Succès · la même migration rendue additive. Attendu au journal : « Vérification · … toutes en base »
#    PUIS « Déploiement terminé » ; ids de web/workers NOUVEAUX, marqueur = cible, BUILD_SHA = cible.
( cd "$ESSAI/dev" && echo 'CREATE TABLE IF NOT EXISTS "essai_d1" ("id" integer);' > "product/packages/db/drizzle/$TAG.sql" ); pousser "essai D1 · migration additive"
"$DEPLOY"; etat; git -C "$ESSAI/dev" rev-parse --short=8 HEAD
docker compose -p tiktrends-essai-d1 exec web printenv BUILD_SHA
docker compose -p tiktrends-essai-d1 exec workers printenv BUILD_SHA
etat > "$ESSAI/avant.txt"

# 6. Vérification en échec · une migration au `when` plus ancien que la dernière appliquée : drizzle
#    l'ignore sans erreur. Attendu : « ÉCHEC · vérification · migration(s) du journal absente(s) de la
#    base : …_essai_d1_masquee », état identique. (La CI refuserait ce journal : essai seulement.)
ajouter_migration "$(printf '%04d_essai_d1_masquee' $((N + 1)))" "$((W + 500))" 'CREATE TABLE IF NOT EXISTS "essai_d1_b" ("id" integer);'
pousser "essai D1 · migration masquée"
"$DEPLOY"; etat | diff "$ESSAI/avant.txt" - && echo "OK · rien remplacé, marqueur inchangé"

# 7. Nettoyage · uniquement le projet d'essai (nom en toutes lettres), puis la copie (données client).
docker compose -p tiktrends-essai-d1 down -v --rmi local
cd ~ && rm -rf "$ESSAI"
```

Pendant les étapes 4 et 5, une seconde fenêtre avec `docker compose -p tiktrends-essai-d1 ps` montre que
`web` et `workers` gardent leur ancien `CREATED` pendant toute la migration, et ne changent qu'APRÈS la
ligne « Vérification · … ». Rapporter les sorties : c'est la preuve réelle que le banc ne peut pas donner.

---

## Worker · décodage vidéo (ffmpeg, Studios L7-B)

L'image `workers` installe `ffmpeg` (Alpine, paquet `ffmpeg` : `ffmpeg` et
`ffprobe`). Aucune variable ni aucun secret à poser. La capacité vidéo n'est
**jamais déclarée à la main** : au démarrage puis toutes les 5 min, le worker
studio (s'il tourne) sonde ffmpeg · version, encodeurs `libx264`/`aac`,
échantillon 32×32 de 12 images généré puis décodé en entier · et publie le
résultat dans `app_settings` (clé `studio:capacite-video`). Le site ne propose
une vidéo que sur une sonde de moins de 15 min dont l'échantillon a été décodé ;
sinon il refuse au devis, comme avant.

Vérifier après déploiement (propriétaire, sur le VPS) :

```bash
cd ~/tiktrends/product
docker compose exec workers ffmpeg -hide_banner -version | head -1
docker compose exec workers ffprobe -hide_banner -version | head -1
docker compose exec workers sh -c 'ffmpeg -hide_banner -encoders | grep -E " (libx264|aac) "'
docker compose logs workers --since 15m | grep "sonde vidéo"
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
select updated_at, value from app_settings where key = 'studio:capacite-video';
SQL
```

Lecture : `decodage.ok = true` et `updated_at` récent ⇒ décodage prouvé ;
`encodeurs.libx264 = false` ⇒ aucun export MP4 H.264 n'est annoncé. Même
décodage prouvé, l'animation reste refusée au devis tant qu'aucun fournisseur
d'animation n'est branché.

---

## Interrupteurs Studios (F1) · ce qui est coupé au premier déploiement

Les capacités Studios incomplètes sont **coupées par défaut** : rien n'est à
poser pour qu'elles le restent. Au premier déploiement, sans aucune variable :

| Capacité | Coupée car |
| --- | --- |
| `generation_image` | le fournisseur d’images n’est pas encore validé en réel |
| `controle_visuel` | la relecture par la vision n’est pas encore validée en réel |
| `video` | la chaîne vidéo n’est pas encore validée en réel |
| `voix` | aucun fournisseur de voix n’est validé |
| `shadow` | outil de recette interne, pas encore comparé en production |
| `benchmark_reel` | campagne réelle non budgétée |

Le reste (projets, éditeur, textes, export, canvas, propositions, identités)
est actif ; l'ancienne expérience (Studio historique, Pubs IA, ADMIN IA) n'est
jamais coupée.

Variables lues par le web ET le worker (noms seulement · listes de capacités
ou d'espaces séparées par des virgules, à poser dans `.env.deploy` par le
propriétaire ; le worker les relit à son redémarrage, le web à chaque requête) :

| Variable | Effet |
| --- | --- |
| `STUDIOS_CAPACITES_COUPEES` | coupure d'urgence, partout ; l'emporte sur tout |
| `STUDIOS_CAPACITES_GENERALES` | généralisation, pour tous les espaces (seule façon d'ouvrir `benchmark_reel`) |
| `STUDIOS_ESPACES_PILOTES` | identifiants des espaces pilotes |
| `STUDIOS_CAPACITES_PILOTES` | capacités ouvertes pour ces espaces pilotes seulement |

Un espace peut aussi être réglé depuis l'écran ADMIN « Interrupteurs Studios »
(`/admin/studios-interrupteurs`, réglage en base, sans redémarrage). Ordre de
décision et garde : `packages/core/src/studios/interrupteurs.ts`. La recette
isolée ouvre les siennes dans son compose (`ops/recette/README.md`, §3).

---

## Sauvegardes de la base (quotidiennes)

Dump `pg_dump` compressé chaque nuit à 03h30, gardé 14 jours dans `~/backups`.

### Installation (une seule fois, sur le VPS)

```bash
cd ~/tiktrends
git pull
chmod +x product/ops/backup.sh
sudo cp product/ops/tiktrends-backup.service /etc/systemd/system/
sudo cp product/ops/tiktrends-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tiktrends-backup.timer
```

### Vérifier

```bash
systemctl list-timers tiktrends-backup      # prochaine exécution
sudo systemctl start tiktrends-backup.service   # sauvegarde immédiate (test)
ls -lh ~/backups                             # les dumps
journalctl -u tiktrends-backup -n 20 --no-pager
```

### Restaurer une sauvegarde

```bash
cd ~/tiktrends/product
# Remplace le fichier par la sauvegarde voulue (~/backups/tiktrends-AAAAMMJJ-HHMMSS.sql.gz)
gunzip -c ~/backups/tiktrends-20260823-033000.sql.gz \
  | docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

> Le dump utilise `--clean --if-exists` : la restauration remet la base dans l'état
> exact de la sauvegarde (tables recréées). À faire avec précaution en production.

### ⚠️ Copie hors-site (recommandée)

Les dumps sont sur le **même VPS** : si le serveur est perdu, ils le sont aussi.
Pour une vraie sécurité, activer la copie vers **OVH Object Storage** (S3) —
créer un bucket, configurer `rclone`, puis décommenter la dernière ligne de
`backup.sh`. (Demander à Claude de le brancher.)

---

## Migrations Studios · vérifier, revenir en arrière, restaurer en isolé (L9)

Scripts dans `ops/migration/`, détail et preuves dans `docs/studios-v2/L9/L9-MIGRATION.md`, ordre de fusion dans
`docs/studios-v2/L9/PLAN-FUSION.md`. Tous refusent une base qui n'est pas LOCALE (127.0.0.1, localhost, [::1]) et
nommée `l9_*` ou `copie_*` : ils ne touchent jamais la production (`db`, base `tiktrends`).

| Script | Sert à |
| --- | --- |
| `verifier-migration.sh --base URL [--preparer 0053]` | interrompre le vrai migrateur (coupure, échec forcé), reprendre, rejouer, comparer les empreintes |
| `restaurer-isole.sh --sauvegarde F.sql.gz --base URL [--sans-proprietaires]` | restaurer une sauvegarde de `backup.sh` dans une base NEUVE et la valider (lignes, clés étrangères, contraintes, journal) |
| `rollback-local.sh --base URL --ancien DIR --nouveau DIR` | ancienne app sur base migrée, puis ré-avance |
| `lancer-et-mesurer.sh --produit DIR --base URL` | temps et erreurs des parcours sur une app locale construite |

### Attention · restaurer EN PLACE une sauvegarde plus ancienne que les migrations Studios

La commande « Restaurer une sauvegarde » ci-dessus (psql sans `ON_ERROR_STOP`) ne s'arrête pas sur erreur. Éprouvé en
local : une sauvegarde d'avant 0054 restaurée ainsi sur une base qui a 0054 donne 35 erreurs, un code de sortie 0 et
une base incohérente (cinq tables gardent leurs lignes actuelles, les autres reviennent à la sauvegarde). Pour revenir
sur du code plus ancien, **ne pas restaurer** : les migrations Studios sont additives, l'ancien code tourne sur la base
migrée (revert de la fusion, voir PLAN-FUSION §5). Pour vérifier une sauvegarde, la restaurer en isolé
(`restaurer-isole.sh`). Une restauration en place, si elle est vraiment voulue, se fait avec
`psql -v ON_ERROR_STOP=1 --single-transaction` : elle échoue alors proprement au lieu d'appliquer à moitié.
