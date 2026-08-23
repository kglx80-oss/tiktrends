#!/usr/bin/env bash
# Auto-déploiement TikTrends sur le VPS OVH.
# Vérifie s'il y a de nouveaux commits sur origin/main ; si oui : pull + rebuild
# + migrations (idempotentes). Appelé par le timer systemd toutes les minutes.
set -euo pipefail

REPO="/home/debian/tiktrends"
BRANCH="main"

cd "$REPO"

git fetch origin "$BRANCH" --quiet
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  # Rien de nouveau.
  exit 0
fi

echo "[$(date -Is)] Nouveau commit détecté ($REMOTE) — déploiement…"

# product/ a-t-il changé ? (sinon inutile de rebuild : ex. modif de la maquette).
PRODUCT_CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" -- product/ | head -1 || true)

git pull --ff-only origin "$BRANCH"

if [ -z "$PRODUCT_CHANGED" ]; then
  echo "[$(date -Is)] Aucun changement dans product/ — pas de rebuild."
  exit 0
fi

cd "$REPO/product"

# Build + (re)démarrage des conteneurs modifiés.
docker compose up -d --build

# Migrations DB (drizzle n'applique que les nouvelles, donc sans risque).
# On réessaie tant que le conteneur workers n'est pas prêt.
for i in $(seq 1 12); do
  if docker compose exec -T -w /app workers pnpm --filter @tiktrends/db migrate; then
    break
  fi
  echo "[$(date -Is)] workers pas encore prêt, nouvel essai dans 5s ($i/12)…"
  sleep 5
done

echo "[$(date -Is)] Déploiement terminé."
