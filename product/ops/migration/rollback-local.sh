#!/usr/bin/env bash
# Studios · L9 · MIG-03 · retour à l'application précédente sur une base DÉJÀ
# migrée (0054/0055) qui porte des projets Studios, puis ré-avance. En local.
#
# Rejoue ce que ferait le déploiement automatique après un `git revert` de la
# fusion sur main : l'ANCIEN code est construit, son migrateur passe (il ne doit
# rien faire, ni échouer), l'ancienne app sert ses écrans avec les tables et la
# colonne en plus. Puis le NOUVEAU code revient : son migrateur ne doit rien
# refaire. À chaque étape, les lignes Studios doivent être là, identiques.
#
# Usage :
#   ops/migration/rollback-local.sh --base URL_LOCALE_MIGREE \
#       --ancien /chemin/checkout-main/product --nouveau /chemin/checkout-studios/product \
#       [--port 3485] [--sortie DOSSIER] [--repetitions 7]
#
# Les deux checkouts doivent avoir leurs dépendances installées et leur app
# construite (`pnpm --filter @tiktrends/web build`). Rien n'est supprimé.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

URL="" ANCIEN="" NOUVEAU="" PORT=3485 SORTIE="" REPS=7
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) URL="$2"; shift 2 ;;
    --ancien) ANCIEN="$2"; shift 2 ;;
    --nouveau) NOUVEAU="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --sortie) SORTIE="$2"; shift 2 ;;
    --repetitions) REPS="$2"; shift 2 ;;
    *) l9_stop "argument inconnu : $1" ;;
  esac
done
if ! raison="$(l9_garde_locale "$URL")"; then l9_stop "garde · $raison"; fi
for d in "$ANCIEN" "$NOUVEAU"; do [[ -f "$d/packages/db/drizzle/meta/_journal.json" ]] || l9_stop "checkout illisible : $d"; done
SORTIE="${SORTIE:-$(mktemp -d "${TMPDIR:-/tmp}/l9-rollback.XXXXXX")}"; mkdir -p "$SORTIE"
L9_ECHECS=0
BASE="$(l9_nom_base "$URL")"
echo "L9 · rollback local · base $BASE · ancien $(git -C "$ANCIEN" rev-parse --short HEAD) · nouveau $(git -C "$NOUVEAU" rev-parse --short HEAD) · charge $(cut -d' ' -f1-3 /proc/loadavg)"

releve() {
  l9_colonnes "$URL" > "$SORTIE/$1-colonnes.tsv"
  l9_empreinte_donnees "$URL" "$SORTIE/$1-colonnes.tsv" > "$SORTIE/$1-donnees.txt"
  l9_empreinte_schema "$URL" > "$SORTIE/$1-schema.txt"
  l9_migrations_base "$URL" > "$SORTIE/$1-migrations.tsv"
  grep '^studio_' "$SORTIE/$1-donnees.txt" > "$SORTIE/$1-studios.txt" || true
}
memes() {
  local a="$1" b="$2" quoi="$3"
  if cmp -s "$SORTIE/$a-$quoi" "$SORTIE/$b-$quoi"; then return 0; fi
  l9_echec "$b · $quoi différent de $a (diff $SORTIE/$a-$quoi $SORTIE/$b-$quoi)"; return 1
}

releve depart
projets="$(l9_psql "$URL" -c "select count(*) from studio_projects")"
lignes_studio="$(awk -F'|' '{s+=$2} END {print s+0}' "$SORTIE/depart-studios.txt")"
[[ "$projets" -gt 0 ]] || l9_stop "aucun projet Studios en base · appliquer d'abord semis-studios.sql (les « nouveaux projets » à ne pas perdre)"
l9_info "départ · $(wc -l < "$SORTIE/depart-migrations.tsv") migrations, $projets projet(s) Studios, $lignes_studio ligne(s) dans les tables studio_*"

# 1 · L'ancien migrateur sur la base en avance : rien à faire, aucune erreur.
if ( cd "$ANCIEN" && DATABASE_URL="$URL" pnpm --filter @tiktrends/db migrate ) > "$SORTIE/ancien-migrateur.log" 2>&1; then
  l9_ok "ancien migrateur · terminé sans erreur sur la base en avance ($(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).entries.length)' "$ANCIEN/packages/db/drizzle/meta/_journal.json") migrations dans son journal)"
else
  l9_echec "ancien migrateur · en échec sur la base migrée (journal $SORTIE/ancien-migrateur.log) · deploy.sh resterait bloqué"
fi
releve ancien-migre
memes depart ancien-migre migrations.tsv && memes depart ancien-migre schema.txt && memes depart ancien-migre donnees.txt \
  && l9_ok "ancien migrateur · journal, schéma et données inchangés"

# 2 · L'ancienne app sert ses écrans sur la base migrée.
"$L9_DIR/lancer-et-mesurer.sh" --produit "$ANCIEN" --base "$URL" --port "$PORT" --etiquette ancien-sur-base-migree --repetitions "$REPS" --sortie "$SORTIE" | tee "$SORTIE/ancien-app.txt"
mauvais="$(node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).resultats;
  const ko = r.filter((x) => !x.route.startsWith("/studio/projets") && (x.erreurs > 0 || !x.statuts.every((s) => s === 200) || x.contenuAttendu === false));
  console.log(ko.map((x) => `${x.route} ${x.statuts.join(",")} erreurs=${x.erreurs} contenu=${x.contenuAttendu}`).join(" ; "));
' "$SORTIE/mesures-ancien-sur-base-migree.json")"
if [[ -z "$mauvais" ]]; then l9_ok "ancienne app · tous ses écrans en 200, sans erreur, contenu historique rendu"; else l9_echec "ancienne app · écrans en défaut : $mauvais"; fi
releve ancien-servi
memes depart ancien-servi studios.txt && l9_ok "ancienne app · $projets projet(s) Studios et $lignes_studio ligne(s) studio_* toujours en base, à l'identique"

# 3 · Ré-avance : le nouveau migrateur ne refait rien, le nouveau code relit les projets.
if ( cd "$NOUVEAU" && DATABASE_URL="$URL" pnpm --filter @tiktrends/db migrate ) > "$SORTIE/nouveau-migrateur.log" 2>&1; then
  l9_ok "ré-avance · nouveau migrateur terminé sans erreur"
else
  l9_echec "ré-avance · nouveau migrateur en échec (journal $SORTIE/nouveau-migrateur.log)"
fi
releve reavance
memes depart reavance migrations.tsv && memes depart reavance schema.txt && memes ancien-servi reavance donnees.txt \
  && l9_ok "ré-avance · journal, schéma et données identiques (aucune migration rejouée, aucun doublon)"
"$L9_DIR/lancer-et-mesurer.sh" --produit "$NOUVEAU" --base "$URL" --port "$PORT" --etiquette nouveau-apres-reavance --repetitions "$REPS" --sortie "$SORTIE" | tee "$SORTIE/nouveau-app.txt"
mauvais="$(node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).resultats;
  const ko = r.filter((x) => x.erreurs > 0 || !x.statuts.every((s) => s === 200) || x.contenuAttendu === false);
  console.log(ko.map((x) => `${x.route} ${x.statuts.join(",")} erreurs=${x.erreurs} contenu=${x.contenuAttendu}`).join(" ; "));
' "$SORTIE/mesures-nouveau-apres-reavance.json")"
if [[ -z "$mauvais" ]]; then l9_ok "ré-avance · nouvelle app : écrans en 200, projets Studios créés avant le retour arrière affichés"; else l9_echec "ré-avance · écrans en défaut : $mauvais"; fi
releve fin
memes depart fin studios.txt && l9_ok "fin · lignes studio_* identiques au départ"

if [[ "$L9_ECHECS" = 0 ]]; then echo "VERDICT · MIG-03 vérifié sur $BASE · relevés $SORTIE"; exit 0; fi
echo "VERDICT · $L9_ECHECS vérification(s) en échec · relevés $SORTIE" >&2
exit 1
