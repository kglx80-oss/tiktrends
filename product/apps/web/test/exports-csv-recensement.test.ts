import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Recensement des exports tableur (CSV, TSV, XLSX) · garde de l'injection de
 * formule (CWE-1236).
 *
 * La neutralisation vit dans UNE fonction du noyau, `csvCell`
 * (`packages/core/src/adsmap/sheet.ts`), éprouvée sur sa SORTIE par
 * `packages/core/test/adsmap-csv-formules.test.ts` et, sur la vraie action, par
 * `csv-formules-export-db.test.ts`. Ce qui reste à garder, c'est qu'un NOUVEL
 * export ne la contourne pas · un `champCsv` maison (l'export Textes du studio
 * en avait un) remet la faille en service sans qu'aucun test ne rougisse.
 *
 * Deux règles, sur tout le code de production (`apps/`, `packages/`, hors tests) :
 *  1. tout fichier qui parle de tableur (type MIME CSV/TSV/Excel, extension
 *     `.csv`/`.tsv`/`.xlsx`, format `'csv'`) est RECENSÉ ci-dessous, avec son
 *     rôle · un fichier inconnu échoue « NON RECENSÉ » ; un producteur doit
 *     appeler `csvCell` ou `toCsv` ;
 *  2. aucun fichier hors `sheet.ts` n'échappe lui-même un guillemet CSV (`'""'`).
 */

const RACINE = join(process.cwd(), '..', '..');   // product/
const DOSSIERS = ['apps', 'packages'];
const IGNORES = new Set(['node_modules', '.next', 'dist', 'test', 'tests', '__tests__', '.turbo', 'coverage']);
const EXTENSIONS = /\.(?:ts|tsx|js|mjs|cjs)$/;

/** Ce qui désigne un fichier tableur dans du code. */
const MOTIF_TABLEUR = /text\/csv|text\/tab-separated-values|spreadsheetml|application\/vnd\.ms-excel|\.(?:csv|tsv|xlsx?)\b|['"](?:csv|tsv|xlsx)['"]/i;
/** Un échappement CSV écrit à la main · le guillemet doublé. */
const ECHAPPEMENT_MAISON = /'""'|"\\"\\""|`""`/;

const CELLULE = 'packages/core/src/adsmap/sheet.ts';

type Role = 'production' | 'transit' | 'lecture';
const RECENSES: Record<string, { role: Role; pourquoi: string }> = {
  'apps/web/app/actions/adsmap.ts': { role: 'production', pourquoi: 'exportAdsCsvAction · Résultats › Tests › « Exporter en CSV », via toCsv' },
  'packages/core/src/studios/textes/textes.ts': { role: 'production', pourquoi: 'exporterTextes(…, "csv") · studio Textes, via csvCell' },
  'apps/web/lib/studios/textes/textes.ts': { role: 'transit', pourquoi: 'choisit le format de l’export Textes, n’écrit aucune cellule' },
  'apps/web/spatial/vues/projet/Textes.tsx': { role: 'transit', pourquoi: 'bouton de téléchargement de l’export Textes (contenu produit par le noyau)' },
  'apps/web/spatial/vues/resultats/Tests.tsx': { role: 'transit', pourquoi: 'télécharge le CSV rendu par exportAdsCsvAction' },
  'apps/web/spatial/vues/resultats/Importer.tsx': { role: 'lecture', pourquoi: 'sélection du CSV historique à importer' },
  'apps/web/scripts/importer-pack-prompts.ts': { role: 'lecture', pourquoi: 'lit 04-RECETTE.csv du pack de prompts (script d’exploitation)' },
  'packages/core/src/prompts/pack.ts': { role: 'lecture', pourquoi: 'commentaire nommant 04-RECETTE.csv' },
};

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    if (IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin));
    else if (EXTENSIONS.test(nom) && !/\.(?:test|spec)\.[tj]sx?$/.test(nom)) out.push(chemin);
  }
  return out;
}

const SOURCES = DOSSIERS.flatMap((d) => fichiers(join(RACINE, d)))
  .map((f) => ({ rel: relative(RACINE, f).split('\\').join('/'), src: readFileSync(f, 'utf8') }));

describe('exports tableur · tous recensés, tous par csvCell', () => {
  it('le balayage voit bien le code de production (témoin)', () => {
    expect(SOURCES.length).toBeGreaterThan(500);
    expect(SOURCES.some((s) => s.rel === CELLULE), 'sheet.ts introuvable · le balayage regarde ailleurs').toBe(true);
    expect(SOURCES.find((s) => s.rel === CELLULE)!.src).toMatch(/export function csvCell\(/);
  });

  it('tout fichier qui parle de tableur est recensé', () => {
    const inconnus = SOURCES.filter((s) => s.rel !== CELLULE && MOTIF_TABLEUR.test(s.src) && !RECENSES[s.rel]).map((s) => s.rel);
    expect(inconnus, `export tableur NON RECENSÉ · faire passer chaque cellule par csvCell (${CELLULE}) puis l'ajouter à RECENSES : ${inconnus.join(', ')}`).toEqual([]);
  });

  it('le recensement n’a pas d’entrée périmée', () => {
    const perimes = Object.keys(RECENSES).filter((rel) => !SOURCES.some((s) => s.rel === rel && MOTIF_TABLEUR.test(s.src)));
    expect(perimes, `recensement périmé · ces fichiers ne parlent plus de tableur : ${perimes.join(', ')}`).toEqual([]);
  });

  it('chaque producteur écrit ses cellules par csvCell ou toCsv', () => {
    for (const [rel, r] of Object.entries(RECENSES)) {
      if (r.role !== 'production') continue;
      const src = SOURCES.find((s) => s.rel === rel)!.src;
      expect(src, `export ${rel} (${r.pourquoi}) contourne csvCell · ses cellules partent sans neutralisation des formules`).toMatch(/\b(?:csvCell|toCsv)\(/);
    }
  });

  it('aucun échappement CSV maison hors csvCell', () => {
    const maison = SOURCES.filter((s) => s.rel !== CELLULE && ECHAPPEMENT_MAISON.test(s.src)).map((s) => s.rel);
    expect(maison, `échappement CSV hors csvCell (guillemet doublé à la main) · la neutralisation des formules est contournée : ${maison.join(', ')}`).toEqual([]);
  });
});
