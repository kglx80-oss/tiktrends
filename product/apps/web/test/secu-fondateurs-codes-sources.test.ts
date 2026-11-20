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
