/**
 * Un lot qui déclare ce qu'il teste.
 *
 * ── Ce qu'un lot était ───────────────────────────────────────────────────────
 *
 * Quatre publicités, quatre gabarits, quatre mises en page, quatre univers.
 * Quatre paris indépendants, et rien nulle part n'écrivait ce qu'on cherchait à
 * savoir.
 *
 * Quand la mesure arrivait, elle ne pouvait rien attribuer : la gagnante avait
 * une autre accroche ET une autre composition ET une autre ambiance. On
 * apprenait qu'une image avait marché, pas POURQUOI, donc on ne pouvait pas la
 * refaire.
 *
 * ── Ce qu'un lot d'essai est ─────────────────────────────────────────────────
 *
 * **Une seule dimension varie, tout le reste est tenu.** Les N publicités
 * partagent la même scène, les mêmes textes, le même gabarit · sauf une chose,
 * et c'est celle qu'on teste.
 *
 * ── La conséquence qu'on n'attendait pas ─────────────────────────────────────
 *
 * Tenir la scène veut dire n'en produire QU'UNE. Un essai de quatre accroches
 * ou de quatre mises en page coûte donc **une image**, pas quatre.
 *
 * Le lot le plus rigoureux est aussi le moins cher. Ce n'est pas un hasard :
 * ce qu'on payait en double, c'était l'ambiguïté.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import type { DeclinaisonSnapshot } from './studio-iterate';

/** Ce qu'un lot d'essai peut faire varier. */
export const ESSAI_VARIABLES = ['accroche', 'mise_en_page', 'univers'] as const;
export type EssaiVariable = typeof ESSAI_VARIABLES[number];

export const ESSAI_LABEL: Record<EssaiVariable, string> = {
  accroche: 'Les accroches',
  mise_en_page: 'Les mises en page',
  univers: 'Les ambiances',
};

/**
 * Combien d'IMAGES un lot d'essai produit réellement.
 *
 * C'est le nombre qui décide du prix, et il n'est presque jamais N · tenir la
 * scène constante, c'est n'en produire qu'une.
 */
export function imagesPourEssai(v: EssaiVariable, n: number): number {
  const total = Math.max(1, Math.floor(n));
  // Seule l'ambiance change l'image · les deux autres essais se jouent sur la
  // même scène, et c'est justement ce qui les rend comparables.
  return v === 'univers' ? total : 1;
}

export function prixEssai(v: EssaiVariable, n: number, creditsImage: number): number {
  return imagesPourEssai(v, n) * Math.max(0, creditsImage);
}

/** L'hypothèse, écrite · affichée avant de payer, consignée avec le lot. */
export function hypotheseEssai(v: EssaiVariable, n: number): string {
  const total = Math.max(1, Math.floor(n));
  switch (v) {
    case 'accroche':
      return `Ce lot teste ${total} accroches sur la même scène et la même mise en page.`;
    case 'mise_en_page':
      return `Ce lot teste ${total} mises en page sur la même scène et les mêmes textes.`;
    case 'univers':
      return `Ce lot teste ${total} ambiances visuelles sur les mêmes textes et la même mise en page.`;
  }
}

/** Ce qui est TENU · le contrat, montrable avant de lancer. */
export function tenuDansEssai(v: EssaiVariable): string[] {
  switch (v) {
    case 'accroche': return ['la scène', 'la mise en page', 'le bouton', 'l’ambiance'];
    case 'mise_en_page': return ['la scène', 'tous les textes', 'l’ambiance'];
    case 'univers': return ['tous les textes', 'la mise en page'];
  }
}

/** Ce qu'on économise en tenant la scène · dit en clair, parce que c'est contre-intuitif. */
export function economieEssai(v: EssaiVariable, n: number, creditsImage: number): number {
  const total = Math.max(1, Math.floor(n));
  return Math.max(0, (total - imagesPourEssai(v, total)) * Math.max(0, creditsImage));
}

/* -------------------------------------------------------------------------- */
/*  Le contrôle                                                                */
/* -------------------------------------------------------------------------- */

const meme = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** La valeur testée, pour une publicité du lot. */
function valeur(s: DeclinaisonSnapshot, v: EssaiVariable): string {
  if (v === 'accroche') return (s.headline ?? '').trim().toLowerCase();
  if (v === 'mise_en_page') return s.layout;
  return (s.universe ?? '').trim().toLowerCase();
}

/**
 * Ce lot est-il vraiment un essai ?
 *
 * ── Pourquoi ce n'est pas de la paranoïa ─────────────────────────────────────
 *
 * Rien dans le chemin de génération ne garantit mécaniquement le contrat. Le
 * modèle peut rendre deux fois la même accroche. Une accroche trop longue peut
 * faire changer la mise en page d'une seule publicité du lot, et deux choses
 * varient alors au lieu d'une.
 *
 * Un lot annoncé comme contrôlé qui ne l'est pas est PIRE qu'un lot libre · on
 * lui fait confiance pour conclure.
 *
 * Le contrôle rend un constat, pas une exception · un lot imparfait reste
 * utilisable, il ne doit simplement pas se présenter comme un essai.
 */
export function verifieEssai(
  lot: readonly DeclinaisonSnapshot[],
  v: EssaiVariable,
): { ok: true } | { ok: false; probleme: string } {
  if (lot.length < 2) return { ok: false, probleme: 'Un essai a besoin d’au moins deux publicités à comparer.' };

  const valeurs = lot.map((s) => valeur(s, v));
  if (new Set(valeurs).size !== valeurs.length) {
    return { ok: false, probleme: `Deux publicités du lot partagent ${ESSAI_LABEL[v].toLowerCase()} · il n’y a rien à comparer entre elles.` };
  }

  const [ref] = lot;
  if (!ref) return { ok: false, probleme: 'Lot vide.' };
  for (const s of lot.slice(1)) {
    const ecart: Array<[boolean, string]> = [
      [v !== 'accroche' && !meme(ref.headline, s.headline), 'l’accroche'],
      [!meme(ref.cta, s.cta), 'le bouton'],
      [v !== 'mise_en_page' && ref.layout !== s.layout, 'la mise en page'],
      [v !== 'univers' && ref.sceneUrl !== s.sceneUrl, 'la scène'],
      [v !== 'univers' && !meme(ref.universe, s.universe), 'l’ambiance'],
    ];
    const casse = ecart.find(([mauvais]) => mauvais);
    if (casse) return { ok: false, probleme: `${casse[1]} varie aussi dans ce lot · l’écart ne serait attribuable à rien.` };
  }
  return { ok: true };
}
