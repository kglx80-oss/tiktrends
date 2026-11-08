import { redirect } from 'next/navigation';
import { CONNECTEURS_DISPONIBLES, FUSEAU_ACCUEIL, bilanRattachement, etatConnexionMeta, etatRemontee, feuilleDeRouteConnecteurs, fraicheurConnecteur, messagesRetourConnexions } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { lireConnexionMeta } from '../../../../lib/connexion-meta';
import { connectMetaAction, connectShopifyAction, disconnectMetaAction, disconnectShopifyAction, getConnectionState, selectMetaAccountAction, syncMetaAction, syncShopifyAction } from '../../../actions/connections';
import { disconnectDriveAction, getDriveState, syncDriveNowAction } from '../../../actions/drive';
import { reglerRemonteeNocturneAction } from '../../../actions/adsmap-mesures';
import { adsDeLaMarque, lireReglageRemontee, lireRemontees } from '../../../../lib/adsmap-mesures';
import { Connexions, type CarteConnexionVue } from '../../../../spatial/vues/reglages/Connexions';
import { SOUS_NAV_REGLAGES } from '../../../../spatial/vues/reglages/sous-nav';

export const dynamic = 'force-dynamic';

const le = (iso: string | null) => fraicheurConnecteur(iso, FUSEAU_ACCUEIL);

export default async function ConnexionsSpatiales() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const [brand, etat, drive] = await Promise.all([getActiveBrand(s.workspaceId), getConnectionState(), getDriveState()]);
  const meta = etat?.meta ?? null;
  const shop = etat?.shopify ?? null;
  // Meta · LA lecture et LA règle de l'Accueil, d'Analytics et du Radar (`lireConnexionMeta` →
  // `etatConnexionMeta`) · la carte date par la dernière synchro réelle (KPI du compte OU mesure
  // Adsmap), jamais par `meta_synced_at` seul, et dit le même libellé que les trois autres écrans.
  const lue = brand ? await lireConnexionMeta(brand.id, s.workspaceId) : null;
  const etatMeta = etatConnexionMeta(lue?.entree ?? { jeton: false, compte: false, comptes: 0, kpiLe: null, mesuresLe: null }, new Date());
  const metaBranche = etatMeta.phase !== 'a_brancher';

  // La remontée planifiée (lot 4 V5) · état lu (journal, dernière mesure réussie), jamais supposé.
  // `CRON_SECRET` · seulement sa PRÉSENCE (le web et le worker lisent le même fichier d'environnement).
  const maintenant = new Date();
  const [reglage, journal, ads] = brand
    ? await Promise.all([lireReglageRemontee(brand.id), lireRemontees(brand.id), adsDeLaMarque(s.workspaceId, brand.id)])
    : [{ suspendueLe: null, derniereReussie: null }, [], []] as const;
  const remontee = etatRemontee({ connecte: metaBranche, cleDeclenchement: !!process.env.CRON_SECRET, ...reglage, journal }, maintenant, FUSEAU_ACCUEIL);

  const cartes: CarteConnexionVue[] = [
    { cle: 'meta', groupe: 'Résultats publicitaires', nom: 'Meta Ads', etape1: !metaBranche,
      description: 'Dépenses, impressions et achats de tes campagnes remontent dans TikTrends : c’est ce qui permet de conclure un test.',
      connecte: metaBranche, resume: [metaBranche ? meta?.adAccountId : null, etatMeta.libelle].filter(Boolean).join(' · '),
      remontee: metaBranche ? { phase: remontee.phase, libelle: remontee.libelle, erreur: remontee.erreur } : undefined },
    { cle: 'shopify', groupe: 'Produits et ventes', nom: 'Shopify', etape1: false,
      description: 'Les ventes et les produits de ta boutique remontent pour relier tes créas aux ventes réelles.',
      connecte: !!shop?.connected, resume: shop?.connected ? [shop.domain ?? 'boutique', le(shop.syncedAt)].join(' · ') : null },
    { cle: 'gdrive', groupe: 'Assets', nom: 'Google Drive', etape1: false,
      description: 'Tes photos, vidéos et chartes rangées dans la Bibliothèque de la marque.',
      connecte: drive.connected, resume: drive.connected ? [drive.folderName ?? 'aucun dossier choisi', le(drive.syncedAt)].join(' · ') : null },
    { cle: 'dropbox', groupe: 'Assets', nom: 'Dropbox', etape1: false,
      description: 'Les dossiers partagés de ton équipe ou de ton agence · ce connecteur n’est pas encore disponible.',
      connecte: false, resume: null },
  ];

  return (
    <Connexions
      sousNav={SOUS_NAV_REGLAGES} marque={brand?.name ?? null} cartes={cartes} branchables={CONNECTEURS_DISPONIBLES.length}
      feuilleDeRoute={feuilleDeRouteConnecteurs(['Dropbox'])}
      meta={{ oauth: !!(process.env.META_APP_ID && process.env.APP_URL), connecter: connectMetaAction, synchroniser: syncMetaAction, deconnecter: disconnectMetaAction, choisirCompte: selectMetaAccountAction, comptes: meta?.accounts ?? [], compte: meta?.adAccountId ?? null,
        remontee: metaBranche ? { rattachement: bilanRattachement(ads).phrase, libelle: remontee.libelle, erreur: remontee.erreur, active: !reglage.suspendueLe, raisonFermee: remontee.raisonFermee, regler: reglerRemonteeNocturneAction } : undefined }}
      shopify={{ oauth: !!(process.env.SHOPIFY_API_KEY && process.env.APP_URL), connecter: connectShopifyAction, synchroniser: syncShopifyAction, deconnecter: disconnectShopifyAction, domaine: shop?.domain ?? null }}
      drive={{ connexion: drive.available ? '/api/oauth/google' : null, synchroniser: syncDriveNowAction, deconnecter: disconnectDriveAction, dossier: drive.folderName }}
      retours={messagesRetourConnexions()}
    />
  );
}
