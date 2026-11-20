import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * « Codé seul » (suivi de #1115) · `FOUNDER_EMAILS` n'ouvre aucun pouvoir.
 *
 * `secu-fondateurs-codes-db.test.tsx` éprouve au RÉSULTAT chaque porte qui
 * existe aujourd'hui. Ce recensement ferme la suivante · une porte écrite
 * demain sur la variable (lue directement, ou via `estFondateurEnvironnement`)
 * fait échouer ce test, qui dit où. Seuls deux fichiers la lisent ·
 * `lib/founder.ts` (la lecture) et `lib/equipe-plateforme.ts` (le rôle SANS
 * POUVOIR qui porte le message `MESSAGE_FONDATEUR_HORS_CODE`).
 *
 * Les commentaires sont retirés avant la lecture · les citer pour expliquer
 * la règle reste permis.
 */

const PRODUIT = join(__dirname, '..', '..', '..');
const RACINES = ['apps/web', 'apps/workers', 'packages'].map((r) => join(PRODUIT, r));
const IGNORES = new Set(['node_modules', '.next', 'dist', 'test', 'tests', '.turbo', 'coverage']);

function sources(dir: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    if (IGNORES.has(nom)) continue;
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(nom) && !/\.test\./.test(nom) && !nom.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Le code sans ses commentaires (blocs, puis lignes hors chaînes d'URL). */
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const LECTEURS: Record<string, { motif: RegExp; permis: readonly string[] }> = {
  'la variable FOUNDER_EMAILS': { motif: /\bFOUNDER_EMAILS\b/, permis: ['apps/web/lib/founder.ts'] },
  'estFondateurEnvironnement': { motif: /\bestFondateurEnvironnement\b/, permis: ['apps/web/lib/founder.ts', 'apps/web/lib/equipe-plateforme.ts'] },
};

const FICHIERS = RACINES.flatMap((r) => sources(r)).map((p) => ({ chemin: relative(PRODUIT, p).split('\\').join('/'), code: sansCommentaires(readFileSync(p, 'utf8')) }));

describe('« Codé seul » · qui lit FOUNDER_EMAILS', () => {
  it('le recensement lit bien le dépôt (sinon il ne garde rien)', () => {
    expect(FICHIERS.length, 'aucun fichier source lu').toBeGreaterThan(200);
    expect(FICHIERS.some((f) => f.chemin === 'apps/web/lib/founder.ts' && /\bFOUNDER_EMAILS\b/.test(f.code)), 'la lecture de référence est introuvable · le motif regarde ailleurs').toBe(true);
  });

  for (const [quoi, { motif, permis }] of Object.entries(LECTEURS)) {
    it(`${quoi} · lue seulement par ${permis.join(', ')}`, () => {
      const hors = FICHIERS.filter((f) => motif.test(f.code) && !permis.includes(f.chemin)).map((f) => f.chemin);
      expect(hors, `${quoi} lue hors des fichiers permis · une adresse de FOUNDER_EMAILS ne doit ouvrir aucun pouvoir (« Codé seul »), passe par aPouvoirsFondateur`).toEqual([]);
    });
  }

  it('`isFounder` (qui unissait la variable à la liste codée) n’existe plus', () => {
    const hors = FICHIERS.filter((f) => /\bisFounder\b/.test(f.code)).map((f) => f.chemin);
    expect(hors, 'isFounder est revenu · une porte de pouvoir doit lire aPouvoirsFondateur (liste codée seule)').toEqual([]);
  });
});

/**
 * Suivi de #1117 · la marque `FaceEquipe` n'est inconstructible que pour le
 * compilateur · un `{ … } as FaceEquipe` (ou `<FaceEquipe>{ … }`) dans une
 * page compile, et rendrait la face équipe (rubriques sans verrou de
 * formule) à un compte non admissible, sans passer par `privilegesEquipe`.
 * Seuls la construction de production (`lib/access.ts`, sous
 * `effectiveAccess`) et le helper des tests de `rbac` ont le droit d'y
 * forcer un objet. Ici, les tests sont lus aussi · un cast dans un test
 * contournerait la règle qu'il prétend éprouver.
 */
/** Le nom de la marque, recomposé · ce fichier, lu par le recensement, ne le nomme ni ne le force lui-même. */
const MARQUE = ['Face', 'Equipe'].join('');
const IGNORES_MARQUE = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage']);
function toutesSources(dir: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    if (IGNORES_MARQUE.has(nom)) continue;
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) toutesSources(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(nom) && !nom.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
/** Un cast vers le type `nom`, nu ou qualifié (`as rbac.X`, `as import('…').X`, `<X>{…}`). */
const cast = (nom: string) => new RegExp(`\\bas\\s+(?:import\\([^)]*\\)\\.|[\\w$]+\\.)*${nom}\\b|(?:^|[^\\w$\\]).>\\s])\\s*<\\s*(?:import\\([^)]*\\)\\.|[\\w$]+\\.)*${nom}\\s*>`, 'm');
const CAST_FACE_EQUIPE = cast(MARQUE);
const CAST_ACCESS = cast('Access');
const PERMIS_FACE_EQUIPE = ['apps/web/lib/access.ts', 'apps/web/test/helpers/face-equipe.ts'];
/** Qui NOMME la marque · sa définition, et les deux constructions permises. Un alias (`type F = …`) passe par là. */
const NOMMENT_FACE_EQUIPE = ['apps/web/lib/rbac.ts', ...PERMIS_FACE_EQUIPE];
const FICHIERS_MARQUE = RACINES.flatMap((r) => toutesSources(r)).map((p) => ({ chemin: relative(PRODUIT, p).split('\\').join('/'), code: sansCommentaires(readFileSync(p, 'utf8')) }));

describe('Marque de la face équipe · seul `effectiveAccess` la construit', () => {
  it('le recensement lit bien les deux constructions permises (sinon il ne garde rien)', () => {
    for (const chemin of PERMIS_FACE_EQUIPE) {
      expect(FICHIERS_MARQUE.some((f) => f.chemin === chemin && CAST_FACE_EQUIPE.test(f.code)), `${chemin} · la construction de référence est introuvable · le motif regarde ailleurs`).toBe(true);
    }
    expect(FICHIERS_MARQUE.some((f) => f.chemin.startsWith('apps/web/test/')), 'les tests ne sont pas lus').toBe(true);
  });

  it('aucun cast vers la marque hors des deux constructions permises (pages, actions, lib, tests)', () => {
    const hors = FICHIERS_MARQUE.filter((f) => CAST_FACE_EQUIPE.test(f.code) && !PERMIS_FACE_EQUIPE.includes(f.chemin)).map((f) => f.chemin);
    expect(hors, 'une face équipe est forcée hors de effectiveAccess · elle redonnerait la face équipe sans admissibilité (privilegesEquipe), passe par effectiveAccess').toEqual([]);
  });

  it('la marque n’est nommée que par sa définition et les deux constructions permises (un alias la forcerait sans cast visible)', () => {
    const hors = FICHIERS_MARQUE.filter((f) => new RegExp(`\\b${MARQUE}\\b`).test(f.code) && !NOMMENT_FACE_EQUIPE.includes(f.chemin)).map((f) => f.chemin);
    expect(hors, `${MARQUE} est nommée hors de rbac.ts, access.ts et du helper de test · seule effectiveAccess construit une face équipe (privilegesEquipe), lis Access.equipe sans nommer la marque`).toEqual([]);
  });

  // Sonde de compilation (tsc, sur ce dépôt) · `{ role, plan, equipe: s.equipe } as Access` compile aussi,
  // et force la marque par l'objet entier. Les tests de `rbac` en font sans face équipe · le code, jamais.
  it('aucun cast vers `Access` dans le code (pages, actions, lib) · il forcerait la marque par l’objet entier', () => {
    const hors = FICHIERS.filter((f) => CAST_ACCESS.test(f.code)).map((f) => f.chemin);
    expect(hors, 'un Access est forcé hors de effectiveAccess · il redonnerait la face équipe sans admissibilité (privilegesEquipe), passe par effectiveAccess').toEqual([]);
  });

  it('le motif ne confond pas un type générique (`Readonly<…>`) avec un cast', () => {
    const T = MARQUE;
    expect(CAST_FACE_EQUIPE.test(`type T = Readonly<${T}>;`)).toBe(false);
    expect(CAST_FACE_EQUIPE.test(`const f = <${T}>{ role, matrice };`)).toBe(true);
    expect(CAST_FACE_EQUIPE.test(`equipe: { role, matrice } as unknown as ${T}`)).toBe(true);
    const A = ['Acc', 'ess'].join('');
    expect(CAST_ACCESS.test(`async function f(): Promise<${A}> {}`)).toBe(false);
    expect(CAST_ACCESS.test(`const a = { role, plan, equipe } as ${A};`)).toBe(true);
    expect(CAST_ACCESS.test(`const a = { role } as ${A}Level;`)).toBe(false);
    expect(CAST_FACE_EQUIPE.test(`x as import('../lib/rbac').${T}`), 'forme import()').toBe(true);
    expect(CAST_FACE_EQUIPE.test(`x as rbac.${T}`), 'forme qualifiée').toBe(true);
    expect(CAST_FACE_EQUIPE.test(`<import('../lib/rbac').${T}>{ role }`), 'chevrons qualifiés').toBe(true);
    expect(CAST_ACCESS.test(`({ ...s }) as import('../../lib/rbac').${A}`), 'Access via import()').toBe(true);
  });
});
