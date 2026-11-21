import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * CLIQUET des attentes FIXES dans les tests de `apps/web` (suite de #1129).
 *
 * Une attente fixe (« 400 ms puis on lit la base ») parie sur la vitesse de la machine · au repos
 * elle passe, sous charge elle perd une fois de temps en temps, et une route ralentie au-delà de
 * sa durée la rend aveugle (une course de verrou qui ne se produit plus passe au vert). Un test
 * attend un ÉTAT · `attendreEtat` (un état qu'on attend de voir venir) ou `attendreAbsence` (une
 * absence tenue dans la durée), `test/helpers/attendre-etat.ts`.
 *
 * Ce qu'on compte · dans `apps/web/test` (tous les `.ts` / `.tsx`, sous-dossiers compris), chaque
 * PROMESSE DE SOMMEIL · `new Promise((r) => setTimeout(r, N))` (le résolveur passé tel quel au
 * minuteur, avec ou sans accolades, typée ou non) dont le délai N n'est pas `0` · un délai écrit
 * par une variable (`ms`, `faux.latenceMs`) compte aussi, il n'est pas 0 par construction · et
 * chaque import de `timers/promises` (le même sommeil, sous un autre nom). Ne comptent PAS · le
 * tour de boucle `setTimeout(r, 0)` (ou sans délai), une valeur rendue en différé
 * (`setTimeout(() => r(v), 10)`), un délai de garde qui REJETTE (`setTimeout(() => rej(…))`).
 *
 * C'est plus large que « un sommeil suivi d'un `expect` » · une attente cachée dans une aide
 * (`const attendre = () => … setTimeout(r, 30) …`, puis `await attendre(); expect(…)`) est le
 * même pari, et une ligne entre le sommeil et l'`expect` suffirait à tromper une lecture de
 * voisinage. Le cas légitime (un faux qui simule une latence, un `dormir` injecté au code testé)
 * se DÉCLARE ici, avec sa raison.
 *
 * Exclus · `helpers/attendre-etat.ts` (le seul sommeil légitime · le pas entre deux sondages) et
 * ce fichier (il décrit les formes qu'il cherche).
 *
 * Les EXEMPTIONS ci-dessous sont l'état mesuré de main (d959ff37, 21/11/2026) · 49 promesses de
 * sommeil dans 41 fichiers, après la migration de ce lot (les boucles maison de `boucle-fiche-test`,
 * `boucle-preuve`, `notes-iterer`, `commentaire-iterer`, `dans-les-tests`, `gagnante-clavier`,
 * `gagnante-partout`, et les 400 ms de `e2-controle-vision-pg` et `fd-revocation-pg`). Chacune porte
 * son COMPTE EXACT · un fichier qui en gagne une tombe (une nouvelle attente fixe), un fichier qui
 * en perd une tombe aussi (l'exemption est périmée · abaisse le compte, ou retire la ligne à 0) ·
 * le cliquet ne descend que par une décision écrite.
 */

const RACINE = __dirname;
const EXCLUS = new Set(['helpers/attendre-etat.ts', 'attente-fixe-cliquet.test.ts']);

/* Les raisons, par nature · chaque exemption en nomme une. */
const INJECTE = 'le `dormir` injecté au code testé (son propre sondage, borné par `attente`) · pas une attente du test';
const LATENCE = 'latence simulée dans un faux (fournisseur, fetch, verrou, processus enfant) · le test provoque un chevauchement, il n’attend pas un état';
const SONDAGE = 'boucle de sondage maison, bornée, sur la condition vraie · même forme que celles migrées par ce lot, à passer par `attendreEtat`';
const FIXE = 'attente fixe avant constat (montage, action serveur, focus) · dette à migrer vers `attendreEtat` / `attendreMontageStable`';
const FEU = 'laisse partir le « fire and forget » avant de lire l’espion · une absence, à passer par `attendreAbsence`';
const VERROU = 'course de verrou Postgres à délai fixe (`pause(400)`) · même cas que `e2-controle-vision-pg` et `fd-revocation-pg`, à passer par `pg_blocking_pids`';

const EXEMPTIONS: Readonly<Record<string, { n: number; raison: string }>> = {
  // Le code testé reçoit son sommeil · c'est SA boucle, bornée par `attente`.
  'r6-pas1-interrupteurs.test.ts': { n: 1, raison: INJECTE },
  'e2-pas1-registre.test.ts': { n: 1, raison: INJECTE },
  'e-pas1-recette.test.ts': { n: 1, raison: INJECTE },
  'e4-pas1-reprise-vision.test.ts': { n: 1, raison: INJECTE },
  // Un faux qui prend du temps · la course est le sujet.
  'e3-enfant-registre.ts': { n: 1, raison: LATENCE },
  'logos-charte-etat.test.ts': { n: 1, raison: LATENCE },
  'adsmap-import-verrou-db.test.ts': { n: 1, raison: LATENCE },
  'fa-course-mixte-pg.test.ts': { n: 3, raison: `${LATENCE} · et le départ synchronisé des deux vagues de la course (rendez-vous, échelonnement)` },
  // Le même défaut que celui réparé ici, hors du périmètre de ce lot.
  'l2-revocation-course-pg.test.ts': { n: 1, raison: VERROU },
  'fa-reservation-commune.test.ts': { n: 1, raison: SONDAGE },
  'l3-worker.test.ts': { n: 1, raison: SONDAGE },
  'import-lot-db.test.tsx': { n: 1, raison: SONDAGE },
  'fin-prevue-import-db.test.tsx': { n: 1, raison: SONDAGE },
  'iterer-gagnante-db.test.tsx': { n: 1, raison: SONDAGE },
  'lot9-personas-db.test.tsx': { n: 2, raison: SONDAGE },
  'lot9bis-offres-db.test.tsx': { n: 1, raison: SONDAGE },
  'l0-api-ad.test.ts': { n: 1, raison: FEU },
  'l0-jalons.test.ts': { n: 1, raison: FEU },
  // Les aides `attendre` / `laisser` / `monter` à durée fixe.
  'analyse-crea-marque-db.test.tsx': { n: 1, raison: FIXE },
  'boucles-hypothese-db.test.tsx': { n: 1, raison: FIXE },
  'commentaire-boucle-mentions-db.test.tsx': { n: 2, raison: FIXE },
  'lot6-veille-tags-db.test.tsx': { n: 1, raison: FIXE },
  'lot6bis-sauvegardes-hypothese-db.test.tsx': { n: 1, raison: FIXE },
  'lot7-veille-filtres-liste.test.tsx': { n: 1, raison: FIXE },
  'lot8-studios-db.test.tsx': { n: 1, raison: FIXE },
  'lot10-activite-db.test.tsx': { n: 1, raison: FIXE },
  'lot11-notes-lignee-db.test.tsx': { n: 1, raison: FIXE },
  'lot12-bibliotheque-db.test.tsx': { n: 1, raison: FIXE },
  'lot13-raccourcis-rendu.test.tsx': { n: 1, raison: FIXE },
  'lot13b-raccourcis-lot-db.test.tsx': { n: 1, raison: FIXE },
  'lot13b-raccourcis-suite-rendu.test.tsx': { n: 1, raison: FIXE },
  'lot13t-raccourcis-test-db.test.tsx': { n: 1, raison: FIXE },
  'lot13t-raccourcis-visibles-rendu.test.tsx': { n: 1, raison: FIXE },
  'mes-mentions-db.test.tsx': { n: 2, raison: FIXE },
  'notes-iterer-db.test.tsx': { n: 1, raison: `${FIXE} (l’aide \`attendre\` · la boucle de création, elle, est migrée)` },
  'spatial-editeur-gestes.test.tsx': { n: 4, raison: FIXE },
  'spatial-editeur-zoom.test.tsx': { n: 1, raison: FIXE },
  'studios-ateliers-brique-design.test.tsx': { n: 1, raison: FIXE },
  'studios-editeur-ecran-design.test.tsx': { n: 1, raison: FIXE },
  'studios-fiche-projet-ecran-design.test.tsx': { n: 1, raison: FIXE },
  'studios-video-ecran-design.test.tsx': { n: 1, raison: FIXE },
};

/**
 * Une promesse de sommeil · `new Promise[<T>]((r) => [{] setTimeout(r[, délai]) …` · le MÊME nom
 * en résolveur et en rappel (sinon c'est une valeur différée, pas un sommeil). Groupe 2 · le délai.
 */
const SOMMEIL = /new\s+Promise\s*(?:<[^>]*>)?\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*\{?\s*setTimeout\s*\(\s*\1\s*(?:,\s*([^)]*?)\s*)?\)/g;
const TIMERS_PROMESSES = /from\s+['"](?:node:)?timers\/promises['"]|require\(\s*['"](?:node:)?timers\/promises['"]\s*\)/g;

/** Les attentes fixes d'un source · leurs lignes (1 = première). */
function attentesFixes(source: string): number[] {
  const ligne = (i: number) => source.slice(0, i).split('\n').length;
  const lignes: number[] = [];
  for (const m of source.matchAll(SOMMEIL)) {
    const delai = (m[2] ?? '').trim();
    if (delai === '' || /^0+$/.test(delai)) continue;
    lignes.push(ligne(m.index!));
  }
  for (const m of source.matchAll(TIMERS_PROMESSES)) lignes.push(ligne(m.index!));
  return lignes.sort((a, b) => a - b);
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    if (nom === 'node_modules' || nom.startsWith('.')) continue;
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(nom)) out.push(relative(RACINE, p).split('\\').join('/'));
  }
  return out.sort();
}

const VERS = 'attendre un ÉTAT, jamais une durée · passe par `attendreEtat` (un état qu’on attend de voir venir) ou `attendreAbsence` (une absence tenue dans la durée), `test/helpers/attendre-etat.ts`';

describe('le détecteur · il voit chaque forme de sommeil, et seulement elles', () => {
  const Z = 'setTime' + 'out';
  it.each([
    ['inline, résolveur r', `await new Promise((r) => ${Z}(r, 20));`],
    ['résolveur ok, sans parenthèses', `await new Promise(ok => ${Z}(ok, 400));`],
    ['typée, à accolades, délai variable', `const dormir = (ms: number) => new Promise<void>((r) => { ${Z}(r, ms); });`],
    ['sur deux lignes', `await new Promise((r) =>\n  ${Z}(r, 50));`],
    ['dans act', `await act(async () => { await new Promise((r) => ${Z}(r, 5)); });`],
    ['timers/promises', `import { ${Z} as dormir } from 'node:timers/promises';`],
  ])('compte · %s', (_, src) => {
    expect(attentesFixes(src), `le détecteur ne voit pas « ${src} »`).toHaveLength(1);
  });
  it.each([
    ['un tour de boucle (0)', `await new Promise((r) => ${Z}(r, 0));`],
    ['sans délai', `await new Promise((r) => ${Z}(r));`],
    ['une valeur différée', `new Promise((r) => ${Z}(() => r({ ok: true }), 10));`],
    ['un délai de garde qui rejette', `new Promise((_, rej) => { t = ${Z}(() => rej(new Error('DELAI')), 500); });`],
    ['un minuteur nu', `${Z}(() => champ.focus(), 50);`],
  ])('ne compte pas · %s', (_, src) => {
    expect(attentesFixes(src), `le détecteur compte « ${src} »`).toEqual([]);
  });
});

describe('cliquet · aucune attente fixe nouvelle dans les tests de apps/web', () => {
  const fichiers = sources(RACINE).filter((f) => !EXCLUS.has(f));
  const releve = new Map(fichiers.map((f) => [f, attentesFixes(readFileSync(join(RACINE, f), 'utf8'))] as const));

  it('préalable · le relevé lit les tests (et l’utilitaire exclu existe)', () => {
    expect(fichiers.length, 'préalable · aucun fichier de test relevé').toBeGreaterThan(100);
    expect(existsSync(join(RACINE, 'helpers/attendre-etat.ts')), 'préalable · l’utilitaire commun a bougé').toBe(true);
    expect(fichiers, 'préalable · le relevé ne descend pas dans les sous-dossiers').toContain('helpers/pg-memoire.ts');
  });

  it('un fichier hors exemptions ne porte AUCUNE attente fixe', () => {
    const fautes = [...releve].filter(([f, l]) => l.length > 0 && !EXEMPTIONS[f])
      .map(([f, l]) => `${f} · ${l.length} attente(s) fixe(s), ligne(s) ${l.join(', ')} · ${VERS}`);
    expect(fautes).toEqual([]);
  });

  it('un fichier exempté garde EXACTEMENT son compte · une de plus est une attente nouvelle, une de moins une exemption périmée', () => {
    const fautes: string[] = [];
    for (const [f, e] of Object.entries(EXEMPTIONS)) {
      expect(e.raison.trim(), `${f} · une exemption sans raison`).not.toBe('');
      const l = releve.get(f);
      if (!l) { fautes.push(`${f} · exemption d’un fichier absent · retire-la`); continue; }
      if (l.length > e.n) fautes.push(`${f} · ${l.length} attente(s) fixe(s) pour ${e.n} exemptée(s), ligne(s) ${l.join(', ')} · ${VERS}`);
      if (l.length < e.n) fautes.push(`${f} · ${l.length} attente(s) fixe(s) pour ${e.n} exemptée(s) · exemption périmée, abaisse son compte à ${l.length}${l.length === 0 ? ' (retire la ligne)' : ''}`);
    }
    expect(fautes).toEqual([]);
  });
});
