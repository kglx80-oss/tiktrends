/**
 * De la pub repérée en veille au brief qui arme le studio.
 *
 * ── Le maillon qui manquait ──────────────────────────────────────────────────
 *
 * La veille repère des pubs qui gagnent. Le studio écrit des pubs. Entre les
 * deux, le seul pont était un bouton « Générer une variante » qui pointait vers
 * le mauvais écran (`/studio` au lieu des Pubs IA) avec des paramètres que
 * personne ne lisait, et qui charriait la copy concurrente MOT POUR MOT. Résultat :
 * un clic sans suite, et quand il en avait une, une créa qui recopiait le
 * concurrent. Une veille qui ne se transforme pas en créa n'est pas un poumon,
 * c'est un décor.
 *
 * Ce fichier produit le BRIEF : ce qu'on dit à Jarvis pour qu'il reparte de
 * l'angle ÉPROUVÉ du concurrent et écrive NOTRE version.
 *
 * ── Reprendre l'angle, jamais les mots ───────────────────────────────────────
 *
 * On ne recopie pas la pub · on la traite comme une preuve de marché. Le brief
 * est une CONSIGNE d'adaptation, bornée et attribuée (« une pub concurrente
 * éprouvée »), pas la créa livrée · Jarvis réécrit tout, et la consigne le lui
 * dit en toutes lettres. C'est la même matière que la copy gagnante déjà
 * injectée en inspiration, mais dirigée vers UN angle précis au lieu d'un vivier.
 *
 * ── La survie est le seul vote crédible ──────────────────────────────────────
 *
 * Une pub qui tourne encore après le seuil de survie est payée semaine après
 * semaine par un annonceur qui voit ses chiffres. Le brief le dit quand c'est le
 * cas · c'est ce qui distingue « reprends cet angle » de « reprends ce pari ».
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import { PROVEN_DAYS } from './adsmap/market-stats';

/** Ce qu'on sait d'une pub de veille · le sous-ensemble qui fait un brief. */
export interface PubVeille {
  /** Le texte de la pub concurrente · sert d'indice d'angle, jamais recopié tel quel dans la créa. */
  body?: string | null;
  /** L'appel à l'action affiché · « Shop Now », « En savoir plus »… */
  callToAction?: string | null;
  /** Jours de diffusion · au-delà du seuil, la pub est « éprouvée ». */
  daysRunning?: number | null;
}

export interface BriefVeille {
  /** La consigne d'angle, prête à pré-remplir le studio · bornée à 300 caractères. */
  angle: string;
  /** La pub a franchi le seuil de survie · c'est une preuve, pas un pari. */
  eprouvee: boolean;
}

/** Le studio borne l'angle passé en URL à 300 · on rend un brief déjà prêt à tenir. */
const MAX_ANGLE = 300;

/** Coupe proprement à la limite, sur un mot, sans laisser de phrase pendante. */
function borne(s: string, max: number): string {
  if (s.length <= max) return s;
  const coupe = s.slice(0, max);
  const dernierEspace = coupe.lastIndexOf(' ');
  return (dernierEspace > max * 0.6 ? coupe.slice(0, dernierEspace) : coupe).trimEnd();
}

/**
 * Construit le brief · `null` quand la pub n'offre aucune matière (ni texte, ni
 * appel à l'action). Sans matière, un brief générique (« reprends l'angle ») ne
 * dirige rien · mieux vaut ne pas proposer le geste que le proposer vide.
 */
export function briefDepuisVeille(pub: PubVeille): BriefVeille | null {
  const body = (pub.body ?? '').replace(/\s+/g, ' ').trim();
  const cta = (pub.callToAction ?? '').replace(/\s+/g, ' ').trim();
  if (!body && !cta) return null;

  const jours = Number.isFinite(pub.daysRunning) ? Math.floor(pub.daysRunning as number) : 0;
  const eprouvee = jours >= PROVEN_DAYS;
  const preuve = eprouvee ? `éprouvée (diffusée depuis ${jours} j)` : 'repérée en veille';
  const appel = cta ? ` Appel à l'action : « ${cta} ».` : '';

  // L'ossature est PRIORITAIRE · l'instruction d'adaptation vit à la fin, et
  // c'est elle qui rend le geste sûr. On la pose d'abord, puis l'indice d'angle
  // (extrait borné du message concurrent) remplit ce qui reste sous la borne.
  // Ainsi une pub bavarde ne fait jamais tomber le « écris nos mots ».
  const prefixe = `Reprends l'angle d'une pub concurrente ${preuve}.${appel} `;
  const suffixe = 'Écris NOTRE version pour notre marque et notre produit · même angle, nos mots, ne recopie aucune phrase.';

  const budgetIndice = MAX_ANGLE - prefixe.length - suffixe.length;
  // Sous ~40 caractères utiles, un extrait ne dirige plus · on le laisse tomber
  // plutôt que d'afficher « Son message : « aaa… » » qui n'apprend rien.
  const indice = body && budgetIndice > 40
    ? `Son message : « ${borne(body, budgetIndice - 20)} ». `
    : '';

  return { angle: prefixe + indice + suffixe, eprouvee };
}
