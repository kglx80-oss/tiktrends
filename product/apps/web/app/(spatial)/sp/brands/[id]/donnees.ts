import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { RAISON_LOGO_SANS_STOCKAGE, costFor, domaineConcurrent, initialeNom, lienNouveauProjet, messageLimiteConcurrents, messagesRetourMarque, type FicheMarqueLue, messageServiceInactif } from '@tiktrends/core';
import { forfaitEffectif } from '../../../../../lib/droits-forfait';
import { getSession, type Session } from '../../../../../lib/auth';
import { canAccess, FEATURES, roleAtLeast } from '../../../../../lib/rbac';
import { anthropicConfigured } from '../../../../../lib/ai-status';
import { unlimitedCredits } from '../../../../../lib/credits';
import { getActiveBrand } from '../../../../../lib/brands';
import { brandMediaPreview } from '../../../../../lib/brand-media-url';
import { refusJarvis } from '../../../../../lib/jarvis-acces';
import { generateFullBrandAction, importBrandDAAction, saveBrandDAAction } from '../../../../actions/brand-detail';
import { presignAssetUploadAction } from '../../../../actions/assets';
import { storageConfigured } from '@tiktrends/integrations';
import { refusEcritureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../../../../lib/bibliotheque-acces';
import { sousNavMarque, type PropsFaviconMarque, type PropsSyncSite } from '../../../../../spatial/vues/marque/base';

/**
 * La lecture commune des cinq écrans de la fiche Marque (Spatial) · MÊMES
 * gardes que la fiche V5 (`app/(app)/brands/[id]`) : session, admin d'espace,
 * marque de l'espace de la session. Consulter ne modifie rien.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const j = (a?: string[] | null) => (a ?? []).join(', ');

export type MarqueLue = typeof schema.brands.$inferSelect;

export interface ContexteMarque {
  s: Session;
  b: MarqueLue;
  estActive: boolean;
  domaine: string | null;
  unlimited: boolean;
  aiReady: boolean;
  sousNav: Array<{ href: string; libelle: string }>;
  retours: Record<string, string>;
  /** Le lien Jarvis quand la feature est ouverte à la personne, sinon `null`. */
  jarvis: string | null;
  /** Le lien de création d'une pub quand les Studios sont ouverts, sinon `null`. */
  creerPub: string | null;
}

export async function chargerMarque(id: string): Promise<ContexteMarque> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!db || !UUID.test(id)) notFound();
  const [b] = await db.select().from(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  if (!b) notFound();
  const active = await getActiveBrand(s.workspaceId);
  const studio = FEATURES.find((f) => f.key === 'studio')!;
  return {
    s, b, estActive: active?.id === b.id,
    domaine: b.url ? domaineConcurrent(b.url) : b.shopifyDomain ? domaineConcurrent(b.shopifyDomain) : null,
    unlimited: unlimitedCredits(s.user.email), aiReady: anthropicConfigured(),
    sousNav: sousNavMarque(b.id), retours: messagesRetourMarque({ limiteConcurrents: messageLimiteConcurrents(forfaitEffectif(s.plan)) }),
    jarvis: refusJarvis(s) ? null : '/jarvis',
    creerPub: canAccess({ role: s.role, plan: s.plan, equipe: s.equipe ?? undefined }, studio) ? lienNouveauProjet({ type: 'ads' }) : null,
  };
}

/** La fiche telle que la mesure `completudeFicheMarque`. */
export function ficheLue(b: MarqueLue, n: { scenarios: number; personas: number; produits: number }): FicheMarqueLue {
  return {
    description: b.description, usp: b.usp, audience: b.audience, category: b.category, categoryNeeds: b.categoryNeeds, tone: b.tone,
    industryTags: (b.industryTags ?? []).length, colors: (b.colors ?? []).length, concurrents: (b.competitors ?? []).length, ...n,
  };
}

/** Les valeurs ACTUELLES de tous les champs de `updateBrandAction` · renvoyées en caché, rien n'est écrasé. */
export function valeursFiche(b: MarqueLue): Record<string, string> {
  return {
    id: b.id, name: b.name, url: b.url ?? '', description: b.description ?? '', usp: b.usp ?? '', audience: b.audience ?? '',
    category: b.category ?? '', categoryNeeds: b.categoryNeeds ?? '', moreAbout: b.moreAbout ?? '', industry: b.industry ?? '',
    industryTags: j(b.industryTags), tone: b.tone ?? '', languages: j(b.languages), colors: j(b.colors), fonts: j(b.fonts),
    preferredWords: j(b.preferredWords), avoidWords: j(b.avoidWords), competitors: (b.competitors ?? []).join('\n'),
  };
}

export function propsSync(c: ContexteMarque): PropsSyncSite {
  const raison = !c.aiReady ? messageServiceInactif('ia_profil') : !c.domaine ? 'Renseigne le site de la marque pour le relire' : null;
  return { brandId: c.b.id, site: c.domaine, relancer: raison ? null : generateFullBrandAction, raison, cout: c.unlimited ? null : costFor('brief') };
}

export function propsFavicon(c: ContexteMarque): PropsFaviconMarque {
  const logo = c.b.logoUrl ? brandMediaPreview(c.b.id, c.b.logoUrl) : null;
  const favicon = c.domaine ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domaine)}&sz=64` : null;
  return {
    brandId: c.b.id, image: logo ?? favicon, initiale: initialeNom(c.b.name),
    titre: logo ? 'Logo enregistré dans la charte' : favicon ? `Récupéré depuis ${c.domaine}` : 'Aucun logo ni site renseigné',
    detail: logo ? 'Affiché dans le menu et le sélecteur de marque.' : 'Le menu montre l’initiale de la marque tant qu’aucun logo n’est enregistré.',
    recuperer: c.domaine ? importBrandDAAction : null,
    raisonRecuperer: c.domaine ? null : 'Renseigne le site de la marque pour récupérer sa charte',
    importLogo: propsImportLogo(c),
  };
}

/**
 * « Importer » un fichier de logo · le dépôt passe par la Bibliothèque
 * (`presignAssetUploadAction`, sa garde d'écriture · rôle et offre), la charte
 * par `saveBrandDAAction` (admin, marque de l'espace · déjà exigé par la page).
 * Fermé avec la raison de la première garde qui refuserait, ou sans stockage.
 */
export function propsImportLogo(c: ContexteMarque): PropsFaviconMarque['importLogo'] {
  const refus = refusEcritureBibliotheque(c.s);
  const raison = refus ? TEXTE_REFUS_BIBLIOTHEQUE[refus] : !storageConfigured() ? RAISON_LOGO_SANS_STOCKAGE : null;
  return {
    logos: [...new Set([c.b.logoUrl, ...(c.b.logos ?? [])].filter((u): u is string => !!u))], defaut: c.b.logoUrl ?? null,
    couleurs: c.b.colors ?? [], polices: c.b.fonts ?? [],
    actions: raison ? null : { preparer: presignAssetUploadAction, enregistrer: saveBrandDAAction }, raison,
  };
}
