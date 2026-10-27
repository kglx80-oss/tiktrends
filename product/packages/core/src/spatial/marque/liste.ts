import { MESSAGES_SUPPRESSION_MARQUE } from '../../studios/suppression-marque';
import { domaineConcurrent } from '../../concurrent-carte';

/**
 * Spatial · la liste des marques (`/brands`, écran sans fragment de maquette,
 * vague 3) · RÈGLES PURES. Les messages des actions qui y redirigent (création,
 * suppression, refus) · mêmes textes que l'écran V5 · et la ligne descriptive
 * d'une marque (catégorie · domaine), sans rien inventer.
 */

const OK_LISTE: Record<string, string> = {
  '1': 'Marque créée.', created: 'Marque créée et sélectionnée.', renamed: 'Marque renommée.', deleted: 'Marque supprimée.', saved: 'Marque mise à jour.',
};
const ERR_LISTE: Record<string, string> = {
  forbidden: 'Action réservée aux administrateurs.', name: 'Donne un nom à la marque.',
  shopify_domain: 'Indique l’adresse de ton site.',
  shopify_notfound: 'Impossible de lire cette boutique automatiquement. Vérifie l’adresse, ou crée la marque puis complète le profil.',
  ...MESSAGES_SUPPRESSION_MARQUE,
};

/** Les messages indexés `ok:<code>` / `e:<code>` · ce que lit l'annonce de l'écran (`AnnonceRetour`). */
export function messagesListeMarques(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(OK_LISTE)) out[`ok:${k}`] = v;
  for (const [k, v] of Object.entries(ERR_LISTE)) out[`e:${k}`] = v;
  return out;
}

/** La ligne sous le nom · catégorie (ou secteur) puis domaine du site · « Profil à compléter » sans rien. */
export function ligneMarque(m: { category?: string | null; industry?: string | null; url?: string | null }): { texte: string; domaine: string | null } {
  const cat = (m.category || m.industry || '').trim();
  const dom = domaineConcurrent(m.url ?? '') || null;
  const site = dom ?? (m.url?.trim() || null);
  if (!cat && !site) return { texte: 'Profil à compléter', domaine: null };
  return { texte: [cat, site].filter(Boolean).join(' · '), domaine: dom };
}

/** La marque active d'abord, puis l'ordre alphabétique (français, sans casse). */
export function ordreMarques<T extends { id: string; nom: string }>(marques: readonly T[], active: string | null): T[] {
  return [...marques].sort((a, b) => Number(b.id === active) - Number(a.id === active) || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
}
