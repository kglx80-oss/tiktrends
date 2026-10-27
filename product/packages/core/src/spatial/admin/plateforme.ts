/**
 * Tour de contrôle (Spatial, rubrique Admin) · les métriques de la PLATEFORME,
 * calculées à partir des seules données réelles (espaces, grand livre de
 * crédits, événements Stripe, tickets). Pur · ni base, ni réseau.
 *
 * ── Ce qui compte comme « payant » ───────────────────────────────────────────
 *
 * Un espace est PAYANT quand sa formule a un prix (> 0 €), qu'il porte un
 * abonnement Stripe ET que Stripe le dit actif ou en retard de paiement
 * (`active`, `past_due`). Une formule posée à la main par le fondateur (tests,
 * démonstrations, `changePlanAction`) n'est pas un revenu · elle n'entre pas
 * dans le MRR. C'est volontairement plus strict que l'ancien tableau de bord,
 * qui additionnait le prix de la formule de TOUS les espaces.
 *
 * ── Ce qui n'est PAS calculé, faute d'historique ─────────────────────────────
 *
 * L'outil n'enregistre ni le MRR mois par mois, ni le montant perdu à une
 * résiliation, ni l'ancienneté au départ · aucune de ces valeurs n'est
 * reconstituée. Les écrans affichent l'état vide qui le dit.
 */
import { initialesAvatar } from '../avatar';
import { adminMois } from './format';

const JOUR = 86_400_000;

/** Statuts Stripe d'un abonnement qui rapporte (le retard de paiement reste dû). */
export const STATUTS_ABONNEMENT_PAYANT: readonly string[] = ['active', 'past_due'];
/** Statuts Stripe d'un paiement en défaut. */
export const STATUTS_DEFAUT_PAIEMENT: readonly string[] = ['past_due', 'unpaid'];
/**
 * Inactivité · même définition que l'ancien tableau de bord plateforme
 * (`computePlatformMetrics`) : aucun mouvement de crédits sur 30 jours.
 */
export const JOURS_INACTIVITE = 30;

/** Les tarifs effectifs (formules du code + surcharge en base `plan_config`). */
export interface TarifsPlateforme {
  /** Formules dans l'ordre d'affichage (du moins cher au plus cher). */
  ordre: readonly string[];
  libelles: Readonly<Record<string, string>>;
  prix: Readonly<Record<string, number>>;
  credits: Readonly<Record<string, number>>;
}

/** Un espace client vu de la plateforme · tout vient de la base. */
export interface EspacePlateforme {
  id: string;
  nom: string;
  forfait: string;
  /** `normal` / `beta` / `staff` (workspaces.account_kind). */
  type: string;
  creeLe: Date;
  onboardeLe: Date | null;
  essaiFinLe: Date | null;
  abonnementStripe: boolean;
  statutAbonnement: string | null;
  solde: number;
  /** Crédits débités sur les 30 derniers jours. */
  conso30: number;
  /** Au moins un débit de crédits depuis l'inscription. */
  aConsomme: boolean;
  /** Dernier mouvement du grand livre (débit ou crédit). */
  derniereActivite: Date | null;
  /** Tickets ouverts dont le dernier message n'est pas de l'équipe. */
  ticketsSansReponse: number;
  /** Profil déclaré à l'onboarding (libellé), s'il existe. */
  profil: string | null;
}

export const prixForfait = (t: TarifsPlateforme, f: string) => t.prix[f] ?? 0;
export const libelleForfait = (t: TarifsPlateforme, f: string) => t.libelles[f] ?? f;

export function estPayant(e: EspacePlateforme, t: TarifsPlateforme): boolean {
  return prixForfait(t, e.forfait) > 0 && e.abonnementStripe && STATUTS_ABONNEMENT_PAYANT.includes(e.statutAbonnement ?? '');
}

export function estEnEssai(e: EspacePlateforme, maintenant: Date): boolean {
  return (e.essaiFinLe != null && e.essaiFinLe.getTime() > maintenant.getTime()) || e.statutAbonnement === 'trialing';
}

export function enDefautDePaiement(e: EspacePlateforme): boolean {
  return STATUTS_DEFAUT_PAIEMENT.includes(e.statutAbonnement ?? '');
}

/** MRR rapporté par un espace · son prix s'il est payant, 0 sinon. */
export const mrrEspace = (e: EspacePlateforme, t: TarifsPlateforme) => (estPayant(e, t) ? prixForfait(t, e.forfait) : 0);

export interface LigneForfait { forfait: string; libelle: string; prix: number; credits: number; abonnes: number; mrr: number }

export interface MrrPlateforme {
  mrr: number;
  arr: number;
  payants: number;
  /** Revenu moyen par compte payant · `null` sans payant. */
  arpu: number | null;
  /** Les formules PAYANTES (prix > 0), dans l'ordre des tarifs. */
  parForfait: LigneForfait[];
}

export function mrrPlateforme(espaces: readonly EspacePlateforme[], t: TarifsPlateforme): MrrPlateforme {
  const parForfait: LigneForfait[] = t.ordre.filter((f) => prixForfait(t, f) > 0).map((f) => ({
    forfait: f, libelle: libelleForfait(t, f), prix: prixForfait(t, f), credits: t.credits[f] ?? 0, abonnes: 0, mrr: 0,
  }));
  let mrr = 0, payants = 0;
  for (const e of espaces) {
    if (!estPayant(e, t)) continue;
    const l = parForfait.find((x) => x.forfait === e.forfait);
    const p = prixForfait(t, e.forfait);
    mrr += p; payants += 1;
    if (l) { l.abonnes += 1; l.mrr += p; }
  }
  return { mrr, arr: mrr * 12, payants, arpu: payants ? mrr / payants : null, parForfait };
}

/** Nombre d'espaces par formule (payants ou non) · l'écran des forfaits. */
export function espacesParForfait(espaces: readonly EspacePlateforme[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of espaces) out[e.forfait] = (out[e.forfait] ?? 0) + 1;
  return out;
}

/* ──────────────────────────────── Risque ──────────────────────────────── */

export type NiveauRisque = 'critique' | 'attention' | 'sain';

/**
 * Les SIGNAUX de risque d'un espace · des faits, pas un score inventé. Chacun
 * se lit en base · paiement en défaut (Stripe), aucune consommation depuis
 * 30 jours, crédits épuisés, onboarding non terminé, ticket sans réponse.
 */
export function signauxRisque(e: EspacePlateforme, maintenant: Date): string[] {
  const s: string[] = [];
  if (e.statutAbonnement === 'past_due') s.push('Paiement en retard');
  if (e.statutAbonnement === 'unpaid') s.push('Paiement impayé');
  if (!e.derniereActivite) s.push('Aucune consommation depuis l’inscription');
  else {
    const j = Math.floor((maintenant.getTime() - e.derniereActivite.getTime()) / JOUR);
    if (j >= JOURS_INACTIVITE) s.push(`Aucune activité depuis ${j} jours`);
  }
  if (e.solde <= 0) s.push('Crédits épuisés');
  if (!e.onboardeLe) s.push('Onboarding non terminé');
  if (e.ticketsSansReponse > 0) s.push(`${e.ticketsSansReponse} ticket${e.ticketsSansReponse > 1 ? 's' : ''} sans réponse`);
  return s;
}

/**
 * Critique · un paiement en défaut, ou deux signaux et plus. Attention · un
 * signal. Sain · aucun. La règle compte des FAITS · elle ne pondère rien.
 */
export function niveauRisque(e: EspacePlateforme, maintenant: Date): NiveauRisque {
  const s = signauxRisque(e, maintenant);
  if (enDefautDePaiement(e) || s.length >= 2) return 'critique';
  return s.length === 1 ? 'attention' : 'sain';
}

export const CLASSE_RISQUE: Readonly<Record<NiveauRisque, '' | 'g' | 'w' | 'r'>> = { critique: 'r', attention: 'w', sain: 'g' };

export function libelleRisque(n: number): string {
  return n === 0 ? 'Aucun signal' : `${n} signal${n > 1 ? 'aux' : ''}`;
}

export interface CompteARisque {
  id: string; nom: string; forfait: string; libelleForfait: string;
  essai: boolean; mrr: number; niveau: NiveauRisque; signaux: string[];
}

/**
 * Les comptes à surveiller · payants ou en essai, avec au moins un signal.
 * Critiques d'abord, puis le plus de signaux, puis le plus gros MRR.
 */
export function comptesARisque(espaces: readonly EspacePlateforme[], t: TarifsPlateforme, maintenant: Date): CompteARisque[] {
  const rang: Record<NiveauRisque, number> = { critique: 0, attention: 1, sain: 2 };
  return espaces
    .filter((e) => estPayant(e, t) || estEnEssai(e, maintenant))
    .map((e) => ({
      id: e.id, nom: e.nom, forfait: e.forfait, libelleForfait: libelleForfait(t, e.forfait),
      essai: !estPayant(e, t) && estEnEssai(e, maintenant), mrr: mrrEspace(e, t),
      niveau: niveauRisque(e, maintenant), signaux: signauxRisque(e, maintenant),
    }))
    .filter((c) => c.signaux.length > 0)
    .sort((a, b) => rang[a.niveau] - rang[b.niveau] || b.signaux.length - a.signaux.length || b.mrr - a.mrr || a.nom.localeCompare(b.nom));
}

/** Le MRR porté par les comptes à risque (payants seulement). */
export const mrrARisque = (c: readonly CompteARisque[]) => c.reduce((s, x) => s + x.mrr, 0);

/* ──────────────────────────────── Churn ──────────────────────────────── */

/**
 * Résiliations par mois calendaire · une par événement Stripe
 * `customer.subscription.deleted` reçu. Hauteur = part du mois le plus fort
 * (0 à 100) · aucun mois n'est rempli quand tout vaut 0.
 */
export function resiliationsParMois(dates: readonly Date[], maintenant: Date, n = 12): Array<{ libelle: string; n: number; hauteur: number; enCours: boolean }> {
  const mois = adminMois(maintenant, n);
  const totaux = mois.map((m) => dates.filter((d) => d >= m.debut && d < m.fin).length);
  const max = Math.max(0, ...totaux);
  return mois.map((m, i) => ({ libelle: m.libelle, n: totaux[i]!, hauteur: max > 0 ? Math.round((totaux[i]! / max) * 100) : 0, enCours: m.enCours }));
}

/**
 * Churn des comptes sur 30 jours glissants, en POURCENTS · résiliations ÷
 * comptes payants au début de la fenêtre. Faute d'historique, ce dénominateur
 * se reconstitue · payants d'aujourd'hui + résiliés de la fenêtre. `null`
 * quand la base est vide (aucun payant, aucune résiliation) · pas de 0 %
 * trompeur sur une plateforme sans abonné.
 */
export function tauxChurn30(resiliations30: number, payants: number): number | null {
  const base = payants + resiliations30;
  return base > 0 ? (resiliations30 / base) * 100 : null;
}

/** Ancienneté moyenne des comptes payants, en mois entiers · `null` sans payant. */
export function ancienneteMoyenneMois(espaces: readonly EspacePlateforme[], t: TarifsPlateforme, maintenant: Date): number | null {
  const p = espaces.filter((e) => estPayant(e, t));
  if (!p.length) return null;
  const moy = p.reduce((s, e) => s + (maintenant.getTime() - e.creeLe.getTime()), 0) / p.length;
  return Math.floor(moy / (30.44 * JOUR));
}

/**
 * Durée de vie attendue d'un abonné · LTV = ARPU × marge brute ÷ churn
 * mensuel. `null` dès qu'un terme manque (aucun départ mesuré = durée infinie,
 * qu'on n'affiche pas).
 */
export function ltvMoyenne(arpu: number | null, margeBrutePct: number | null, churnPct: number | null): number | null {
  if (arpu == null || margeBrutePct == null || churnPct == null || churnPct <= 0) return null;
  return (arpu * (margeBrutePct / 100)) / (churnPct / 100);
}

/* ─────────────────────────── Inscriptions, essais ─────────────────────────── */

const dans = (d: Date, depuis: number, jusqua: number) => d.getTime() > depuis && d.getTime() <= jusqua;

export interface Inscriptions {
  /** Inscrits sur les 30 derniers jours. */
  n30: number;
  /** Inscrits sur les 30 jours précédents. */
  precedents30: number;
  /** Variation en pourcents · `null` sans période précédente. */
  variationPct: number | null;
  essaisEnCours: number;
  essaisFinDans7j: number;
  /** Payants parmi les inscrits des 30 derniers jours, en pourcents · `null` sans inscrit. */
  conversionPct: number | null;
}

export function inscriptions(espaces: readonly EspacePlateforme[], t: TarifsPlateforme, maintenant: Date): Inscriptions {
  const now = maintenant.getTime();
  const recents = espaces.filter((e) => dans(e.creeLe, now - 30 * JOUR, now));
  const avant = espaces.filter((e) => dans(e.creeLe, now - 60 * JOUR, now - 30 * JOUR)).length;
  const essais = espaces.filter((e) => estEnEssai(e, maintenant));
  return {
    n30: recents.length,
    precedents30: avant,
    variationPct: avant > 0 ? ((recents.length - avant) / avant) * 100 : null,
    essaisEnCours: essais.length,
    essaisFinDans7j: essais.filter((e) => e.essaiFinLe && e.essaiFinLe.getTime() <= now + 7 * JOUR).length,
    conversionPct: recents.length ? (recents.filter((e) => estPayant(e, t)).length / recents.length) * 100 : null,
  };
}

export interface EtapeParcoursInscription { libelle: string; n: number; hauteur: number; partPrecedente: number | null }

/**
 * Le parcours d'inscription des 30 derniers jours · inscrits → onboarding
 * terminé → première consommation → payants. Chaque étape est un sous-ensemble
 * de la précédente (un payant qui n'a jamais terminé l'onboarding reste compté
 * à son étape réelle, pas plus loin). Hauteur = part des inscrits.
 */
export function parcoursInscription(espaces: readonly EspacePlateforme[], t: TarifsPlateforme, maintenant: Date): EtapeParcoursInscription[] {
  const now = maintenant.getTime();
  const inscrits = espaces.filter((e) => dans(e.creeLe, now - 30 * JOUR, now));
  const onb = inscrits.filter((e) => e.onboardeLe);
  const conso = onb.filter((e) => e.aConsomme);
  const pay = conso.filter((e) => estPayant(e, t));
  const etapes: Array<[string, number]> = [['Inscrits', inscrits.length], ['Onboarding terminé', onb.length], ['1re consommation', conso.length], ['Payants', pay.length]];
  const base = inscrits.length;
  return etapes.map(([libelle, n], i) => ({
    libelle, n,
    hauteur: base > 0 ? (n / base) * 100 : 0,
    partPrecedente: i === 0 ? null : etapes[i - 1]![1] > 0 ? (n / etapes[i - 1]![1]) * 100 : null,
  }));
}

/** Part de la dotation mensuelle consommée sur 30 jours, en pourcents (peut dépasser 100). */
export function partCreditsUtilises(e: EspacePlateforme, t: TarifsPlateforme): number | null {
  const dot = t.credits[e.forfait] ?? 0;
  return dot > 0 ? Math.round((e.conso30 / dot) * 100) : null;
}

/** Les initiales d'un espace pour son avatar (« Agence Pivot » → « AP »). */
export const initialesEspace = (nom: string) => initialesAvatar(nom, nom);

/* ──────────────────────────── Rapprochement ──────────────────────────── */

export interface Rapprochement {
  /** Espaces sur une formule payante (hors comptes de test et d'équipe). */
  attendus: number;
  /** … dont l'abonnement Stripe est actif. */
  rattaches: number;
  /** Les espaces en écart · formule payante sans abonnement Stripe actif. */
  ecarts: Array<{ id: string; nom: string; forfait: string; statut: string | null }>;
}

/**
 * Stripe ↔ TikTrends · une formule payante doit correspondre à un abonnement
 * Stripe actif. Un écart n'est pas une erreur en soi (formule posée à la main
 * pour un test) · il se regarde. Les comptes `beta` et `staff` sont exclus.
 */
export function rapprochementStripe(espaces: readonly EspacePlateforme[], t: TarifsPlateforme): Rapprochement {
  const attendus = espaces.filter((e) => prixForfait(t, e.forfait) > 0 && e.type === 'normal');
  const ecarts = attendus.filter((e) => !estPayant(e, t)).map((e) => ({ id: e.id, nom: e.nom, forfait: e.forfait, statut: e.statutAbonnement }));
  return { attendus: attendus.length, rattaches: attendus.length - ecarts.length, ecarts };
}

/* ──────────────────────────── Affichage des listes ──────────────────────────── */

/** Les puces de filtre d'une liste de comptes · Tous, (Critiques | À risque), formules payantes, Essais. */
export function filtresComptes(t: TarifsPlateforme, risque: 'critique' | 'risque'): Array<{ cle: string; libelle: string }> {
  return [
    { cle: 'tous', libelle: 'Tous' },
    ...(risque === 'critique' ? [{ cle: 'critique', libelle: 'Critiques' }] : []),
    ...t.ordre.filter((f) => prixForfait(t, f) > 0).map((f) => ({ cle: f, libelle: libelleForfait(t, f) })),
    { cle: 'essai', libelle: 'Essais' },
    ...(risque === 'risque' ? [{ cle: 'risque', libelle: 'À risque' }] : []),
  ];
}

/** Une ligne « comptes à risque » prête à afficher · libellés et clés de filtre décidés ici. */
export function ligneRisqueAffichee(c: CompteARisque, t: TarifsPlateforme) {
  return {
    id: c.id, nom: c.nom,
    cles: [c.forfait, ...(c.niveau === 'critique' ? ['critique'] : []), ...(c.essai ? ['essai'] : [])],
    forfait: c.essai ? { libelle: 'Essai', classe: 'c' as const } : { libelle: c.libelleForfait, classe: '' as const },
    risque: { libelle: libelleRisque(c.signaux.length), classe: (c.niveau === 'critique' ? 'r' : 'w') as 'r' | 'w' },
    prix: c.essai ? 'Essai' : `${prixForfait(t, c.forfait).toLocaleString('fr-FR')} € / mois`,
    signal: c.signaux[0] ?? '',
    autres: c.signaux.slice(1).join(' · '),
  };
}
