#!/usr/bin/env bash
# Recette Studios · vérification de l'environnement d'essai ISOLÉ, à lancer par
# le propriétaire depuis `product/` (la session de développement n'a pas de
# démon Docker : ce script n'a été joué qu'à blanc).
#
#   bash ops/recette/verifier-environnement.sh            # vérification réelle
#   bash ops/recette/verifier-environnement.sh --a-blanc  # affiche les commandes, n'exécute rien
#
# Chaque point affiche « OK » ou « ÉCHEC » avec sa raison, sans jamais afficher
# une valeur de ops/recette/.env.recette ni une clé. Code de sortie : 0 si
# tout est OK, 1 sinon. Rien n'est dépensé : aucune commande payante ici.
#
# Ordre (garde : apps/web/test/e2-verifier-environnement.test.ts) :
#   1 memoire · 2 disque · 3 fichier-env · 4 compose-config · 5 construction ·
#   6 demarrage · 7 migrations · 8 isolement · 9 ffmpeg-worker · 10 sonde-video ·
#   11 site-local · 12 registre
set -u

A_BLANC=0
if [ "${1:-}" = "--a-blanc" ]; then A_BLANC=1; fi

# Seuils MESURÉS (ops/recette/README.md §2) : pic de `next build` 2 375 Mo, dépendances 804 Mo.
SEUIL_MEMOIRE_MO=3500
SEUIL_DISQUE_GO=10

DC="docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette"
ECHECS=0
RESUME=""
ETAPE=0

etape() { ETAPE=$((ETAPE + 1)); echo "ÉTAPE ${ETAPE} · $1"; }
ok() { echo "  OK · $1"; RESUME="${RESUME}OK     · ${ETAPE} $2"$'\n'; }
echec() { echo "  ÉCHEC · $1"; ECHECS=$((ECHECS + 1)); RESUME="${RESUME}ÉCHEC  · ${ETAPE} $2"$'\n'; }
# Exécute (ou affiche, à blanc) une commande · sa sortie va dans $SORTIE.
lancer() {
  if [ "$A_BLANC" = "1" ]; then echo "  [à blanc] $*"; SORTIE=""; STATUT=0; return 0; fi
  SORTIE="$(eval "$*" 2>&1)"
  STATUT=$?
}

if [ ! -f docker-compose.recette.yml ]; then echo "ÉCHEC · lance ce script depuis product/ (docker-compose.recette.yml introuvable)"; exit 1; fi

# 1 · mémoire disponible
etape "memoire · mémoire disponible ≥ ${SEUIL_MEMOIRE_MO} Mo"
if [ "$A_BLANC" = "1" ]; then echo "  [à blanc] lecture de MemAvailable (/proc/meminfo) ou de la mémoire de Docker Desktop"; else
  # RECETTE_MEMINFO : autre fichier au format /proc/meminfo (garde de test seulement).
  MEMINFO="${RECETTE_MEMINFO:-/proc/meminfo}"
  if [ -r "$MEMINFO" ]; then MO=$(awk '/^MemAvailable:/ {print int($2/1024)}' "$MEMINFO"); else MO=$(( $(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0) / 1048576 )); fi
  if [ "${MO:-0}" -ge "$SEUIL_MEMOIRE_MO" ]; then ok "${MO} Mo disponibles" "memoire"; else echec "${MO:-0} Mo disponibles < ${SEUIL_MEMOIRE_MO} Mo · ne démarre pas (sur le VPS, passe par ta machine)" "memoire"; fi
fi

# 2 · disque libre
etape "disque · disque libre ≥ ${SEUIL_DISQUE_GO} Go"
if [ "$A_BLANC" = "1" ]; then echo "  [à blanc] df -Pk ."; else
  GO=$(df -Pk . | awk 'NR==2 {print int($4/1048576)}')
  if [ "${GO:-0}" -ge "$SEUIL_DISQUE_GO" ]; then ok "${GO} Go libres" "disque"; else echec "${GO:-0} Go libres < ${SEUIL_DISQUE_GO} Go" "disque"; fi
fi

# 3 · fichier d'environnement de recette · présent, sans clé payante (on COMPTE, on n'affiche rien)
etape "fichier-env · ops/recette/.env.recette présent, sans FAL_KEY ni ANTHROPIC_API_KEY"
if [ "$A_BLANC" = "1" ]; then echo "  [à blanc] grep -cE '^(FAL_KEY|ANTHROPIC_API_KEY)=' ops/recette/.env.recette"; else
  if [ ! -f ops/recette/.env.recette ]; then echec "fichier absent · crée-le (README §4.1)" "fichier-env";
  elif [ "$(grep -cE '^(FAL_KEY|ANTHROPIC_API_KEY)=' ops/recette/.env.recette)" != "0" ]; then echec "une clé payante est écrite dans le fichier · retire-la (elle ne passe que par ton shell)" "fichier-env";
  else ok "présent, aucune clé payante" "fichier-env"; fi
fi

# 4 · configuration résolue · noms préfixés, ports sur 127.0.0.1 seulement, aucun fichier de production
etape "compose-config · configuration résolue du projet : volumes, réseaux, ports, fichiers de production"
lancer "$DC --profile outils config"
if [ "$A_BLANC" = "0" ]; then
  if [ -z "$SORTIE" ] || echo "$SORTIE" | grep -q "^error\|invalid"; then echec "config illisible" "compose-config";
  else
    PUBLIES=$(echo "$SORTIE" | grep -cE '^\s+published:')
    LOCAUX=$(echo "$SORTIE" | grep -cE '^\s+host_ip: 127\.0\.0\.1$')
    NOMS=$(echo "$SORTIE" | awk '/^(volumes|networks):/ {s=1; next} /^[a-z]/ {s=0} s && /^    name:/ {print $2}')
    HORS=$(echo "$NOMS" | grep -v '^tiktrends-recette' | grep -c . || true)
    if echo "$SORTIE" | grep -q '\.env\.deploy'; then echec ".env.deploy (production) référencé" "compose-config";
    elif [ "$PUBLIES" = "0" ]; then echec "aucun port publié pour le site de recette" "compose-config";
    elif [ "$PUBLIES" != "$LOCAUX" ]; then echec "${PUBLIES} port(s) publié(s), ${LOCAUX} sur 127.0.0.1 · un port sort de la machine" "compose-config";
    elif [ "$HORS" != "0" ]; then echec "volume ou réseau hors préfixe tiktrends-recette" "compose-config";
    else ok "ports sur 127.0.0.1 seulement (${PUBLIES}), volumes et réseaux préfixés tiktrends-recette" "compose-config"; fi
  fi
fi

# 5 · construction des images du projet de recette
etape "construction · images web, worker et outils de recette"
lancer "$DC --profile outils build"
if [ "$A_BLANC" = "0" ]; then if [ "$STATUT" -eq 0 ]; then ok "images construites" "construction"; else echec "construction en échec · relis la sortie de « $DC --profile outils build »" "construction"; fi; fi

# 6 · démarrage (base, Redis, web, worker de recette)
etape "demarrage · up -d des services de recette"
lancer "$DC up -d"
if [ "$A_BLANC" = "0" ]; then lancer "$DC ps --status running --services"; if echo "$SORTIE" | grep -q '^web_recette$' && echo "$SORTIE" | grep -q '^workers_recette$'; then ok "web_recette et workers_recette en marche" "demarrage"; else echec "services non démarrés · « $DC logs »" "demarrage"; fi; fi

# 7 · migrations de la base de recette (la sonde publie dans app_settings)
etape "migrations · base de recette à jour"
lancer "$DC --profile outils run --rm -w /app outils_recette pnpm --filter @tiktrends/db migrate"
if [ "$A_BLANC" = "0" ]; then if [ "$STATUT" -eq 0 ]; then ok "migrations appliquées" "migrations"; else echec "migrations en échec" "migrations"; fi; fi

# 8 · inspection · aucun volume ni réseau hors du projet de recette sur ses conteneurs
etape "isolement · inspection des conteneurs : montages et réseaux du seul projet tiktrends-recette"
lancer "docker ps -a --filter label=com.docker.compose.project=tiktrends-recette --format '{{.Names}}' | xargs -r docker inspect --format '{{range .Mounts}}{{if .Name}}V:{{.Name}} {{else}}B:{{.Source}} {{end}}{{end}}{{range \$k, \$v := .NetworkSettings.Networks}}N:{{\$k}} {{end}}'"
if [ "$A_BLANC" = "0" ]; then
  INTRUS=$(echo "$SORTIE" | tr ' ' '\n' | grep -E '^(V|N):' | grep -vE '^(V|N):tiktrends-recette' | sort -u)
  BINDS=$(echo "$SORTIE" | tr ' ' '\n' | grep -E '^B:' | grep -vE '/ops/recette/(sorties|registre)$' | sort -u)
  if [ -n "$INTRUS" ] || [ -n "$BINDS" ]; then echec "partage détecté · $(echo "$INTRUS $BINDS" | tr '\n' ' ')" "isolement"; else ok "volumes, réseaux et montages propres à tiktrends-recette" "isolement"; fi
fi

# 9 · ffmpeg et ffprobe présents dans l'image du worker
etape "ffmpeg-worker · ffprobe et ffmpeg dans workers_recette"
lancer "$DC run --rm --no-deps workers_recette ffprobe -version"; V1=$(echo "$SORTIE" | head -1)
lancer "$DC run --rm --no-deps workers_recette ffmpeg -version"; V2=$(echo "$SORTIE" | head -1)
if [ "$A_BLANC" = "0" ]; then
  if echo "$V1" | grep -q '^ffprobe version' && echo "$V2" | grep -q '^ffmpeg version'; then ok "${V1} · ${V2}" "ffmpeg-worker"; else echec "ffprobe ou ffmpeg absent de l'image du worker" "ffmpeg-worker"; fi; fi

# 10 · la sonde vidéo publie sa capacité (publiée PUIS relue en base)
etape "sonde-video · sonde publiée et relue dans app_settings"
lancer "$DC run --rm workers_recette pnpm exec tsx src/recette/sonde-recette.ts"
if [ "$A_BLANC" = "0" ]; then L=$(echo "$SORTIE" | grep -E '^(OK|ÉCHEC) · ' | tail -1); if echo "$L" | grep -q '^OK · '; then ok "${L#OK · }" "sonde-video"; else echec "${L:-aucune ligne de sonde}" "sonde-video"; fi; fi

# 11 · le site de recette répond, sur 127.0.0.1 SEULEMENT
etape "site-local · http://127.0.0.1:3101 répond, publié sur 127.0.0.1 seulement"
lancer "$DC port web_recette 3000"; PORT="$SORTIE"
lancer "curl -sS -o /dev/null -w '%{http_code}' --max-time 20 http://127.0.0.1:3101/"; CODE="$SORTIE"
if [ "$A_BLANC" = "0" ]; then
  if [ "$PORT" != "127.0.0.1:3101" ]; then echec "publié sur « ${PORT} » · seul 127.0.0.1:3101 est admis" "site-local";
  elif echo "$CODE" | grep -qE '^[23][0-9][0-9]$'; then ok "HTTP ${CODE}, publié sur ${PORT}" "site-local";
  else echec "HTTP « ${CODE} » sur http://127.0.0.1:3101/" "site-local"; fi; fi

# 12 · registre cumulatif du budget · dossier présent sur la machine, jamais dans un volume
etape "registre · ops/recette/registre sur la machine, lisible par recette:budget"
lancer "mkdir -p ops/recette/registre && $DC --profile outils run --rm outils_recette pnpm --filter @tiktrends/web recette:budget"
if [ "$A_BLANC" = "0" ]; then if echo "$SORTIE" | grep -q 'RESTANT'; then ok "$(echo "$SORTIE" | grep 'RESTANT' | sed 's/^ *//')" "registre";
  elif echo "$SORTIE" | grep -q 'premier essai'; then ok "registre absent, base sans dépense · créé à la première commande payante" "registre";
  else echec "$(echo "$SORTIE" | tail -1)" "registre"; fi; fi

echo
echo "Résumé"
if [ "$A_BLANC" = "1" ]; then echo "À BLANC · ${ETAPE} étapes affichées, rien n'a été exécuté."; exit 0; fi
printf '%s' "$RESUME"
if [ "$ECHECS" -gt 0 ]; then echo "${ECHECS} ÉCHEC(S) · ne lance aucune commande payante."; exit 1; fi
echo "Tout est OK · tu peux passer au pas 1 (README §4.5)."
exit 0
