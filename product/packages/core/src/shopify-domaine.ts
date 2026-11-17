/**
 * Le domaine Admin d'une boutique Shopify · `<nom>.myshopify.com`, et rien d'autre.
 *
 * C'est vers ce domaine que partent le jeton Admin (`X-Shopify-Access-Token`) et
 * l'échange du code OAuth. Un domaine personnalisé (`ma-marque.com`) sert la
 * vitrine, pas l'API Admin · l'accepter laissait un administrateur (ou le
 * catalogue public, qui réécrivait le domaine) envoyer le jeton à n'importe quel
 * hôte. Le motif est ANCRÉ aux deux bouts · `x.myshopify.com.piege.com`,
 * `piege.com?.myshopify.com`, un port, des identifiants (`a@b`) sont refusés.
 *
 * Accepte une saisie avec schéma et chemin (`https://x.myshopify.com/admin`),
 * rend le domaine nu en minuscules, ou null. Pur.
 */
export const MOTIF_DOMAINE_MYSHOPIFY = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function domaineMyshopify(saisie: string | null | undefined): string | null {
  const d = (saisie ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  return MOTIF_DOMAINE_MYSHOPIFY.test(d) ? d : null;
}

/** La raison dite à l'écran quand un domaine enregistré n'est pas le domaine Admin. */
export function raisonDomaineShopify(domaine: string): string {
  return `Ta boutique est enregistrée sous un domaine personnalisé (${domaine}) · reconnecte-la avec son domaine .myshopify.com (ex : ta-boutique.myshopify.com) pour synchroniser.`;
}
