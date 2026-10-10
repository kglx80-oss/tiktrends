#!/usr/bin/env bash
# Studios · L9 · lance UNE app déjà construite (next start) contre une base
# LOCALE, mesure les parcours (mesurer-parcours.mjs), puis arrête CE serveur-là
# et lui seul. Sert BASE-05 (baseline), MIG-02 (écrans historiques sur base
# migrée) et MIG-03 (ancienne app sur base migrée).
#
# Usage :
#   ops/migration/lancer-et-mesurer.sh --produit /chemin/vers/product --base URL_LOCALE \
#       --port 3485 --etiquette main [--repetitions 7] [--sortie DOSSIER]
#
# --produit désigne le dossier `product/` d'un checkout dont `apps/web/.next`
# est construit (`pnpm --filter @tiktrends/web build`). Aucune clé fournisseur
# n'est transmise : l'environnement du serveur est VIDÉ puis reconstruit avec
# le strict nécessaire (base locale, secret de session local tiré au hasard).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PRODUIT="" URL="" PORT=3485 ETIQ="app" REPS=7 SORTIE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --produit) PRODUIT="$2"; shift 2 ;;
    --base) URL="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --etiquette) ETIQ="$2"; shift 2 ;;
    --repetitions) REPS="$2"; shift 2 ;;
    --sortie) SORTIE="$2"; shift 2 ;;
    *) l9_stop "argument inconnu : $1" ;;
  esac
done
if ! raison="$(l9_garde_locale "$URL")"; then l9_stop "garde · $raison"; fi
[[ -f "$PRODUIT/apps/web/.next/BUILD_ID" ]] || l9_stop "aucun build dans $PRODUIT/apps/web/.next (lancer pnpm --filter @tiktrends/web build)"
SORTIE="${SORTIE:-$(mktemp -d "${TMPDIR:-/tmp}/l9-mesures.XXXXXX")}"; mkdir -p "$SORTIE"
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then l9_stop "le port $PORT est déjà pris"; fi

SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n')"
PROPRIO="a9000000-0000-4000-8000-000000000011"
MARQUE="a9000000-0000-4000-8000-000000000021"
PROJET="a9000000-0000-4000-8000-0000000000a1"

cd "$PRODUIT/apps/web"
env -i PATH="$PATH" HOME="${HOME:-/tmp}" NODE_ENV=production DATABASE_URL="$URL" AUTH_SECRET="$SECRET" \
  NEXT_TELEMETRY_DISABLED=1 PORT="$PORT" HOSTNAME=127.0.0.1 \
  "$PRODUIT/apps/web/node_modules/.bin/next" start -p "$PORT" -H 127.0.0.1 > "$SORTIE/serveur-$ETIQ.log" 2>&1 &
SERVEUR=$!
trap 'kill "$SERVEUR" 2>/dev/null || true; wait "$SERVEUR" 2>/dev/null || true' EXIT

debut=$(date +%s%N)
for _ in $(seq 1 600); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/login"; then break; fi
  kill -0 "$SERVEUR" 2>/dev/null || { tail -20 "$SORTIE/serveur-$ETIQ.log" >&2; l9_stop "le serveur $ETIQ s'est arrêté au démarrage"; }
  sleep 0.2
done
echo "serveur $ETIQ prêt en $(( ($(date +%s%N) - debut) / 1000000 )) ms (pid $SERVEUR, port $PORT, build $(cat "$PRODUIT/apps/web/.next/BUILD_ID"))"

node "$L9_DIR/mesurer-parcours.mjs" --app "http://127.0.0.1:$PORT" --secret "$SECRET" --utilisateur "$PROPRIO" \
  --marque "$MARQUE" --projet "$PROJET" --etiquette "$ETIQ" --repetitions "$REPS" --sortie "$SORTIE/mesures-$ETIQ.json"

# Erreurs écrites par le serveur pendant la mesure (hors avertissement « standalone »).
erreurs="$(grep -ciE '(^|[^a-z])(error|erreur)([^a-z]|$)' "$SORTIE/serveur-$ETIQ.log" || true)"
echo "journal serveur $ETIQ : $erreurs ligne(s) d'erreur · $SORTIE/serveur-$ETIQ.log"
