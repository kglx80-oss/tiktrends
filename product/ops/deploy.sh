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

# Le code applicatif a-t-il changé ? On ne rebuild que si apps/packages/Docker
# changent — pas pour une modif ops/ ou docs (économie de temps/ressources).
CODE_CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" -- \
  product/apps product/packages \
  product/Dockerfile.web product/Dockerfile.workers \
  product/docker-compose.yml product/Caddyfile | head -1 || true)

git pull --ff-only origin "$BRANCH"

if [ -z "$CODE_CHANGED" ]; then
  echo "[$(date -Is)] Pas de changement de code applicatif — pull seul, aucun rebuild."
  exit 0
fi

cd "$REPO/product"

# L'empreinte du commit qu'on s'apprête à compiler · on est APRÈS le pull, donc
# HEAD = le commit servi. `docker compose` la passe en build-arg au Dockerfile,
# `next.config` la fige dans l'env compilé, `deployment.ts` la relit · le bandeau
# de diagnostic montre alors le SHA au lieu de « inconnu » (CDC · Lot 0). Sans
# cet export, `${BUILD_SHA-}` du compose est vide et la chaîne reste muette.
export BUILD_SHA
BUILD_SHA=$(git rev-parse --short=8 HEAD)

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
