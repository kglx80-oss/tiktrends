import { describe, expect, it } from 'vitest';
import {
  chiffresClesMeta, encartKpiJarvisMeta, etatConnexionMeta, fenetreChiffresMeta, perfAnnoncesSuivies,
  type EntreeChiffresMeta, type JourneeAnnonceMeta,
} from '../src';

/**
 * D2 (planche finale) · LES chiffres clés Meta · une source, une fenêtre, les
 * mêmes valeurs pour l'Accueil, Analytics, Jarvis et le Radar. On vérifie ce
 * qui SORT · la source retenue, la phrase qui la dit, les valeurs formatées.
 */
const MAINTENANT = new Date('2026-10-29T10:00:00Z');
const AUJ = '2026-10-29';
const HEURE = 3_600_000;
const synchronise = etatConnexionMeta({ jeton: true, compte: true, comptes: 1, kpiLe: null, mesuresLe: new Date(MAINTENANT.getTime() - 30 * HEURE) }, MAINTENANT);
const nonConnecte = etatConnexionMeta({ jeton: false, compte: false, comptes: 0, kpiLe: null, mesuresLe: new Date(MAINTENANT.getTime() - 30 * HEURE) }, MAINTENANT);
const aChoisir = etatConnexionMeta({ jeton: true, compte: false, comptes: 2, kpiLe: null, mesuresLe: null }, MAINTENANT);

const jour = (annonce: string, date: string, v: Partial<JourneeAnnonceMeta> = {}): JourneeAnnonceMeta => ({
  annonce, nom: `Pub ${annonce}`, date, depense: 0, impressions: 0, clics: 0, achats: 0, revenu: 0, vues3s: 0, vues75: 0, ...v,
});
const COMPTE = {
  window: { spend: 1200, revenue: 3000, purchases: 60, cpa: 20 },
  previous: { spend: 1000, revenue: 2000, purchases: 40, cpa: 25 },
  releveLe: new Date('2026-10-21T08:00:00Z'), creas: 12,
};
const entree = (v: Partial<EntreeChiffresMeta>): EntreeChiffresMeta => ({ connexion: synchronise, compte: null, annonces: null, aujourdhui: AUJ, ...v });
const valeurs = (c: ReturnType<typeof chiffresClesMeta>) => Object.fromEntries(c.kpis.map((k) => [k.cle, k.valeur]));
const sp = (t: string) => t.replace(/\s/g, ' ');

describe('chiffresClesMeta · la fenêtre', () => {
  it('30 jours finissant hier (la journée en cours n’est pas close chez Meta), et les 30 précédents', () => {
    const f = fenetreChiffresMeta(AUJ);
    expect([f.debut, f.fin, f.precDebut, f.precFin]).toEqual(['2026-09-29', '2026-10-28', '2026-08-30', '2026-09-28']);
  });
});

describe('chiffresClesMeta · une source, par priorité', () => {
  it('1 · les KPI du compte s’ils existent · tout le compte, datés de leur relevé · même si des annonces suivies sont mesurées', () => {
    const c = chiffresClesMeta(entree({ compte: COMPTE, annonces: [jour('a', '2026-10-27', { depense: 503, revenu: 770, achats: 17 })] }));
    expect(c.source).toBe('compte');
    expect(sp(c.mention)).toBe('D’après ton compte publicitaire Meta · 30 jours au 21 oct. · 12 créas mesurées');
    expect(Object.fromEntries(c.kpis.map((k) => [k.cle, sp(k.valeur)]))).toEqual({ depense: '1 200 €', cpa: '20,00 €', roas: '2,50', valeur: '3 000 €' });
    expect(c.kpis.map((k) => k.libelle)).toEqual(['Dépense', 'CPA', 'ROAS', 'Valeur d’achat']);
    // Un CPA qui baisse est bon, un ROAS qui monte aussi · la dépense n'a pas de sens.
    expect(c.kpis.map((k) => [k.variation, k.ton])).toEqual([['▲ +20,0 %', 'neutre'], ['▼ −20,0 %', 'bon'], ['▲ +25,0 %', 'bon'], ['▲ +50,0 %', 'bon']]);
    expect(c.creas).toBe(12);
    expect(c.perfs).toEqual([]);
  });

  it('2 · sinon la mesure des annonces suivies, sur la fenêtre · dite « d’après tes annonces suivies »', () => {
    const c = chiffresClesMeta(entree({
      annonces: [
        jour('a', '2026-10-28', { depense: 300, revenu: 450, achats: 10, impressions: 10000, clics: 200, vues3s: 3000, vues75: 600 }),
        jour('b', '2026-10-01', { depense: 203, revenu: 320, achats: 7, impressions: 5000, clics: 50 }),
        jour('c', '2026-10-15'), // aucune dépense · n'est pas une créa mesurée
        jour('a', '2026-10-29', { depense: 999 }), // aujourd'hui · hors fenêtre
        jour('a', '2026-09-28', { depense: 400, revenu: 400, achats: 10 }), // période précédente
      ],
    }));
    expect(c.source).toBe('annonces');
    expect(sp(c.mention)).toBe('D’après tes annonces suivies · 30 jours au 28 oct. · 2 créas mesurées · le compte entier n’est pas encore relevé');
    expect(valeurs(c)).toEqual({ depense: '503 €', cpa: '29,59 €', roas: '1,53', valeur: '770 €' });
    expect(c.kpis.find((k) => k.cle === 'depense')!.variation).toBe('▲ +25,8 %');
    expect(c.creas).toBe(2);
    expect(c.perfs.map((p) => [p.adId, p.name, p.spend, p.ctr, p.hookRate, p.holdRate, p.roas, p.cpa])).toEqual([
      ['a', 'Pub a', 300, 2, 30, 20, 1.5, 30],
      ['b', 'Pub b', 203, 1, 0, 0, 1.58, 29],
    ]);
  });

  it('3 · sinon aucune · quatre « n.c. », aucune variation, la même phrase', () => {
    for (const e of [entree({}), entree({ annonces: [] }), entree({ annonces: [jour('a', '2026-09-20', { depense: 50 })] })]) {
      const c = chiffresClesMeta(e);
      expect(c.source).toBe('aucune');
      expect(c.mention).toBe('Aucun chiffre Meta sur les 30 derniers jours');
      expect(valeurs(c)).toEqual({ depense: 'n.c.', cpa: 'n.c.', roas: 'n.c.', valeur: 'n.c.' });
      expect(c.kpis.every((k) => k.variation === null)).toBe(true);
      expect(c.creas).toBeNull();
    }
  });

  it('une connexion à brancher ou dont le compte est à choisir n’a pas de chiffres · même avec des KPI ou une mesure anciens', () => {
    for (const connexion of [nonConnecte, aChoisir]) {
      const c = chiffresClesMeta(entree({ connexion, compte: COMPTE, annonces: [jour('a', '2026-10-27', { depense: 503 })] }));
      expect(c.source).toBe('aucune');
      expect(valeurs(c).depense).toBe('n.c.');
    }
  });
});

describe('chiffresClesMeta · rien d’inventé', () => {
  it('un ratio sans dénominateur vaut « n.c. » · une dépense nulle reste un vrai zéro', () => {
    const c = chiffresClesMeta(entree({ compte: { window: { spend: 0, revenue: 0, purchases: 0 }, previous: null, releveLe: null, creas: null } }));
    expect(c.source).toBe('compte');
    expect(sp(c.mention)).toBe('D’après ton compte publicitaire Meta · 30 jours');
    expect(valeurs(c)).toEqual({ depense: '0 €', cpa: 'n.c.', roas: 'n.c.', valeur: '0 €' });
    expect(c.kpis.every((k) => k.variation === null)).toBe(true);
  });

  it('une ancienne ligne de KPI sans nombre d’achats · le CPA de la synchro est repris, jamais recalculé à partir de rien', () => {
    const c = chiffresClesMeta(entree({ compte: { window: { spend: 1200, revenue: 3000, cpa: 20 }, previous: null, releveLe: null, creas: 1 } }));
    expect(valeurs(c).cpa).toBe('20,00 €');
    expect(sp(c.mention)).toMatch(/· 1 créa mesurée$/);
  });

  it('perfAnnoncesSuivies · bornes incluses, annonces sans dépense écartées, tri par dépense', () => {
    const p = perfAnnoncesSuivies([jour('x', '2026-10-01', { depense: 1 }), jour('y', '2026-10-31', { depense: 5 }), jour('z', '2026-10-10', { depense: 3 }), jour('w', '2026-10-05')], '2026-10-01', '2026-10-30');
    expect(p.map((x) => x.adId)).toEqual(['z', 'x']);
  });
});

describe('encartKpiJarvisMeta · Jarvis montre LES chiffres clés', () => {
  it('avec une source · les mêmes valeurs, la même phrase, la fenêtre de 30 jours', () => {
    const c = chiffresClesMeta(entree({ compte: COMPTE }));
    const e = encartKpiJarvisMeta(c, 'Synchroniser Meta Ads');
    expect(e.etat).toBe('source');
    if (e.etat !== 'source') throw new Error('attendu source');
    expect(e.entete).toBe(c.mention);
    expect(e.periode).toBe('30 derniers jours');
    expect(e.kpis.map((k) => k.valeur)).toEqual(c.kpis.map((k) => k.valeur));
  });

  it('sans chiffre · cartes vides, la phrase de la règle (jamais « aucune source branchée » à un compte branché), le geste de la connexion', () => {
    const c = chiffresClesMeta(entree({}));
    const e = encartKpiJarvisMeta(c, 'Synchroniser Meta Ads');
    expect(e.etat).toBe('vide');
    if (e.etat !== 'vide') throw new Error('attendu vide');
    expect(e.entete).toBe('Aucun chiffre Meta sur les 30 derniers jours');
    expect(e.lienLibelle).toBe('Synchroniser Meta Ads');
    expect(e.raison).not.toMatch(/brancher|branchée/i);
    expect(e.cartes.map((k) => k.cle)).toEqual(c.kpis.map((k) => k.cle));
  });
});
