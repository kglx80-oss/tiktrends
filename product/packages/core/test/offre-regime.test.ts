import { describe, expect, it } from 'vitest';
import {
  BAREME_V2, CREDIT_COSTS, annonceBrouillonJarvis, annonceConversationJarvis, coutActionRegime, creditsAnalyseRadar, creditsAppelAnnonce,
  creditsAppelAnnonceMicros, debitApresAppel, mentionAppelTexte, regimeTarifaire, tarifsV2Actifs, type CreditAction,
} from '../src';

/**
 * Débit en crédits des appels aujourd'hui gratuits (décision du 29/10, point 4)
 * · derrière `TARIFS_V2` et seulement pour un forfait V2. Sans l'interrupteur,
 * RIEN ne change de ce que le client paie : la preuve est ici.
 */
const TOUS = ['starter', 'core', 'plus', 'business', 'essentiel', 'pro', 'agence', 'inconnu', null] as const;

describe('régime tarifaire', () => {
  it('sans TARIFS_V2 · tout espace reste au régime actuel, quel que soit son forfait', () => {
    expect(tarifsV2Actifs({})).toBe(false);
    expect(tarifsV2Actifs({ TARIFS_V2: '0' })).toBe(false);
    for (const p of TOUS) expect(regimeTarifaire(p, false), String(p)).toBe('actuel');
  });

  it('avec TARIFS_V2 · seuls Essentiel, Pro et Agence passent en V2 · un abonné actuel garde son régime jusqu’à l’échéance', () => {
    expect(tarifsV2Actifs({ TARIFS_V2: '1' })).toBe(true);
    expect(TOUS.map((p) => regimeTarifaire(p, true))).toEqual(['actuel', 'actuel', 'actuel', 'actuel', 'v2', 'v2', 'v2', 'actuel', 'actuel']);
  });

  it('régime actuel · le barème d’aujourd’hui, et les appels gratuits restent inclus (aucun débit)', () => {
    for (const a of Object.keys(CREDIT_COSTS) as CreditAction[]) expect(coutActionRegime(a, 'actuel')).toBe(CREDIT_COSTS[a]);
    expect(coutActionRegime('jarvis_message', 'actuel')).toBeNull();
    expect(coutActionRegime('brouillon_concept', 'actuel')).toBeNull();
    expect(creditsAnalyseRadar('actuel')).toBeNull();
    expect(creditsAppelAnnonce('actuel', 0.5)).toBeNull();
    expect(creditsAppelAnnonceMicros('actuel', 147_024)).toBeNull();
    expect(annonceConversationJarvis('actuel')).toBe('Conversation incluse · aucun crédit débité par message.');
    expect(annonceBrouillonJarvis('actuel')).toBe('inclus, aucun crédit débité');
    expect(mentionAppelTexte('actuel', 0.13)).toBe('Appel IA · inclus · aucun crédit débité');
  });

  it('régime V2 · le barème recalibré, et chaque appel a un prix en crédits annoncé', () => {
    expect(coutActionRegime('jarvis_message', 'v2')).toBe(BAREME_V2.jarvis_message);
    expect(coutActionRegime('video', 'v2', 2)).toBe(BAREME_V2.video * 2);
    expect(creditsAnalyseRadar('v2')).toBe(BAREME_V2.asset_analysis);
    expect(creditsAppelAnnonceMicros('v2', 147_024)).toBe(136);
    expect(annonceConversationJarvis('v2')).toBe('35 crédits au plus par message · ajustés au coût réel, rendus si Jarvis ne répond pas.');
    expect(mentionAppelTexte('v2', 0.13)).toBe('Appel IA · environ 120 crédits (estimation) · ajustés au coût réel');
    for (const s of [annonceConversationJarvis('v2'), annonceBrouillonJarvis('v2'), mentionAppelTexte('v2', 0.13)]) expect(s).not.toMatch(/\$|€/);
  });

  it('le débit final ne dépasse jamais l’annonce, suit le coût réel, et vaut au moins un crédit', () => {
    expect(debitApresAppel(35, 0.01)).toBe(10);
    expect(debitApresAppel(35, 1)).toBe(35);
    expect(debitApresAppel(35, 0)).toBe(1);
    expect(debitApresAppel(35, null)).toBe(35);
    expect(debitApresAppel(0, 0.5)).toBe(0);
  });
});
