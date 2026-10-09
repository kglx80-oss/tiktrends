#!/usr/bin/env bash
# Banc D1 · exécute le VRAI `ops/deploy.sh` dans un monde git temporaire, avec
# de faux `docker`, `git` (journalisant, puis vrai git) et `sleep` en tête du
# PATH. Rien n'est construit, rien n'est démarré, aucune base n'est touchée :
# le faux docker JOURNALISE chaque appel avec son étape et simule le résultat.
#
#   ops/test-deploiement/banc.sh <scénario> [--sortie DIR] [--deploy FICHIER]
#
# Scénarios : succes, premier, rien, ops_seul, build_ko, migration_ko,
# migration_ko_base_a_jour, verification_ko, lecture_base_ko, activation_ko,
# retour_arriere, reprise, garde_essai.
#
# Sortie (dans DIR, par défaut un dossier temporaire affiché à la fin) :
#   journal    une ligne par appel · « étape<TAB>commande<TAB>BUILD_SHA=…<TAB>PROJET=…<TAB>issue=ok|ko »
#              (git : « git<TAB>commande »)
#   sortie     ce que deploy.sh a écrit (stdout et stderr)
#   resultat   code=…, marqueur_avant=…, marqueur_apres=…, cible=…, sha_court=…
#
# La garde qui lit ce journal : apps/web/test/d1-deploiement.test.ts.
set -euo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRODUIT="$(cd "$ICI/../.." && pwd)"
SCENARIO="${1:-}"
[ -n "$SCENARIO" ] || { echo "usage : banc.sh <scénario> [--sortie DIR] [--deploy FICHIER]" >&2; exit 64; }
shift
SORTIE=""
DEPLOY="$PRODUIT/ops/deploy.sh"
while [ $# -gt 0 ]; do
  case "$1" in
    --sortie) SORTIE="$2"; shift 2 ;;
    --deploy) DEPLOY="$2"; shift 2 ;;
    *) echo "argument inconnu : $1" >&2; exit 64 ;;
  esac
done
[ -n "$SORTIE" ] || SORTIE="$(mktemp -d "${TMPDIR:-/tmp}/banc-d1.XXXXXX")"
mkdir -p "$SORTIE/etat"
: > "$SORTIE/journal"
: > "$SORTIE/sortie"

VRAI_GIT="$(command -v git)"
# Monde hermétique : ni la configuration git de la machine (signature des
# commits, négociation de push…), ni celle du système.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
g() { "$VRAI_GIT" -c user.name=banc -c user.email=banc@exemple.invalid -c init.defaultBranch=main "$@"; }

MONDE="$SORTIE/monde"
rm -rf "$MONDE"
mkdir -p "$MONDE"
g init -q --bare "$MONDE/origin.git"
g clone -q "$MONDE/origin.git" "$MONDE/dev" 2>/dev/null
DEV="$MONDE/dev"
g -C "$DEV" checkout -q -b main

# L'arbre minimal que deploy.sh regarde : code applicatif, journal RÉEL des
# migrations (même format que celui que le script lit sur le VPS), ops/.
mkdir -p "$DEV/product/apps/web" "$DEV/product/packages/db/drizzle/meta" "$DEV/product/ops"
echo "v1" > "$DEV/product/apps/web/page.txt"
cp "$PRODUIT/packages/db/drizzle/meta/_journal.json" "$DEV/product/packages/db/drizzle/meta/_journal.json"
echo "notes v1" > "$DEV/product/ops/notes.txt"
g -C "$DEV" add -A
g -C "$DEV" commit -q -m "initial"
g -C "$DEV" push -q origin main
INITIAL="$(g -C "$DEV" rev-parse HEAD)"

g clone -q "$MONDE/origin.git" "$MONDE/depot"
DEPOT="$MONDE/depot"

# État de la base simulée : toutes les migrations du journal initial appliquées.
grep -oE '"when"[[:space:]]*:[[:space:]]*[0-9]+' "$DEV/product/packages/db/drizzle/meta/_journal.json" \
  | grep -oE '[0-9]+$' | sort -u > "$SORTIE/etat/base"

# Le dernier déploiement réussi : le commit initial.
echo "$INITIAL" > "$DEPOT/.tiktrends-deployed-sha"

commit_code() {
  echo "v2 $RANDOM" >> "$DEV/product/apps/web/page.txt"
  g -C "$DEV" add -A && g -C "$DEV" commit -q -m "code" && g -C "$DEV" push -q origin main
}
commit_migration() {
  # Ajoute au journal une migration postérieure à la dernière (when + 1000).
  node -e '
    const fs = require("fs"); const f = process.argv[1];
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const d = j.entries[j.entries.length - 1];
    const idx = d.idx + 1;
    j.entries.push({ idx, version: d.version, when: d.when + 1000, tag: String(idx).padStart(4, "0") + "_banc_d1", breakpoints: true });
    fs.writeFileSync(f, JSON.stringify(j, null, 2));
  ' "$DEV/product/packages/db/drizzle/meta/_journal.json"
  echo "-- banc D1" > "$DEV/product/packages/db/drizzle/banc_d1.sql"
  echo "v2 migration" >> "$DEV/product/apps/web/page.txt"
  g -C "$DEV" add -A && g -C "$DEV" commit -q -m "code et migration" && g -C "$DEV" push -q origin main
}
commit_ops() {
  echo "notes v2" >> "$DEV/product/ops/notes.txt"
  g -C "$DEV" add -A && g -C "$DEV" commit -q -m "ops seul" && g -C "$DEV" push -q origin main
}

export BANC_JOURNAL="$SORTIE/journal" BANC_ETAT="$SORTIE/etat" BANC_VRAI_GIT="$VRAI_GIT"
export TIKTRENDS_REPO="$DEPOT" COMPOSE_PROJECT_NAME="banc-d1"
unset BUILD_SHA FAUX_BUILD FAUX_MIGRATION FAUX_UP FAUX_LECTURE_BASE 2>/dev/null || true

case "$SCENARIO" in
  succes)          commit_migration ;;
  premier)         rm -f "$DEPOT/.tiktrends-deployed-sha" ;;
  rien)            ;;
  ops_seul)        commit_ops ;;
  build_ko)        commit_migration; export FAUX_BUILD=ko ;;
  migration_ko)    commit_migration; export FAUX_MIGRATION=ko ;;
  # Le migrateur échoue (base injoignable, verrou…) alors que la base est déjà
  # à jour : la vérification passerait · seul l'arrêt sur l'échec protège.
  migration_ko_base_a_jour) commit_code; export FAUX_MIGRATION=ko ;;
  verification_ko) commit_migration; export FAUX_MIGRATION=muette ;;
  lecture_base_ko) commit_migration; export FAUX_LECTURE_BASE=ko ;;
  activation_ko)   commit_migration; export FAUX_UP=ko ;;
  retour_arriere)  commit_code; echo 9999999999999 >> "$SORTIE/etat/base" ;;
  reprise)         commit_migration ;;
  garde_essai)     commit_code; unset COMPOSE_PROJECT_NAME ;;
  *) echo "scénario inconnu : $SCENARIO" >&2; exit 64 ;;
esac

CIBLE="$(g -C "$DEV" rev-parse HEAD)"
MARQUEUR_AVANT="$(cat "$DEPOT/.tiktrends-deployed-sha" 2>/dev/null || echo absent)"

lancer() {
  set +e
  ( cd / && PATH="$ICI/faux:$PATH" bash "$DEPLOY" ) >> "$SORTIE/sortie" 2>&1
  CODE=$?
  set -e
}

if [ "$SCENARIO" = reprise ]; then
  # Premier passage : construction en échec. Second : tout réussit · le
  # marqueur resté en arrière doit suffire à relancer le déploiement.
  FAUX_BUILD=ko lancer
  CODE1=$CODE
  printf 'passage\t--- second passage ---\n' >> "$SORTIE/journal"
  lancer
  echo "code_premier=$CODE1" >> "$SORTIE/resultat.tmp"
else
  lancer
fi

{
  cat "$SORTIE/resultat.tmp" 2>/dev/null || true
  echo "code=$CODE"
  echo "marqueur_avant=$MARQUEUR_AVANT"
  echo "marqueur_apres=$(cat "$DEPOT/.tiktrends-deployed-sha" 2>/dev/null || echo absent)"
  echo "cible=$CIBLE"
  echo "sha_court=$(g -C "$DEV" rev-parse --short=8 HEAD)"
} > "$SORTIE/resultat"
rm -f "$SORTIE/resultat.tmp"

echo "── banc D1 · scénario $SCENARIO · $SORTIE"
echo "── journal"
cat "$SORTIE/journal"
echo "── sortie de deploy.sh"
cat "$SORTIE/sortie"
echo "── résultat"
cat "$SORTIE/resultat"
