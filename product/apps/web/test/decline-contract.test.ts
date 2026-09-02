import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECLINAISONS_DISPONIBLES } from '@tiktrends/core';

/**
 * Une déclinaison ne s'enregistre pas sans avoir été vérifiée.
 *
 * ── L'invariant ──────────────────────────────────────────────────────────────
 *
 * Le prix d'une déclinaison est bas, et c'est précisément ce qui rend le
 * relâchement facile : facturer un crédit pour une accroche identique ne se
 * remarque pas. Ce qui se remarque, c'est la grille qui se remplit de doublons,
 * six mois plus tard, quand la mesure ne conclut plus rien.
 *
 * Deux choses doivent donc être vraies dans l'action, et elles ne peuvent pas
 * l'être « par attention » :
 *
 * 1. **le contrôle passe avant l'enregistrement** · une déclinaison qui n'a rien
 *    changé, ou qui a changé deux choses, ne doit jamais atteindre la base ;
 * 2. **l'enfant porte sa filiation** · sans `parentId` et `variable`, c'est une
 *    créa de plus dans la grille et l'écart qu'elle mesure n'est rattaché à
 *    rien · c'est-à-dire toute la valeur de la fonctionnalité, perdue en
 *    silence.
 *
 * ── Pourquoi ce test regarde la source ───────────────────────────────────────
 *
 * `declineAdAction` est un module « use server » · l'exercer demanderait une
 * session, une base et le fournisseur de modèles. Ce qui est vérifiable sans
 * eux, c'est l'ordre des étapes dans le corps de la fonction.
 */

const SRC = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

/** Le corps de la fonction · le reste du fichier ne la concerne pas. */
const CORPS = (() => {
  const i = SRC.indexOf('export async function declineAdAction');
  expect(i, 'declineAdAction a disparu du fichier').toBeGreaterThan(-1);
  return SRC.slice(i);
})();

describe('la déclinaison respecte son contrat', () => {
  it('vérifie AVANT d’enregistrer', () => {
    const verif = CORPS.indexOf('verifieDeclinaison(');
    const insert = CORPS.indexOf('db.insert(');
    expect(verif, 'le contrôle a disparu · un doublon serait facturé et compté comme une variante').toBeGreaterThan(-1);
    expect(insert, 'l’enregistrement a disparu').toBeGreaterThan(-1);
    expect(
      verif,
      'le contrôle passe APRÈS l’enregistrement · une copie déguisée en variante atteindrait la base.',
    ).toBeLessThan(insert);
  });

  it('rembourse quand le contrôle refuse', () => {
    // Le travail a eu lieu, mais il n'a rien produit qu'on puisse comparer ·
    // le facturer serait vendre un doublon.
    const bloc = CORPS.slice(CORPS.indexOf('verifieDeclinaison('), CORPS.indexOf('db.insert('));
    expect(bloc, 'le refus ne rembourse pas').toMatch(/rendre\(\)/);
  });

  it('l’enfant porte sa filiation', () => {
    const enfant = CORPS.slice(CORPS.indexOf('const enfant'), CORPS.indexOf('const vue'));
    expect(enfant, 'la déclinaison ne dit pas de qui elle descend').toMatch(/parentId:\s*input\.id/);
    expect(enfant, 'la déclinaison ne dit pas ce qu’on y a changé').toMatch(/variable,/);
  });

  it('n’hérite ni de la note ni du score du parent', () => {
    // Ils ont été calculés sur autre chose · les afficher sur l'enfant vendrait
    // une évaluation qui n'a pas eu lieu.
    const enfant = CORPS.slice(CORPS.indexOf('const enfant'), CORPS.indexOf('const vue'));
    expect(enfant).toMatch(/jarvisScore:\s*undefined/);
    expect(enfant).toMatch(/rating:\s*undefined/);
  });

  it('chaque déclinaison proposée est réellement traitée', () => {
    // Ajouter une variable au vivier sans lui écrire de branche la ferait
    // apparaître à l'écran et échouer au clic.
    const branches = CORPS.slice(0, CORPS.indexOf('const enfant'));
    for (const v of DECLINAISONS_DISPONIBLES) {
      expect(branches, `« ${v} » est proposée à l’écran mais aucune branche ne la traite`).toContain(`'${v}'`);
    }
  });

  it('ne facture jamais une déclinaison au prix d’une image', () => {
    // Les déclinaisons disponibles réutilisent toutes la scène · passer le
    // coût du moteur d'images ici ferait payer une image qu'on ne produit pas.
    expect(CORPS).toMatch(/prixDeclinaison\(variable,\s*0,/);
  });
});
