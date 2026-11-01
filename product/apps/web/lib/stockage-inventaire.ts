import { db, schema, sql } from '@tiktrends/db';
import { storageFromEnv, listerObjets, type StorageConfig } from '@tiktrends/integrations';
import {
  MOTIF_REFERENCE_SQL, PREFIXE_OBJETS_ESPACES, RECENSEMENT_REFERENCES_STOCKAGE, clesReferencees, inventaireOrphelins,
  type InventaireOrphelins, type ReferenceRecensee,
} from '@tiktrends/core';

/**
 * Inventaire des objets candidats orphelins · LECTURE SEULE. Liste le bucket
 * (`listerObjets`, GET signé), lit chaque colonne du recensement
 * (`RECENSEMENT_REFERENCES_STOCKAGE`, noyau), puis laisse la règle du noyau
 * (`inventaireOrphelins`) compter. Ce module ne supprime RIEN · il n'importe
 * aucune fonction de suppression (garde `stockage-orphelins-ecran`).
 * Appelé seulement derrière `porteAdmin` (fondateur ET admin de l'espace).
 */

type Base = NonNullable<typeof db>;

/** Fragments distincts lus par colonne · au-delà, la lecture est déclarée incomplète. */
export const FRAGMENTS_MAX_PAR_COLONNE = 50_000;

export interface LectureColonne { table: string; colonne: string; fragments: number; complete: boolean; erreur?: string }

const NOM_SQL = /^[a-z_][a-z0-9_]*$/;

function expression(r: ReferenceRecensee) {
  const col = sql.identifier(r.colonne);
  if (r.forme === 'tableau') return sql`array_to_string(${col}, ' ')`;
  if (r.forme === 'json') return sql`${col}::text`;
  return col;
}

const lignes = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

/**
 * Les fragments `assets/…` présents dans UNE colonne recensée · extraits par
 * Postgres (motif du noyau en paramètre), distincts, bornés. Un data URI
 * (`data:…`) ne désigne jamais un objet · il n'est pas parcouru.
 */
export async function lireColonne(base: Base, r: ReferenceRecensee, max = FRAGMENTS_MAX_PAR_COLONNE): Promise<{ fragments: string[]; lecture: LectureColonne }> {
  if (!NOM_SQL.test(r.table) || !NOM_SQL.test(r.colonne)) {
    return { fragments: [], lecture: { table: r.table, colonne: r.colonne, fragments: 0, complete: false, erreur: 'nom invalide' } };
  }
  const e = expression(r);
  try {
    const res = await base.execute(sql`
      select distinct m.r[1] as f
      from ${sql.identifier(r.table)} t
      cross join lateral regexp_matches(${e}, ${MOTIF_REFERENCE_SQL}, 'g') as m(r)
      where (${e} like ${'%assets/%'} or ${e} ilike ${'%assets\\%2f%'})
        and ${e} not like ${'data:%'}
      limit ${max + 1}`);
    const fragments = lignes<{ f: string }>(res).map((x) => x.f).filter((f): f is string => typeof f === 'string');
    const complete = fragments.length <= max;
    return { fragments: fragments.slice(0, max), lecture: { table: r.table, colonne: r.colonne, fragments: Math.min(fragments.length, max), complete, ...(complete ? {} : { erreur: 'borne atteinte' }) } };
  } catch (err) {
    console.error(`[stockage] lecture ${r.table}.${r.colonne}`, err instanceof Error ? err.message : err);
    return { fragments: [], lecture: { table: r.table, colonne: r.colonne, fragments: 0, complete: false, erreur: 'lecture impossible' } };
  }
}

/** Toutes les références recensées · `complete` faux dès qu'UNE colonne n'a pas été lue entièrement. */
export async function lireReferencesStockage(base: Base, recensement: readonly ReferenceRecensee[] = RECENSEMENT_REFERENCES_STOCKAGE) {
  const fragments: string[] = [];
  const lectures: LectureColonne[] = [];
  for (const r of recensement) {
    const l = await lireColonne(base, r);
    fragments.push(...l.fragments);
    lectures.push(l.lecture);
  }
  return { references: clesReferencees(fragments), lectures, complete: lectures.every((l) => l.complete) };
}

export type EtatInventaire =
  | { etat: 'sans_stockage' }
  | { etat: 'sans_base' }
  | {
    etat: 'pret';
    inventaire: InventaireOrphelins;
    listeComplete: boolean;
    erreurListe: string | null;
    pages: number;
    lectures: LectureColonne[];
    noms: Record<string, string>;
  };

/** L'inventaire complet · liste, références, espaces, puis la règle du noyau. */
export async function chargerInventaireStockage(o: { base?: Base | null; cfg?: StorageConfig | null; maintenant?: Date } = {}): Promise<EtatInventaire> {
  const cfg = o.cfg !== undefined ? o.cfg : storageFromEnv();
  if (!cfg) return { etat: 'sans_stockage' };
  const base = o.base !== undefined ? o.base : db;
  if (!base) return { etat: 'sans_base' };
  const maintenant = o.maintenant ?? new Date();
  const [liste, refs, espaces] = await Promise.all([
    listerObjets(cfg, { prefixe: PREFIXE_OBJETS_ESPACES }),
    lireReferencesStockage(base),
    base.select({ id: schema.workspaces.id, nom: schema.workspaces.name }).from(schema.workspaces),
  ]);
  const inventaire = inventaireOrphelins(liste.objets, {
    maintenant, espaces: new Set(espaces.map((e) => e.id)), references: refs.references, referencesCompletes: refs.complete,
  });
  return {
    etat: 'pret', inventaire, listeComplete: liste.complete, erreurListe: liste.erreur ?? null, pages: liste.pages,
    lectures: refs.lectures, noms: Object.fromEntries(espaces.map((e) => [e.id, e.nom])),
  };
}
