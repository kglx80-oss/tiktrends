/**
 * L'offre · ce que les pages PUBLIQUES (`/tarifs`, la page d'accueil, les CGV)
 * lisent de l'offre V2, servie sous `TARIFS_V2`. Pur.
 *
 * Les cartes sont CELLES de la page Forfaits de l'appli (`cartesForfaitsV2`),
 * lues pour un visiteur sans espace · mêmes prix, mêmes crédits, mêmes droits,
 * même étiquette. Seul le bouton change : il mène à l'inscription, car le
 * forfait se souscrit depuis l'espace (Réglages · Forfaits), jamais d'une page
 * publique. Aucun prix ni volume n'est écrit ici.
 */
import { DROITS_V2, LIBELLE_SUPPORT } from './droits';
import { FORFAITS_V2, FORFAITS_V2_ORDRE, type CleForfaitV2 } from './forfaits';
import { REMISE_ANNUELLE_LIBELLE, cartesForfaitsV2, faqForfaitsV2, type CarteForfaitV2 } from './page-forfaits';

/** L'inscription existante · le seul chemin d'un visiteur vers un forfait. */
export const INSCRIPTION_PUBLIQUE = '/signup';

/** Dit sous la grille · où le forfait se souscrit, une fois l'espace créé. */
export const NOTE_SOUSCRIPTION_V2 = 'Crée ton espace, puis choisis ton forfait dans Réglages · Forfaits. Paiement sécurisé, TVA incluse.';

export interface PrixPublicV2 {
  /** Le prix ramené au mois (« 34,30 € »). */
  prix: string;
  /** « / mois TTC ». */
  periode: string;
  /** Annuel · ce qui est prélevé une fois par an · `null` en mensuel. */
  sousPrix: string | null;
}

export interface OffrePubliqueV2 extends Pick<CarteForfaitV2, 'cle' | 'nom' | 'accroche' | 'credits' | 'fonctions' | 'limites' | 'etiquette' | 'miseEnAvant' | 'engagement'> {
  mensuel: PrixPublicV2;
  annuel: PrixPublicV2;
  bouton: { libelle: string; href: string };
}

const VISITEUR = { plan: '', proprietaire: false, paiement: false, abonne: false, achetable: () => false } as const;

export function offresPubliquesV2(): OffrePubliqueV2[] {
  const mensuel = cartesForfaitsV2({ ...VISITEUR, facturation: 'mensuel' });
  const annuel = cartesForfaitsV2({ ...VISITEUR, facturation: 'annuel' });
  return mensuel.map((m, i) => {
    const a = annuel[i]!;
    return {
      cle: m.cle, nom: m.nom, accroche: m.accroche, credits: m.credits, fonctions: m.fonctions, limites: m.limites,
      etiquette: m.etiquette, miseEnAvant: m.miseEnAvant, engagement: m.engagement,
      mensuel: { prix: m.prix, periode: m.periode, sousPrix: m.sousPrix },
      annuel: { prix: a.prix, periode: a.periode, sousPrix: a.sousPrix },
      bouton: { libelle: `Choisir ${m.nom}`, href: INSCRIPTION_PUBLIQUE },
    };
  });
}

/** Une ligne du comparatif des droits · une valeur par forfait (texte, ou inclus / non inclus). */
export interface LigneComparatifV2 { libelle: string; valeurs: Record<CleForfaitV2, string | boolean> }

const parForfait = <T>(f: (k: CleForfaitV2) => T) => Object.fromEntries(FORFAITS_V2_ORDRE.map((k) => [k, f(k)])) as Record<CleForfaitV2, T>;
const nombre = (n: number | null) => (n === null ? 'Sans limite' : n.toLocaleString('fr-FR'));

/** Le comparatif des droits V2 · ceux appliqués au serveur (`DROITS_V2`). */
export function comparatifDroitsV2(): LigneComparatifV2[] {
  return [
    { libelle: 'Marques', valeurs: parForfait((k) => nombre(DROITS_V2[k].marques)) },
    { libelle: 'Concurrents suivis par marque', valeurs: parForfait((k) => nombre(DROITS_V2[k].concurrentsParMarque)) },
    { libelle: 'Vidéo finale', valeurs: parForfait((k) => `Jusqu’à ${DROITS_V2[k].videoMaxSecondes} s`) },
    { libelle: 'Clone de pubs vidéo', valeurs: parForfait((k) => DROITS_V2[k].cloneVideo) },
    { libelle: 'Contrôle visuel activable', valeurs: parForfait((k) => DROITS_V2[k].controleVisuelActivable) },
    { libelle: 'Support', valeurs: parForfait((k) => LIBELLE_SUPPORT[DROITS_V2[k].support]) },
  ];
}

/** « Essentiel, Pro, Agence ». */
export function nomsForfaitsV2(): string {
  return FORFAITS_V2_ORDRE.map((k) => FORFAITS_V2[k].libelle).join(', ');
}

/** La fourchette des prix mensuels TTC · données structurées (JSON-LD) de la page d'accueil. */
export function fourchettePrixV2(): { bas: number; haut: number; nombre: number } {
  const prix = FORFAITS_V2_ORDRE.map((k) => FORFAITS_V2[k].prixMensuelTtc);
  return { bas: Math.min(...prix), haut: Math.max(...prix), nombre: prix.length };
}

/** La description de `/tarifs` (moteurs de recherche, partage). */
export function descriptionTarifsV2(): string {
  return `Trois forfaits, ${nomsForfaitsV2()} · prix TTC, crédits IA inclus chaque mois, sans engagement.`;
}

/** La FAQ publique · celle de la page Forfaits, plus l'annuel (ce qu'un visiteur demande avant de choisir). */
export function faqPubliqueV2(): Array<{ question: string; reponse: string }> {
  return [
    ...faqForfaitsV2(),
    {
      question: 'Comment fonctionne l’annuel ?',
      reponse: `L’annuel coûte ${REMISE_ANNUELLE_LIBELLE} par rapport au mensuel, réglé en une fois. Les crédits du forfait arrivent chaque mois, comme en mensuel.`,
    },
  ];
}
