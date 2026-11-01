import { randomUUID } from 'node:crypto';
import type { ReferenceRecensee } from '@tiktrends/core';

/**
 * Semer une référence d'objet du bucket dans N'IMPORTE quelle colonne du
 * recensement (`RECENSEMENT_REFERENCES_STOCKAGE`), avec sa forme (texte,
 * tableau, JSON, adresse encodée, clé brute) · partagé par les gardes pglite de
 * l'inventaire (`stockage-orphelins-db`) et du retrait des dépôts
 * (`stockage-retrait-depot-db`).
 */

// Le client drizzle et `sql` sont volontairement lâches · le semis écrit du SQL brut.
type Db = any;
type Sql = any;

export const lignesSql = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];

/** La valeur d'une colonne obligatoire sans défaut · seule la colonne recensée importe au test. */
async function valeurParDefaut(db: Db, sql: Sql, c: { data_type: string; udt_name: string }): Promise<string> {
  switch (c.data_type) {
    case 'uuid': return 'gen_random_uuid()';
    case 'text': case 'character varying': return `'x-${randomUUID()}'`;
    case 'integer': case 'bigint': case 'smallint': case 'numeric': case 'real': case 'double precision': return '0';
    case 'boolean': return 'false';
    case 'json': case 'jsonb': return `'{}'::${c.data_type}`;
    case 'timestamp with time zone': case 'timestamp without time zone': case 'date': return 'now()';
    case 'ARRAY': return `'{}'`;
    case 'USER-DEFINED': {
      const [e] = lignesSql<{ l: string }>(await db.execute(sql`select e.enumlabel as l from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = ${c.udt_name} order by e.enumsortorder limit 1`));
      return `'${e!.l}'::"${c.udt_name}"`;
    }
    default: throw new Error(`type non prévu ${c.data_type}`);
  }
}

/** Insère une ligne dont la colonne recensée porte `contenu`. */
export async function semerDans(db: Db, sql: Sql, r: ReferenceRecensee, contenu: string): Promise<void> {
  const cols = lignesSql<{ column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null }>(await db.execute(sql`
    select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = ${r.table}`));
  const cible = cols.find((c) => c.column_name === r.colonne);
  if (!cible) throw new Error(`${r.table}.${r.colonne} absente de la base`);
  const echappe = contenu.replace(/'/g, "''");
  const valeur = r.forme === 'tableau' ? `ARRAY['${echappe}']::text[]` : r.forme === 'json' ? `'${echappe}'::${cible.data_type}` : `'${echappe}'`;
  const noms = [`"${r.colonne}"`];
  const valeurs = [valeur];
  for (const c of cols) {
    if (c.column_name === r.colonne || c.is_nullable === 'YES' || c.column_default !== null) continue;
    noms.push(`"${c.column_name}"`);
    valeurs.push(await valeurParDefaut(db, sql, c));
  }
  // Base de test seulement · ni clés étrangères ni contraintes de forme · on éprouve le LECTEUR, pas le schéma.
  for (const k of lignesSql<{ conname: string }>(await db.execute(sql`select conname from pg_constraint where conrelid = ${r.table}::regclass and contype = 'c'`))) {
    await db.execute(sql.raw(`alter table "${r.table}" drop constraint "${k.conname}"`));
  }
  await db.execute(sql.raw('set session_replication_role = replica'));
  try { await db.execute(sql.raw(`insert into "${r.table}" (${noms.join(', ')}) values (${valeurs.join(', ')})`)); }
  finally { await db.execute(sql.raw('set session_replication_role = origin')); }
}

/** Le contenu semé, selon la forme · adresse, clé brute, JSON imbriqué, adresse encodée dans un lien. */
export function contenuPour(base: string, r: ReferenceRecensee, cle: string, i: number): string {
  const url = `${base}/${cle}`;
  if (r.table === 'studio_assets' && r.colonne === 'storage_key') return cle;
  if (r.forme === 'json') return JSON.stringify(i % 2 ? { ref: { url } } : { medias: [{ cle }], note: 'x' });
  if (r.table === 'jarvis_messages') return `Voici l’image : /api/brands/b/media?url=${encodeURIComponent(url)}.`;
  return url;
}
