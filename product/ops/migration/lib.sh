# shellcheck shell=bash
# Studios · L9 · outils communs des scripts de migration, rollback et restauration.
#
# Sourcé, jamais exécuté. Aucune écriture hors de la base passée en argument,
# et cette base doit être LOCALE et nommée l9_* ou copie_* (garde ci-dessous).
# La production (service `db` du compose, base `tiktrends`) n'est joignable que
# par le réseau docker : elle ne répond ni sur 127.0.0.1 ni sous ces noms.

L9_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
L9_PRODUCT="$(cd "$L9_DIR/../.." && pwd)"
L9_DRIZZLE="$L9_PRODUCT/packages/db/drizzle"

# Fuseau, format de date et flottants figés : une empreinte ne dépend que des données.
export PGOPTIONS="${PGOPTIONS:-} -c TimeZone=UTC -c DateStyle=ISO,YMD -c extra_float_digits=1 -c client_min_messages=warning"

l9_ok()    { printf 'OK · %s\n' "$*"; }
l9_info()  { printf '   %s\n' "$*"; }
l9_echec() { printf 'ÉCHEC · %s\n' "$*" >&2; L9_ECHECS=$(( ${L9_ECHECS:-0} + 1 )); }
l9_stop()  { printf 'ARRÊT · %s\n' "$*" >&2; exit 2; }

# ── Garde de destination ────────────────────────────────────────────────────
# Rend 0 si l'URL désigne une base LOCALE nommée l9_* ou copie_* ; sinon écrit
# la raison et rend 1. Pur bash : aucun accès réseau avant d'avoir dit oui.
l9_garde_locale() {
  local url="$1"
  local re='^postgres(ql)?://([^@/]*@)?(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?/([A-Za-z0-9_]+)(\?.*)?$'
  if [[ -z "$url" ]]; then echo "URL de base absente"; return 1; fi
  if [[ ! "$url" =~ $re ]]; then
    echo "base non locale ou URL illisible · seules 127.0.0.1, localhost et [::1] sont acceptées (jamais la production)"
    return 1
  fi
  local nom="${BASH_REMATCH[5]}"
  if [[ ! "$nom" =~ ^(l9|copie)_[a-z0-9_]+$ ]]; then
    echo "nom de base « $nom » refusé · une copie isolée s'appelle l9_* ou copie_* (jamais tiktrends)"
    return 1
  fi
  return 0
}

# Nom de la base et URL d'administration (même serveur, base postgres).
l9_nom_base() { local re='/([A-Za-z0-9_]+)(\?.*)?$'; [[ "$1" =~ $re ]] && echo "${BASH_REMATCH[1]}"; }
l9_url_admin() { local u="$1" n; n="$(l9_nom_base "$u")"; echo "${u%/"$n"*}/postgres"; }

l9_psql() { psql "$1" -X -q -v ON_ERROR_STOP=1 -At "${@:2}"; }

# ── Journal drizzle ─────────────────────────────────────────────────────────
# Lignes « idx<TAB>when<TAB>tag » du journal du dépôt.
l9_journal() {
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const e of j.entries) console.log(`${e.idx}\t${e.when}\t${e.tag}`);
  ' "${1:-$L9_DRIZZLE}/meta/_journal.json"
}

# Migrations appliquées en base : « created_at<TAB>hash », dans l'ordre.
l9_migrations_base() {
  l9_psql "$1" -F $'\t' -c "select created_at, hash from drizzle.__drizzle_migrations order by created_at, id" 2>/dev/null || true
}

# Applique le journal du dépôt jusqu'à l'étiquette $2 (incluse) avec le VRAI
# migrateur drizzle, par TRANCHES : une migration qui ajoute une valeur d'enum
# (ALTER TYPE … ADD VALUE) clôt sa tranche. Sans ça, une base vierge échoue
# (« New enum values must be committed before they can be used ») : le
# migrateur passe TOUT le lot en attente dans une seule transaction, et 0011
# puis 0034 ajoutent des valeurs qu'une migration suivante utilise.
# Les fichiers sont copiés à l'octet : mêmes empreintes, mêmes horodatages que
# le migrateur de production.
l9_migrer_jusqua() {
  local url="$1" jusqua="$2" tmp
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/l9-tranches.XXXXXX")"
  local bornes=() idx when tag
  while IFS=$'\t' read -r idx when tag; do
    if grep -qiE 'ALTER TYPE .* ADD VALUE' "$L9_DRIZZLE/$tag.sql"; then bornes+=("$idx"); fi
    if [[ "$tag" == "$jusqua"* ]]; then bornes+=("$idx"); break; fi
  done < <(l9_journal)
  local b
  for b in "${bornes[@]}"; do
    rm -rf "$tmp/d"; mkdir -p "$tmp/d/meta"; cp "$L9_DRIZZLE"/*.sql "$tmp/d/"
    node -e '
      const fs = require("fs"); const [src, dst, max] = process.argv.slice(1);
      const j = JSON.parse(fs.readFileSync(src, "utf8"));
      j.entries = j.entries.filter((e) => e.idx <= Number(max));
      fs.writeFileSync(dst, JSON.stringify(j, null, 2));
    ' "$L9_DRIZZLE/meta/_journal.json" "$tmp/d/meta/_journal.json" "$b"
    printf "export default { dialect: 'postgresql', out: '%s', dbCredentials: { url: process.env.DATABASE_URL ?? '' } };\n" "$tmp/d" > "$tmp/cfg.ts"
    ( cd "$L9_PRODUCT/packages/db" && DATABASE_URL="$url" pnpm exec drizzle-kit migrate --config="$tmp/cfg.ts" ) > "$tmp/tranche-$b.log" 2>&1 \
      || { tail -20 "$tmp/tranche-$b.log" >&2; l9_stop "tranche jusqu'à $b en échec"; }
    l9_info "tranche appliquée jusqu'au rang $b"
  done
  rm -rf "$tmp"
}

# Le migrateur de PRODUCTION, tel que deploy.sh l'appelle (sans le conteneur).
l9_migrer() {
  ( cd "$L9_PRODUCT" && DATABASE_URL="$1" pnpm --filter @tiktrends/db migrate )
}

# ── Empreintes ──────────────────────────────────────────────────────────────
# Colonnes de chaque table du schéma public : « table<TAB>col1,col2,… ».
l9_colonnes() {
  l9_psql "$1" -F $'\t' -c "
    select c.relname, string_agg(quote_ident(a.attname), ',' order by a.attnum)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    group by c.relname order by c.relname"
}

# Empreinte des DONNÉES, table par table, restreinte aux colonnes du fichier $2
# (celles d'AVANT la migration : une colonne ajoutée ne fausse pas la
# comparaison des lignes existantes). Sortie « table|lignes|md5 ». L'ordre
# physique ne compte pas : les empreintes de lignes sont triées.
l9_empreinte_donnees() {
  local url="$1" colonnes="$2" requete="" t cols
  while IFS=$'\t' read -r t cols; do
    [[ -z "$t" ]] && continue
    requete+="select '$t' as t, count(*) as n, md5(coalesce(string_agg(h, ',' order by h), '')) as h from (select md5(row($cols)::text) as h from public.\"$t\") s"$'\n'"union all "
  done < "$colonnes"
  requete="${requete%union all }"
  [[ -z "$requete" ]] && return 0
  l9_psql "$url" -F '|' -c "select * from ($requete) x order by t"
}

# Empreinte du SCHÉMA : colonnes, contraintes, index, déclencheurs, fonctions
# (hors extensions), enums. Un objet dupliqué ou manquant change la sortie.
l9_empreinte_schema() {
  l9_psql "$1" -F '|' -c "
    select 'col', c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
           || case when a.attnotnull then ' NOT NULL' else '' end
           || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    union all
    select 'con', conrelid::regclass::text || '.' || conname || ' ' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
    union all
    select 'idx', pg_get_indexdef(i.indexrelid)
    from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
    union all
    select 'trg', pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public'
    union all
    select 'fn', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid))
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
    union all
    select 'enum', t.typname || ' ' || (select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid = t.oid)
    from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'
    order by 1, 2"
}

# Clés étrangères orphelines : pour chaque contrainte FOREIGN KEY du schéma
# public, compte les lignes dont la clé (toutes colonnes non nulles) ne trouve
# pas son parent. Sortie « contrainte|orphelins ». Indépendant de la validité
# déclarée de la contrainte : on regarde les DONNÉES.
l9_orphelins() {
  local url="$1" requete
  requete="$(l9_psql "$url" -c "
    select string_agg(format(
      'select %L as c, count(*) as n from %s e where %s and not exists (select 1 from %s p where %s)',
      con.conrelid::regclass::text || '.' || con.conname,
      con.conrelid::regclass, cols.non_nuls, con.confrelid::regclass, cols.jointure), ' union all ' order by con.conname)
    from pg_constraint con
    cross join lateral (
      select string_agg(format('e.%I is not null', ae.attname), ' and ') as non_nuls,
             string_agg(format('p.%I = e.%I', ap.attname, ae.attname), ' and ') as jointure
      from unnest(con.conkey, con.confkey) as k(e, p)
      join pg_attribute ae on ae.attrelid = con.conrelid and ae.attnum = k.e
      join pg_attribute ap on ap.attrelid = con.confrelid and ap.attnum = k.p
    ) cols
    where con.contype = 'f' and con.connamespace = 'public'::regnamespace")"
  [[ -z "$requete" ]] && return 0
  l9_psql "$url" -F '|' -c "select * from ($requete) x order by c"
}
