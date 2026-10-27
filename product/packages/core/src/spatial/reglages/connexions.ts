import { dejaDisponible, etatCatalogue } from '../../connecteurs-catalogue';

/**
 * Spatial · Connexions · la feuille de route des connecteurs (reprise de
 * l'écran V5 `/connections`, CDC v7 · N09). Ce qui est VRAIMENT branchable a
 * sa carte ; le reste est listé « Bientôt », sans bouton, et un connecteur
 * déjà disponible (ou qui a déjà sa carte, comme Dropbox) n'y reparaît jamais.
 */

/** Les connecteurs branchables aujourd'hui · seuls autorisés à se dire « disponibles ». */
export const CONNECTEURS_DISPONIBLES = ['Shopify', 'Meta Ads', 'Google Drive'] as const;

/** Le catalogue de l'écran V5, par catégorie (noms seuls · aucune promesse de date). */
export const CATALOGUE_CONNECTEURS: ReadonlyArray<{ categorie: string; noms: readonly string[] }> = [
  { categorie: 'Publicité', noms: ['TikTok Ads', 'Google Ads', 'Snapchat Ads', 'Reddit Ads', 'Pinterest Ads', 'LinkedIn Ads'] },
  { categorie: 'Analytics & Data', noms: ['Google Analytics', 'Search Console', 'Google BigQuery', 'Amplitude', 'Snowflake'] },
  { categorie: 'E-commerce & Paiement', noms: ['Stripe', 'Triple Whale'] },
  { categorie: 'CRM', noms: ['HubSpot', 'Salesforce', 'Pipedrive'] },
  { categorie: 'Engagement client', noms: ['Intercom', 'Klaviyo', 'Mailchimp', 'Zendesk'] },
  { categorie: 'Réseaux sociaux', noms: ['Facebook', 'Instagram', 'LinkedIn', 'X (Twitter)', 'YouTube', 'Snapchat'] },
  { categorie: 'Créa & Design', noms: ['Canva', 'Figma', 'Higgsfield'] },
  { categorie: 'Fichiers & Connaissance', noms: ['Google Drive', 'Notion', 'Dropbox', 'OneDrive', 'SharePoint', 'Confluence'] },
  { categorie: 'Productivité', noms: ['Gmail', 'Outlook', 'Google Sheets', 'Google Docs', 'Excel', 'Slack'] },
];

/**
 * La feuille de route affichée · par catégorie, sans les disponibles ni les
 * outils qui ont déjà leur carte (`dejaCartes`). Une catégorie vide disparaît.
 */
export function feuilleDeRouteConnecteurs(dejaCartes: readonly string[] = []): { categories: Array<{ categorie: string; noms: string[] }>; enPreparation: number } {
  const exclus = [...CONNECTEURS_DISPONIBLES, ...dejaCartes];
  const categories = CATALOGUE_CONNECTEURS
    .map((c) => ({ categorie: c.categorie, noms: c.noms.filter((n) => !dejaDisponible(n, exclus)) }))
    .filter((c) => c.noms.length > 0);
  return { categories, enPreparation: etatCatalogue(CONNECTEURS_DISPONIBLES, categories.flatMap((c) => c.noms)).enPreparation };
}
