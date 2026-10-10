/**
 * Studios · les ANCIENNES adresses de création et la préparation d'un projet.
 *
 * Pur · ni base, ni réseau.
 *
 * ── Le mandat (Kevin, 10/10) ─────────────────────────────────────────────────
 *
 * Une seule expérience de création : les projets des Studios. Les anciens
 * studios (`/studio`, `/studio/ads`, `/studio/image`, `/studio/video`,
 * `/studio/textes`) sont retirés. Leurs adresses restent en circulation
 * (favoris, liens partagés, notifications enregistrées) : chacune mène à une
 * destination UTILE, sans 404 ni boucle, et le contexte qu'elle portait
 * (annonce sauvegardée, angle, test Adsmap, consigne, retour Veille) est repris
 * dans la PRÉPARATION d'un projet. Rien n'est créé à l'ouverture : un GET ne
 * crée jamais de projet, seul le clic « Créer le projet » le fait.
 *
 * Ce module dit :
 *  · `lienNouveauProjet` · l'adresse de la préparation, armée d'un contexte
 *    (c'est ce que tous les producteurs de liens appellent désormais) ;
 *  · `destinationAncienneAdresse` · où mène une ancienne adresse ;
 *  · `lireContexteNouveauProjet` · ce que la préparation relit de son adresse,
 *    chaque valeur bornée et validée (une valeur forgée est ignorée) ;
 *  · `objectifDepuisIteration` · l'objectif d'un projet né d'un test Adsmap ;
 *  · `notesContexte` · ce qui n'a PAS pu être repris, dit en clair.
 */

import { TYPES_NOUVEAU_PROJET, type TypeNouveauProjet } from './ux/nouveau-projet';
import { lienRetourVeille, PARAM_RETOUR_VEILLE, DEPUIS_VEILLE } from '../retour-veille';
import { PARAM_DEPUIS } from '../adsmap/passage-studio';
import { sourceVeilleDepuisRef } from '../veille-liens';
import { lireIterationDemandee, PARAM_ITERATION, type BriefDepuisTest } from '../brief-iteration';

export const CHEMIN_PROJETS = '/studio/projets';
export const CHEMIN_NOUVEAU_PROJET = '/studio/projets/nouveau';

/** Les anciennes adresses de création · servies, elles ne font plus que rediriger. */
export const ANCIENNES_ADRESSES_STUDIO = ['/studio', '/studio/ads', '/studio/image', '/studio/video', '/studio/textes'] as const;

/** Bornes reprises des anciens écrans (ce que leurs liens portaient déjà). */
export const ANGLE_MAX = 300;
export const PRODUIT_MAX = 120;
export const SOURCE_CLE_MAX = 96;
export const SOURCE_NOM_MAX = 120;
/** L'objectif d'un projet (borne serveur de `creerProjetDepuisSources`). */
export const OBJECTIF_MAX = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les paramètres que la préparation lit · un test vérifie que la page les lit tous. */
export const PARAMS_NOUVEAU_PROJET = ['type', 'angle', 'produit', 'ref', PARAM_ITERATION, 'src', 'srcnom', PARAM_DEPUIS, PARAM_RETOUR_VEILLE] as const;

export interface ContexteLien {
  type?: TypeNouveauProjet | null;
  /** Angle, consigne, insight ou prompt · devient l'objectif proposé. */
  angle?: string | null;
  /** Produit nommé en clair (ancien lien Textes IA). */
  produit?: string | null;
  /** Identifiant d'une annonce SAUVEGARDÉE · jointe comme source du projet. */
  ref?: string | null;
  /** Identifiant d'un test Adsmap · son brief d'itération est relu côté serveur. */
  iter?: string | null;
  /** Annonce de la Veille par sa clé `plateforme:id` et son annonceur (provenance seule). */
  src?: string | null;
  srcnom?: string | null;
  /** Contexte de recherche de la Veille (`rv`) · permet d'y revenir. */
  retourVeille?: string | null;
}

type Params = Record<string, string | string[] | undefined | null>;

const premier = (v: string | string[] | undefined | null): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');
const net = (v: string | null | undefined, max: number): string => (v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** Le contexte de Veille NETTOYÉ (critères admis, ancre de carte) · vide quand il ne dit rien. */
function rvPropre(rv: string | null | undefined): string {
  if (!rv) return '';
  const l = lienRetourVeille(rv) ?? '/veille';
  return l.slice('/veille'.length).replace(/^\?/, '');
}
const estType = (t: unknown): t is TypeNouveauProjet => typeof t === 'string' && (TYPES_NOUVEAU_PROJET as readonly string[]).includes(t);

/** L'adresse de la préparation d'un projet, armée de son contexte · seules les valeurs valides y figurent. */
export function lienNouveauProjet(c: ContexteLien = {}): string {
  const p = new URLSearchParams();
  if (estType(c.type)) p.set('type', c.type);
  const angle = net(c.angle, ANGLE_MAX);
  if (angle) p.set('angle', angle);
  const produit = net(c.produit, PRODUIT_MAX);
  if (produit) p.set('produit', produit);
  if (c.ref && UUID.test(c.ref)) p.set('ref', c.ref.toLowerCase());
  if (c.iter && UUID.test(c.iter)) p.set(PARAM_ITERATION, c.iter.toLowerCase());
  const src = net(c.src, SOURCE_CLE_MAX);
  if (src && sourceVeilleDepuisRef(src)) {
    p.set('src', src);
    const nom = net(c.srcnom, SOURCE_NOM_MAX);
    if (nom) p.set('srcnom', nom);
  }
  const rv = rvPropre(c.retourVeille);
  if (rv) {
    p.set(PARAM_DEPUIS, DEPUIS_VEILLE);
    p.set(PARAM_RETOUR_VEILLE, rv);
  }
  const q = p.toString();
  return q ? `${CHEMIN_NOUVEAU_PROJET}?${q}` : CHEMIN_NOUVEAU_PROJET;
}

/** Le lien du panneau d'un test Adsmap vers la préparation d'un projet, brief d'itération repris. */
export function lienIterationStudio(adId: string): string {
  return lienNouveauProjet({ type: 'ads', iter: adId });
}

/** Le contexte qu'une ancienne adresse portait, traduit dans les mots de la préparation. */
function contexteAncien(chemin: string, sp: Params): ContexteLien | null {
  const rv = premier(sp.depuis) === DEPUIS_VEILLE ? premier(sp[PARAM_RETOUR_VEILLE]) || null : null;
  switch (chemin) {
    case '/studio/ads':
      return { type: 'ads', angle: premier(sp.angle), ref: premier(sp.ref), iter: lireIterationDemandee(sp as Record<string, string | string[] | undefined>), src: premier(sp.src), srcnom: premier(sp.srcnom), retourVeille: rv };
    case '/studio/image':
      return { type: 'image' };
    case '/studio/video':
      return { type: 'video', angle: premier(sp.prompt) };
    case '/studio/textes':
      return { type: 'text', angle: premier(sp.inspo), produit: premier(sp.brand) };
    default:
      return null;
  }
}

/**
 * Où mène une ancienne adresse de création.
 *
 *  · `/studio` et toute adresse inconnue · la liste des projets ;
 *  · un ancien studio SANS contexte (favori simple, `?mode=clone`) · la liste
 *    des projets, d'où « Nouveau projet » part ;
 *  · avec un contexte valide · la préparation d'un projet, contexte repris.
 *
 * Jamais une adresse sous `/studio/{ads,image,video,textes}` · aucune boucle.
 */
export function destinationAncienneAdresse(chemin: string, sp: Params = {}): string {
  const c = contexteAncien(chemin, sp);
  if (!c) return CHEMIN_PROJETS;
  const lien = lienNouveauProjet(c);
  const avecContexte = lien.includes('?') && lien !== lienNouveauProjet({ type: c.type });
  return avecContexte ? lien : CHEMIN_PROJETS;
}

export interface ContexteNouveauProjet {
  type: TypeNouveauProjet;
  /** Le type vient-il de l'adresse (sinon, défaut « pub ») ? */
  typeDonne: boolean;
  /** Objectif proposé · modifiable avant la création. */
  objectif: string;
  ref: string | null;
  iter: string | null;
  sourceVeille: { cle: string; nom: string } | null;
  /** Valeur `rv` NETTOYÉE (le lien de retour se calcule avec `lienRetourVeille`). */
  retourVeille: string | null;
  /** L'adresse portait-elle un contexte (autre que le type) ? */
  aContexte: boolean;
}

/** Ce que la préparation relit de son adresse · chaque valeur bornée, une valeur forgée ignorée. */
export function lireContexteNouveauProjet(sp: Params = {}): ContexteNouveauProjet {
  const t = premier(sp.type);
  const angle = net(premier(sp.angle), ANGLE_MAX);
  const produit = net(premier(sp.produit), PRODUIT_MAX);
  const refBrut = premier(sp.ref).trim();
  const ref = UUID.test(refBrut) ? refBrut.toLowerCase() : null;
  const iter = lireIterationDemandee(sp as Record<string, string | string[] | undefined>);
  const srcCle = net(premier(sp.src), SOURCE_CLE_MAX);
  const source = srcCle ? sourceVeilleDepuisRef(srcCle, net(premier(sp.srcnom), SOURCE_NOM_MAX)) : null;
  const retourVeille = premier(sp.depuis) === DEPUIS_VEILLE ? rvPropre(premier(sp[PARAM_RETOUR_VEILLE])) || null : null;
  const objectif = [angle, produit ? `Produit : ${produit}` : ''].filter(Boolean).join('\n').slice(0, OBJECTIF_MAX);
  return {
    type: estType(t) ? t : 'ads',
    typeDonne: estType(t),
    objectif,
    ref,
    iter,
    sourceVeille: source ? { cle: srcCle, nom: source.annonceur } : null,
    retourVeille,
    aContexte: !!(objectif || ref || iter || source || retourVeille),
  };
}

/** L'objectif et le titre d'un projet né d'un test Adsmap gagnant · repris du brief d'itération. */
export function objectifDepuisIteration(b: Extract<BriefDepuisTest, { eligible: true }>): { objectif: string; titre: string } {
  const lignes = [
    `Angle : ${b.champs.angle.valeur}`,
    b.champs.audience ? `Audience : ${b.champs.audience.valeur}` : '',
    `Hypothèse suggérée : ${b.champs.hypothese.valeur}`,
    b.apprentissages.length ? `Appris : ${b.apprentissages.map((a) => a.texte).join(' · ')}` : '',
    b.provenance.chiffres.length ? `Mesuré : ${b.provenance.chiffres.join(' · ')}` : '',
  ].filter(Boolean);
  return { objectif: lignes.join('\n').slice(0, OBJECTIF_MAX), titre: b.provenance.titre.slice(0, 200) };
}

export type EtatRepriseIteration = { etat: 'reprise' } | { etat: 'non_eligible'; motif: string } | { etat: 'refuse' } | null;

/**
 * Ce qui n'a PAS pu être repris, en clair · jamais une perte silencieuse.
 * `refJointe` : l'annonce sauvegardée a été relue dans la portée et sera jointe.
 */
export function notesContexte(c: ContexteNouveauProjet, o: { refJointe: boolean; iteration: EtatRepriseIteration }): string[] {
  const n: string[] = [];
  if (c.ref && !o.refJointe) n.push('L’annonce sauvegardée de ce lien n’est plus accessible (supprimée, d’une autre marque ou hors de tes droits) · le projet partira de l’objectif seul.');
  if (c.sourceVeille && !c.ref) {
    const nom = c.sourceVeille.nom ? ` de ${c.sourceVeille.nom}` : '';
    n.push(`L’annonce${nom} vue dans la Veille n’est pas jointe · le lien ne transporte que sa référence. Pour l’attacher comme source, rouvre-la dans la Veille et choisis « Préparer une création ».`);
  }
  if (o.iteration?.etat === 'non_eligible') n.push(`Le test Adsmap n’a pas été repris · ${o.iteration.motif}`);
  if (o.iteration?.etat === 'refuse') n.push('Le test Adsmap de ce lien n’est pas lisible ici (supprimé, d’une autre marque ou accès Adsmap requis) · le projet partira de l’objectif seul.');
  return n;
}
