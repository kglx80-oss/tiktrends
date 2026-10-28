import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parcoursResultats, type CompteBoucle } from '@tiktrends/core';

/**
 * UX V2 · lot 4a · Veille et Résultats, parcours de la boucle (maquette § 7).
 *
 * On REND les vraies pages (serveur simulé · pas de base, pas de réseau, pas
 * de source, aucune écriture) et on lit le HTML :
 *  · Veille · source → analyse → projet, lu sur ce que la grille affiche ; les
 *    raccourcis Scale / Radar / Sauvegardes ne doublonnent plus les onglets ;
 *  · Résultats · hypothèse → lot → mesures → apprentissage, lu sur les comptes
 *    réels de la marque ; une étape vide le dit, avec un chemin que le RÔLE
 *    peut suivre ; la nature de chaque étape est affichée.
 */

const vide: CompteBoucle = { tests: 0, avecHypothese: 0, lots: 0, lotsLances: 0, lotsImportes: 0, mesures: 0, aArbitrer: 0, arbitres: 0, apprentissages: 0, derniereMesure: null };


// Vague 4 · la page V5 `/veille` (et son parcours source → analyse → projet) est retirée ·
// la Veille est servie par Spatial (sous-navigation de section, sans bande de parcours).

describe('Résultats · le chargeur est en lecture seule (source)', () => {
  it('aucune écriture ni appel externe dans `compterBoucle`', () => {
    const src = readFileSync(join(process.cwd(), 'lib/boucle-resultats.ts'), 'utf8');
    expect(src).not.toMatch(/\.(insert|update|delete)\(/);
    expect(src).not.toMatch(/fetch\(|@tiktrends\/ai|anthropic|\bfal\b/i);
    expect(src).toContain('compterLots(');
  });

  it('la règle d’affichage vient du noyau', () => {
    // L'ancienne vue d'ensemble V5 est retirée (Résultats exclusif Spatial) · la règle reste au noyau.
    // Le noyau, pour un membre, ne propose pas les lots.
    expect(parcoursResultats(vide, { peutAgir: false }).etapes.flatMap((e) => e.liens.map((l) => l.href))).not.toContain('/adsmap/lots');
  });
});
