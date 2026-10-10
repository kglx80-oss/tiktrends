#!/usr/bin/env bash
# Auto-déploiement TikTrends sur le VPS OVH.
# Appelé par le timer systemd toutes les minutes.
#
# ── L'ordre, et pourquoi ─────────────────────────────────────────────────────
#
#   1. construire les images        `docker compose build`        rien n'est remplacé
#   2. migrer, conteneur éphémère   `docker compose run --rm …`   NOUVELLE image workers
#   3. vérifier la base             journal du dépôt ⊆ base       sinon rien n'est activé
#   4. activer le nouveau code      `docker compose up -d`        conteneurs recréés
#   5. marqueur                     écrit EN DERNIER
#
# Un échec à 1, 2 ou 3 arrête le script AVANT l'activation : l'ancienne version
# reste servie, le marqueur ne bouge pas, le tick suivant retente. Un échec à 4
# laisse aussi le marqueur : retenté (le build est en cache, la migration ne
# refait rien).
#
# Avant (jusqu'à b35ce9b), `docker compose up -d --build` activait le nouveau
# code PUIS lançait les migrations dans le conteneur workers déjà remplacé.
# Pendant la fenêtre, le nouveau code tournait sur l'ancien schéma (mesuré par
# L9-A : écrans Studios en erreur 42P01, réservation de dépense refusée) ; et si
# la migration échouait 12 fois, cela durait jusqu'au tick qui réussissait.
#
# La fenêtre est maintenant INVERSE : la migration s'applique pendant que
# l'ANCIEN code tourne. C'est sûr parce que les migrations sont additives
# (cahier §14 · expand → vérification → activation, ni drop ni rename) : garde
# `apps/web/test/l9-migration-additive.test.ts`, preuve « ancien code sur base
# migrée » dans `docs/studios-v2/L9/L9-MIGRATION.md` §5. Une migration qui
# casserait l'ancien code ne doit pas passer cette garde.
#
# ── Le marqueur (réparé avant, gardé tel quel) ────────────────────────────────
#
# On suit le dernier commit RÉELLEMENT déployé (build, migrations, vérification
# et activation menés au bout), consigné dans un marqueur écrit EN DERNIER. Tant
# que le marqueur ne vaut pas `origin/main`, on retente. Un échec ne fige rien.
#
# ── Banc ─────────────────────────────────────────────────────────────────────
#
# `ops/test-deploiement/banc.sh` exécute CE script avec de faux `docker`, `git`
# et `sleep` journalisants (garde : `apps/web/test/d1-deploiement.test.ts`).
# Procédure réelle sur une copie isolée : `ops/README.md`, « Déploiement ».
set -euo pipefail

# Le dépôt. Variable lue seulement pour le banc et la copie d'essai isolée ;
# le service systemd ne la pose pas.
REPO="${TIKTRENDS_REPO:-/home/debian/tiktrends}"
BRANCH="main"
# Le SHA du dernier déploiement RÉUSSI · hors du dépôt (jamais écrasé par pull),
# à côté de lui. Absent au premier passage de cette version → on force un build.
MARQUEUR="$REPO/.tiktrends-deployed-sha"
# Essais de migration (la base peut démarrer) et pause entre deux, en secondes.
ESSAIS_MIGRATION=6
PAUSE=5
# Sauvegarde AVANT migration · même dossier que la sauvegarde quotidienne
# (ops/backup.sh) sur le VPS ; une copie d'essai garde les siennes à côté
# d'elle, jamais dans celui de la production.
if [ -n "${TIKTRENDS_REPO:-}" ] && [ "$TIKTRENDS_REPO" != "/home/debian/tiktrends" ]; then
  SAUVEGARDES="${TIKTRENDS_SAUVEGARDES:-$TIKTRENDS_REPO/../sauvegardes}"
else
  SAUVEGARDES="${TIKTRENDS_SAUVEGARDES:-/home/debian/backups}"
fi
GARDER_AVANT_MIGRATION=5

horodatage() { date -Is; }
echec() {
  echo "[$(horodatage)] ÉCHEC · $1 · ${2:-aucun conteneur remplacé}, marqueur inchangé, réessai au prochain tick." >&2
  exit 1
}

# Une copie d'essai (autre dépôt que celui du VPS) DOIT avoir son propre projet
# compose : le nom par défaut vient du dossier (`product`), le même que la
# production · sans ça, l'essai remplacerait les conteneurs servis.
if [ -n "${TIKTRENDS_REPO:-}" ] && [ "$TIKTRENDS_REPO" != "/home/debian/tiktrends" ]; then
  case "${COMPOSE_PROJECT_NAME:-}" in
    ''|product|tiktrends)
      echo "[$(horodatage)] ARRÊT · copie d'essai sans COMPOSE_PROJECT_NAME distinct · elle viserait le projet compose de production." >&2
      exit 2
      ;;
  esac
fi

cd "$REPO"

git fetch origin "$BRANCH" --quiet
REMOTE=$(git rev-parse "origin/$BRANCH")
DEPLOYE=$(cat "$MARQUEUR" 2>/dev/null || echo "")

if [ "$DEPLOYE" = "$REMOTE" ]; then
  # Ce commit a déjà été déployé avec succès · rien à faire.
  exit 0
fi

echo "[$(horodatage)] Cible $REMOTE (déployé : ${DEPLOYE:-aucun}) · déploiement…"

# Base de comparaison pour « le code a-t-il changé » : le dernier commit déployé,
# pas HEAD. Marqueur absent ou illisible (première fois, ou commit inconnu du
# dépôt local) → base vide, on force le rebuild pour repartir d'un état connu.
BASE="$DEPLOYE"
if [ -z "$BASE" ] || ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  BASE=""
fi

git pull --ff-only origin "$BRANCH"

# On ne rebuild que si apps/packages/Docker changent · pas pour une modif ops/ ou
# docs (économie de temps/ressources). Sans base fiable, on rebuild par sécurité.
CODE_CHANGED=1
if [ -n "$BASE" ]; then
  CHANGE=$(git diff --name-only "$BASE" "$REMOTE" -- \
    product/apps product/packages \
    product/Dockerfile.web product/Dockerfile.workers \
    product/docker-compose.yml product/Caddyfile | head -1 || true)
  [ -z "$CHANGE" ] && CODE_CHANGED=0
fi

if [ "$CODE_CHANGED" = 0 ]; then
  echo "[$(horodatage)] Pas de changement de code applicatif · pull seul, aucun rebuild."
  # Le commit EST servi (aucun code applicatif n'a bougé) · on avance le marqueur.
  echo "$REMOTE" > "$MARQUEUR"
  exit 0
fi

cd "$REPO/product"

# L'empreinte du commit qu'on compile · `docker compose` la passe en build-arg
# aux deux images : `next.config` la fige pour le bandeau de diagnostic, et les
# deux images la portent dans leur environnement (`printenv BUILD_SHA` dans le
# conteneur). On est APRÈS le pull, donc HEAD = le commit construit.
export BUILD_SHA
BUILD_SHA=$(git rev-parse --short=8 HEAD)

# ── 1. Construire · aucune image servie n'est touchée tant que rien n'est activé.
echo "[$(horodatage)] Construction des images ($BUILD_SHA)…"
if ! docker compose build; then
  echec "construction des images"
fi

# ── 2. Migrer depuis la NOUVELLE image workers, dans un conteneur éphémère.
# Même réseau et même fichier d'environnement que le service workers, mais
# `--no-deps` : aucun service n'est recréé. La base seule est démarrée si elle
# ne tourne pas (premier déploiement), JAMAIS remplacée (`--no-recreate`).
# drizzle applique toutes les migrations en attente dans UNE transaction : un
# échec n'en laisse aucune à moitié, et un nouvel essai repart proprement.
docker compose up -d --no-recreate --no-build db || echec "démarrage de la base"

# Le journal de l'arbre construit · « when<TAB>tag » par migration attendue.
JOURNAL="$REPO/product/packages/db/drizzle/meta/_journal.json"
journal_migrations() {
  # « when<TAB>tag » par entrée · le journal drizzle écrit `when` avant `tag`.
  local ligne w="" t
  while IFS= read -r ligne; do
    case "$ligne" in
      *'"when"'*) w="${ligne//[^0-9]/}" ;;
      *'"tag"'*)
        t="${ligne#*\"tag\"}"; t="${t#*\"}"; t="${t%%\"*}"
        [ -n "$w" ] && printf '%s\t%s\n' "$w" "$t"
        w=""
        ;;
    esac
  done < "$JOURNAL"
}
ATTENDUES=$(journal_migrations 2>/dev/null || true)
[ -n "$ATTENDUES" ] || echec "vérification · journal des migrations illisible ($JOURNAL)"

# ── 2a. Sauvegarder AVANT de migrer, dès qu'une migration du journal manque en
# base (ou que la base ne se laisse pas lire : dans le doute, on sauvegarde).
# Un dump qui échoue ou sort vide ARRÊTE tout : aucune migration sans copie de
# la base telle qu'elle était. Restauration : ops/README.md, « Restaurer ».
# shellcheck disable=SC2016  # les variables sont celles du conteneur db
AVANT=$(docker compose exec -T db sh -c \
  'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select created_at from drizzle.__drizzle_migrations /* etat-avant */"' 2>/dev/null) \
  || AVANT="illisible"
en_attente=""
if [ "$AVANT" = illisible ]; then
  en_attente="(base illisible)"
else
  while IFS=$'\t' read -r w t; do
    if ! grep -qxF "$w" <<<"$AVANT"; then en_attente="$en_attente $t"; fi
  done <<<"$ATTENDUES"
fi
if [ -n "$en_attente" ]; then
  mkdir -p "$SAUVEGARDES" || echec "sauvegarde avant migration · dossier $SAUVEGARDES impossible à créer"
  DUMP="$SAUVEGARDES/avant-migration-$BUILD_SHA-$(date +%Y%m%d-%H%M%S).sql.gz"
  echo "[$(horodatage)] Migration(s) en attente :$en_attente · sauvegarde de la base vers $DUMP…"
  # shellcheck disable=SC2016  # les variables sont celles du conteneur db
  if ! docker compose exec -T db sh -c \
      'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
      | gzip > "$DUMP"; then
    rm -f "$DUMP"
    echec "sauvegarde avant migration · pg_dump en échec, aucune migration lancée"
  fi
  if [ ! -s "$DUMP" ] || [ "$(wc -c < "$DUMP")" -lt 500 ]; then
    rm -f "$DUMP"
    echec "sauvegarde avant migration · dump vide, aucune migration lancée"
  fi
  echo "[$(horodatage)] Sauvegarde avant migration OK : $DUMP ($(wc -c < "$DUMP") octets)."
  # Rotation propre à ces sauvegardes · la quotidienne (tiktrends-*.sql.gz) n'est pas touchée.
  ls -1t "$SAUVEGARDES"/avant-migration-*.sql.gz 2>/dev/null | tail -n +$((GARDER_AVANT_MIGRATION + 1)) | xargs -r rm -f
fi

migrees=0
for i in $(seq 1 "$ESSAIS_MIGRATION"); do
  if docker compose run --rm --no-deps -T -w /app workers pnpm --filter @tiktrends/db migrate; then
    migrees=1
    break
  fi
  echo "[$(horodatage)] migration non aboutie ($i/$ESSAIS_MIGRATION)." >&2
  if [ "$i" -lt "$ESSAIS_MIGRATION" ]; then sleep "$PAUSE"; fi
done
if [ "$migrees" != 1 ]; then
  echec "migrations non appliquées après $ESSAIS_MIGRATION essais · l'ancienne version reste servie"
fi

# ── 3. Vérifier · chaque migration du journal du dépôt est en base.
# Le journal est celui de l'arbre qu'on vient de construire. On exige l'INCLUSION
# (pas l'égalité) : après un retour arrière par revert, l'ancien code a moins de
# migrations que la base, qui reste en avance (L9-MIGRATION §5) · c'est attendu.
# Ce contrôle attrape ce que drizzle tait : une migration dont le `when` est plus
# ancien que la dernière appliquée est ignorée SANS erreur.
# shellcheck disable=SC2016  # les variables sont celles du conteneur db
APPLIQUEES=$(docker compose exec -T db sh -c \
  'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select created_at from drizzle.__drizzle_migrations"') \
  || echec "vérification · lecture de drizzle.__drizzle_migrations impossible"
manquantes=""
nb_journal=0
while IFS=$'\t' read -r w t; do
  nb_journal=$((nb_journal + 1))
  if ! grep -qxF "$w" <<<"$APPLIQUEES"; then manquantes="$manquantes $t"; fi
done <<<"$ATTENDUES"
nb_base=$(grep -c '[0-9]' <<<"$APPLIQUEES" || true)
if [ -n "$manquantes" ]; then
  echec "vérification · migration(s) du journal absente(s) de la base :$manquantes (base $nb_base, journal $nb_journal)"
fi
echo "[$(horodatage)] Vérification · $nb_journal migration(s) du journal toutes en base (base : $nb_base)."

# ── 4. Activer · les conteneurs dont l'image a changé sont recréés. Aucun
# build ici (`--no-build`) : on active exactement ce qui a été migré et vérifié.
docker compose up -d --no-build || echec "activation (docker compose up)" "activation peut-être partielle"

# ── 5. Marqueur avancé EN DERNIER · uniquement build, migrations, vérification
# ET activation réussis. Tout échec en amont laisse l'ancien SHA, donc retenté.
echo "$REMOTE" > "$MARQUEUR"
echo "[$(horodatage)] Déploiement terminé ($REMOTE)."
