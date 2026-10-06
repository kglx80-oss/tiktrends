import { describe, it, expect } from 'vitest';
import { changementPortee, type PorteeConnaissance } from '../src/index';

/**
 * Message 63 · `changementPortee` · « espace A → marque d'un espace B » envoie le
 * texte à des lecteurs qui ne le lisaient pas · c'est un DÉPLACEMENT, pas un
 * resserrement. Il était rendu `null` (aucune confirmation demandée).
 */

const WS = '11111111-1111-4111-8111-111111111111';
const WS2 = '22222222-2222-4222-8222-222222222222';
const BR = '33333333-3333-4333-8333-333333333333';
const BR2 = '44444444-4444-4444-8444-444444444444';
const BR3 = '55555555-5555-4555-8555-555555555555';

const P: PorteeConnaissance = { niveau: 'plateforme' };
const E: PorteeConnaissance = { niveau: 'espace', workspaceId: WS };
const E2: PorteeConnaissance = { niveau: 'espace', workspaceId: WS2 };
const M: PorteeConnaissance = { niveau: 'marque', workspaceId: WS, brandId: BR };
const Mb: PorteeConnaissance = { niveau: 'marque', workspaceId: WS, brandId: BR3 };
const M2: PorteeConnaissance = { niveau: 'marque', workspaceId: WS2, brandId: BR2 };

describe('changementPortee · matrice complète', () => {
  const CAS: Array<[string, PorteeConnaissance, PorteeConnaissance, 'elargie' | 'deplacee' | null]> = [
    // Reproduction · un niveau plus étroit HORS de l'espace d'origine.
    ['espace A → marque d’un espace B', E, M2, 'deplacee'],
    // Resserrements qui restent chez eux (sous-ensemble des lecteurs).
    ['espace A → marque de A', E, M, null],
    ['plateforme → espace', P, E, null],
    ['plateforme → marque', P, M, null],
    // Même niveau.
    ['plateforme → plateforme', P, P, null],
    ['espace A → espace A', E, E, null],
    ['espace A → espace B', E, E2, 'deplacee'],
    ['marque → même marque', M, M, null],
    ['marque → autre marque du même espace', M, Mb, 'deplacee'],
    ['marque → marque d’un autre espace', M, M2, 'deplacee'],
    // Élargissements.
    ['marque → espace de la marque', M, E, 'elargie'],
    ['marque → plateforme', M, P, 'elargie'],
    ['espace → plateforme', E, P, 'elargie'],
    ['marque de A → espace B', M, E2, 'elargie'],
  ];
  for (const [nom, avant, apres, attendu] of CAS) {
    it(`${nom} → ${attendu ?? 'aucune confirmation'}`, () => {
      expect(changementPortee(avant, apres)).toBe(attendu);
    });
  }
});

