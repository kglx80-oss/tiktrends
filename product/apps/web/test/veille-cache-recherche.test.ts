import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InspoAd } from '@tiktrends/integrations';
import {
  cleRecherche, lireRecherche, ecrireRecherche, _viderRecherche,
  RECHERCHE_TTL_MS, RECHERCHE_MAX,
} from '../lib/veille-search-cache';

/**
 * Le cache de recherche évite de repayer Trendtrack pour la même recherche.
 *
 * On teste le comportement, pas la présence d'un appel · une écriture puis une
 * lecture rend la valeur ; passé le délai, elle disparaît ; au-delà de la borne,
 * la moins récemment utilisée est jetée. L'horloge est injectée · pas de faux
 * timers, on lit un résultat déterministe.
 */

const res = (n: number) => ({ ads: [{ id: `ad${n}`, platform: 'meta' } as InspoAd], total: n });

beforeEach(() => _viderRecherche());

describe('cleRecherche · une recherche, une clé', () => {
  it('mêmes composantes → même clé ; une différence → clé différente', () => {
    expect(cleRecherche(['meta', 'q', 'crème', 1])).toBe(cleRecherche(['meta', 'q', 'crème', 1]));
    expect(cleRecherche(['meta', 'q', 'crème', 1])).not.toBe(cleRecherche(['meta', 'q', 'crème', 2]));
    // Un filtre absent ne collisionne pas avec un filtre présent voisin.
    expect(cleRecherche(['meta', undefined, 'x'])).not.toBe(cleRecherche(['meta', 'x', undefined]));
  });
});

describe('lire / écrire · le répété ne repaie pas', () => {
  it('absent → undefined ; écrit puis relu → la valeur', () => {
    expect(lireRecherche('k')).toBeUndefined();
    ecrireRecherche('k', res(3), 1000);
    expect(lireRecherche('k', 1000)).toEqual(res(3));
  });

  it('passé le TTL → undefined, et l’entrée est purgée', () => {
    ecrireRecherche('k', res(1), 0);
    expect(lireRecherche('k', RECHERCHE_TTL_MS)).toEqual(res(1)); // pile au seuil, encore valide
    expect(lireRecherche('k', RECHERCHE_TTL_MS + 1)).toBeUndefined(); // au-delà, périmée
    expect(lireRecherche('k', RECHERCHE_TTL_MS + 1)).toBeUndefined(); // et bien purgée
  });
});

describe('borne · un cache mémoire n’est pas un stockage', () => {
  it('au-delà de la borne, la plus ancienne est jetée', () => {
    for (let i = 0; i < RECHERCHE_MAX + 5; i++) ecrireRecherche(`k${i}`, res(i), 100);
    expect(lireRecherche('k0', 100), 'la plus ancienne a été évincée').toBeUndefined();
    expect(lireRecherche(`k${RECHERCHE_MAX + 4}`, 100), 'la plus récente est là').toEqual(res(RECHERCHE_MAX + 4));
  });

  it('une lecture rafraîchit la récence · c’est ce qui rend l’éviction LRU', () => {
    ecrireRecherche('vieux', res(1), 100);
    ecrireRecherche('autre', res(2), 100);
    // On relit « vieux » · il redevient le plus récemment utilisé.
    lireRecherche('vieux', 100);
    // On remplit jusqu'à forcer UNE éviction · ce doit être « autre », pas « vieux ».
    for (let i = 0; i < RECHERCHE_MAX - 1; i++) ecrireRecherche(`bourrage${i}`, res(i), 100);
    expect(lireRecherche('vieux', 100), 'le relu récemment survit').toEqual(res(1));
    expect(lireRecherche('autre', 100), 'le non-relu est évincé').toBeUndefined();
  });
});

const PAGE = readFileSync(join(process.cwd(), 'app/(app)/veille/page.tsx'), 'utf8');

describe('la page branche le cache', () => {
  it('lit le cache avant l’appel, écrit après, et respecte ?refresh', () => {
    expect(PAGE).toMatch(/lireRecherche\(cle\)/);
    expect(PAGE).toMatch(/ecrireRecherche\(cle, \{ ads, total \}\)/);
    expect(PAGE, 'refresh doit court-circuiter la lecture').toMatch(/sp\.refresh \? undefined : lireRecherche\(cle\)/);
  });
});
