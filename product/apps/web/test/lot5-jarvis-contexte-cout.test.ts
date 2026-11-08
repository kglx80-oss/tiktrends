import { describe, expect, it } from 'vitest';
import {
  actionsPromptBlock, resumerContexteJarvis, BORNES_CONTEXTE_JARVIS, BORNES_PROJETS_JARVIS, BORNES_CONCEPT_JARVIS, COUT_REFERENCE_ACTION, costOfTokens,
  type EntreeContexteJarvis, type FaitsAdSpatial, type FaitsLotSpatial,
} from '@tiktrends/core';
import { assemblerConsigneJarvis, type DonneesConversation } from '../lib/studios/prompts/conversation';
import { POLITIQUE_JARVIS_1_0_0 } from '../lib/studios/prompts/complement-tiktrends';

/**
 * Lot 5 V5 · le contexte joint garde l'estimation du barème VRAIE. On assemble
 * la consigne RÉELLE (politique 1.0.0) au plus lourd réaliste, on y joint le
 * plus gros contexte possible, et on compare l'entrée obtenue à celle que le
 * coût de référence d'un message (`jarvis_message`) laisse après la sortie
 * maximale · c'est la mesure écrite dans `BORNES_CONTEXTE_JARVIS`, refaite.
 */

const MODELE = 'claude-sonnet-5';
const SORTIE_MAX = 1200; // `max_tokens` de la route `/api/jarvis/chat`
const jetons = (t: string) => Math.ceil([...t].length / 3.5);
const fr = (n: number) => 'Les accroches en question retiennent mieux sur les peaux sèches, surtout en hiver. '.repeat(Math.ceil(n / 84)).slice(0, n);
const B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ctx = { maintenant: new Date('2026-11-08T00:00:00Z'), fenetreJours: 7 };
const H = fr(BORNES_CONTEXTE_JARVIS.valeur + 50);
const ad = (i: number): FaitsAdSpatial => ({
  id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`, variante: `V${i}`, statut: 'done', hypothese: H, variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: ['Offre', 'Page'],
  verdict: { calcule: 'loser', retenu: 'loser', statut: 'validated', comparable: true, raison: fr(400), depense: 412.5, impressions: 48210, achats: 17, cpa: 24.26 },
});
const lot = (n: number, k: number): FaitsLotSpatial => ({ id: `${String(n).padStart(8, '0')}-2222-4222-8222-222222222222`, numero: n, but: fr(300), statut: 'testing', lanceLe: '2026-10-01T00:00:00Z', ads: Array.from({ length: k }, (_, i) => ad(n * 100 + i)), protocole: null });

/** La consigne la plus lourde réaliste · chaque donnée à son plafond (connaissances à part, voir la note du module). */
const LOURDE: DonneesConversation = {
  brandName: 'Neva', memory: fr(9000), identity: fr(1500), rules: fr(2000), measuredAds: 120, canAdsmap: true, canPropose: true,
  niveau: 'avance', blocActions: actionsPromptBlock(), blocProjets: fr(BORNES_PROJETS_JARVIS.bloc),
};

describe('lot 5 · le contexte joint ne rend pas l’estimation du message fausse', () => {
  const lots = Array.from({ length: 30 }, (_, i) => lot(i + 1, 14));
  const entrees: EntreeContexteJarvis[] = [
    { type: 'lot', brandId: B, lot: lots[0]!, lots, ctx, cibleCpa: 18 },
    { type: 'hypothese', brandId: B, ad: { ...ad(1), concept: fr(300), lotId: lots[0]!.id }, lot: lots[0]!, ctx },
    { type: 'resultats', brandId: B, page: 'hypotheses', lots, horsLot: lots[1]!.ads, ctx, cibleCpa: 18 },
  ];

  it('chaque résumé, même nourri au-delà de toutes les bornes, tient sous `bloc`', () => {
    for (const e of entrees) {
      const r = resumerContexteJarvis(e, { brandId: B })!;
      expect([...r.bloc].length, e.type).toBeLessThanOrEqual(BORNES_CONTEXTE_JARVIS.bloc);
    }
  });

  it('consigne la plus lourde + plus gros contexte + sa question · sous l’entrée que laisse le coût de référence', () => {
    const entreeAdmise = Math.floor((COUT_REFERENCE_ACTION.jarvis_message.usd - costOfTokens(MODELE, 0, SORTIE_MAX)) / (costOfTokens(MODELE, 1_000_000, 0) / 1_000_000));
    expect(entreeAdmise).toBeGreaterThan(5000);
    const sans = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, LOURDE);
    for (const e of entrees) {
      const r = resumerContexteJarvis(e, { brandId: B })!;
      const avec = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, { ...LOURDE, blocContexte: r.bloc });
      const ecart = jetons(avec) - jetons(sans);
      expect(ecart, `${e.type} · écart ${ecart} jetons`).toBeLessThanOrEqual(Math.ceil(BORNES_CONTEXTE_JARVIS.bloc / 3.5) + 2);
      expect(jetons(avec) + jetons(r.question), `${e.type} · ${jetons(avec)} jetons de consigne`).toBeLessThan(entreeAdmise);
    }
  });

  it('sans contexte, la consigne est EXACTEMENT celle d’avant · et le contexte part juste avant les règles maison', () => {
    const avant = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, LOURDE);
    expect(assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, { ...LOURDE, blocContexte: '' })).toBe(avant);
    expect(assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, { ...LOURDE, blocContexte: '   ' })).toBe(avant);
    const r = resumerContexteJarvis(entrees[0]!, { brandId: B })!;
    const avec = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, { ...LOURDE, blocContexte: r.bloc });
    expect(avec.indexOf(r.bloc)).toBeGreaterThan(avec.indexOf(LOURDE.blocProjets!.slice(0, 40)));
    expect(avec.trimEnd().endsWith(LOURDE.rules!.trim())).toBe(true);
  });

  it('un projet joint n’ajoute rien · son bloc est le bloc concept existant, déjà borné', () => {
    const r = resumerContexteJarvis({ type: 'projet', brandId: B, id: B, titre: 'T', etape: 'Brief', bloc: 'CONCEPT CRÉATIF EN COURS' }, { brandId: B })!;
    expect(r.bloc).toBe('');
    expect(BORNES_CONCEPT_JARVIS.bloc).toBe(4800);
  });
});
