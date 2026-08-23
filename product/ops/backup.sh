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
# COPIE HORS-SITE (OVH Object Storage) — s'active TOUTE SEULE dès qu'un remote
# rclone nommé "ovh" existe. Tant qu'il n'est pas configuré, on ne fait rien.
# La copie n'échoue jamais la sauvegarde locale (best-effort).
OFFSITE_BUCKET="${OFFSITE_BUCKET:-tiktrends-backups}"
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q '^ovh:'; then
  if rclone copy "$FILE" "ovh:${OFFSITE_BUCKET}/" 2>/dev/null; then
    echo "[$(date -Is)] Copie hors-site OK -> ovh:${OFFSITE_BUCKET}/"
    # Rotation hors-site : garder ~30 jours.
    rclone delete --min-age 30d "ovh:${OFFSITE_BUCKET}/" 2>/dev/null || true
  else
    echo "[$(date -Is)] AVERTISSEMENT : copie hors-site échouée (sauvegarde locale conservée)."
  fi
fi
# ------------------------------------------------------------------------------
