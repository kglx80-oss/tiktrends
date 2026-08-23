#!/usr/bin/env bash
# Sauvegarde quotidienne de la base TikTrends (pg_dump compressé + rotation).
# Lancé par le timer systemd. Les dumps restent sur le VPS (voir §off-site pour
# une copie hors-site OVH Object Storage, fortement recommandée).
set -euo pipefail

REPO="/home/debian/tiktrends/product"
BACKUP_DIR="/home/debian/backups"
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

# ------------------------------------------------------------------------------
# COPIE HORS-SITE (optionnelle, recommandée) — décommenter après avoir configuré
# rclone avec un remote "ovh" pointant sur OVH Object Storage (S3) :
#   rclone copy "$FILE" ovh:tiktrends-backups/ && echo "copie hors-site OK"
# ------------------------------------------------------------------------------
