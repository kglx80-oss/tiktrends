#!/usr/bin/env bash
# Studios · L9 · MIG-04 · restauration d'une sauvegarde EN ISOLÉ, puis validation.
#
# Prend un fichier au format de `ops/backup.sh` (pg_dump --clean --if-exists,
# SQL texte compressé gzip), le restaure dans une base NEUVE locale (copie_* ou
# l9_*), puis valide : intégrité du fichier, restauration sans AUCUNE erreur
# (ON_ERROR_STOP, une seule transaction), lignes par table, clés étrangères
# (orphelins comptés sur les DONNÉES), contraintes toutes validées,
# déclencheurs d'immuabilité présents, journal drizzle conforme au dépôt, et,
# si une base de référence est donnée, empreintes des données et du schéma
# identiques à la source.
#
# La production n'est jamais touchée : la base cible doit être locale et
# NEUVE ; le script refuse une base existante (aucune restauration « par
# dessus »).
#
# Usage :
#   ops/migration/restaurer-isole.sh --sauvegarde tiktrends-AAAAMMJJ-HHMMSS.sql.gz \
#       --base postgres://postgres@127.0.0.1:5433/copie_20261009 \
#       [--reference URL_LOCALE_SOURCE] [--sans-proprietaires] [--sortie DOSSIER]
#
#   --sans-proprietaires  retire les « ALTER … OWNER TO » et GRANT/REVOKE du
#                         flux (le rôle de production, ex. « tiktrends »,
#                         n'existe pas sur la machine isolée). Sans ce drapeau,
#                         un rôle propriétaire absent arrête tout, et le dit.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FICHIER="" URL="" REF="" SANS_PROPRIO=0 SORTIE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sauvegarde) FICHIER="$2"; shift 2 ;;
    --base) URL="$2"; shift 2 ;;
    --reference) REF="$2"; shift 2 ;;
    --sans-proprietaires) SANS_PROPRIO=1; shift ;;
    --sortie) SORTIE="$2"; shift 2 ;;
    *) l9_stop "argument inconnu : $1" ;;
  esac
done
if ! raison="$(l9_garde_locale "$URL")"; then l9_stop "garde · $raison"; fi
if [[ -n "$REF" ]] && ! raison="$(l9_garde_locale "$REF")"; then l9_stop "garde (référence) · $raison"; fi
[[ -f "$FICHIER" ]] || l9_stop "sauvegarde introuvable : $FICHIER"
BASE="$(l9_nom_base "$URL")"; ADMIN="$(l9_url_admin "$URL")"
SORTIE="${SORTIE:-$(mktemp -d "${TMPDIR:-/tmp}/l9-restauration.XXXXXX")}"; mkdir -p "$SORTIE"
L9_ECHECS=0
echo "L9 · restauration isolée · $(basename "$FICHIER") ($(du -h "$FICHIER" | cut -f1)) → $BASE · charge $(cut -d' ' -f1-3 /proc/loadavg)"

# ── 1 · Le fichier ──────────────────────────────────────────────────────────
gzip -t "$FICHIER" 2>/dev/null || l9_stop "fichier gzip corrompu ou tronqué : $FICHIER"
tete="$(gunzip -c "$FICHIER" 2>/dev/null | head -c 4096 || true)"
[[ "$tete" == *"PostgreSQL database dump"* ]] || l9_stop "ce n'est pas un pg_dump au format texte (format de backup.sh attendu)"
[[ "$(gunzip -c "$FICHIER" | tail -c 2048)" == *"PostgreSQL database dump complete"* ]] || l9_stop "pg_dump incomplet : la ligne de fin « dump complete » manque (sauvegarde interrompue)"
version="$(grep -oE 'Dumped by pg_dump version [0-9.]+' <<< "$tete" | head -1 || true)"
l9_ok "fichier · gzip intègre, pg_dump texte complet (${version:-version non lue})"

# Rôles propriétaires cités par le flux et absents de ce serveur.
mapfile -t ROLES < <(gunzip -c "$FICHIER" | grep -oE 'OWNER TO [A-Za-z_"][A-Za-z0-9_"]*;' | sed -E 's/OWNER TO "?([^";]+)"?;/\1/' | sort -u)
absents=()
for r in "${ROLES[@]}"; do
  [[ "$(l9_psql "$ADMIN" -c "select count(*) from pg_roles where rolname = '$r'")" = 1 ]] || absents+=("$r")
done
if [[ ${#absents[@]} -gt 0 && "$SANS_PROPRIO" = 0 ]]; then
  l9_stop "rôle(s) propriétaire(s) absent(s) ici : ${absents[*]} · relancer avec --sans-proprietaires (la propriété n'est pas une donnée)"
fi

# ── 2 · Restauration dans une base NEUVE ────────────────────────────────────
[[ "$(l9_psql "$ADMIN" -c "select count(*) from pg_database where datname = '$BASE'")" = 0 ]] || l9_stop "la base $BASE existe déjà · une restauration isolée se fait dans une base neuve"
l9_psql "$ADMIN" -c "create database \"$BASE\""
debut=$(date +%s%N)
filtre() { if [[ "$SANS_PROPRIO" = 1 ]]; then grep -vE '^(ALTER [A-Z ]+ .* OWNER TO |GRANT |REVOKE )'; else cat; fi; }
if gunzip -c "$FICHIER" | filtre | psql "$URL" -X -q -v ON_ERROR_STOP=1 --single-transaction > "$SORTIE/restauration.log" 2>&1; then
  l9_ok "restauration · sans aucune erreur, en une transaction ($(( ($(date +%s%N) - debut) / 1000000 )) ms)$([[ $SANS_PROPRIO = 1 ]] && echo " · propriétaires retirés : ${absents[*]:-aucun}")"
else
  l9_echec "restauration · en erreur (rien n'est conservé, transaction annulée) : $(grep -m1 -E 'ERROR|ERREUR' "$SORTIE/restauration.log" || tail -1 "$SORTIE/restauration.log")"
  exit 1
fi

# ── 3 · Validation des données et des relations ─────────────────────────────
l9_colonnes "$URL" > "$SORTIE/colonnes.tsv"
l9_empreinte_donnees "$URL" "$SORTIE/colonnes.tsv" > "$SORTIE/donnees.txt"
l9_empreinte_schema "$URL" > "$SORTIE/schema.txt"
l9_ok "tables · $(wc -l < "$SORTIE/donnees.txt") tables, $(awk -F'|' '{s+=$2} END {print s+0}' "$SORTIE/donnees.txt") lignes (détail par table : $SORTIE/donnees.txt)"

l9_orphelins "$URL" > "$SORTIE/orphelins.txt"
nfk="$(wc -l < "$SORTIE/orphelins.txt")"; norph="$(awk -F'|' '$2 > 0' "$SORTIE/orphelins.txt" | wc -l)"
if [[ "$norph" = 0 ]]; then l9_ok "relations · $nfk clés étrangères vérifiées sur les données, 0 orphelin"; else l9_echec "relations · $norph clé(s) étrangère(s) avec orphelins : $(awk -F'|' '$2 > 0' "$SORTIE/orphelins.txt" | tr '\n' ' ')"; fi

nv="$(l9_psql "$URL" -c "select count(*) from pg_constraint where connamespace = 'public'::regnamespace and not convalidated")"
[[ "$nv" = 0 ]] && l9_ok "contraintes · toutes validées ($(l9_psql "$URL" -c "select count(*) from pg_constraint where connamespace = 'public'::regnamespace") au total)" || l9_echec "contraintes · $nv non validée(s)"

attendus="$(l9_psql "$URL" -c "select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relname like 'studio\_%'")"
studio="$(l9_psql "$URL" -c "select count(*) from pg_class where relname like 'studio\_%' and relkind = 'r'")"
if [[ "$studio" -gt 0 ]]; then
  # Les tables immuables le restent après restauration : un UPDATE est refusé.
  if l9_psql "$URL" -c "begin; update studio_audit_events set reason = reason; rollback;" > /dev/null 2>&1 && [[ "$(l9_psql "$URL" -c "select count(*) from studio_audit_events")" != 0 ]]; then
    l9_echec "immuabilité · un UPDATE a été accepté sur studio_audit_events après restauration"
  else
    l9_ok "immuabilité · $attendus déclencheurs studio_* restaurés, table d'audit toujours en ajout seul"
  fi
fi

if [[ "$(l9_psql "$URL" -c "select count(*) from pg_namespace where nspname = 'drizzle'")" = 1 ]]; then
  l9_migrations_base "$URL" > "$SORTIE/migrations.tsv"
  l9_journal > "$SORTIE/journal.tsv"
  n_base="$(wc -l < "$SORTIE/migrations.tsv")"; n_depot="$(wc -l < "$SORTIE/journal.tsv")"
  conformes=0
  while IFS=$'\t' read -r cree hash; do
    tag="$(awk -F'\t' -v w="$cree" '$2 == w { print $3 }' "$SORTIE/journal.tsv")"
    [[ -n "$tag" && "$(sha256sum "$L9_DRIZZLE/$tag.sql" | cut -d' ' -f1)" = "$hash" ]] && conformes=$((conformes + 1))
  done < "$SORTIE/migrations.tsv"
  l9_ok "journal drizzle · $n_base migration(s) dans la sauvegarde, $conformes conforme(s) au dépôt, $n_depot au journal du dépôt$([[ $n_base -lt $n_depot ]] && echo " · $((n_depot - n_base)) à appliquer par le migrateur")"
  [[ "$conformes" = "$n_base" ]] || l9_echec "journal drizzle · $((n_base - conformes)) empreinte(s) en base inconnue(s) du dépôt"
fi

# ── 4 · Comparaison à la source (recette locale) ────────────────────────────
if [[ -n "$REF" ]]; then
  l9_empreinte_donnees "$REF" "$SORTIE/colonnes.tsv" > "$SORTIE/reference-donnees.txt"
  l9_empreinte_schema "$REF" > "$SORTIE/reference-schema.txt"
  cmp -s "$SORTIE/reference-donnees.txt" "$SORTIE/donnees.txt" && l9_ok "source · données identiques table par table (lignes et empreintes)" || l9_echec "source · données différentes : diff $SORTIE/reference-donnees.txt $SORTIE/donnees.txt"
  cmp -s "$SORTIE/reference-schema.txt" "$SORTIE/schema.txt" && l9_ok "source · schéma identique (colonnes, contraintes, index, déclencheurs, fonctions, enums)" || l9_echec "source · schéma différent : diff $SORTIE/reference-schema.txt $SORTIE/schema.txt"
fi

if [[ "$L9_ECHECS" = 0 ]]; then echo "VERDICT · MIG-04 · sauvegarde restaurée et validée dans $BASE · relevés $SORTIE"; exit 0; fi
echo "VERDICT · $L9_ECHECS vérification(s) en échec · relevés $SORTIE" >&2
exit 1
