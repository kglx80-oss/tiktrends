import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Toute migration écrite doit être inscrite au journal.
 *
 * ── L'incident que ce test empêche de recommencer ────────────────────────────
 *
 * `0039_radar.sql` a été écrit, relu, commité, déployé · et n'a jamais tourné.
 * Drizzle applique les migrations listées dans `meta/_journal.json`, pas les
 * fichiers présents dans le dossier. Un fichier oublié du journal est
 * silencieux : rien n'échoue au déploiement, la base reste en arrière, et le
 * défaut ne se manifeste que le jour où quelqu'un ouvre l'écran qui lit la
 * colonne manquante. Cinq écrans sont tombés d'un coup pour cette seule raison.
 *
 * ── Pourquoi un test plutôt qu'une vigilance ─────────────────────────────────
 *
 * « Ne pas oublier le journal » n'est pas une règle applicable · c'est une
 * demande faite à la mémoire de celui qui écrit, au moment précis où il pense à
 * autre chose. Le seul remède est une vérification qui ne dépend de personne.
 *
 * Le test vit dans `apps/web` parce que c'est le paquet qui a déjà un lanceur ·
 * il lit le dossier de `packages/db`, comme la couverture du garde de dépense
 * lit `app/` et `lib/`. Un test qui vérifie une propriété du dépôt n'appartient
 * pas au paquet qu'il inspecte, il appartient là où il peut tourner.
 */

const DRIZZLE = join(process.cwd(), '..', '..', 'packages', 'db', 'drizzle');

interface Journal { entries: Array<{ idx: number; tag: string }> }

const journal = (): Journal =>
  JSON.parse(readFileSync(join(DRIZZLE, 'meta', '_journal.json'), 'utf8')) as Journal;

const fichiers = (): string[] =>
  readdirSync(DRIZZLE).filter((f) => f.endsWith('.sql')).sort();

describe('journal des migrations', () => {
  it('chaque fichier .sql a son entrée · sinon il ne tournera jamais', () => {
    const tags = new Set(journal().entries.map((e) => e.tag));
    const orphelins = fichiers()
      .map((f) => f.replace(/\.sql$/, ''))
      .filter((tag) => !tags.has(tag));

    expect(orphelins, `Migration(s) absente(s) de meta/_journal.json · elles ne seront PAS appliquées : ${orphelins.join(', ')}`)
      .toEqual([]);
  });

  it('chaque entrée a son fichier · une entrée sans fichier fait échouer le déploiement', () => {
    const presents = new Set(fichiers().map((f) => f.replace(/\.sql$/, '')));
    const manquants = journal().entries.map((e) => e.tag).filter((t) => !presents.has(t));
    expect(manquants, `Entrée(s) de journal sans fichier : ${manquants.join(', ')}`).toEqual([]);
  });

  it('les index sont uniques et croissants · l’ordre d’application en dépend', () => {
    const idx = journal().entries.map((e) => e.idx);
    expect(new Set(idx).size, 'index dupliqué dans le journal').toBe(idx.length);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it('le journal contient la migration du radar · le cas qui a échoué', () => {
    // Test de non-régression nommément : la migration dont l'oubli a fait
    // tomber cinq écrans en production.
    expect(journal().entries.some((e) => e.tag === '0039_radar')).toBe(true);
  });
});
