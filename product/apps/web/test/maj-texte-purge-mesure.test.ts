import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S20 · réécrire les textes d'une pub sans régénérer l'image ne doit pas laisser
 * la mesure (score, conformité, lisibilité) collée à des mots qu'elle ne décrit
 * plus. Le noyau prouve la RÈGLE (texteAdModifie + sansMesure) ; ici on vérifie
 * son CÂBLAGE dans `updateAdTextAction`.
 *
 * Fichier `'use server'` · action non exécutable hors base. Adoption par la source.
 */
const src = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('S20 · la mise à jour des textes retire la mesure caduque', () => {
  it('updateAdTextAction détecte le changement et retire la mesure', () => {
    const i = src.indexOf('export async function updateAdTextAction(');
    expect(i, 'updateAdTextAction introuvable').toBeGreaterThan(-1);
    const corps = src.slice(i, i + 2200);
    expect(corps, 'le changement de texte n’est pas détecté').toContain('texteAdModifie(r, next)');
    expect(corps, 'la mesure n’est pas retirée quand le texte change').toMatch(/if \(mesureReinitialisee\) next = sansMesure\(next\)/);
    expect(corps, 'le client n’est pas informé de la réinitialisation').toContain('mesureReinitialisee');
  });
});
