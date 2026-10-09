#!/usr/bin/env bash
# Studios · L9 · MIG-01 · migration interrompue puis rejouée, vérifiée par empreintes.
#
# Sur une base LOCALE (l9_* ou copie_*) : relève l'état d'avant (lignes,
# empreintes des données, empreinte du schéma, journal drizzle), lance le VRAI
# migrateur (`pnpm --filter @tiktrends/db migrate`, celui de deploy.sh) et
# l'INTERROMPT au milieu, à chaque point demandé, en alternant deux façons :
#
#   coupure · la connexion du migrateur est tuée (pg_terminate_backend) pendant
#             qu'il attend un verrou, transaction ouverte, travail déjà fait ;
#   échec   · le migrateur échoue de lui-même (lock_timeout posé sur la base),
#             comme une erreur SQL au milieu du lot.
#
# Après chaque interruption, la base doit être EXACTEMENT celle d'avant. Puis
# reprise complète, deuxième passage (rien à faire), et ré-exécution brute des
# fichiers en attente (psql) : aucun doublon, aucune perte, données existantes
# inchangées, nouvelles colonnes vides, nouvelles tables vides (pas de backfill).
#
# Usage :
#   ops/migration/verifier-migration.sh --base postgres://postgres@127.0.0.1:5433/l9_mig \
#       [--preparer 0053] [--points "brands adsmap_ads ai_spend"] [--sortie DOSSIER]
#
#   --preparer TAG  crée la base (elle ne doit pas exister), applique le journal
#                   jusqu'à TAG inclus par le vrai migrateur, puis le semis
#                   synthétique (semis-synthetique.sql, schéma de 0053).
#                   Sans --preparer : la base existe déjà (copie restaurée de la
#                   production, cf. restaurer-isole.sh) et n'est pas semée.
#   --points        tables existantes que le lot en attente modifie ou référence ;
#                   le migrateur est bloqué sur chacune puis interrompu. Défaut :
#                   les tables existantes nommées par un ALTER TABLE des
#                   migrations en attente, dans l'ordre d'apparition.
#
# Code de sortie : 0 si tout est vérifié, 1 si une vérification échoue, 2 si
# la garde refuse ou si un prérequis manque. JAMAIS contre la production.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

URL="" PREPARER="" POINTS="" SORTIE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) URL="$2"; shift 2 ;;
    --preparer) PREPARER="$2"; shift 2 ;;
    --points) POINTS="$2"; shift 2 ;;
    --sortie) SORTIE="$2"; shift 2 ;;
    -h|--help) sed -n '2,36p' "$0"; exit 0 ;;
    *) l9_stop "argument inconnu : $1" ;;
  esac
done

if ! raison="$(l9_garde_locale "$URL")"; then l9_stop "garde · $raison"; fi
BASE="$(l9_nom_base "$URL")"
ADMIN="$(l9_url_admin "$URL")"
SORTIE="${SORTIE:-$(mktemp -d "${TMPDIR:-/tmp}/l9-verif-$BASE.XXXXXX")}"
mkdir -p "$SORTIE"
L9_ECHECS=0
VERROU_PID="" MIGR_PID="" TIMEOUT_POSE=0

nettoyer() {
  [[ -n "$VERROU_PID" ]] && kill "$VERROU_PID" 2>/dev/null || true
  [[ -n "$MIGR_PID" ]] && kill "$MIGR_PID" 2>/dev/null || true
  if [[ "$TIMEOUT_POSE" = 1 ]]; then l9_psql "$ADMIN" -c "alter database \"$BASE\" reset lock_timeout" >/dev/null 2>&1 || true; fi
  l9_psql "$ADMIN" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$BASE' and application_name = 'l9_verrou'" >/dev/null 2>&1 || true
}
trap nettoyer EXIT

echo "L9 · vérification de migration · base $BASE · sortie $SORTIE"
echo "   machine : $(nproc) cœurs, $(free -m | awk '/^Mem:/{print $2" Mo"}'), charge $(cut -d' ' -f1-3 /proc/loadavg) · $(date -u +%FT%TZ)"

# ── Préparation éventuelle (base synthétique) ───────────────────────────────
if [[ -n "$PREPARER" ]]; then
  if [[ "$(l9_psql "$ADMIN" -c "select count(*) from pg_database where datname = '$BASE'")" != 0 ]]; then
    l9_stop "--preparer exige une base NEUVE · $BASE existe déjà"
  fi
  l9_psql "$ADMIN" -c "create database \"$BASE\""
  debut=$(date +%s%N)
  l9_migrer_jusqua "$URL" "$PREPARER"
  l9_psql "$URL" -f "$L9_DIR/semis-synthetique.sql" >/dev/null
  l9_ok "base neuve migrée jusqu'à $PREPARER puis semée ($(( ($(date +%s%N) - debut) / 1000000 )) ms)"
fi

# ── Ce qui est en attente ───────────────────────────────────────────────────
l9_journal > "$SORTIE/journal.tsv"
l9_migrations_base "$URL" > "$SORTIE/avant-migrations.tsv"
DERNIER="$(tail -1 "$SORTIE/avant-migrations.tsv" | cut -f1)"
mapfile -t ATTENTE < <(awk -F'\t' -v d="${DERNIER:-0}" '$2 > d { print $3 }' "$SORTIE/journal.tsv")
MASQUEES=""
[[ -s "$SORTIE/avant-migrations.tsv" ]] && MASQUEES="$(awk -F'\t' 'NR==FNR { fait[$1] = 1; if ($1 > max) max = $1; next } !($2 in fait) && $2 <= max { print $3 }' "$SORTIE/avant-migrations.tsv" "$SORTIE/journal.tsv")"
if [[ -n "$MASQUEES" ]]; then l9_echec "migrations jamais appliquées mais plus anciennes que la dernière (le migrateur les IGNORERAIT) : $MASQUEES"; fi
if [[ ${#ATTENTE[@]} -eq 0 ]]; then
  l9_info "aucune migration en attente sur $BASE · seules la reprise à vide et la ré-exécution sont vérifiables"
else
  l9_info "en attente (${#ATTENTE[@]}) : ${ATTENTE[*]}"
fi

# ── Relevé d'AVANT ──────────────────────────────────────────────────────────
l9_colonnes "$URL" > "$SORTIE/avant-colonnes.tsv"
l9_empreinte_donnees "$URL" "$SORTIE/avant-colonnes.tsv" > "$SORTIE/avant-donnees.txt"
l9_empreinte_schema "$URL" > "$SORTIE/avant-schema.txt"
l9_info "avant : $(wc -l < "$SORTIE/avant-colonnes.tsv") tables, $(awk -F'|' '{s+=$2} END {print s+0}' "$SORTIE/avant-donnees.txt") lignes, $(wc -l < "$SORTIE/avant-migrations.tsv") migrations appliquées"

comparer_a_avant() {
  local etiquette="$1"
  l9_migrations_base "$URL" > "$SORTIE/$etiquette-migrations.tsv"
  l9_empreinte_donnees "$URL" "$SORTIE/avant-colonnes.tsv" > "$SORTIE/$etiquette-donnees.txt"
  l9_empreinte_schema "$URL" > "$SORTIE/$etiquette-schema.txt"
  local ok=1
  cmp -s "$SORTIE/avant-migrations.tsv" "$SORTIE/$etiquette-migrations.tsv" || { l9_echec "$etiquette · journal des migrations modifié"; ok=0; }
  cmp -s "$SORTIE/avant-donnees.txt" "$SORTIE/$etiquette-donnees.txt" || { l9_echec "$etiquette · données modifiées (diff : $SORTIE/$etiquette-donnees.txt)"; ok=0; }
  cmp -s "$SORTIE/avant-schema.txt" "$SORTIE/$etiquette-schema.txt" || { l9_echec "$etiquette · schéma modifié, travail partiel resté en base (diff : $SORTIE/$etiquette-schema.txt)"; ok=0; }
  [[ $ok = 1 ]] && l9_ok "$etiquette · base identique à l'avant (journal, $(wc -l < "$SORTIE/avant-donnees.txt") empreintes de tables, schéma)"
  return 0
}

# ── Interruptions ───────────────────────────────────────────────────────────
if [[ ${#ATTENTE[@]} -gt 0 ]]; then
  if [[ -z "$POINTS" ]]; then
    for tag in "${ATTENTE[@]}"; do
      for t in $(grep -oE 'ALTER TABLE "[a-z_0-9]+"' "$L9_DRIZZLE/$tag.sql" | sed -E 's/ALTER TABLE "([^"]+)"/\1/'); do
        if cut -f1 "$SORTIE/avant-colonnes.tsv" | grep -qx "$t" && [[ " $POINTS " != *" $t "* ]]; then POINTS="$POINTS $t"; fi
      done
    done
  fi
  n=0
  for table in $POINTS; do
    n=$((n + 1))
    mode=$([[ $((n % 2)) = 1 ]] && echo coupure || echo echec)
    etiquette="interruption-$n-$mode-$table"
    if [[ "$mode" = echec ]]; then
      l9_psql "$ADMIN" -c "alter database \"$BASE\" set lock_timeout = '4s'" >/dev/null; TIMEOUT_POSE=1
    fi
    PGAPPNAME=l9_verrou psql "$URL" -X -q -c "begin; lock table public.\"$table\" in access exclusive mode; select pg_sleep(900);" >/dev/null 2>&1 &
    VERROU_PID=$!
    for _ in $(seq 1 100); do
      [[ "$(l9_psql "$URL" -c "select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = 'l9_verrou' and l.granted and l.relation = 'public.\"$table\"'::regclass")" = 1 ]] && break
      sleep 0.1
    done
    l9_migrer "$URL" > "$SORTIE/$etiquette.log" 2>&1 &
    MIGR_PID=$!
    bloque="" enCours="" verrous=""
    for _ in $(seq 1 600); do
      bloque="$(l9_psql "$URL" -c "select a.pid from pg_stat_activity a where a.datname = '$BASE' and exists (select 1 from pg_stat_activity v where v.application_name = 'l9_verrou' and v.pid = any(pg_blocking_pids(a.pid)))" | head -1)"
      [[ -n "$bloque" ]] && break
      kill -0 "$MIGR_PID" 2>/dev/null || break
      sleep 0.1
    done
    if [[ -z "$bloque" ]]; then
      l9_echec "$etiquette · le migrateur n'a jamais atteint le verrou sur $table (journal : $SORTIE/$etiquette.log)"
    else
      enCours="$(l9_psql "$URL" -c "select left(regexp_replace(query, '\s+', ' ', 'g'), 110) from pg_stat_activity where pid = $bloque")"
      verrous="$(l9_psql "$URL" -c "select count(*) from pg_locks where pid = $bloque and locktype = 'relation' and granted")"
      l9_info "$etiquette · migrateur (pid $bloque) bloqué, transaction ouverte, $verrous verrous de relation déjà pris · instruction en cours : $enCours"
      if [[ "$mode" = coupure ]]; then
        l9_psql "$URL" -c "select pg_terminate_backend($bloque)" >/dev/null
      fi
    fi
    set +e; wait "$MIGR_PID"; code=$?; set -e; MIGR_PID=""
    kill "$VERROU_PID" 2>/dev/null || true
    l9_psql "$URL" -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'l9_verrou' and datname = '$BASE'" >/dev/null
    wait "$VERROU_PID" 2>/dev/null || true; VERROU_PID=""
    if [[ "$mode" = echec ]]; then l9_psql "$ADMIN" -c "alter database \"$BASE\" reset lock_timeout" >/dev/null; TIMEOUT_POSE=0; fi
    if [[ $code = 0 ]]; then
      l9_echec "$etiquette · le migrateur a terminé (code 0) alors qu'il devait être interrompu"
    else
      cause="$(grep -oE "(terminating connection due to administrator command|canceling statement due to lock timeout|CONNECTION_CLOSED|CONNECTION_ENDED|ECONNRESET)" "$SORTIE/$etiquette.log" | head -1 || true)"
      l9_info "$etiquette · migrateur arrêté (code $code) · cause relevée : ${cause:-voir $SORTIE/$etiquette.log}"
    fi
    comparer_a_avant "$etiquette"
  done
fi

# ── Reprise ─────────────────────────────────────────────────────────────────
debut=$(date +%s%N)
if l9_migrer "$URL" > "$SORTIE/reprise.log" 2>&1; then
  l9_ok "reprise · migrateur terminé ($(( ($(date +%s%N) - debut) / 1000000 )) ms)"
else
  l9_echec "reprise · migrateur en échec (journal : $SORTIE/reprise.log)"
fi

l9_migrations_base "$URL" > "$SORTIE/apres-migrations.tsv"
attendu="$(wc -l < "$SORTIE/journal.tsv")"
obtenu="$(wc -l < "$SORTIE/apres-migrations.tsv")"
if [[ "$attendu" = "$obtenu" ]]; then l9_ok "journal · $obtenu migrations en base pour $attendu au journal"; else l9_echec "journal · $obtenu en base, $attendu attendues"; fi
# Chaque empreinte en base = sha256 du fichier du dépôt de même horodatage.
mauvais=0
while IFS=$'\t' read -r cree hash; do
  tag="$(awk -F'\t' -v w="$cree" '$2 == w { print $3 }' "$SORTIE/journal.tsv")"
  if [[ -z "$tag" ]]; then l9_echec "journal · ligne en base ($cree) sans fichier au dépôt"; mauvais=1; continue; fi
  [[ "$(sha256sum "$L9_DRIZZLE/$tag.sql" | cut -d' ' -f1)" = "$hash" ]] || { l9_echec "journal · empreinte de $tag différente du fichier"; mauvais=1; }
done < "$SORTIE/apres-migrations.tsv"
[[ $mauvais = 0 ]] && l9_ok "journal · chaque empreinte en base est le sha256 du fichier du dépôt"
dups="$(cut -f1 "$SORTIE/apres-migrations.tsv" | sort | uniq -d | wc -l)"
[[ "$dups" = 0 ]] && l9_ok "journal · aucune migration inscrite deux fois" || l9_echec "journal · $dups migration(s) inscrite(s) deux fois"

l9_empreinte_donnees "$URL" "$SORTIE/avant-colonnes.tsv" > "$SORTIE/apres-donnees.txt"
if cmp -s "$SORTIE/avant-donnees.txt" "$SORTIE/apres-donnees.txt"; then
  l9_ok "données · $(wc -l < "$SORTIE/avant-donnees.txt") tables existantes identiques ligne à ligne (colonnes d'avant), $(awk -F'|' '{s+=$2} END {print s+0}' "$SORTIE/apres-donnees.txt") lignes"
else
  l9_echec "données · des lignes existantes ont changé : diff $SORTIE/avant-donnees.txt $SORTIE/apres-donnees.txt"
fi

# Colonnes ajoutées aux tables existantes : vides (aucun backfill) ou défaut déclaré.
l9_colonnes "$URL" > "$SORTIE/apres-colonnes.tsv"
while IFS=$'\t' read -r t cols; do
  avant="$(awk -F'\t' -v t="$t" '$1 == t { print $2 }' "$SORTIE/avant-colonnes.tsv")"
  if [[ -z "$avant" ]]; then
    lignes="$(l9_psql "$URL" -c "select count(*) from public.\"$t\"")"
    echo "nouvelle table $t · $lignes ligne(s)" >> "$SORTIE/ajouts.txt"
    [[ "$lignes" = 0 ]] || l9_info "nouvelle table $t porte $lignes ligne(s) après migration (backfill ?)"
    continue
  fi
  IFS=',' read -r -a la <<< "$cols"; IFS=',' read -r -a lb <<< "$avant"
  for c in "${la[@]}"; do
    if [[ " ${lb[*]} " != *" $c "* ]]; then
      pleins="$(l9_psql "$URL" -c "select count(*) from public.\"$t\" where $c is not null")"
      defaut="$(l9_psql "$URL" -c "select coalesce(pg_get_expr(d.adbin, d.adrelid), '') from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = 'public.\"$t\"'::regclass and quote_ident(a.attname) = '$c'")"
      echo "colonne ajoutée $t.$c · $pleins ligne(s) renseignée(s) · défaut « $defaut »" >> "$SORTIE/ajouts.txt"
      if [[ "$pleins" != 0 && -z "$defaut" ]]; then l9_echec "colonne $t.$c renseignée sur $pleins ligne(s) existante(s) sans défaut déclaré"; fi
    fi
  done
done < "$SORTIE/apres-colonnes.tsv"
touch "$SORTIE/ajouts.txt"
nt="$(grep -c '^nouvelle table' "$SORTIE/ajouts.txt" || true)"; nc="$(grep -c '^colonne ajoutée' "$SORTIE/ajouts.txt" || true)"
nonvides="$(grep '^nouvelle table' "$SORTIE/ajouts.txt" | grep -vc ' · 0 ligne' || true)"
l9_ok "ajouts · $nt nouvelle(s) table(s) dont $nonvides non vide(s), $nc colonne(s) ajoutée(s) aux tables existantes (détail : $SORTIE/ajouts.txt)"
l9_empreinte_schema "$URL" > "$SORTIE/apres-schema.txt"
l9_empreinte_donnees "$URL" "$SORTIE/apres-colonnes.tsv" > "$SORTIE/apres-donnees-completes.txt"

# ── Rejeu ───────────────────────────────────────────────────────────────────
if l9_migrer "$URL" > "$SORTIE/rejeu-migrateur.log" 2>&1; then
  l9_migrations_base "$URL" > "$SORTIE/rejeu-migrations.tsv"
  cmp -s "$SORTIE/apres-migrations.tsv" "$SORTIE/rejeu-migrations.tsv" && l9_ok "rejeu · second passage du migrateur sans effet" || l9_echec "rejeu · le second passage a modifié le journal"
else
  l9_echec "rejeu · second passage du migrateur en échec"
fi
for tag in "${ATTENTE[@]}"; do
  if l9_psql "$URL" -1 -f <(sed 's/-->\s*statement-breakpoint//g' "$L9_DRIZZLE/$tag.sql") > "$SORTIE/rejeu-$tag.log" 2>&1; then
    l9_ok "rejeu · $tag ré-exécuté tel quel sur la base déjà migrée, sans erreur"
  else
    l9_echec "rejeu · $tag n'est pas rejouable (journal : $SORTIE/rejeu-$tag.log)"
  fi
done
l9_empreinte_schema "$URL" > "$SORTIE/rejeu-schema.txt"
l9_empreinte_donnees "$URL" "$SORTIE/apres-colonnes.tsv" > "$SORTIE/rejeu-donnees.txt"
cmp -s "$SORTIE/apres-schema.txt" "$SORTIE/rejeu-schema.txt" && l9_ok "rejeu · schéma identique (aucune contrainte, aucun index, aucun déclencheur en double)" || l9_echec "rejeu · le schéma a changé au rejeu : diff $SORTIE/apres-schema.txt $SORTIE/rejeu-schema.txt"
cmp -s "$SORTIE/apres-donnees-completes.txt" "$SORTIE/rejeu-donnees.txt" && l9_ok "rejeu · toutes les lignes (colonnes ajoutées comprises) identiques, aucun doublon" || l9_echec "rejeu · données modifiées par le rejeu : diff $SORTIE/apres-donnees-completes.txt $SORTIE/rejeu-donnees.txt"

echo "schéma avant $(md5sum < "$SORTIE/avant-schema.txt" | cut -c1-12) · après $(md5sum < "$SORTIE/apres-schema.txt" | cut -c1-12) · données avant $(md5sum < "$SORTIE/avant-donnees.txt" | cut -c1-12)" > "$SORTIE/resume.txt"
if [[ "$L9_ECHECS" = 0 ]]; then
  echo "VERDICT · MIG-01 vérifié sur $BASE · $(cat "$SORTIE/resume.txt") · charge $(cut -d' ' -f1-3 /proc/loadavg)"
  exit 0
fi
echo "VERDICT · $L9_ECHECS vérification(s) en échec sur $BASE · relevés dans $SORTIE" >&2
exit 1
