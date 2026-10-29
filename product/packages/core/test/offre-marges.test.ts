import { describe, expect, it } from 'vitest';
import {
  ACTIONS_BAREME, BAREME_V2, BORNE_EUR_PAR_CREDIT, COUT_REFERENCE_ACTION, CREDIT_COSTS, FACTEUR_UNITE, FORFAITS_V2, IMAGE_MODELS,
  MARGE_CIBLE, MARGE_PLANCHER_RECHARGE, coutEurParCreditImageV2, coutEurParCreditV2, creditsActuels, creditsMaxPourMarge,
  creditsPourCoutUsd, creditsPourCoutUsdMicros, creditsV2Image, nomForfait, pireCoutEurParCreditV2, prixEcheanceTtc,
  tableauMargesRecharges, tableauMargesV2, type CreditAction,
} from '../src';

/**
 * L'offre V2 · la marge brute au PIRE CAS (décision du 29/10, point 2).
 *
 * Tableau MESURÉ (29/10, `tableauMargesV2`) · prix TTC, TVA France 20 %, frais
 * Stripe 2,9 % + 0,30 € + Billing 0,7 % + Tax 0,5 %, pire cas = 100 % des
 * crédits à 0,001 € (la borne ; mesure du barème fixe : vidéo, 0,000991 €) :
 *
 *   forfait    facturation  prix/mois  crédits  pire cas  pire +20 %  50 % consommé
 *   Essentiel  mensuel      29,00      4 000    77,3 %    74,0 %      85,6 %
 *   Essentiel  annuel       20,30      4 000    71,3 %    66,6 %      83,1 %
 *   Pro        mensuel      49,00      7 000    77,2 %    73,8 %      85,8 %
 *   Pro        annuel       34,30      7 000    70,5 %    65,6 %      82,7 %
 *   Agence     mensuel     129,00     18 500    77,6 %    74,1 %      86,2 %
 *   Agence     annuel       90,30     18 500    70,5 %    65,5 %      82,8 %
 *
 * Plafond mesuré au pire cas annuel (`creditsMaxPourMarge`, au cent) ·
 * 4 200 / 7 100 / 18 800. La grille retenue (4 000 / 7 000 / 18 500) garde de
 * la marge sous ce plafond.
 *
 * Recharges (pire cas, paiement unique) · plus bas mesuré 63,1 % (2 000
 * crédits au prix Agence, 8,40 €) · aucune vente à perte, plancher 60 %.
 */
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;

describe('offre V2 · marges au pire cas', () => {
  it('chaque forfait, mensuel ET annuel, tient la cible au pire cas', () => {
    const fautes = tableauMargesV2()
      .filter((l) => l.pireCas < MARGE_CIBLE)
      .map((l) => `${nomForfait(l.forfait)} ${l.facturation} : ${pct(l.pireCas)} au pire cas, sous la cible de ${pct(MARGE_CIBLE)}`);
    expect(fautes).toEqual([]);
  });

  it('le tableau mesuré est celui écrit en tête de ce fichier', () => {
    const lu = tableauMargesV2().map((l) => [l.forfait, l.facturation, l.prixMensuelTtc, l.credits, pct(l.pireCas), pct(l.pireCasPlus20), pct(l.moitie)]);
    expect(lu).toEqual([
      ['essentiel', 'mensuel', 29, 4000, '77,3 %', '74,0 %', '85,6 %'],
      ['essentiel', 'annuel', 20.3, 4000, '71,3 %', '66,6 %', '83,1 %'],
      ['pro', 'mensuel', 49, 7000, '77,2 %', '73,8 %', '85,8 %'],
      ['pro', 'annuel', 34.3, 7000, '70,5 %', '65,6 %', '82,7 %'],
      ['agence', 'mensuel', 129, 18500, '77,6 %', '74,1 %', '86,2 %'],
      ['agence', 'annuel', 90.3, 18500, '70,5 %', '65,5 %', '82,8 %'],
    ]);
  });

  it('la grille reste sous le plafond mesuré au pire cas annuel', () => {
    expect((['essentiel', 'pro', 'agence'] as const).map((k) => creditsMaxPourMarge(k))).toEqual([4200, 7100, 18800]);
    for (const k of ['essentiel', 'pro', 'agence'] as const) expect(FORFAITS_V2[k].creditsMois).toBeLessThanOrEqual(creditsMaxPourMarge(k));
  });

  it('prix · 29 / 49 / 129 € TTC par mois, annuel −30 %', () => {
    expect([29, 49, 129]).toEqual((['essentiel', 'pro', 'agence'] as const).map((k) => prixEcheanceTtc(k, 'mensuel')));
    expect([243.6, 411.6, 1083.6]).toEqual((['essentiel', 'pro', 'agence'] as const).map((k) => prixEcheanceTtc(k, 'annuel')));
  });

  it('aucune recharge ne se vend à perte, ni sous le plancher', () => {
    const r = tableauMargesRecharges();
    const fautes = r.filter((x) => x.pireCas < MARGE_PLANCHER_RECHARGE).map((x) => `recharge ${x.credits} crédits (${nomForfait(x.forfait)}, ${x.eur.toLocaleString('fr-FR')} €) : ${pct(x.pireCas)}`);
    expect(fautes).toEqual([]);
    expect(pct(Math.min(...r.map((x) => x.pireCas)))).toBe('63,1 %');
  });
});

describe('barème V2 · un crédit coûte au plus la borne, quelle que soit l’action', () => {
  it('chaque action à prix fixe et chaque moteur d’image', () => {
    const fautes = [
      ...ACTIONS_BAREME.filter((a) => coutEurParCreditV2(a) > BORNE_EUR_PAR_CREDIT).map((a) => `${a} : ${coutEurParCreditV2(a).toFixed(6)} € par crédit`),
      ...IMAGE_MODELS.filter((m) => coutEurParCreditImageV2(m.key) > BORNE_EUR_PAR_CREDIT).map((m) => `image ${m.key} : ${coutEurParCreditImageV2(m.key).toFixed(6)} € par crédit`),
    ];
    expect(fautes).toEqual([]);
    expect(pireCoutEurParCreditV2().action).toBe('video');
  });

  it('chaque action débitée aujourd’hui a un coût de référence, et aucune ne devient moins chère', () => {
    for (const a of Object.keys(CREDIT_COSTS) as CreditAction[]) {
      expect(COUT_REFERENCE_ACTION[a]?.usd, `${a} sans coût de référence`).toBeGreaterThan(0);
      expect(BAREME_V2[a]).toBeGreaterThanOrEqual(creditsActuels(a)! * FACTEUR_UNITE);
    }
    for (const m of IMAGE_MODELS) expect(creditsV2Image(m.key)).toBeGreaterThanOrEqual(m.credits * FACTEUR_UNITE);
  });

  it('les appels aujourd’hui gratuits ont un prix V2', () => {
    expect(creditsActuels('jarvis_message')).toBeNull();
    expect(BAREME_V2.jarvis_message).toBe(35);
    expect(BAREME_V2.brouillon_concept).toBe(60);
    expect(BAREME_V2.video).toBe(325);
  });

  it('un appel à coût borné se convertit au plus juste, jamais en dessous', () => {
    expect(creditsPourCoutUsdMicros(0)).toBe(0);
    expect(creditsPourCoutUsdMicros(1)).toBe(1);
    expect(creditsPourCoutUsdMicros(147_024)).toBe(136); // contrôle visuel, borne par image (Sonnet 5)
    expect(creditsPourCoutUsd(0.06)).toBe(56);
    for (const micros of [1, 999, 1087, 10_000, 147_024, 1_234_567]) {
      expect((micros / 1e6) * 0.92 / creditsPourCoutUsdMicros(micros)).toBeLessThanOrEqual(BORNE_EUR_PAR_CREDIT + 1e-12);
    }
  });
});
