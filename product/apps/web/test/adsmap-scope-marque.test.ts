import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La vue Table ADSMAP (`listAdsAction`) et son export CSV lisent « les ads de la
 * marque active ». `schema.ads` ne porte pas de brandId · la marque s'atteint
 * par la chaîne concept→angle→désir→persona. Scopée à l'espace seul, la table
 * d'une agence affichait les ads de TOUTES ses marques, et `exportAdsCsvAction`
 * remettait au client A un fichier nommé « adsmap_A_… » contenant les données
 * de B · une fuite inter-marques, jusque dans un livrable client.
 *
 * Le job utilise le singleton `db` (non injectable) · comme les autres gardes
 * de requête du dépôt, on vérifie la propriété sur la source · la lecture
 * filtre par `personas.brandId`, via le join de la chaîne. Le test tombe si le
 * filtre marque disparaît.
 */
const SRC = readFileSync(join(process.cwd(), 'app/actions/adsmap.ts'), 'utf8');

describe('ADSMAP · la vue Table lit la marque active, pas tout l’espace', () => {
  it('la lecture des ads filtre par personas.brandId', () => {
    expect(SRC, 'listAdsAction ne filtre plus par marque · la table fuite les ads des autres marques de l’espace')
      .toMatch(/eq\(schema\.personas\.brandId, g\.brand\.id\)/);
  });

  it('la chaîne persona est jointe pour permettre ce filtre', () => {
    expect(SRC).toMatch(/[lL]eftJoin\(schema\.personas, eq\(schema\.desires\.personaId, schema\.personas\.id\)\)/);
  });
});
