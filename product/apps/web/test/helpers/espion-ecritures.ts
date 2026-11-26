import { PGlite } from '@electric-sql/pglite';
import { attendreAbsence } from './attendre-etat';

/**
 * L'espion d'écritures SQL · prouver qu'une LECTURE n'écrit rien en base (BASE-03), au RÉSULTAT.
 *
 * Chaque instruction passée à `PGlite.prototype.query` (le chemin de drizzle sur pglite) est lue ·
 * celles qui modifient la base sont relevées tant que l'espion est armé. Une seule définition, pour
 * `l0-api-ad` et `l0-jalons` · une correction ne se fait plus deux fois.
 *
 * Branchement · dans la fabrique `vi.mock('@tiktrends/db', …)` du fichier, avant la base ·
 * `(await import('./helpers/espion-ecritures')).espionnerEcritures();`. Puis, dans un test,
 * `const { r, ecritures } = await sousEspion(() => lecture());` et `expect(ecritures).toEqual([])`.
 *
 * Gardé par `espion-ecritures.test.ts` (écriture synchrone vue, écriture différée vue, lecture non
 * comptée, espion désarmé quand la lecture lève, autres erreurs relancées).
 */

/** Une instruction qui modifie la base · le reste (select, with … select, select … for update) est une lecture. */
export const ECRITURE = /\binsert\s+into\b|\bupdate\s+"?[a-z_]+"?\s+set\b|\bdelete\s+from\b|\btruncate\b|\bmerge\s+into\b/i;

/** L'état de l'espion · un par fichier de test (chaque fichier a son propre graphe de modules). */
const espion = { actif: false, ecritures: [] as string[] };
let branche = false;

/** Enveloppe `PGlite.prototype.query` · une fois par fichier, appeler de nouveau ne double rien. */
export function espionnerEcritures(): void {
  if (branche) return;
  branche = true;
  const proto = PGlite.prototype as unknown as { query: (sql: string, ...rest: unknown[]) => Promise<unknown> };
  const query = proto.query;
  proto.query = function (this: unknown, sql: string, ...rest: unknown[]) {
    if (espion.actif && ECRITURE.test(sql)) espion.ecritures.push(sql.replace(/\s+/g, ' ').slice(0, 160));
    return query.call(this, sql, ...rest);
  };
}

/**
 * Lance une lecture sous espion · rend son résultat et les instructions d'écriture vues.
 *
 * Une lecture peut répondre AVANT d'avoir fini · un « fire and forget » (`void rangerRendu(…)` dans
 * `GET /api/ad/[id]`, l'ancien `void recordMilestones(…)` de `jarvisStats`) écrit APRÈS le retour
 * de `f`. Ce qu'on attend n'est pas une durée, c'est une ABSENCE · aucune écriture, tenue dans la
 * durée (`attendreAbsence`), l'espion toujours armé. La première écriture vue la viole aussitôt ·
 * elle est rendue au test, dont l'`expect` la nomme. Toute autre erreur (celle de `f`, celle de
 * l'attente) remonte telle quelle · l'espion est désarmé dans tous les cas.
 *
 * Délais MESURÉS de l'écriture que cette absence doit voir, 22/11/2026, machine de 4 cœurs, tout le
 * fichier en boucle :
 *
 *   défaut remis                                         régime                passages    n    p50    max
 *   `l0-api-ad` · l'index noté derrière `rangerRendu`    au repos                   4     16    0,1    0,5 ms
 *   (du retour de `f` à la première écriture vue)        12 boucles CPU actives     6     24    0,1   12,2 ms
 *
 *   `l0-jalons` · `void recordMilestones(…)` dans `jarvisStats` · l'insertion arrive pendant
 *   `jarvisSnapshot`, AVANT le retour de `f` (8 à 12 ms avant au repos, 31 à 55 ms sous 12 boucles
 *   CPU, 10 passages) · le premier sondage la voit.
 *
 * La fenêtre de `attendreAbsence` (`SONDAGES_ABSENCE` sondages, ~200 ms) couvre le pire plus de
 * seize fois · l'ancienne attente fixe (30 ms) un peu plus de deux, et une écriture partie 80 ms
 * après la réponse passait dessous sans bruit.
 */
export async function sousEspion<T>(f: () => Promise<T>): Promise<{ r: T; ecritures: string[] }> {
  espion.ecritures = [];
  espion.actif = true;
  try {
    const r = await f();
    await attendreAbsence('aucune écriture SQL ne part de la lecture, même après son retour (« fire and forget »)', () => espion.ecritures.length === 0)
      .catch((e: unknown) => { if (espion.ecritures.length === 0) throw e; });
    return { r, ecritures: [...espion.ecritures] };
  } finally {
    espion.actif = false;
  }
}

/** L'espion est-il armé · pour la garde de l'aide (un espion resté armé compterait les écritures du test suivant). */
export const espionArme = (): boolean => espion.actif;
