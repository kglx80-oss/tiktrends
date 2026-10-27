import type { getConnectionState } from '../../../app/actions/connections';
import type { getDriveState } from '../../../app/actions/drive';
import type { LogoConnecteur } from './logos';

/**
 * Les connecteurs RÉELLEMENT branchables du parcours d'accueil (« Tes outils »)
 * et leur état · Meta Ads et Google Drive par leur porte OAuth, Shopify par la
 * page Connexions (il demande sa boutique). Dropbox (maquette) n'a pas de
 * connecteur · absent. Google Drive n'apparaît que s'il est configuré.
 * Module sans état, lu par la page serveur ET par le parcours (client).
 */
export interface ConnecteurParcours { cle: LogoConnecteur; nom: string; sous: string; connecte: boolean; href: string }

type Etat = Awaited<ReturnType<typeof getConnectionState>>;
type Drive = Awaited<ReturnType<typeof getDriveState>>;

export function connecteursDepuis(c: Etat, d: Drive): ConnecteurParcours[] {
  const l: ConnecteurParcours[] = [
    { cle: 'meta', nom: 'Meta Ads', sous: c?.meta.connected ? (c.meta.adAccountId ? `Compte ${c.meta.adAccountId}` : 'Compte à choisir dans Connexions') : 'Résultats publicitaires', connecte: !!c?.meta.connected, href: '/api/oauth/meta' },
    { cle: 'shopify', nom: 'Shopify', sous: c?.shopify.connected ? (c.shopify.domain ?? 'Boutique connectée') : 'Produits et ventes', connecte: !!c?.shopify.connected, href: '/connections' },
  ];
  if (d.available) l.push({ cle: 'gdrive', nom: 'Google Drive', sous: d.connected ? (d.folderName ?? 'Dossier à choisir dans Bibliothèque') : 'Assets', connecte: d.connected, href: '/api/oauth/google' });
  return l;
}
