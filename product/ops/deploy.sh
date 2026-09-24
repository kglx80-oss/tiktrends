#!/usr/bin/env bash
# Auto-déploiement TikTrends sur le VPS OVH.
# Appelé par le timer systemd toutes les minutes.
#
# ── Ce qui a été réparé, et ce que ça coûtait ────────────────────────────────
#
# L'ancienne version décidait « y a-t-il du nouveau ? » en comparant `git HEAD`
# à `origin/main`. Mais `git pull` (qui AVANCE HEAD) se faisait AVANT le
# `docker compose up --build`. Un seul build raté — OOM, disque plein, image de
# base momentanément injoignable — et `set -e` interrompait le script HEAD déjà
# avancé. Au tick suivant : `HEAD == origin/main` → « rien de nouveau » → le
# build n'était JAMAIS retenté. Le dépôt à jour, le conteneur servi figé sur
# l'ancien commit, indéfiniment. Personne ne le voit avant de comparer les SHA.
#
# La règle est désormais : on suit le dernier commit RÉELLEMENT déployé (build +
# migrations menés au bout), consigné dans un marqueur écrit EN DERNIER. Tant que
# le marqueur ne vaut pas `origin/main`, on retente. Un échec ne fige plus rien.
set -euo pipefail

REPO="/home/debian/tiktrends"
BRANCH="main"
# Le SHA du dernier déploiement RÉUSSI · hors du dépôt (jamais écrasé par pull),
# à côté de lui. Absent au premier passage de cette version → on force un build.
MARQUEUR="$REPO/.tiktrends-deployed-sha"

cd "$REPO"

git fetch origin "$BRANCH" --quiet
REMOTE=$(git rev-parse "origin/$BRANCH")
DEPLOYE=$(cat "$MARQUEUR" 2>/dev/null || echo "")

if [ "$DEPLOYE" = "$REMOTE" ]; then
  # Ce commit a déjà été déployé avec succès (build compris) · rien à faire.
  exit 0
fi

echo "[$(date -Is)] Cible $REMOTE (déployé : ${DEPLOYE:-aucun}) — déploiement…"

# Base de comparaison pour « le code a-t-il changé » : le dernier commit déployé,
# pas HEAD. Marqueur absent ou illisible (première fois, ou commit inconnu du
# dépôt local) → base vide, on force le rebuild pour repartir d'un état connu.
BASE="$DEPLOYE"
if [ -z "$BASE" ] || ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  BASE=""
fi

git pull --ff-only origin "$BRANCH"

# On ne rebuild que si apps/packages/Docker changent — pas pour une modif ops/ ou
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
  echo "[$(date -Is)] Pas de changement de code applicatif — pull seul, aucun rebuild."
  # Le commit EST servi (aucun code applicatif n'a bougé) · on avance le marqueur.
  echo "$REMOTE" > "$MARQUEUR"
  exit 0
fi

cd "$REPO/product"

# L'empreinte du commit qu'on compile · `docker compose` la passe en build-arg,
# `next.config` la fige, `deployment.ts` la relit · le bandeau de diagnostic
# montre alors le SHA au lieu de « inconnu ». On est APRÈS le pull, donc
# HEAD = le commit servi.
export BUILD_SHA
BUILD_SHA=$(git rev-parse --short=8 HEAD)

# Build + (re)démarrage des conteneurs modifiés. Un échec ici interrompt le
# script (set -e) SANS toucher au marqueur · le prochain tick retentera.
docker compose up -d --build

# Migrations DB (drizzle n'applique que les nouvelles, donc sans risque).
# On réessaie tant que le conteneur workers n'est pas prêt.
migrees=0
for i in $(seq 1 12); do
  if docker compose exec -T -w /app workers pnpm --filter @tiktrends/db migrate; then
    migrees=1
    break
  fi
  echo "[$(date -Is)] workers pas encore prêt, nouvel essai dans 5s ($i/12)…"
  sleep 5
done
if [ "$migrees" != 1 ]; then
  echo "[$(date -Is)] ÉCHEC · migrations non appliquées après 12 essais · marqueur inchangé, réessai au prochain tick." >&2
  exit 1
fi

# Marqueur avancé EN DERNIER · uniquement build ET migrations réussis. C'est ce
# qui rend le déploiement auto-cicatrisant : tout échec en amont laisse le
# marqueur sur l'ancien SHA, donc retenté.
echo "$REMOTE" > "$MARQUEUR"
echo "[$(date -Is)] Déploiement terminé ($REMOTE)."
