import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILLES_CLASSEES } from '@tiktrends/core';

/**
 * Les deux listes de familles d'erreur ne doivent pas diverger.
 *
 * ── Le silence qu'on rend bruyant ────────────────────────────────────────────
 *
 * L'application classe les échecs en familles (`ErrorFamily`). Le noyau décide,
 * famille par famille, si le fournisseur a facturé. Ce sont deux listes, dans
 * deux paquets, et rien ne les relie.
 *
 * Le jour où une famille s'ajoute d'un côté, elle tombe silencieusement dans
 * « on compte » de l'autre. C'est le bon côté de l'erreur — mais silencieux,
 * donc jamais relu : une famille qui ne facture rien resterait comptée pour
 * toujours, et le plafond se viderait sur des appels gratuits.
 *
 * Ce test transforme cet oubli en échec de build. Il ne dit pas de quel côté
 * classer la nouvelle famille · il dit qu'il faut choisir.
 */

const SRC = readFileSync(join(process.cwd(), 'lib/user-error.ts'), 'utf8');

/**
 * Les familles déclarées par l'union de types, lues à la source.
 *
 * Le premier extracteur écrit ici cherchait `'([a-z_]+)'` · une famille nommée
 * `moderation_v2` ne correspondait à rien et DISPARAISSAIT de la comparaison.
 * Le garde restait vert en ne voyant rien, ce qui est exactement le défaut
 * qu'il est censé empêcher, une couche plus bas.
 *
 * On compte donc aussi les littéraux · si l'un d'eux n'est pas reconnu, le
 * garde tombe au lieu de l'ignorer.
 */
function famillesDeclarees(): string[] {
  const m = SRC.match(/export type ErrorFamily = ([^;]+);/);
  if (!m) throw new Error('le type ErrorFamily est introuvable · le garde ne peut plus lire ce qu’il compare');
  const union = m[1]!;
  const noms = [...union.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]!);
  const litteraux = (union.match(/'/g) ?? []).length / 2;
  expect(noms.length, `un nom de famille n’a pas pu être lu dans « ${union.trim()} »`).toBe(litteraux);
  return noms;
}

describe('les familles d’erreur restent classées des deux côtés', () => {
  it('chaque famille de l’application est classée dans le noyau', () => {
    const oubliees = famillesDeclarees().filter((f) => !FAMILLES_CLASSEES.includes(f));
    expect(
      oubliees,
      `famille(s) non classées côté dépense : ${oubliees.join(', ')} · décide si le fournisseur facture, dans spend-refund.ts`,
    ).toEqual([]);
  });

  it('le noyau ne classe aucune famille qui n’existe plus', () => {
    // Une famille supprimée de l'application laisserait une règle qui ne
    // s'applique à rien · elle donne l'illusion d'être couverte.
    const declarees = famillesDeclarees();
    const fantomes = FAMILLES_CLASSEES.filter((f) => !declarees.includes(f));
    expect(fantomes, `classées côté dépense mais inconnues de l’application : ${fantomes.join(', ')}`).toEqual([]);
  });
});
