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

/** Toutes les sources, tests compris (les directives ESLint s'y lisent aussi). */
const IGNORES_TOUT = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage']);
function toutesSources(dir: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    if (IGNORES_TOUT.has(nom)) continue;
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) toutesSources(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(nom) && !nom.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/**
 * Suite de #1117 et #1119 · la face équipe (`Access.equipe`) n'est construite
 * que par `effectiveAccess`. La garde est désormais une règle ESLint TYPÉE du
 * dépôt (`eslint-rules/face-equipe.mjs`, éprouvée au résultat par
 * `secu-face-equipe-lint.test.ts`) · elle voit à travers un alias, un
 * générique, un `as any` ou un `as never`. Les motifs de cast par expression
 * régulière qui la précédaient ne voyaient que les casts écrits en toutes
 * lettres · ils sont retirés.
 *
 * Restent ici deux filets, contre une ERREUR (un raccourci pris de bonne foi),
 * pas contre la malveillance :
 *  · ce qu'une règle ESLint ne peut pas garder elle-même, sa propre
 *    désactivation · dans apps/web (code et tests), une directive qui coupe
 *    une règle `tiktrends/`, une directive sans liste (elle les coupe toutes),
 *    ou une configuration en ligne qui en nomme une, échoue ici et dit où.
 *    Modifier eslint.config.mjs reste possible, c'est la relecture qui le voit ;
 *  · le NOM de la marque · hors de sa définition (rbac.ts), de la construction
 *    de production (access.ts) et du helper de test, personne n'a à l'écrire ·
 *    lire `Access.equipe` suffit. Ce filet ne coûte rien et attrape par
 *    construction toute forme qui l'écrit en toutes lettres.
 */
const WEB = join(PRODUIT, 'apps/web');
const GARDEES = (r: string) => r.startsWith('tiktrends/');
/** Les directives ESLint d'un fichier · un commentaire qui COMMENCE par le mot-clé (seule forme qu'ESLint lit). */
function directives(code: string): Array<{ ligne: number; motCle: string; regles: string[] }> {
  const out: Array<{ ligne: number; motCle: string; regles: string[] }> = [];
  for (const m of code.matchAll(/\/\*([\s\S]*?)\*\/|\/\/(.*)$/gm)) {
    const corps = (m[1] ?? m[2] ?? '').trim();
    const d = /^(eslint-disable-next-line|eslint-disable-line|eslint-disable|eslint)(?=\s|$)([\s\S]*)$/.exec(corps);
    if (!d) continue;
    const liste = d[2]!.split(/\s--\s/)[0]!.trim();
    const regles = d[1] === 'eslint'
      ? [...liste.matchAll(/([@\w/-]+)\s*:/g)].map((x) => x[1]!)
      : liste.split(',').map((r) => r.trim()).filter(Boolean);
    out.push({ ligne: code.slice(0, m.index).split('\n').length, motCle: d[1]!, regles });
  }
  return out;
}
const FICHIERS_WEB = toutesSources(WEB).map((p) => ({ chemin: relative(PRODUIT, p).split('\\').join('/'), code: readFileSync(p, 'utf8') }));

describe('Face équipe · la règle ESLint qui la garde n’est désactivée nulle part', () => {
  it('le recensement lit les directives du dépôt (sinon il ne garde rien)', () => {
    expect(FICHIERS_WEB.some((f) => f.chemin.startsWith('apps/web/test/')), 'les tests ne sont pas lus').toBe(true);
    const connues = FICHIERS_WEB.flatMap((f) => directives(f.code).map((d) => d.regles.join(',')));
    expect(connues, 'les directives react-hooks existantes sont introuvables · le motif regarde ailleurs').toContain('react-hooks/exhaustive-deps');
  });

  it('le lecteur reconnaît chaque forme de désactivation', () => {
    const r = (c: string) => directives(c).map((d) => `${d.motCle}:${d.regles.join(',')}`);
    const T = ['tiktrends', 'face-equipe-forcee'].join('/');
    expect(r(`/* ${'eslint-disable'} ${T} */`)).toEqual([`eslint-disable:${T}`]);
    expect(r(`x; // ${'eslint-disable-line'} a/b, ${T} -- raison`)).toEqual([`eslint-disable-line:a/b,${T}`]);
    expect(r(`// ${'eslint-disable-next-line'}`)).toEqual(['eslint-disable-next-line:']);
    expect(r(`/* ${'eslint'} ${T}: off */`)).toEqual([`eslint:${T}`]);
    expect(r('// un commentaire qui cite eslint-disable au milieu')).toEqual([]);
  });

  it('aucune directive ne coupe une règle tiktrends/, ni toutes les règles', () => {
    const hors = FICHIERS_WEB.flatMap((f) => directives(f.code)
      .filter((d) => (d.motCle !== 'eslint' && d.regles.length === 0) || d.regles.some(GARDEES))
      .map((d) => `${f.chemin}:${d.ligne} · ${d.motCle} ${d.regles.join(', ') || '(toutes les règles)'}`));
    expect(hors, 'une directive ESLint coupe la garde de la face équipe · seul effectiveAccess construit un Access (privilegesEquipe), corrige le code au lieu de couper la règle').toEqual([]);
  });
});

/** Le nom de la marque, recomposé · ce fichier, lu par le recensement, ne l'écrit pas lui-même. */
const MARQUE = ['Face', 'Equipe'].join('');
const NOMMENT_LA_MARQUE = ['apps/web/lib/rbac.ts', 'apps/web/lib/access.ts', 'apps/web/test/helpers/face-equipe.ts'];
/** Le code sans ses commentaires (blocs, puis lignes hors chaînes d'URL) · citer la marque pour expliquer reste permis. */
const FICHIERS_WEB_SANS_COMMENTAIRES = FICHIERS_WEB.map((f) => ({ chemin: f.chemin, code: sansCommentaires(f.code) }));

describe('Face équipe · la marque n’est nommée que par sa définition et ses deux constructions', () => {
  it('le recensement lit bien la définition et les deux constructions (sinon il ne garde rien)', () => {
    for (const chemin of NOMMENT_LA_MARQUE) {
      expect(FICHIERS_WEB_SANS_COMMENTAIRES.some((f) => f.chemin === chemin && new RegExp(`\\b${MARQUE}\\b`).test(f.code)), `${chemin} ne nomme plus la marque · le motif regarde ailleurs`).toBe(true);
    }
  });

  it('personne d’autre ne la nomme (pages, actions, lib, tests)', () => {
    const hors = FICHIERS_WEB_SANS_COMMENTAIRES.filter((f) => new RegExp(`\\b${MARQUE}\\b`).test(f.code) && !NOMMENT_LA_MARQUE.includes(f.chemin)).map((f) => f.chemin);
    expect(hors, `${MARQUE} est nommée hors de rbac.ts, access.ts et du helper de test · seule effectiveAccess construit une face équipe (privilegesEquipe), lis Access.equipe sans nommer la marque`).toEqual([]);
  });
});

/**
 * Suite de #1122 · le registre des faces équipe (lib/rbac.ts) n'a qu'une porte,
 * `inscrireFaceEquipe`, et seul `effectiveAccess` (lib/access.ts) la passe. Son
 * NOM écrit ailleurs (import, espace de noms, chaîne) suffirait à rendre
 * reconnue une face forgée · ce filet le refuse par construction, la règle
 * `tiktrends/inscription-face-equipe` le dit dans l'éditeur.
 *
 * Et la décision se prend CÔTÉ SERVEUR · un composant client qui importerait
 * rbac ou access déciderait sur une face reçue en props, donc sérialisée, donc
 * refusée par le registre (face client) · l'écran d'équipe se fermerait sans
 * bruit. Aucun module `'use client'` ne les importe · il reçoit le résultat.
 */
const PORTE = ['inscrireFace', 'Equipe'].join('');
const PASSENT_LA_PORTE = ['apps/web/lib/rbac.ts', 'apps/web/lib/access.ts'];

describe('Face équipe · une seule porte au registre, et la décision côté serveur', () => {
  it('la porte est définie dans rbac.ts et passée par access.ts (sinon le recensement ne garde rien)', () => {
    for (const chemin of PASSENT_LA_PORTE) {
      expect(FICHIERS_WEB_SANS_COMMENTAIRES.some((f) => f.chemin === chemin && new RegExp(`\\b${PORTE}\\b`).test(f.code)), `${chemin} ne nomme plus la porte · le motif regarde ailleurs`).toBe(true);
    }
  });

  it('personne d’autre ne nomme la porte du registre (pages, actions, lib, tests, règles)', () => {
    const hors = FICHIERS_WEB_SANS_COMMENTAIRES.filter((f) => new RegExp(`\\b${PORTE}\\b`).test(f.code) && !PASSENT_LA_PORTE.includes(f.chemin)).map((f) => f.chemin);
    expect(hors, `${PORTE} est nommée hors de rbac.ts et access.ts · inscrire une face la rendrait reconnue sans privilegesEquipe, passe par effectiveAccess`).toEqual([]);
  });

  it('aucun module client n’importe rbac ni access · il recevrait une face sérialisée, que le registre refuse', () => {
    const clients = FICHIERS_WEB_SANS_COMMENTAIRES.filter((f) => /^\s*['"]use client['"]/.test(f.code));
    expect(clients.length, 'aucun composant client lu · le motif regarde ailleurs').toBeGreaterThan(20);
    const hors = clients.filter((f) => /from\s+['"][^'"]*\blib\/(rbac|access)['"]|import\(\s*['"][^'"]*\blib\/(rbac|access)['"]/.test(f.code)).map((f) => f.chemin);
    expect(hors, 'un composant client importe rbac ou access · la décision d’accès se prend côté serveur, le client reçoit le résultat (ouvert, verrou)').toEqual([]);
  });
});
