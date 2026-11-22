#!/usr/bin/env bash
# Sauvegarde quotidienne de la base TikTrends (pg_dump compressé + rotation).
# Lancé par le timer systemd. Les dumps restent sur le VPS (voir §off-site pour
# une copie hors-site OVH Object Storage, fortement recommandée).
set -euo pipefail

# Chemins et mode · `configurer` (une fonction pour que la garde l'exécute seule,
# script sourcé, dans un environnement vide). Le service systemd ne pose
# aucune variable : REPO=/home/debian/tiktrends/product, BACKUP_DIR=
# /home/debian/backups, copie hors-site active.
#
# TIKTRENDS_REPO qui désigne un AUTRE dépôt (barres finales ignorées) = copie
# d'essai (ops/README.md, « Déploiement »). Comme deploy.sh, elle exige alors
# son propre projet compose : sans lui, `docker compose` viserait le projet
# `product` et c'est la base de PRODUCTION qui serait dumpée. Ses dumps restent
# à côté d'elle, et ne partent JAMAIS vers `ovh:` (ils y prendraient le nom des
# vrais). Gardes : apps/web/test/ops-backup-hors-site.test.ts.
VPS_REPO="/home/debian/tiktrends"
configurer() {
  RACINE="${TIKTRENDS_REPO:-$VPS_REPO}"
  RACINE="${RACINE%"${RACINE##*[!/]}"}"
  REPO="$RACINE/product"
  if [ "$RACINE" = "$VPS_REPO" ]; then
    BACKUP_DIR="${TIKTRENDS_SAUVEGARDES:-/home/debian/backups}"
    OFFSITE=1
    return 0
  fi
  case "${COMPOSE_PROJECT_NAME:-}" in
    ''|product|tiktrends)
      echo "[$(date -Is)] ARRÊT · copie d'essai ($RACINE) sans COMPOSE_PROJECT_NAME distinct · elle dumperait la base de production." >&2
      return 2
      ;;
  esac
  BACKUP_DIR="${TIKTRENDS_SAUVEGARDES:-$RACINE/../sauvegardes}"
  OFFSITE=0
}

# ------------------------------------------------------------------------------
# COPIE HORS-SITE (OVH Object Storage) — s'active TOUTE SEULE dès qu'un remote
# rclone nommé "ovh" existe. Tant qu'il n'est pas configuré, on ne fait rien.
# La copie n'échoue jamais la sauvegarde locale (best-effort).
#
# Jamais `rclone listremotes | grep -q` : sous `pipefail`, `grep -q` sort dès
# `ovh:` lu et ferme le tube ; si rclone écrit encore (un remote listé après
# `ovh`), il prend SIGPIPE (statut 141) et le tube entier « échoue » · la copie
# hors-site pouvait être SAUTÉE sans un mot (#1127 pour le même défaut). La
# liste est donc lue en entier, PUIS cherchée : un rclone en échec compte
# toujours comme « pas de remote ovh », comme avant.
# Garde : apps/web/test/ops-backup-hors-site.test.ts (cas « sortie bavarde »).
copie_hors_site() {
  local fichier="$1" bucket="${OFFSITE_BUCKET:-tiktrends-backups}" remotes
  if command -v rclone >/dev/null 2>&1 && remotes="$(rclone listremotes 2>/dev/null)" && grep -q '^ovh:' <<< "$remotes"; then
    if rclone copy "$fichier" "ovh:${bucket}/" 2>/dev/null; then
      echo "[$(date -Is)] Copie hors-site OK -> ovh:${bucket}/"
      # Rotation hors-site : garder ~30 jours.
      rclone delete --min-age 30d "ovh:${bucket}/" 2>/dev/null || true
    else
      echo "[$(date -Is)] AVERTISSEMENT : copie hors-site échouée (sauvegarde locale conservée)."
    fi
  fi
}
# ------------------------------------------------------------------------------

# Sourcé (gardes) : seules les fonctions ci-dessus sont définies, rien ne tourne.
if [ "${BASH_SOURCE[0]}" != "$0" ]; then return 0; fi

configurer || exit $?
KEEP=14   # nombre de sauvegardes quotidiennes conservées

cd "$REPO"
mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/tiktrends-$TS.sql.gz"

# Dump depuis le conteneur db (identifiants lus dans l'environnement du conteneur,
# aucun secret n'apparaît ici). -T = pas de TTY.
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > "$FILE"

# Garde-fou : un dump vide ou minuscule = échec, on ne le garde pas.
if [ ! -s "$FILE" ] || [ "$(stat -c%s "$FILE")" -lt 500 ]; then
  echo "[$(date -Is)] ERREUR : sauvegarde vide, suppression de $FILE"
  rm -f "$FILE"
  exit 1
fi

echo "[$(date -Is)] Sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"

# Rotation : on ne conserve que les $KEEP plus récentes.
ls -1t "$BACKUP_DIR"/tiktrends-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "[$(date -Is)] Rotation : $(ls -1 "$BACKUP_DIR"/tiktrends-*.sql.gz | wc -l) sauvegarde(s) conservée(s)."

# Copie hors-site : jamais depuis une copie d'essai (voir `configurer`).
if [ "$OFFSITE" = 1 ]; then
  copie_hors_site "$FILE"
else
  echo "[$(date -Is)] Copie hors-site SAUTÉE · copie d'essai ($RACINE) : ses dumps ne partent jamais vers ovh:."
fi
