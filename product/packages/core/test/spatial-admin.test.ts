import { describe, expect, it } from 'vitest';
import {
  adminDuree, adminEuros, adminIlYa, adminPourcent, adminVariation, alertesPlateforme, attendReponse, barresUsage, bibliothequePrompts, caseDroit,
  comptesARisque, coutsParFournisseur, estEnEssai, estPayant, etatAttente, fluxDirect, indicateursSav, inscriptions, ligneRisqueAffichee, ltvMoyenne,
  margeBrutePonderee, margesOperations, mrrPlateforme, niveauRisque, noteRepartitionMrr, parcoursInscription, partsMrr, rapprochementStripe,
  rentabiliteForfaits, resiliationsParMois, roleVoitRubrique, rubriquesApresBascule, signauxRisque, tauxChurn30, traceMrr, MARGE_CIBLE_PCT, VALEUR_ABSENTE,
  type EspacePlateforme, type TarifsPlateforme, type TicketPlateforme,
} from '../src';

const MAINTENANT = new Date('2026-10-27T12:00:00Z');
const J = 86_400_000;
const ilYa = (jours: number) => new Date(MAINTENANT.getTime() - jours * J);

const TARIFS: TarifsPlateforme = {
  ordre: ['starter', 'core', 'plus', 'business'],
  libelles: { starter: 'Starter', core: 'Core', plus: 'Plus', business: 'Business' },
  prix: { starter: 0, core: 99, plus: 299, business: 990 },
  credits: { starter: 200, core: 2000, plus: 7000, business: 24000 },
};

const espace = (o: Partial<EspacePlateforme> = {}): EspacePlateforme => ({
  id: 'w', nom: 'Espace', forfait: 'core', type: 'normal', creeLe: ilYa(100), onboardeLe: ilYa(99), essaiFinLe: null,
  abonnementStripe: true, statutAbonnement: 'active', solde: 500, conso30: 100, aConsomme: true, derniereActivite: ilYa(2),
  ticketsSansReponse: 0, profil: null, ...o,
});

describe('Tour de contrôle · qui est payant, et le MRR', () => {
  it('payant = formule à prix + abonnement Stripe actif ou en retard · une formule posée à la main ne compte pas', () => {
    expect(estPayant(espace(), TARIFS)).toBe(true);
    expect(estPayant(espace({ statutAbonnement: 'past_due' }), TARIFS)).toBe(true);
    expect(estPayant(espace({ abonnementStripe: false }), TARIFS)).toBe(false);
    expect(estPayant(espace({ statutAbonnement: 'trialing' }), TARIFS)).toBe(false);
    expect(estPayant(espace({ statutAbonnement: 'canceled' }), TARIFS)).toBe(false);
    expect(estPayant(espace({ forfait: 'starter' }), TARIFS)).toBe(false);
  });

  it('le MRR additionne les seuls payants, par formule payante, dans l’ordre des tarifs', () => {
    const m = mrrPlateforme([espace(), espace({ forfait: 'plus' }), espace({ abonnementStripe: false, forfait: 'business' }), espace({ forfait: 'starter' })], TARIFS);
    expect(m.mrr).toBe(99 + 299);
    expect(m.arr).toBe((99 + 299) * 12);
    expect(m.payants).toBe(2);
    expect(m.arpu).toBe(199);
    expect(m.parForfait.map((l) => [l.forfait, l.abonnes, l.mrr])).toEqual([['core', 1, 99], ['plus', 1, 299], ['business', 0, 0]]);
    expect(mrrPlateforme([], TARIFS).arpu).toBeNull();
  });

  it('un essai · date de fin future, ou abonnement Stripe en essai', () => {
    expect(estEnEssai(espace({ essaiFinLe: new Date(MAINTENANT.getTime() + J) }), MAINTENANT)).toBe(true);
    expect(estEnEssai(espace({ essaiFinLe: ilYa(1) }), MAINTENANT)).toBe(false);
    expect(estEnEssai(espace({ statutAbonnement: 'trialing' }), MAINTENANT)).toBe(true);
  });
});

describe('Tour de contrôle · risque (des faits, pas un score)', () => {
  it('chaque signal se lit en base, et seulement lui', () => {
    expect(signauxRisque(espace(), MAINTENANT)).toEqual([]);
    expect(signauxRisque(espace({ statutAbonnement: 'past_due', derniereActivite: ilYa(31), solde: 0, onboardeLe: null, ticketsSansReponse: 2 }), MAINTENANT))
      .toEqual(['Paiement en retard', 'Aucune activité depuis 31 jours', 'Crédits épuisés', 'Onboarding non terminé', '2 tickets sans réponse']);
    expect(signauxRisque(espace({ derniereActivite: null }), MAINTENANT)).toEqual(['Aucune consommation depuis l’inscription']);
  });

  it('l’inactivité commence à 30 jours (définition de l’ancien tableau de bord)', () => {
    expect(signauxRisque(espace({ derniereActivite: ilYa(29) }), MAINTENANT)).toEqual([]);
    expect(signauxRisque(espace({ derniereActivite: ilYa(30) }), MAINTENANT)).toEqual(['Aucune activité depuis 30 jours']);
  });

  it('critique · un défaut de paiement suffit, ou deux signaux · attention · un seul', () => {
    expect(niveauRisque(espace({ statutAbonnement: 'past_due' }), MAINTENANT)).toBe('critique');
    expect(niveauRisque(espace({ solde: 0, onboardeLe: null }), MAINTENANT)).toBe('critique');
    expect(niveauRisque(espace({ solde: 0 }), MAINTENANT)).toBe('attention');
    expect(niveauRisque(espace(), MAINTENANT)).toBe('sain');
  });

  it('les comptes à risque · payants ou en essai, critiques d’abord, puis le plus de signaux, puis le MRR', () => {
    const l = comptesARisque([
      espace({ id: 'a', nom: 'A', solde: 0 }),
      espace({ id: 'b', nom: 'B', forfait: 'plus', solde: 0 }),
      espace({ id: 'c', nom: 'C', statutAbonnement: 'past_due' }),
      espace({ id: 'd', nom: 'D', abonnementStripe: false, solde: 0 }), // ni payant ni en essai · hors liste
      espace({ id: 'e', nom: 'E', abonnementStripe: false, essaiFinLe: new Date(MAINTENANT.getTime() + J), onboardeLe: null }),
      espace({ id: 'f', nom: 'F' }), // aucun signal
    ], TARIFS, MAINTENANT);
    expect(l.map((c) => c.id)).toEqual(['c', 'b', 'a', 'e']);
    expect(l.find((c) => c.id === 'e')!.essai).toBe(true);
    expect(ligneRisqueAffichee(l[0]!, TARIFS)).toMatchObject({ cles: ['core', 'critique'], risque: { libelle: '1 signal', classe: 'r' }, prix: '99 € / mois' });
    expect(ligneRisqueAffichee(l[3]!, TARIFS)).toMatchObject({ forfait: { libelle: 'Essai', classe: 'c' }, prix: 'Essai', cles: ['core', 'essai'] });
  });
});

describe('Tour de contrôle · churn, inscriptions, rapprochement', () => {
  it('churn 30 j · résiliations ÷ (payants + résiliés) · `null` sur une base vide, jamais 0 %', () => {
    expect(tauxChurn30(1, 9)).toBe(10);
    expect(tauxChurn30(0, 10)).toBe(0);
    expect(tauxChurn30(0, 0)).toBeNull();
  });

  it('les résiliations par mois calendaire · hauteur relative au mois le plus fort, rien d’inventé quand tout vaut 0', () => {
    const r = resiliationsParMois([new Date(2026, 9, 3), new Date(2026, 9, 20), new Date(2026, 8, 1)], new Date(2026, 9, 27), 3);
    expect(r.map((m) => [m.libelle, m.n, m.hauteur, m.enCours])).toEqual([['août', 0, 0, false], ['sept.', 1, 50, false], ['oct.', 2, 100, true]]);
    expect(resiliationsParMois([], MAINTENANT, 2).every((m) => m.hauteur === 0)).toBe(true);
  });

  it('LTV · `null` dès qu’un terme manque (aucun départ mesuré)', () => {
    expect(ltvMoyenne(100, 80, 4)).toBe(2000);
    expect(ltvMoyenne(100, 80, 0)).toBeNull();
    expect(ltvMoyenne(null, 80, 4)).toBeNull();
  });

  it('inscriptions · fenêtre de 30 jours, variation, essais, conversion', () => {
    const l = [
      espace({ creeLe: ilYa(5) }), espace({ creeLe: ilYa(10), abonnementStripe: false, essaiFinLe: new Date(MAINTENANT.getTime() + 3 * J) }),
      espace({ creeLe: ilYa(40) }),
    ];
    const i = inscriptions(l, TARIFS, MAINTENANT);
    expect([i.n30, i.precedents30, i.variationPct, i.essaisEnCours, i.essaisFinDans7j, i.conversionPct]).toEqual([2, 1, 100, 1, 1, 50]);
    expect(inscriptions([], TARIFS, MAINTENANT).conversionPct).toBeNull();
  });

  it('le parcours d’inscription · chaque étape est un sous-ensemble de la précédente', () => {
    const l = [
      espace({ creeLe: ilYa(1) }),
      espace({ creeLe: ilYa(2), aConsomme: false }),
      espace({ creeLe: ilYa(3), onboardeLe: null }), // payant sans onboarding · reste à l'étape 1
      espace({ creeLe: ilYa(4), abonnementStripe: false }),
    ];
    expect(parcoursInscription(l, TARIFS, MAINTENANT).map((e) => [e.libelle, e.n])).toEqual([['Inscrits', 4], ['Onboarding terminé', 3], ['1re consommation', 2], ['Payants', 1]]);
  });

  it('rapprochement Stripe · une formule payante sans abonnement actif est un écart · comptes de test exclus', () => {
    const r = rapprochementStripe([espace(), espace({ id: 'x', nom: 'X', abonnementStripe: false }), espace({ type: 'beta', abonnementStripe: false }), espace({ forfait: 'starter' })], TARIFS);
    expect([r.attendus, r.rattaches, r.ecarts.map((e) => e.nom)]).toEqual([2, 1, ['X']]);
  });
});

describe('Tour de contrôle · rentabilité et coûts', () => {
  it('marge par formule · prix − coût IA pire cas − frais de paiement (modèle économique du code)', () => {
    const [core] = rentabiliteForfaits([{ forfait: 'core', libelle: 'Core', prix: 99, credits: 2000, abonnes: 1, mrr: 99 }], 3);
    // 2000 crédits × 0,05 € ÷ 3 = 33,33 € · frais 99 × 2,9 % + 0,30 € = 3,171 €
    expect(core!.coutIaPireCas).toBeCloseTo(33.333, 2);
    expect(core!.fraisPaiement).toBeCloseTo(3.171, 3);
    expect(core!.margePct).toBeCloseTo(((99 - 33.333 - 3.171) / 99) * 100, 1);
  });

  it('marge pondérée par le MRR · `null` sans revenu', () => {
    const r = rentabiliteForfaits([{ forfait: 'core', libelle: 'Core', prix: 99, credits: 2000, abonnes: 0, mrr: 0 }]);
    expect(margeBrutePonderee(r)).toBeNull();
  });

  it('coûts par fournisseur · triés, part du total, largeur relative au plus gros', () => {
    const c = coutsParFournisseur([{ fournisseur: 'fal', usd: 1, appels: 3 }, { fournisseur: 'anthropic', usd: 3, appels: 9 }]);
    expect(c.map((x) => [x.fournisseur, x.part, Math.round(x.largeur)])).toEqual([['anthropic', 75, 100], ['fal', 25, 33]]);
  });

  it('marge par opération · de la plus fragile à la plus confortable, « à revoir » sous la cible de l’écran Finance', () => {
    const m = margesOperations();
    expect(m.length).toBeGreaterThan(5);
    for (let i = 1; i < m.length; i++) expect(m[i]!.margePct).toBeGreaterThanOrEqual(m[i - 1]!.margePct);
    for (const o of m) expect(o.aRevoir).toBe(o.margePct < MARGE_CIBLE_PCT);
    const video = m.find((o) => o.action === 'video')!;
    expect(video.revenuEur).toBeCloseTo(1, 5); // 20 crédits × 0,05 €
    expect(video.margePct).toBeCloseTo(65, 5);
  });

  it('le tracé du MRR · aucune ligne sous deux points connus, les mois sans relevé ne sont pas interpolés', () => {
    expect(traceMrr([null, null, 120])).toBeNull();
    const t = traceMrr([100, null, 200])!;
    expect(t.ligne.split(' L')).toHaveLength(2);
    expect(t.ligne.startsWith('M8.0')).toBe(true);
  });

  it('la note de répartition · la formule en tête, et les comptes au-delà de leur dotation', () => {
    const parts = partsMrr([{ forfait: 'core', libelle: 'Core', prix: 99, credits: 0, abonnes: 3, mrr: 297 }, { forfait: 'plus', libelle: 'Plus', prix: 299, credits: 0, abonnes: 0, mrr: 0 }]);
    expect(noteRepartitionMrr(parts, { core: 2 })).toBe('Core porte 100 % du MRR. 2 comptes Core ont consommé plus que leur dotation sur 30 jours : candidats à Plus.');
    expect(noteRepartitionMrr(parts, {})).toBe('Core porte 100 % du MRR.');
    expect(noteRepartitionMrr(partsMrr([]), {})).toBeNull();
  });
});

describe('Tour de contrôle · tickets du support', () => {
  const t = (o: Partial<TicketPlateforme>): TicketPlateforme => ({
    id: 'abcdef12-0000', espaceId: 'w', espace: 'E', auteur: 'A', type: 'bug', titre: 'T', corps: '', statut: 'open',
    creeLe: ilYa(1), majLe: ilYa(1), messages: [], ...o,
  });

  it('un ticket attend l’équipe quand le dernier message n’est pas d’elle', () => {
    expect(attendReponse(t({}))).toBe(true);
    expect(attendReponse(t({ messages: [{ auteur: 'A', corps: 'x', equipe: false, le: ilYa(1) }] }))).toBe(true);
    expect(attendReponse(t({ messages: [{ auteur: 'S', corps: 'x', equipe: true, le: ilYa(1) }] }))).toBe(false);
    expect(attendReponse(t({ statut: 'resolved' }))).toBe(false);
  });

  it('les délais se MESURENT · médiane de la 1re réponse d’équipe et de la résolution, sur 30 jours', () => {
    const debut = new Date(MAINTENANT.getTime() - 3 * 3_600_000);
    const i = indicateursSav([
      t({ creeLe: debut, messages: [{ auteur: 'S', corps: 'x', equipe: true, le: new Date(debut.getTime() + 30 * 60_000) }] }),
      t({ creeLe: debut, messages: [{ auteur: 'S', corps: 'x', equipe: true, le: new Date(debut.getTime() + 90 * 60_000) }] }),
      t({ statut: 'resolved', creeLe: debut, majLe: new Date(debut.getTime() + 120 * 60_000) }),
      t({ statut: 'in_progress' }),
    ], MAINTENANT);
    expect([i.ouverts, i.sansReponse, i.premiereReponseMin, i.reponsesMesurees, i.resolutionMin, i.resolutionsMesurees]).toEqual([3, 1, 60, 2, 120, 1]);
  });

  it('l’état d’attente · un fait daté, jamais un délai contractuel', () => {
    expect(etatAttente(t({ creeLe: ilYa(1) }), MAINTENANT, adminDuree)).toEqual({ classe: 'r', texte: 'En attente de réponse depuis 1 j' });
    expect(etatAttente(t({ statut: 'resolved', creeLe: ilYa(1), majLe: new Date(ilYa(1).getTime() + 3_600_000) }), MAINTENANT, adminDuree)).toEqual({ classe: 'g', texte: 'Résolu en 1 h' });
  });
});

describe('Tour de contrôle · alertes, flux, usage, prompts, droits', () => {
  const calme = { depensePct: 10, depenseResume: '', depensesAReconcilier: 0, defautsPaiement: 0, mrrEnDefaut: 0, ticketsSansReponse: 0, payantsSansCredit: 0 };

  it('aucune alerte sans fait · la dépense alerte à 80 % du plafond (seuil de l’écran Dépense IA)', () => {
    expect(alertesPlateforme(calme)).toEqual([]);
    expect(alertesPlateforme({ ...calme, depensePct: 79.9 })).toEqual([]);
    expect(alertesPlateforme({ ...calme, depensePct: 80 })[0]).toMatchObject({ ton: 'w', lien: { href: '/admin/depenses' } });
    expect(alertesPlateforme({ ...calme, defautsPaiement: 2, mrrEnDefaut: 198, ticketsSansReponse: 1 }).map((a) => a.titre)).toEqual(['2 paiements en défaut sur Stripe', '1 ticket sans réponse']);
  });

  it('le flux en direct · le plus récent d’abord, limité', () => {
    const f = fluxDirect([
      { type: 'inscription', espace: 'A', le: ilYa(3) }, { type: 'recharge', espace: 'B', le: ilYa(1), credits: 5000 }, { type: 'ticket', espace: 'C', le: ilYa(2), detail: 'Bug' },
    ], MAINTENANT, 2);
    expect(f.map((l) => [l.espace, l.pastille.libelle])).toEqual([['B', '+5\u202f000 crédits'], ['C', 'Bug']]);
  });

  it('les barres d’usage · relatives au plus gros, jamais sous 2 %, 0 pour un poste nul', () => {
    expect(barresUsage([{ libelle: 'a', n: 1000 }, { libelle: 'b', n: 1 }, { libelle: 'c', n: 0 }]).map((b) => b.largeur)).toEqual([100, 2, 0]);
  });

  it('la bibliothèque · une entrée par clé (dernière version), sa famille, sa version en production', () => {
    const v = (type: 'recette' | 'template' | 'socle', cle: string, version: string) => ({ type, cle, titre: cle, version, statut: 'validated', creeLe: ilYa(1), auteur: null });
    const b = bibliothequePrompts([v('recette', 'pixar', '1.2.0'), v('recette', 'pixar', '1.1.0'), v('template', 'ads', '1.0.0'), v('socle', 'commun', '2.0.0')], new Map([['recette:pixar', '1.1.0']]), new Map([['ads', 7]]));
    expect(b.styles.map((e) => [e.cle, e.derniere, e.versions, e.enProduction, e.utilisations])).toEqual([['pixar', '1.2.0', 2, '1.1.0', null]]);
    expect(b.skills.map((e) => [e.cle, e.utilisations])).toEqual([['ads', 7]]);
    expect(b.regles.map((e) => e.cle)).toEqual(['commun']);
  });

  it('la case de droit est binaire, et un clic ouvre ou ferme la rubrique du rôle (ordre canonique)', () => {
    expect(caseDroit('manager', 'veille')).toEqual({ niveau: 2, libelle: 'Accès', voit: true });
    expect(caseDroit('lecture', 'veille')).toEqual({ niveau: 0, libelle: 'Aucun', voit: false });
    const fermee = rubriquesApresBascule('lecture', 'dashboard');
    expect(fermee).toEqual(['analytics', 'saved']);
    const ouverte = rubriquesApresBascule('lecture', 'veille', { lecture: fermee });
    expect(ouverte).toEqual(['analytics', 'veille', 'saved']);
    expect(roleVoitRubrique('lecture', 'veille', { lecture: ouverte })).toBe(true);
    expect(rubriquesApresBascule('lecture', 'inconnue', { lecture: fermee })).toEqual(fermee);
  });
});

describe('Tour de contrôle · formats', () => {
  it('montants, parts, durées, dates relatives et variations', () => {
    // fr-FR · séparateur de milliers = espace fine insécable (U+202F), comme la maquette.
    expect(adminEuros(48255)).toBe('48\u202f255 €');
    expect(adminEuros(122.16)).toBe('122,16 €');
    expect(adminEuros(null)).toBe(VALEUR_ABSENTE);
    expect(adminPourcent(3.14)).toBe('3,1 %');
    expect(adminDuree(38)).toBe('38 min');
    expect(adminDuree(312)).toBe('5 h 12');
    expect(adminDuree(60 * 52)).toBe('2 j 4 h');
    expect(adminIlYa(new Date(MAINTENANT.getTime() - 4 * 60_000), MAINTENANT)).toBe('il y a 4 min');
    expect(adminIlYa(ilYa(1), MAINTENANT)).toBe('hier');
    expect(adminVariation(14.2, 'x')).toEqual({ texte: '▲ +14 %', classe: 'up' });
    expect(adminVariation(-6, 'x')).toEqual({ texte: '▼ −6 %', classe: 'dn' });
    expect(adminVariation(null, 'aucune')).toEqual({ texte: 'aucune', classe: '' });
  });
});
