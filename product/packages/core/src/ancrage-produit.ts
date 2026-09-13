/**
 * L'ANCRAGE PRODUIT · ce qui manquait pour que les cases ouvertes des directions
 * se remplissent sur-sujet.
 *
 * ── Le défaut, observé ───────────────────────────────────────────────────────
 *
 * Les directions artistiques portent des cases ouvertes · « un seul accessoire
 * sculptural », « quelques objets complémentaires », « une surface stylée ». Ces
 * recettes sont AGNOSTIQUES du produit · rien ne dit au modèle ce qu'est un
 * accessoire sur-sujet. Résultat vu en production : un supplément focus posé sur
 * une céramique blanche qui ne veut rien dire · « médiocre, hors sujet ».
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * On ancre chaque scène sur le monde réel du produit · ce qu'il est, ce qu'il
 * fait, pour qui. Tout accessoire, toute surface, tout objet secondaire DOIT
 * appartenir à ce monde. Ça ne fige pas le décor (la rotation de directions
 * garde sa variété) · ça interdit le remplissage au hasard.
 *
 * Pur : ni base, ni réseau, ni modèle. La langue est l'anglais · celle des
 * prompts d'image.
 */

export interface ContexteProduit {
  /** Le nom du produit · ex : « NURO Focus & Boost ». */
  produit?: string | null;
  /** La catégorie · ex : « supplément nootropique ». */
  categorie?: string | null;
  /** À qui il s'adresse · ex : « créateurs de contenu ». */
  audience?: string | null;
  /** Ce qu'il fait, en bref · complète quand le nom ne suffit pas. */
  description?: string | null;
}

const propre = (v?: string | null, max = 160): string => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Vrai si le contexte porte au moins un signal exploitable. */
export function contexteProduitUtile(ctx?: ContexteProduit | null): boolean {
  if (!ctx) return false;
  return !!(propre(ctx.produit) || propre(ctx.categorie) || propre(ctx.audience) || propre(ctx.description));
}

/**
 * L'ancrage tourné en consigne de prompt · '' quand rien n'est connu (le prompt
 * reste léger). Se superpose à la direction · il ne choisit pas le décor, il
 * interdit qu'un accessoire ou une surface sorte du monde du produit.
 */
export function ancrageProduit(ctx?: ContexteProduit | null): string {
  if (!contexteProduitUtile(ctx)) return '';
  const c = ctx!;
  const quoi = [propre(c.produit, 80), propre(c.categorie, 80)].filter(Boolean).join(' · ');
  const bouts: string[] = [];
  if (quoi) bouts.push(`what it is: ${quoi}`);
  if (propre(c.description, 200)) bouts.push(`what it does: ${propre(c.description, 200)}`);
  if (propre(c.audience, 120)) bouts.push(`who it is for: ${propre(c.audience, 120)}`);
  return `Real-world anchor · ${bouts.join('; ')}. Every prop, surface, background and secondary object MUST plausibly belong to this product's world and reinforce what it is for. Never add an object unrelated to it, and never rest the product on an ambiguous or off-topic surface.`;
}
